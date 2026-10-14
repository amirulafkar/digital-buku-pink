using Microsoft.AspNetCore.SignalR;

namespace Api;

/// <summary>Tells connected screens that something changed. It never says what: no entry id, name, status, room, urgent flag or wait.</summary>
public interface IQueueNotifier
{
    /// <summary>Staff of the clinic always; the mother's own connection only when patientUserId is given.</summary>
    Task QueueChangedAsync(Guid clinicId, Guid? patientUserId);
}

public class QueueNotifier(IHubContext<QueueHub> hub) : IQueueNotifier
{
    public Task QueueChangedAsync(Guid clinicId, Guid? patientUserId)
    {
        var groups = new List<string> { QueueGroups.Staff(clinicId) };
        if (patientUserId is { } uid) groups.Add(QueueGroups.Patient(clinicId, uid));
        return hub.Clients.Groups(groups).SendAsync(QueueGroups.Event);
    }
}
