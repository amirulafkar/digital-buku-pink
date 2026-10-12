using System.Net;
using Data;
using Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Api;

public record Outcome<T>(T? Value, int Status = 200, string? Code = null, string? Message = null)
{
    public bool Ok => Code is null;
    public static Outcome<T> Fail(int status, string code, string message) => new(default, status, code, message);
}

public record CheckInDto(Guid QueueEntryId, string QueueNo, string Status, DateTimeOffset CheckedInAt);
public record MyQueueDto(string? QueueNo, string? Status, DateTimeOffset? UpdatedAt);
public record QrIssueDto(string Token, DateTimeOffset ExpiresAt);
public record PatchRequest(string? Status, Guid? RoomId, Guid? StaffId, string? Reason, bool? Urgent = null, string? UrgentReason = null);
public record StaffCheckInRequest(Guid? PatientId, string? WalkInName, string? IdempotencyKey);
public record CheckInRequest(string? Token, string? IdempotencyKey);

/// <summary>
/// Queue logic. Staff always control the queue: nothing here reorders, sets urgency, assigns, or runs on a timer.
/// Audit detail holds ids and codes only: never a name, phone or token value.
/// </summary>
public class QueueService(AppDbContext db, QueueRepository queue, PatientRepository patients, QueueEvents events)
{
    public const int QrLifeSeconds = 60;
    static readonly string[] ReasonCodes = ["no_answer", "left_clinic", "other"];
    // Urgent reasons are fixed non-clinical codes set by staff; the system never sets urgency.
    public static readonly string[] UrgentCodes = ["staff_judgement", "accessibility_need", "family_request", "other"];

