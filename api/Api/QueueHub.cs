using System.Collections.Concurrent;
using System.Security.Claims;
using Data.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;

namespace Api;

/// <summary>Counts open hub connections per user (max 3). In memory: the prototype runs a single instance.</summary>
public class HubConnectionLimiter(IOptions<AuthOptions> opt)
{
    private readonly ConcurrentDictionary<string, int> _open = new();

    public bool TryAdd(string user)
    {
        var max = opt.Value.MaxHubConnections;
        var ok = false;
        _open.AddOrUpdate(user, _ => { ok = max > 0; return ok ? 1 : 0; }, (_, n) => { ok = n < max; return ok ? n + 1 : n; });
        return ok;
    }

    public void Release(string user) => _open.AddOrUpdate(user, 0, (_, n) => Math.Max(0, n - 1));
    public int Count(string user) => _open.GetValueOrDefault(user);
}

/// <summary>
/// Server-push only: this hub has NO client-to-server methods, so a client cannot join, leave or request anything.
/// Groups come from the JWT claims alone. A patient is only ever in her own group; staff and clinic_admin in their clinic group.
/// </summary>
[Authorize]
public class QueueHub(HubConnectionLimiter limiter) : Hub
{
    public static string PatientGroup(string userId) => $"patient:{userId}";
    public static string ClinicGroup(Guid clinicId) => $"clinic:{clinicId}";
    public const string ClientMethod = "queueChanged";

    public override async Task OnConnectedAsync()
    {
        var u = Context.User!;
        var sub = u.FindFirstValue("sub");
        var role = u.FindFirstValue("role");
        var clinic = Guid.TryParse(u.FindFirstValue("clinic_id"), out var c) ? c : (Guid?)null;
        var knownRole = role is Roles.Patient or Roles.Nurse or Roles.ClinicAdmin;
        if (sub is null || !knownRole || clinic is null || !limiter.TryAdd(sub))
        {
            Context.Abort(); // missing claims or too many connections: no group is joined
            return;
        }
        Context.Items["counted"] = sub;
        if (role == Roles.Patient) await Groups.AddToGroupAsync(Context.ConnectionId, PatientGroup(sub));
        else await Groups.AddToGroupAsync(Context.ConnectionId, ClinicGroup(clinic.Value));
        await base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        if (Context.Items.TryGetValue("counted", out var s) && s is string sub) limiter.Release(sub);
        return base.OnDisconnectedAsync(exception);
    }
}
