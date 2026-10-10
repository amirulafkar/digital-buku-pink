using System.Net;
using Data;
using Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Api;

public record IssueCodeRequest(Guid? PatientId);

/// <summary>
/// S3 staff features: patient search, nurse list, activation codes.
/// Never logs or audits a query text, phone or code. Every query is clinic-scoped by the caller's token.
/// </summary>
public class StaffService(AppDbContext db, PatientRepository patients, IOptions<AuthOptions> opt)
{
    public const int CodeLifeDays = 7;

    // ---------- search (FR-08) ----------
    public async Task<Outcome<object>> SearchPatientsAsync(Guid clinicId, Guid userId, string? q, int? limit, IPAddress? ip)
    {
        var term = (q ?? "").Trim();
        if (term.Length < 2) return Outcome<object>.Fail(400, "query_too_short", "Type at least 2 characters.");
        if (term.Length > 60) return Outcome<object>.Fail(400, "query_too_long", "Query too long.");
        var take = Math.Clamp(limit ?? 20, 1, 20);

        var digits = Phone.Normalise(term);
        var onlyPhoneChars = term.All(ch => char.IsAsciiDigit(ch) || ch is '-' or ' ' or '+');
        var like = "%" + term.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";

        var query = db.Patients.AsNoTracking().Where(p => p.ClinicId == clinicId);
        query = onlyPhoneChars && digits.Length >= 2
            ? query.Where(p => p.Phone.Contains(digits))
            : query.Where(p => EF.Functions.ILike(p.DisplayName, like, "\\"));
        var found = await query.OrderBy(p => p.DisplayName).Take(take).Select(p => new { p.Id, p.DisplayName }).ToListAsync();

        var tzId = await db.Clinics.AsNoTracking().Where(c => c.Id == clinicId).Select(c => c.Timezone).FirstAsync();
        TimeZoneInfo tz;
        try { tz = TimeZoneInfo.FindSystemTimeZoneById(tzId); } catch (Exception) { tz = TimeZoneInfo.CreateCustomTimeZone("kl", TimeSpan.FromHours(8), "KL", "KL"); }
        var localToday = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz).Date;
        var start = TimeZoneInfo.ConvertTimeToUtc(localToday, tz);
        var end = start.AddDays(1);
        var ids = found.Select(f => f.Id).ToList();
        var appts = await db.Appointments.AsNoTracking()
            .Where(a => a.ClinicId == clinicId && ids.Contains(a.PatientId) && a.Status != "cancelled" && a.ScheduledAt >= start && a.ScheduledAt < end)
            .OrderBy(a => a.ScheduledAt).ToListAsync();

        var rows = found.Select(f =>
        {
            var a = appts.FirstOrDefault(x => x.PatientId == f.Id);
            return new { id = f.Id, displayName = f.DisplayName, todayAppointment = a is null ? null : new { time = a.ScheduledAt, type = a.VisitType } };
        }).ToList();

        // Detail holds only the result count, never the query text.
        Audit.Add(db, userId, clinicId, "search", "patient", null, ip, new { resultCount = rows.Count });
        await db.SaveChangesAsync();
        return new(rows);
    }

    public async Task<List<object>> NursesAsync(Guid clinicId) =>
        (await db.Staff.AsNoTracking().Where(s => s.ClinicId == clinicId && s.Active && s.Role == Roles.Nurse)
            .OrderBy(s => s.DisplayName).Select(s => new { id = s.Id, displayName = s.DisplayName }).ToListAsync())
        .Select(x => (object)x).ToList();

    // ---------- activation codes (FR-01) ----------
    public async Task<Outcome<object>> IssueCodeAsync(Guid clinicId, Guid userId, Guid? patientId, IPAddress? ip)
    {
        if (patientId is null) return Outcome<object>.Fail(400, "invalid_request", "patientId required.");
        if (await patients.GetAsync(clinicId, patientId.Value) is null)
            return Outcome<object>.Fail(404, "not_found", "Patient not found.");
        var staffId = await db.UserAccounts.AsNoTracking().Where(a => a.Id == userId).Select(a => a.StaffId).FirstOrDefaultAsync();
        if (staffId is null) return Outcome<object>.Fail(403, "forbidden", "Not allowed.");

        await using var tx = await db.Database.BeginTransactionAsync();
        // Serialise issue per patient: two parallel issues must leave exactly one unused code.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM patient WHERE id = {patientId.Value} FOR UPDATE");
        var now = DateTimeOffset.UtcNow;
        // Issuing a new code revokes this patient's unused codes (by expiring them now).
        var revoked = await db.ActivationCodes.Where(c => c.PatientId == patientId && c.UsedAt == null && c.ExpiresAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.ExpiresAt, now));
        if (revoked > 0)
            Audit.Add(db, userId, clinicId, "activation_revoke", "patient", patientId, ip, new { count = revoked });

        var code = Crypto.NewActivationCode();
        var row = new ActivationCode
        {
            PatientId = patientId.Value, IssuedBy = staffId.Value,
            CodeHash = Crypto.HashCode(code, opt.Value.CodePepper), ExpiresAt = now.AddDays(CodeLifeDays),
        };
        db.ActivationCodes.Add(row);
        Audit.Add(db, userId, clinicId, "activation_issue", "activation_code", row.Id, ip, new { patientId });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new(new { code, expiresAt = row.ExpiresAt }, 201); // plaintext returned once, never stored or logged
    }

    public async Task<List<object>> ListCodesAsync(Guid clinicId, Guid? patientId)
    {
        var now = DateTimeOffset.UtcNow;
        var q = from c in db.ActivationCodes.AsNoTracking()
                join p in db.Patients.AsNoTracking() on c.PatientId equals p.Id
                where p.ClinicId == clinicId && (patientId == null || c.PatientId == patientId)
                orderby c.CreatedAt descending
                select new { c.Id, p.DisplayName, c.CreatedAt, c.ExpiresAt, c.UsedAt };
        return (await q.Take(100).ToListAsync()).Select(c => (object)new
        {
            id = c.Id, patientDisplayName = c.DisplayName, issuedAt = c.CreatedAt, expiresAt = c.ExpiresAt,
            status = c.UsedAt != null ? "used" : c.ExpiresAt <= now ? "expired" : "unused",
        }).ToList();
    }
}
