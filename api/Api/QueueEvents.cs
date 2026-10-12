using Data;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Api;

/// <summary>
/// Publishes a minimal "something changed" event after a queue change is committed. The payload carries no names, phone numbers,
/// room details, waiting times or ordering; clients refetch through the authenticated REST endpoints.
/// </summary>
public class QueueEvents(IHubContext<QueueHub> hub, AppDbContext db, ILogger<QueueEvents> log)
{
    private static long _last;

    /// <summary>Monotonic across restarts: milliseconds since 2026-01-01, never repeating within a process.</summary>
    public static long NextVersion()
    {
        var now = (long)(DateTimeOffset.UtcNow - new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero)).TotalMilliseconds;
        long prev, next;
        do { prev = Interlocked.Read(ref _last); next = Math.Max(prev + 1, now); } while (Interlocked.CompareExchange(ref _last, next, prev) != prev);
        return next;
    }

    public async Task PublishAsync(Guid clinicId, Guid? patientId, Guid queueEntryId)
    {
        try
        {
            var version = NextVersion();
            var updatedAt = DateTimeOffset.UtcNow;
            object Payload() => new { type = "queue.changed", queueEntryId, version, updatedAt };
            await hub.Clients.Group(QueueHub.ClinicGroup(clinicId)).SendAsync(QueueHub.ClientMethod, Payload());
            if (patientId is { } pid)
            {
                var userId = await db.UserAccounts.AsNoTracking().Where(a => a.PatientId == pid).Select(a => (Guid?)a.Id).FirstOrDefaultAsync();
                if (userId is { } uid) await hub.Clients.Group(QueueHub.PatientGroup(uid.ToString())).SendAsync(QueueHub.ClientMethod, Payload());
            }
        }
        catch (Exception e)
        {
            // Polling covers a missed event. Log the failure type only, never payloads or tokens.
            log.LogWarning("Queue event not published: {Error}", e.GetType().Name);
        }
    }
}
