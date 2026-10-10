using Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Data;

/// <summary>Every method requires clinicId; there are no unscoped overloads.</summary>
public class QueueRepository(AppDbContext db)
{
    public Task<QueueEntry?> GetAsync(Guid clinicId, Guid id, CancellationToken ct = default) =>
        db.QueueEntries.AsNoTracking().FirstOrDefaultAsync(q => q.ClinicId == clinicId && q.Id == id, ct);

    /// <summary>Row-locks the entry (FOR UPDATE); call inside a transaction.</summary>
    public Task<QueueEntry?> GetForUpdateAsync(Guid clinicId, Guid id, CancellationToken ct = default) =>
        db.QueueEntries.FromSqlInterpolated($"SELECT * FROM queue_entry WHERE id = {id} AND clinic_id = {clinicId} FOR UPDATE")
            .FirstOrDefaultAsync(ct);

    public Task<List<QueueEntry>> ListForDateAsync(Guid clinicId, DateOnly date, CancellationToken ct = default) =>
        db.QueueEntries.AsNoTracking().Where(q => q.ClinicId == clinicId && q.QueueDate == date)
            .OrderBy(q => q.CheckedInAt).ToListAsync(ct);

    public Task<List<QueueEntry>> ListForPatientAsync(Guid clinicId, Guid patientId, DateOnly date, CancellationToken ct = default) =>
        db.QueueEntries.Where(q => q.ClinicId == clinicId && q.PatientId == patientId && q.QueueDate == date)
            .OrderByDescending(q => q.CheckedInAt).ToListAsync(ct);

    public Task<List<string>> QueueNosAsync(Guid clinicId, DateOnly date, string prefix, CancellationToken ct = default) =>
        db.QueueEntries.Where(q => q.ClinicId == clinicId && q.QueueDate == date && q.QueueNo.StartsWith(prefix))
            .Select(q => q.QueueNo).ToListAsync(ct);
}
