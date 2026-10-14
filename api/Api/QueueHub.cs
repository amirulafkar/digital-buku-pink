using System.Security.Claims;
using Data.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Api;

public static class QueueGroups
{
    public const string Path = "/hubs/queue";
    public const string Event = "QueueChanged";
    public static string Staff(Guid clinicId) => $"clinic:{clinicId}:staff";
    public static string Patient(Guid clinicId, Guid userId) => $"clinic:{clinicId}:patient:{userId}";
}

/// <summary>
/// Server-to-client only. There is no client-invokable method: clients cannot send anything, join a group or ask for data.
/// Groups come from the JWT claims on connect and nowhere else. The event has zero arguments; the client refetches over REST,
/// which applies the normal clinic and own-row checks. Connect and deny are not audited (human decision, brief S5 no. 5).
/// </summary>
[Authorize(Policy = "Live")]
public class QueueHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var u = Context.User;
        var role = u?.FindFirstValue("role");
        if (u is null || !Guid.TryParse(u.FindFirstValue("clinic_id"), out var clinic) || !Guid.TryParse(u.FindFirstValue("sub"), out var sub))
        {
            Context.Abort();
            return;
        }
        if (role is Roles.Nurse or Roles.ClinicAdmin) await Groups.AddToGroupAsync(Context.ConnectionId, QueueGroups.Staff(clinic));
        else if (role == Roles.Patient) await Groups.AddToGroupAsync(Context.ConnectionId, QueueGroups.Patient(clinic, sub));
        else { Context.Abort(); return; }
        await base.OnConnectedAsync();
    }
}
