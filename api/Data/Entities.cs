namespace Data.Entities;

// Synthetic, minimal data only (NFR-03). No clinical fields, no IC, no address.
public class Clinic
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Timezone { get; set; } = "Asia/Kuala_Lumpur";
    public DateTimeOffset CreatedAt { get; set; }
}

public class Staff
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClinicId { get; set; }
    public string DisplayName { get; set; } = "";
    public string Role { get; set; } = Roles.Nurse; // nurse | clinic_admin
    public bool Active { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
}

public class Patient
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClinicId { get; set; }
    public string DisplayName { get; set; } = "";
    public string Phone { get; set; } = ""; // normalised digits, fictional only
    public string Language { get; set; } = "ms"; // ms | en
    public bool IsDemo { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
}

public class UserAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? PatientId { get; set; }
    public Guid? StaffId { get; set; }
    public string? Username { get; set; } // staff only
    public string? PasswordHash { get; set; }
    public string Status { get; set; } = AccountStatus.Pending;
    public int FailedLogins { get; set; }
    public DateTimeOffset? LockedUntil { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class RefreshToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserAccountId { get; set; }
    public string TokenHash { get; set; } = "";
    public string? DeviceName { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class ActivationCode
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PatientId { get; set; }
    public string CodeHash { get; set; } = "";
    public Guid IssuedBy { get; set; } // staff id
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class AuditLog
{
    public long Id { get; set; }
    public DateTimeOffset At { get; set; }
    public Guid? ActorUserId { get; set; }
    public Guid? ClinicId { get; set; } // null only when a failed login matches no account
    public string Action { get; set; } = "";
    public string Entity { get; set; } = "";
    public Guid? EntityId { get; set; }
    public string? Detail { get; set; } // jsonb, never personal data
    public System.Net.IPAddress? Ip { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class Room
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClinicId { get; set; }
    public string Name { get; set; } = "";
    public bool Active { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
}

public class Appointment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PatientId { get; set; }
    public Guid ClinicId { get; set; }
    public DateTimeOffset ScheduledAt { get; set; }
    public string VisitType { get; set; } = "routine"; // booking | routine | virtual
    public string Status { get; set; } = "scheduled"; // scheduled | checked_in | cancelled
    public DateTimeOffset CreatedAt { get; set; }
}

public class QrToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClinicId { get; set; }
    public string TokenHash { get; set; } = ""; // SHA-256 of an opaque random value; no personal data
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class QueueEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClinicId { get; set; }
    public Guid? PatientId { get; set; }
    public string? WalkInName { get; set; }
    public Guid? AppointmentId { get; set; }
    public DateOnly QueueDate { get; set; } // clinic timezone
    public string QueueNo { get; set; } = ""; // A### appointment, W### walk-in
    public string Source { get; set; } = "qr"; // qr | staff
    public string Status { get; set; } = QueueStatus.Waiting;
    public bool Urgent { get; set; } // no S2 writer; never set by the system
    public string? UrgentReason { get; set; }
    public Guid? RoomId { get; set; }
    public Guid? StaffId { get; set; }
    public string IdempotencyKey { get; set; } = "";
    public DateTimeOffset CheckedInAt { get; set; }
    public DateTimeOffset? CalledAt { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public static class QueueStatus
{
    public const string Waiting = "waiting", Called = "called", InRoom = "in_room", Completed = "completed", Missed = "missed";
}

public static class Roles
{
    public const string Patient = "patient", Nurse = "nurse", ClinicAdmin = "clinic_admin";
}

public static class AccountStatus
{
    public const string Pending = "pending", Active = "active", Disabled = "disabled";
}
