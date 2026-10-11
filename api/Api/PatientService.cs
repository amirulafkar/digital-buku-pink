using Data;
using Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Api;

/// <summary>Mother-facing reads (S4). Own rows only, clinic from the token, no phone number and no audit of reads.</summary>
public class PatientService(AppDbContext db, PatientRepository patients)
{
    private async Task<Guid?> PatientIdAsync(Guid userId) =>
        await db.UserAccounts.AsNoTracking().Where(a => a.Id == userId).Select(a => a.PatientId).FirstOrDefaultAsync();

    public async Task<object?> MeAsync(Guid clinicId, Guid userId)
    {
        if (await PatientIdAsync(userId) is not { } pid || await patients.GetAsync(clinicId, pid) is not { } p) return null;
        var clinicName = await db.Clinics.AsNoTracking().Where(c => c.Id == clinicId).Select(c => c.Name).FirstAsync();
        return new { displayName = p.DisplayName, clinicName, language = p.Language };
    }

    /// <summary>Earliest non-cancelled appointment from the start of today in the clinic timezone.</summary>
    public async Task<object> NextAppointmentAsync(Guid clinicId, Guid userId)
    {
        if (await PatientIdAsync(userId) is not { } pid) return new { scheduledAt = (DateTimeOffset?)null };
        var clinic = await db.Clinics.AsNoTracking().FirstAsync(c => c.Id == clinicId);
        TimeZoneInfo tz;
        try { tz = TimeZoneInfo.FindSystemTimeZoneById(clinic.Timezone); } catch (Exception) { tz = TimeZoneInfo.CreateCustomTimeZone("kl", TimeSpan.FromHours(8), "KL", "KL"); }
        var localToday = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz).Date;
        var start = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(localToday, tz), TimeSpan.Zero);
        var a = await db.Appointments.AsNoTracking()
            .Where(x => x.ClinicId == clinicId && x.PatientId == pid && x.Status != "cancelled" && x.ScheduledAt >= start)
            .OrderBy(x => x.ScheduledAt).FirstOrDefaultAsync();
        return a is null
            ? new { scheduledAt = (DateTimeOffset?)null, type = (string?)null, clinicName = (string?)null }
            : new { scheduledAt = (DateTimeOffset?)a.ScheduledAt, type = (string?)a.VisitType, clinicName = (string?)clinic.Name };
    }
}
