using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Api;
using Data.Entities;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Tests;

[Collection("db")]
public class HubTests(DbFixture fx)
{
    const string Pw = "Correct-horse-1";
    static readonly JsonSerializerOptions J = new(JsonSerializerDefaults.Web);
    record Tok(string AccessToken, string RefreshToken, int ExpiresIn, string Role);

    async Task<(HttpClient Http, string Token)> Login(string identifier)
    {
        var c = fx.Factory.CreateClient();
        var r = await c.PostAsJsonAsync("/api/v1/auth/login", new { identifier, password = Pw });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var t = (await r.Content.ReadFromJsonAsync<Tok>(J))!;
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", t.AccessToken);
        return (c, t.AccessToken);
    }

    sealed class Listener : IAsyncDisposable
    {
        public HubConnection Conn = null!;
        public ConcurrentQueue<JsonElement> Events = new();
        public ValueTask DisposeAsync() => Conn.DisposeAsync();
    }

    async Task<Listener> Connect(string token)
    {
        var l = new Listener();
        // Long polling keeps the test host simple; the token travels in the same access_token query as with WebSockets.
        l.Conn = new HubConnectionBuilder().WithUrl("http://localhost/hubs/queue", o =>
        {
            o.HttpMessageHandlerFactory = _ => fx.Factory.Server.CreateHandler();
            o.Transports = HttpTransportType.LongPolling;
            o.AccessTokenProvider = () => Task.FromResult<string?>(token);
        }).Build();
        l.Conn.On<JsonElement>("queueChanged", e => l.Events.Enqueue(e));
        await l.Conn.StartAsync();
        return l;
    }

    static async Task Settle(params Listener[] ls) => await Task.Delay(700);

    async Task<(HttpClient Nurse, string NurseTok)> Nurse(Guid clinic)
    {
        var u = await fx.CreateStaffAsync(clinic, Roles.Nurse, Pw);
        return await Login(u);
    }

