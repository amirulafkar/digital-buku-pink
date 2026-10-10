using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Data;

public static class Crypto
{
    /// <summary>SHA-256 hex. Used for high-entropy random secrets (refresh tokens, activation codes) only.</summary>
    public static string Hash(string secret) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(secret))).ToLowerInvariant();

    public static string RandomToken(int bytes = 32) =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(bytes)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    // No 0/O/1/I. Formatted XXXX-XXXX-XX for reading aloud.
    public static string NewActivationCode()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var chars = new char[10];
        for (var i = 0; i < chars.Length; i++) chars[i] = alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)];
        var s = new string(chars);
        return $"{s[..4]}-{s[4..8]}-{s[8..]}";
    }

    public static string NormaliseCode(string code) =>
        new string(code.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();

    /// <summary>HMAC-SHA256 with a server-side pepper (env). The pepper is never stored in the database.</summary>
    public static string HashCode(string code, string pepper) =>
        Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(pepper), Encoding.UTF8.GetBytes(NormaliseCode(code)))).ToLowerInvariant();
}

public static class Phone
{
    public static string Normalise(string input) => new(input.Where(char.IsAsciiDigit).ToArray());
}

/// <summary>Writes audit rows in the caller's unit of work. Detail must never hold personal data.</summary>
public static class Audit
{
    public static void Add(AppDbContext db, Guid? actorUserId, Guid? clinicId, string action, string entity,
        Guid? entityId, IPAddress? ip, object? detail = null)
    {
        db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = actorUserId,
            ClinicId = clinicId,
            Action = action,
            Entity = entity,
            EntityId = entityId,
            Ip = ip,
            Detail = detail is null ? null : JsonSerializer.Serialize(detail),
        });
    }
}

/// <summary>Every method requires clinicId; there are no unscoped overloads.</summary>
public class PatientRepository(AppDbContext db)
{
    public Task<Patient?> GetAsync(Guid clinicId, Guid patientId, CancellationToken ct = default) =>
        db.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.ClinicId == clinicId && p.Id == patientId, ct);

    public Task<List<Patient>> ListAsync(Guid clinicId, CancellationToken ct = default) =>
        db.Patients.AsNoTracking().Where(p => p.ClinicId == clinicId).OrderBy(p => p.DisplayName).ToListAsync(ct);
}

public class AppointmentRepository(AppDbContext db)
{
    public Task<List<Appointment>> ListForPatientAsync(Guid clinicId, Guid patientId, CancellationToken ct = default) =>
        db.Appointments.AsNoTracking()
            .Where(a => a.ClinicId == clinicId && a.PatientId == patientId)
            .OrderBy(a => a.ScheduledAt).ToListAsync(ct);
}

public class RoomRepository(AppDbContext db)
{
    public Task<List<Room>> ListAsync(Guid clinicId, CancellationToken ct = default) =>
        db.Rooms.AsNoTracking().Where(r => r.ClinicId == clinicId && r.Active).OrderBy(r => r.Name).ToListAsync(ct);
}
