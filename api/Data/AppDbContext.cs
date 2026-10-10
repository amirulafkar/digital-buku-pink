using Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Clinic> Clinics => Set<Clinic>();
    public DbSet<Staff> Staff => Set<Staff>();
    public DbSet<Patient> Patients => Set<Patient>();
    public DbSet<UserAccount> UserAccounts => Set<UserAccount>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<ActivationCode> ActivationCodes => Set<ActivationCode>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<Appointment> Appointments => Set<Appointment>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Clinic>(e =>
        {
            e.ToTable("clinic");
            e.HasIndex(x => x.Code).IsUnique();
        });
        b.Entity<Staff>(e =>
        {
            e.ToTable("staff", t => t.HasCheckConstraint("ck_staff_role", "role in ('nurse','clinic_admin')"));
            e.HasOne<Clinic>().WithMany().HasForeignKey(x => x.ClinicId).OnDelete(DeleteBehavior.Restrict);
        });
        b.Entity<Patient>(e =>
        {
            e.ToTable("patient", t =>
            {
                t.HasCheckConstraint("ck_patient_language", "language in ('ms','en')");
                t.HasCheckConstraint("ck_patient_is_demo", "is_demo = true");
                t.HasCheckConstraint("ck_patient_phone_digits", "phone ~ '^[0-9]{8,15}$'");
            });
            e.HasOne<Clinic>().WithMany().HasForeignKey(x => x.ClinicId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => x.Phone).IsUnique();
            e.HasIndex(x => new { x.ClinicId, x.DisplayName });
        });
        b.Entity<UserAccount>(e =>
        {
            e.ToTable("user_account", t =>
            {
                t.HasCheckConstraint("ck_user_account_one_owner",
                    "(patient_id is not null and staff_id is null and username is null) or (patient_id is null and staff_id is not null and username is not null)");
                t.HasCheckConstraint("ck_user_account_active_has_password", "status <> 'active' or password_hash is not null");
                t.HasCheckConstraint("ck_user_account_status", "status in ('pending','active','disabled')");
            });
            e.HasOne<Patient>().WithMany().HasForeignKey(x => x.PatientId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Staff>().WithMany().HasForeignKey(x => x.StaffId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => x.Username).IsUnique();
            e.HasIndex(x => x.PatientId).IsUnique();
            e.HasIndex(x => x.StaffId).IsUnique();
        });
        b.Entity<RefreshToken>(e =>
        {
            e.ToTable("refresh_token");
            e.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.UserAccountId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => x.TokenHash).IsUnique();
        });
        b.Entity<ActivationCode>(e =>
        {
            e.ToTable("activation_code");
            e.HasOne<Patient>().WithMany().HasForeignKey(x => x.PatientId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Staff>().WithMany().HasForeignKey(x => x.IssuedBy).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => x.CodeHash).IsUnique();
        });
        b.Entity<AuditLog>(e =>
        {
            e.ToTable("audit_log");
            e.Property(x => x.Id).UseIdentityAlwaysColumn();
            e.Property(x => x.Detail).HasColumnType("jsonb");
            e.Property(x => x.Ip).HasColumnType("inet");
            e.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.ActorUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Clinic>().WithMany().HasForeignKey(x => x.ClinicId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.ClinicId, x.At });
        });
        b.Entity<Room>(e =>
        {
            e.ToTable("room");
            e.HasOne<Clinic>().WithMany().HasForeignKey(x => x.ClinicId).OnDelete(DeleteBehavior.Restrict);
        });
        b.Entity<Appointment>(e =>
        {
            e.ToTable("appointment", t =>
            {
                t.HasCheckConstraint("ck_appointment_visit_type", "visit_type in ('booking','routine','virtual')");
                t.HasCheckConstraint("ck_appointment_status", "status in ('scheduled','checked_in','cancelled')");
            });
            e.HasOne<Patient>().WithMany().HasForeignKey(x => x.PatientId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Clinic>().WithMany().HasForeignKey(x => x.ClinicId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.PatientId, x.ScheduledAt });
        });

        // snake_case columns; created_at / at default now(); uuid ids default gen_random_uuid().
        foreach (var et in b.Model.GetEntityTypes())
        {
            foreach (var p in et.GetProperties())
            {
                p.SetColumnName(Snake(p.Name));
                if (p.Name == "CreatedAt" && p.GetDefaultValueSql() is null) p.SetDefaultValueSql("now()");
                if (p.Name == "Id" && p.ClrType == typeof(Guid)) p.SetDefaultValueSql("gen_random_uuid()");
                if (et.ClrType == typeof(AuditLog) && p.Name == "At") p.SetDefaultValueSql("now()");
                if (et.ClrType == typeof(UserAccount) && p.Name == "FailedLogins") p.SetDefaultValue(0);
                if (et.ClrType == typeof(UserAccount) && p.Name == "Status") p.SetDefaultValue("pending");
                if (et.ClrType == typeof(Clinic) && p.Name == "Timezone") p.SetDefaultValue("Asia/Kuala_Lumpur");
                if (et.ClrType == typeof(Staff) && p.Name == "Active" || et.ClrType == typeof(Room) && p.Name == "Active")
                    p.SetDefaultValue(true);
            }
        }
    }

    private static string Snake(string s) =>
        string.Concat(s.Select((c, i) => char.IsUpper(c) && i > 0 ? "_" + char.ToLowerInvariant(c) : char.ToLowerInvariant(c).ToString()));
}