    // A4 / A5: no token, invalid token, expired token: the connection fails and no group is joined
    [Fact]
    public async Task Hub_refuses_missing_invalid_and_expired_tokens_and_never_logs_them()
    {
        var expired = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = "dbp", Audience = "dbp", NotBefore = DateTime.UtcNow.AddHours(-2), Expires = DateTime.UtcNow.AddHours(-1),
            Subject = new ClaimsIdentity([new Claim("sub", Guid.NewGuid().ToString()), new Claim("clinic_id", fx.ClinicA.ToString()), new Claim("role", "nurse")]),
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(fx.JwtKey)), SecurityAlgorithms.HmacSha256),
        });
        var (_, valid) = await Nurse(fx.ClinicA);
        foreach (var bad in new[] { "", "not-a-jwt-value-at-all", expired })
            await Assert.ThrowsAnyAsync<Exception>(async () => { await using var l = await Connect(bad); });
        // The valid token connects (control), and no token value ever reaches the logs.
        await using (var ok = await Connect(valid)) Assert.Equal(HubConnectionState.Connected, ok.Conn.State);
        var logs = fx.Logs.ToString();
        foreach (var t in new[] { expired, valid, "not-a-jwt-value-at-all" }) Assert.DoesNotContain(t, logs);
        Assert.DoesNotContain("access_token", logs);
    }

    // A3 + group rules: clinic scoping, patient isolation, admin read-only in the clinic group
    [Fact]
    public async Task Events_reach_only_the_right_groups_and_carry_no_personal_data()
    {
        var (nurseA, tokA) = await Nurse(fx.ClinicA);
        var (_, tokB) = await Nurse(fx.ClinicB);
        var admin = await Login(await fx.CreateStaffAsync(fx.ClinicA, Roles.ClinicAdmin, Pw));
        var p1 = await fx.CreatePatientAsync(fx.ClinicA, active: true, password: Pw);
        var p2 = await fx.CreatePatientAsync(fx.ClinicA, active: true, password: Pw);
        var (_, p1Tok) = await Login(p1.Phone);
        var (_, p2Tok) = await Login(p2.Phone);
        await using var a = await Connect(tokA);
        await using var b = await Connect(tokB);
        await using var adm = await Connect(admin.Token);
        await using var l1 = await Connect(p1Tok);
        await using var l2 = await Connect(p2Tok);

        // Staff check-in for patient 1 (carries a patient link, no name in the event)
        var ci = await nurseA.PostAsJsonAsync("/api/v1/staff/checkins", new { patientId = p1.PatientId, idempotencyKey = Guid.NewGuid().ToString() });
        Assert.Equal(HttpStatusCode.Created, ci.StatusCode);
        var entryId = (await ci.Content.ReadFromJsonAsync<JsonElement>(J)).GetProperty("queueEntryId").GetGuid();
        await Settle();
        Assert.Single(a.Events);
        Assert.Single(adm.Events);
        Assert.Single(l1.Events);
        Assert.Empty(b.Events);   // another clinic: zero events
        Assert.Empty(l2.Events);  // another patient in the same clinic: zero events

        // Walk-in with a name: staff see an event, no patient does.
        await nurseA.PostAsJsonAsync("/api/v1/staff/checkins", new { walkInName = "Zainab Walkin", idempotencyKey = Guid.NewGuid().ToString() });
        await Settle();
        Assert.Equal(2, a.Events.Count);
        Assert.Single(l1.Events);
        Assert.Empty(l2.Events);

        // Status change, assignment and urgency each publish after commit.
        var room = await fx.CreateRoomAsync(fx.ClinicA);
        await nurseA.PatchAsJsonAsync($"/api/v1/staff/queue/{entryId}", new { status = "called" });
        await nurseA.PatchAsJsonAsync($"/api/v1/staff/queue/{entryId}", new { roomId = room });
        await nurseA.PatchAsJsonAsync($"/api/v1/staff/queue/{entryId}", new { urgent = true, urgentReason = "other" });
        await Settle();
        Assert.Equal(5, a.Events.Count);
        Assert.Equal(4, l1.Events.Count);
        Assert.Empty(b.Events);
        Assert.Empty(l2.Events);

        // Payload shape: exactly four fields, small, increasing version, no personal data.
        var versions = new List<long>();
        foreach (var e in a.Events.Concat(l1.Events))
        {
            var raw = e.GetRawText();
            Assert.Equal(["queueEntryId", "type", "updatedAt", "version"], e.EnumerateObject().Select(p => p.Name).OrderBy(x => x, StringComparer.Ordinal));
            Assert.Equal("queue.changed", e.GetProperty("type").GetString());
            Assert.True(raw.Length < 1024);
            foreach (var banned in new[] { "Zainab", "Walkin", p1.Phone, p2.Phone, "name", "phone", "room", "urgent", "wait", "position" })
                Assert.DoesNotContain(banned, raw, StringComparison.OrdinalIgnoreCase);
        }
        versions.AddRange(a.Events.Select(e => e.GetProperty("version").GetInt64()));
        Assert.Equal(versions.OrderBy(v => v), versions); // delivered in increasing order
        Assert.Equal(versions.Count, versions.Distinct().Count());
    }

    [Fact]
    public async Task Queue_changes_by_patients_check_in_also_publish_and_a_failed_change_publishes_nothing()
    {
        var (nurse, tokN) = await Nurse(fx.ClinicA);
        var p = await fx.CreatePatientAsync(fx.ClinicA, active: true, password: Pw);
        await fx.AddAppointmentTodayAsync(fx.ClinicA, p.PatientId);
        var (pc, pTok) = await Login(p.Phone);
        await using var staff = await Connect(tokN);
        await using var mine = await Connect(pTok);
        var qr = (await (await nurse.PostAsJsonAsync("/api/v1/staff/qr-tokens", new { })).Content.ReadFromJsonAsync<JsonElement>(J)).GetProperty("token").GetString();
        var r = await pc.PostAsJsonAsync("/api/v1/checkins", new { token = qr, idempotencyKey = Guid.NewGuid().ToString() });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        await Settle();
        Assert.Single(staff.Events);
        Assert.Single(mine.Events);

        // A repeat check-in changes nothing, so it publishes nothing. An invalid transition publishes nothing either.
        await pc.PostAsJsonAsync("/api/v1/checkins", new { token = qr, idempotencyKey = Guid.NewGuid().ToString() });
        var id = (await r.Content.ReadFromJsonAsync<JsonElement>(J)).GetProperty("queueEntryId").GetGuid();
        var bad = await nurse.PatchAsJsonAsync($"/api/v1/staff/queue/{id}", new { status = "completed" });
        Assert.Equal(HttpStatusCode.Conflict, bad.StatusCode);
        await Settle();
        Assert.Single(staff.Events);
        Assert.Single(mine.Events);
    }

    // A4: the hub has no client-to-server methods at all, so a patient cannot join any group
    [Fact]
    public async Task A_patient_cannot_invoke_JoinGroup_or_any_method()
    {
        var p = await fx.CreatePatientAsync(fx.ClinicA, active: true, password: Pw);
        var (_, tok) = await Login(p.Phone);
        await using var l = await Connect(tok);
        var ex = await Assert.ThrowsAsync<HubException>(() => l.Conn.InvokeAsync("JoinGroup", $"clinic:{fx.ClinicA}"));
        Assert.Contains("JoinGroup", ex.Message);
        await Assert.ThrowsAsync<HubException>(() => l.Conn.InvokeAsync("AddToGroup", $"clinic:{fx.ClinicA}"));

        // She stays isolated: a clinic change does not reach her.
        var (nurse, _) = await Nurse(fx.ClinicA);
        await nurse.PostAsJsonAsync("/api/v1/staff/checkins", new { walkInName = "Someone", idempotencyKey = Guid.NewGuid().ToString() });
        await Settle();
        Assert.Empty(l.Events);
    }

    [Fact]
    public async Task At_most_three_connections_per_user()
    {
        var (_, tok) = await Nurse(fx.ClinicA);
        await using var c1 = await Connect(tok);
        await using var c2 = await Connect(tok);
        await using var c3 = await Connect(tok);
        var closed = new TaskCompletionSource();
        var c4 = new HubConnectionBuilder().WithUrl("http://localhost/hubs/queue", o =>
        {
            o.HttpMessageHandlerFactory = _ => fx.Factory.Server.CreateHandler();
            o.Transports = HttpTransportType.LongPolling;
            o.AccessTokenProvider = () => Task.FromResult<string?>(tok);
        }).Build();
        c4.Closed += _ => { closed.TrySetResult(); return Task.CompletedTask; };
        try { await c4.StartAsync(); } catch { closed.TrySetResult(); }
        await Task.WhenAny(closed.Task, Task.Delay(5000));
        Assert.True(closed.Task.IsCompleted, "the fourth connection is closed by the server");
        Assert.NotEqual(HubConnectionState.Connected, c4.State);
        await c4.DisposeAsync();
        // Dropping one frees a slot.
        await c1.Conn.StopAsync();
        await Task.Delay(300);
        await using var again = await Connect(tok);
        Assert.Equal(HubConnectionState.Connected, again.Conn.State);
    }

    [Fact]
    public void Versions_only_go_up()
    {
        var seen = Enumerable.Range(0, 2000).Select(_ => QueueEvents.NextVersion()).ToList();
        Assert.Equal(seen.OrderBy(v => v), seen);
        Assert.Equal(seen.Count, seen.Distinct().Count());
    }

    // A10: 200 concurrent clients on one clinic; one change; p95 delivery under 2 s; no leaked connections afterwards.
    [Fact]
    public async Task Load_200_clients_one_change_p95_under_two_seconds_and_no_leaks()
    {
        string Mint(Guid sub) => new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = "dbp", Audience = "dbp", Expires = DateTime.UtcNow.AddMinutes(10),
            Subject = new ClaimsIdentity([new Claim("sub", sub.ToString()), new Claim("clinic_id", fx.ClinicA.ToString()), new Claim("role", "nurse")]),
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(fx.JwtKey)), SecurityAlgorithms.HmacSha256),
        });
        var subs = Enumerable.Range(0, 200).Select(_ => Guid.NewGuid()).ToList();
        var clients = new List<Listener>();
        var arrived = new ConcurrentDictionary<int, long>();
        var sw = System.Diagnostics.Stopwatch.StartNew();
        await Task.WhenAll(subs.Select(async (s, idx) =>
        {
            var l = await Connect(Mint(s));
            l.Conn.On<JsonElement>("queueChanged", _ => arrived.TryAdd(idx, sw.ElapsedMilliseconds));
            lock (clients) clients.Add(l);
        }));
        Assert.Equal(200, clients.Count);

        var (nurse, _) = await Nurse(fx.ClinicA);
        var t0 = sw.ElapsedMilliseconds;
        var r = await nurse.PostAsJsonAsync("/api/v1/staff/checkins", new { walkInName = "Load test", idempotencyKey = Guid.NewGuid().ToString() });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (arrived.Count < 200 && DateTime.UtcNow < deadline) await Task.Delay(50);
        Assert.Equal(200, arrived.Count);
        var delays = arrived.Values.Select(v => v - t0).OrderBy(v => v).ToList();
        var p95 = delays[(int)Math.Ceiling(delays.Count * 0.95) - 1];
        Assert.True(p95 < 2000, $"p95 delivery {p95} ms");

        foreach (var c in clients) await c.DisposeAsync();
        await Task.Delay(500);
        var limiter = fx.Factory.Services.GetRequiredService<HubConnectionLimiter>();
        Assert.All(subs, s => Assert.Equal(0, limiter.Count(s.ToString())));
    }
}
