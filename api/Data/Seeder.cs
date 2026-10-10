using Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Data;

public record SeedResult(Dictionary<string, string> ActivationCodesByPhone, bool AlreadySeeded);

/// <summary>Fictional demo data only. Run as the owner role. Passwords are supplied by the caller (env), never stored in code.</summary>
public static class Seeder
{
    public const string ClinicCode = "KK-DEMO-1";

    public static async Task<SeedResult> SeedAsync(AppDbContext db, string staffPassword, string codePepper)
    {
        if (await db.Clinics.AnyAsync(c => c.Code == ClinicCode))
            return new SeedResult([], true);

        var hasher = new PasswordHasher<UserAccount>();
        var clinic = new Clinic { Code = ClinicCode, Name = "KK Demo Satu" };
        db.Clinics.Add(clinic);
        await db.SaveChangesAsync();

        foreach (var n in new[] { "Bilik 1", "Bilik 2", "Bilik 3" })
            db.Rooms.Add(new Room { ClinicId = clinic.Id, Name = n });

        var aini = new Staff { ClinicId = clinic.Id, DisplayName = "Aini (demo)", Role = Roles.Nurse };
        var faridah = new Staff { ClinicId = clinic.Id, DisplayName = "Faridah (demo)", Role = Roles.ClinicAdmin };
        db.Staff.AddRange(aini, faridah);
        await db.SaveChangesAsync();
        foreach (var (s, u) in new[] { (aini, "aini.demo"), (faridah, "faridah.demo") })
        {
            var acc = new UserAccount { StaffId = s.Id, Username = u, Status = AccountStatus.Active };
            acc.PasswordHash = hasher.HashPassword(acc, staffPassword);
            db.UserAccounts.Add(acc);
        }

        var patients = new[]
        {
            new Patient { ClinicId = clinic.Id, DisplayName = "Siti (demo)", Phone = "0100000001", Language = "ms" },
            new Patient { ClinicId = clinic.Id, DisplayName = "Dewi (demo)", Phone = "0100000002", Language = "en" },
            new Patient { ClinicId = clinic.Id, DisplayName = "Mei Ling (demo)", Phone = "0100000003", Language = "en" },
            new Patient { ClinicId = clinic.Id, DisplayName = "Priya (demo)", Phone = "0100000004", Language = "ms" },
        };
        db.Patients.AddRange(patients);
        await db.SaveChangesAsync();

        var codes = new Dictionary<string, string>();
        var today = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).Date; // Asia/Kuala_Lumpur, no DST
        var slot = 9;
        foreach (var p in patients)
        {
            db.UserAccounts.Add(new UserAccount { PatientId = p.Id, Status = AccountStatus.Pending });
            db.Appointments.Add(new Appointment
            {
                ClinicId = clinic.Id, PatientId = p.Id, VisitType = "routine",
                ScheduledAt = new DateTimeOffset(today.AddHours(slot++), TimeSpan.FromHours(8)).ToUniversalTime(),
            });
            var code = Crypto.NewActivationCode();
            codes[p.Phone] = code;
            db.ActivationCodes.Add(new ActivationCode
            {
                PatientId = p.Id, IssuedBy = faridah.Id, CodeHash = Crypto.HashCode(code, codePepper),
                ExpiresAt = DateTimeOffset.UtcNow.AddDays(7),
            });
        }
        await db.SaveChangesAsync();
        return new SeedResult(codes, false);
    }
}