    // ---------- time ----------
    private static TimeZoneInfo Tz(string id)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch (Exception) { return TimeZoneInfo.CreateCustomTimeZone("kl", TimeSpan.FromHours(8), "KL", "KL"); }
    }

    public async Task<DateOnly> TodayAsync(Guid clinicId)
    {
        var tz = await db.Clinics.AsNoTracking().Where(c => c.Id == clinicId).Select(c => c.Timezone).FirstAsync();
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Tz(tz)));
    }

    // ---------- QR ----------
    public async Task<QrIssueDto> IssueQrAsync(Guid clinicId, Guid actorUserId, IPAddress? ip)
    {
        var raw = Crypto.RandomToken(32);
        var qr = new QrToken { ClinicId = clinicId, TokenHash = Crypto.Hash(raw), ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(QrLifeSeconds) };
        db.QrTokens.Add(qr);
        Audit.Add(db, actorUserId, clinicId, "qr_issue", "qr_token", qr.Id, ip);
        await db.SaveChangesAsync();
        return new QrIssueDto(raw, qr.ExpiresAt);
    }

    // ---------- check-in ----------
    public async Task<Outcome<CheckInDto>> PatientCheckInAsync(Guid clinicId, Guid userId, string? token, string? key, IPAddress? ip)
    {
        var patientId = await db.UserAccounts.AsNoTracking().Where(a => a.Id == userId).Select(a => a.PatientId).FirstOrDefaultAsync();
        if (patientId is null || await patients.GetAsync(clinicId, patientId.Value) is null)
            return Outcome<CheckInDto>.Fail(403, "forbidden", "Not allowed.");
        if (string.IsNullOrWhiteSpace(key) || key.Length > 100)
            return Outcome<CheckInDto>.Fail(400, "invalid_request", "idempotencyKey required.");

        async Task<Outcome<CheckInDto>> Refuse(int status, string code, string msg)
        {
            Audit.Add(db, userId, clinicId, "checkin_refused", "patient", patientId, ip, new { reason = code });
            await db.SaveChangesAsync();
            return Outcome<CheckInDto>.Fail(status, code, msg);
        }

        // Retry after the 60 s token expiry: an existing active/completed entry for today is returned (200) before the token is checked.
        var date = await TodayAsync(clinicId);
        var already = (await queue.ListForPatientAsync(clinicId, patientId.Value, date)).FirstOrDefault(q => q.Status != QueueStatus.Missed);
        if (already is not null) return new(Dto(already), 200);

        // token_invalid is deliberately not audited (an unauthenticated-style flood would fill audit_log); only wrong_clinic and no_appointment_today are.
        if (string.IsNullOrEmpty(token) || token.Length > 128) return Outcome<CheckInDto>.Fail(400, "token_invalid", "QR code invalid or expired.");
        var hash = Crypto.Hash(token);
        var qr = await db.QrTokens.AsNoTracking().FirstOrDefaultAsync(t => t.TokenHash == hash && t.ExpiresAt > DateTimeOffset.UtcNow);
        if (qr is null) return Outcome<CheckInDto>.Fail(400, "token_invalid", "QR code invalid or expired.");
        if (qr.ClinicId != clinicId) return await Refuse(403, "wrong_clinic", "This QR code belongs to another clinic.");

        var r = await CheckInCoreAsync(clinicId, userId, patientId, null, key, "qr", requireAppointment: true, ip);
        if (r.Code == "no_appointment_today") return await Refuse(422, r.Code, r.Message!);
        return r;
    }

    public async Task<Outcome<CheckInDto>> StaffCheckInAsync(Guid clinicId, Guid userId, StaffCheckInRequest req, IPAddress? ip)
    {
        var name = req.WalkInName?.Trim();
        if (string.IsNullOrWhiteSpace(req.IdempotencyKey) || req.IdempotencyKey.Length > 100
            || (req.PatientId is null) == string.IsNullOrEmpty(name) || (name?.Length ?? 0) > 60)
            return Outcome<CheckInDto>.Fail(400, "invalid_request", "Provide patientId or walkInName, and idempotencyKey.");
        if (req.PatientId is { } pid && await patients.GetAsync(clinicId, pid) is null)
            return Outcome<CheckInDto>.Fail(404, "not_found", "Patient not found.");
        return await CheckInCoreAsync(clinicId, userId, req.PatientId, name, req.IdempotencyKey, "staff", false, ip);
    }

    private async Task<Outcome<CheckInDto>> CheckInCoreAsync(Guid clinicId, Guid userId, Guid? patientId, string? walkInName,
        string key, string source, bool requireAppointment, IPAddress? ip)
    {
        await using var tx = await db.Database.BeginTransactionAsync();
        // Row lock on the clinic serialises number allocation and duplicate checks per clinic.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM clinic WHERE id = {clinicId} FOR UPDATE");
        var clinic = await db.Clinics.AsNoTracking().FirstAsync(c => c.Id == clinicId);
        var tz = Tz(clinic.Timezone);
        var date = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));

        // Idempotency / one entry per patient per day: existing active or completed entry is returned (200).
        if (patientId is { } p)
        {
            var today = await queue.ListForPatientAsync(clinicId, p, date);
            var existing = today.FirstOrDefault(q => q.Status != QueueStatus.Missed);
            if (existing is not null) return new(Dto(existing), 200);
            // A key already used by a missed entry is not replayed as success; a new entry needs a new key.
            if (today.Any(q => q.IdempotencyKey == key))
                return Outcome<CheckInDto>.Fail(409, "key_reused", "Use a new idempotencyKey for a new check-in.");
        }
        else
        {
            var existing = await db.QueueEntries.AsNoTracking().FirstOrDefaultAsync(q =>
                q.ClinicId == clinicId && q.QueueDate == date && q.IdempotencyKey == key && q.PatientId == null);
            if (existing is not null) return new(Dto(existing), 200);
        }

        Appointment? appt = null;
        if (patientId is { } pid)
        {
            var start = TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(TimeOnly.MinValue), tz);
            var end = start.AddDays(1);
            appt = await db.Appointments.Where(a => a.ClinicId == clinicId && a.PatientId == pid && a.Status != "cancelled"
                    && a.ScheduledAt >= start && a.ScheduledAt < end).OrderBy(a => a.ScheduledAt).FirstOrDefaultAsync();
            if (appt is null && requireAppointment)
                return Outcome<CheckInDto>.Fail(422, "no_appointment_today", "No appointment today.");
        }

        var prefix = appt is not null ? "A" : "W";
        var max = (await queue.QueueNosAsync(clinicId, date, prefix)).Select(n => int.Parse(n[1..])).DefaultIfEmpty(0).Max();
        var entry = new QueueEntry
        {
            ClinicId = clinicId, PatientId = patientId, WalkInName = walkInName, AppointmentId = appt?.Id,
            QueueDate = date, QueueNo = $"{prefix}{max + 1:D3}", Source = source, Status = QueueStatus.Waiting,
            IdempotencyKey = key, CheckedInAt = DateTimeOffset.UtcNow,
        };
        db.QueueEntries.Add(entry);
        if (appt is not null) appt.Status = "checked_in";
        Audit.Add(db, userId, clinicId, "checkin", "queue_entry", entry.Id, ip, new { source, queueNo = entry.QueueNo, appointmentId = appt?.Id });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await events.PublishAsync(clinicId, patientId, entry.Id); // after commit, next to the audit write
        return new(Dto(entry), 201);
    }

    private static CheckInDto Dto(QueueEntry q) => new(q.Id, q.QueueNo, q.Status, q.CheckedInAt);

    public async Task<object> MineAsync(Guid clinicId, Guid userId)
    {
        var patientId = await db.UserAccounts.AsNoTracking().Where(a => a.Id == userId).Select(a => a.PatientId).FirstOrDefaultAsync();
        if (patientId is null) return new { queueNo = (string?)null };
        var date = await TodayAsync(clinicId);
        var q = (await queue.ListForPatientAsync(clinicId, patientId.Value, date)).FirstOrDefault();
        if (q is null) return new { queueNo = (string?)null };
        var updated = new[] { q.CheckedInAt, q.CalledAt, q.StartedAt, q.CompletedAt }.Where(x => x != null).Max();
        // The room is shown only while called or in room, and only the staff-set value for this mother's own entry.
        string? roomName = null;
        if (q.RoomId is { } rid && (q.Status == QueueStatus.Called || q.Status == QueueStatus.InRoom))
            roomName = await db.Rooms.AsNoTracking().Where(r => r.Id == rid && r.ClinicId == clinicId).Select(r => r.Name).FirstOrDefaultAsync();
        return new { queueNo = q.QueueNo, status = q.Status, updatedAt = updated, roomName };
    }

    // ---------- staff queue ----------
    public async Task<object> ListAsync(Guid clinicId)
    {
        var date = await TodayAsync(clinicId);
        var rows = await queue.ListForDateAsync(clinicId, date);
        var ids = rows.Where(r => r.PatientId != null).Select(r => r.PatientId!.Value).ToList();
        var names = await db.Patients.AsNoTracking().Where(p => p.ClinicId == clinicId && ids.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.DisplayName);
        return new
        {
            queueDate = date.ToString("yyyy-MM-dd"),
            entries = rows.Select(r => new
            {
                id = r.Id, queueNo = r.QueueNo,
                displayName = r.PatientId is { } pid ? names.GetValueOrDefault(pid) : null,
                walkInName = r.WalkInName, status = r.Status, roomId = r.RoomId, staffId = r.StaffId,
                urgent = r.Urgent, urgentReason = r.UrgentReason, source = r.Source, checkedInAt = r.CheckedInAt,
            }),
        };
    }

    static readonly Dictionary<string, string[]> Allowed = new()
    {
        [QueueStatus.Waiting] = [QueueStatus.Called, QueueStatus.Missed],
        [QueueStatus.Called] = [QueueStatus.InRoom, QueueStatus.Missed],
        [QueueStatus.InRoom] = [QueueStatus.Completed],
    };

    public async Task<Outcome<object>> PatchAsync(Guid clinicId, Guid userId, Guid id, PatchRequest req, IPAddress? ip)
    {
        if (req.Status is null && req.RoomId is null && req.StaffId is null && req.Urgent is null)
            return Outcome<object>.Fail(400, "invalid_request", "Nothing to change.");
        if (req.Status is not null && req.Status is not (QueueStatus.Called or QueueStatus.InRoom or QueueStatus.Completed or QueueStatus.Missed))
            return Outcome<object>.Fail(409, "invalid_transition", "Invalid transition.");
        if (req.Status == QueueStatus.Missed && string.IsNullOrWhiteSpace(req.Reason))
            return Outcome<object>.Fail(422, "reason_required", "Reason is required for missed.");
        if (req.Reason is not null && !ReasonCodes.Contains(req.Reason))
            return Outcome<object>.Fail(422, "invalid_reason", "Reason must be a code: " + string.Join(", ", ReasonCodes));

        if (req.Urgent == true && (req.UrgentReason is null || !UrgentCodes.Contains(req.UrgentReason)))
            return Outcome<object>.Fail(422, "urgent_reason_required", "A reason code is required for urgent: " + string.Join(", ", UrgentCodes));

        await using var tx = await db.Database.BeginTransactionAsync();
        var e = await queue.GetForUpdateAsync(clinicId, id);
        if (e is null) return Outcome<object>.Fail(404, "not_found", "Queue entry not found.");

        if (req.RoomId is { } rid && !await db.Rooms.AnyAsync(r => r.Id == rid && r.ClinicId == clinicId && r.Active))
            return Outcome<object>.Fail(422, "invalid_room", "Room is not in this clinic.");
        if (req.StaffId is { } sid && !await db.Staff.AnyAsync(s => s.Id == sid && s.ClinicId == clinicId && s.Active))
            return Outcome<object>.Fail(422, "invalid_staff", "Staff is not in this clinic.");

        var terminal = e.Status is QueueStatus.Completed or QueueStatus.Missed;
        if (req.Status is not null && (!Allowed.TryGetValue(e.Status, out var next) || !next.Contains(req.Status)))
            return Outcome<object>.Fail(409, "invalid_transition", "Invalid transition.");
        if ((req.RoomId is not null || req.StaffId is not null || req.Urgent is not null) && terminal)
            return Outcome<object>.Fail(409, "invalid_transition", "Entry is closed.");

        if (req.Status is { } to)
        {
            var from = e.Status;
            e.Status = to;
            var now = DateTimeOffset.UtcNow;
            if (to == QueueStatus.Called) e.CalledAt = now;
            if (to == QueueStatus.InRoom) e.StartedAt = now;
            if (to == QueueStatus.Completed) e.CompletedAt = now;
            Audit.Add(db, userId, clinicId, "status", "queue_entry", e.Id, ip, new { from, to, reason = req.Reason });
        }
        if (req.RoomId is not null || req.StaffId is not null)
        {
            if (req.RoomId is not null) e.RoomId = req.RoomId;
            if (req.StaffId is not null) e.StaffId = req.StaffId;
            Audit.Add(db, userId, clinicId, "assign", "queue_entry", e.Id, ip, new { roomId = e.RoomId, staffId = e.StaffId });
        }
        if (req.Urgent is { } urgent && (urgent != e.Urgent || (urgent && req.UrgentReason != e.UrgentReason)))
        {
            e.Urgent = urgent;
            e.UrgentReason = urgent ? req.UrgentReason : null;
            Audit.Add(db, userId, clinicId, "urgent", "queue_entry", e.Id, ip, new { urgent, reasonCode = e.UrgentReason });
        }
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await events.PublishAsync(clinicId, e.PatientId, e.Id);
        return new(new { id = e.Id, queueNo = e.QueueNo, status = e.Status, roomId = e.RoomId, staffId = e.StaffId, urgent = e.Urgent, urgentReason = e.UrgentReason, checkedInAt = e.CheckedInAt });
    }

    // ---------- audit read ----------
    public async Task<List<object>> AuditAsync(Guid clinicId, DateTimeOffset? from, DateTimeOffset? to, int limit)
    {
        limit = Math.Clamp(limit, 1, 200);
        var q = db.AuditLogs.AsNoTracking().Where(a => a.ClinicId == clinicId);
        if (from is not null) q = q.Where(a => a.At >= from);
        if (to is not null) q = q.Where(a => a.At <= to);
        var rows = await q.OrderByDescending(a => a.At).ThenByDescending(a => a.Id).Take(limit).ToListAsync();
        return rows.Select(a => (object)new
        {
            at = a.At, actorUserId = a.ActorUserId, action = a.Action, entity = a.Entity, entityId = a.EntityId,
            detail = a.Detail is null ? (object?)null : System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(a.Detail),
        }).ToList();
    }
}
