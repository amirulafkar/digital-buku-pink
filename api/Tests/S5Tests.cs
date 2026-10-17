using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Api;
using Data;
using Data.Entities;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using System.Text;

namespace Tests;

/// <summary>S5: the live refresh hub. Long polling is used because TestServer has no real sockets; the server code path is the same.</summary>
[Collection("db")]
public class S5Tests(DbFixture fx)
{
    const string Pw = "Correct-horse-1";
    static readonly JsonSerializerOptions J = new(JsonSerializerDefaults.Web);
    record Tok(string AccessToken, string RefreshToken, int ExpiresIn, string Role);
    record Issued(string Token, DateTimeOffset ExpiresAt);

    // ---------- helpers ----------
    async Task<string> LoginToken(string identifier)
    {
        var r = await fx.Factory.CreateClient().PostAsJsonAsync("/api/v1/auth/login", new { identifier, password = Pw });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return (await r.Content.ReadFromJsonAsync<Tok>(J))!.AccessToken;
    }

    static HttpClient WithToken(WebApplicationFactory<Program> f, string token)
    {
        var c = f.CreateClient();
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return c;
    }

    async Task<(HttpClient C, string Token, DbFixture.TestPatient P)> Mother(Guid? clinic = null)
    {
        var p = await fx.CreatePatientAsync(clinic ?? fx.ClinicA, active: true, password: Pw);
        await fx.AddAppointmentTodayAsync(clinic ?? fx.ClinicA, p.PatientId);
        var t = await LoginToken(p.Phone);
        return (WithToken(fx.Factory, t), t, p);
    }

    async Task<(HttpClient C, string Token)> Nurse(Guid? clinic = null)
    {
        var t = await LoginToken(await fx.CreateStaffAsync(clinic ?? fx.ClinicA, Roles.Nurse, Pw));
        return (WithToken(fx.Factory, t), t);
    }

    static async Task<string> Qr(HttpClient nurse) =>
        (await (await nurse.PostAsJsonAsync("/api/v1/staff/qr-tokens", new { })).Content.ReadFromJsonAsync<Issued>(J))!.Token;

    sealed class FrameRecorder(HttpMessageHandler inner, List<string> frames) : DelegatingHandler(inner)
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var r = await base.SendAsync(request, ct);
            if (request.Method == HttpMethod.Get && request.RequestUri!.AbsolutePath.StartsWith("/hubs/queue") && r.Content is not null)
            {
                await r.Content.LoadIntoBufferAsync();
                var text = await r.Content.ReadAsStringAsync(ct);
                if (text.Length > 0) lock (frames) frames.Add(text);
            }
            return r;
        }
    }

    sealed class Probe : IAsyncDisposable
    {
        public HubConnection Hub = null!;
        public int Count;
        public bool Closed;
        public List<string> Frames = [];
        public async Task<bool> WaitCount(int n, int ms = 6000)
        {
            for (var t = 0; t < ms; t += 50) { if (Volatile.Read(ref Count) >= n) return true; await Task.Delay(50); }
            return Volatile.Read(ref Count) >= n;
        }
        public ValueTask DisposeAsync() => Hub.DisposeAsync();
    }

    static async Task<Probe> Connect(WebApplicationFactory<Program> f, string token)
    {
        var p = new Probe();
        p.Hub = new HubConnectionBuilder().WithUrl(new Uri(f.Server.BaseAddress, "/hubs/queue"), o =>
        {
            o.HttpMessageHandlerFactory = _ => new FrameRecorder(f.Server.CreateHandler(), p.Frames);
            o.Transports = HttpTransportType.LongPolling;
            o.AccessTokenProvider = () => Task.FromResult<string?>(token);
        }).Build();
        p.Hub.On("QueueChanged", () => Interlocked.Increment(ref p.Count)); // zero parameters: an event with arguments would break the connection
        p.Hub.Closed += _ => { p.Closed = true; return Task.CompletedTask; };
        await p.Hub.StartAsync();
        await Task.Delay(300); // group join runs right after the handshake
        return p;
    }

    static async Task Quiet() => await Task.Delay(1500);

    async Task<Guid> CheckIn(HttpClient mother, HttpClient nurse, string? key = null)
    {
        var r = await mother.PostAsJsonAsync("/api/v1/checkins", new { token = await Qr(nurse), idempotencyKey = key ?? Guid.NewGuid().ToString() });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        return JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.GetProperty("queueEntryId").GetGuid();
    }

    // ---------- S5-A1 ----------
    [Fact]
    public async Task S5_A1_status_change_reaches_staff_and_only_the_owning_mother()
    {
        var (nurse, nTok) = await Nurse();
        var (m1, t1, _) = await Mother();
        var (m2, t2, _) = await Mother();
        var id = await CheckIn(m1, nurse);
        await CheckIn(m2, nurse);

        await using var staff = await Connect(fx.Factory, nTok);
        await using var own = await Connect(fx.Factory, t1);
        await using var other = await Connect(fx.Factory, t2);

        var r = await nurse.PatchAsJsonAsync($"/api/v1/staff/queue/{id}", new { status = "called" });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.True(await staff.WaitCount(1));
        Assert.True(await own.WaitCount(1));
        await Quiet();
        Assert.Equal(1, staff.Count);
        Assert.Equal(1, own.Count);
        Assert.Equal(0, other.Count);

        // A room change also reaches the owner; staff assignment alone does not.
        var room = await fx.CreateRoomAsync(fx.ClinicA);
        await nurse.PatchAsJsonAsync($"/api/v1/staff/queue/{id}", new { roomId = room });
        Assert.True(await own.WaitCount(2));
        Assert.Equal(0, other.Count);
    }

    [Fact]
    public async Task S5_A1b_clinic_admin_joins_the_staff_group_read_only()
    {
        var (nurse, _) = await Nurse();
        var admin = await Connect(fx.Factory, await LoginToken(await fx.CreateStaffAsync(fx.ClinicA, Roles.ClinicAdmin, Pw)));
        await using var _a = admin;
        var (m, _, _) = await Mother();
        await CheckIn(m, nurse);
        Assert.True(await admin.WaitCount(1));
        // The hub has no method a client could call, admin or not.
        await Assert.ThrowsAsync<HubException>(() => admin.Hub.InvokeAsync("JoinGroup", "clinic:x:staff"));
        await Assert.ThrowsAsync<HubException>(() => admin.Hub.InvokeAsync("QueueChanged"));
        await Assert.ThrowsAsync<HubException>(() => admin.Hub.InvokeAsync("OnConnectedAsync"));
    }

    // ---------- S5-A2 ----------
    [Fact]
    public async Task S5_A2_another_clinic_hears_nothing()
    {
        var (nurseA, tA) = await Nurse();
        var (_, tB) = await Nurse(fx.ClinicB);
        var (mB, tMB, _) = await Mother(fx.ClinicB);
        await using var a = await Connect(fx.Factory, tA);
        await using var b = await Connect(fx.Factory, tB);
        await using var motherB = await Connect(fx.Factory, tMB);

        var (m, _, _) = await Mother();
        await CheckIn(m, nurseA);
        Assert.True(await a.WaitCount(1));
        await Quiet();
        Assert.Equal(0, b.Count);
        Assert.Equal(0, motherB.Count);
    }

    // ---------- S5-A3 ----------
    [Fact]
    public async Task S5_A3_every_frame_has_zero_arguments_and_no_personal_or_clinical_text()
    {
        var (nurse, nTok) = await Nurse();
        var (m, mTok, p) = await Mother();
        await using var staff = await Connect(fx.Factory, nTok);
        await using var mom = await Connect(fx.Factory, mTok);
        var id = await CheckIn(m, nurse);
        var room = await fx.CreateRoomAsync(fx.ClinicA);
        await nurse.PatchAsJsonAsync($"/api/v1/staff/queue/{id}", new { roomId = room });
        await nurse.PatchAsJsonAsync($"/api/v1/staff/queue/{id}", new { status = "called" });
        await nurse.PatchAsJsonAsync($"/api/v1/staff/queue/{id}", new { urgent = true, urgentReason = "staff_judgement" });
        Assert.True(await staff.WaitCount(4));
        Assert.True(await mom.WaitCount(3));
        await Quiet();

        var frames = staff.Frames.Concat(mom.Frames).ToList();
        var events = frames.SelectMany(f => f.Split('\u001e', StringSplitOptions.RemoveEmptyEntries)).Where(x => x.Contains("QueueChanged")).ToList();
        Assert.True(events.Count >= 7, $"captured {events.Count}");
        foreach (var e in events)
        {
            var j = JsonDocument.Parse(e).RootElement;
            Assert.Equal("QueueChanged", j.GetProperty("target").GetString());
            Assert.Equal(0, j.GetProperty("arguments").GetArrayLength());
            foreach (var banned in new[] { p.Phone, "Test (demo)", "Bilik", "urgent", "called", "waiting", "status", "wait", "staff_judgement", id.ToString() })
                Assert.DoesNotContain(banned, e, StringComparison.OrdinalIgnoreCase);
        }
        Assert.DoesNotContain(p.Phone, fx.Logs.ToString());
    }

    // ---------- S5-A4 ----------
    [Fact]
    public async Task S5_A4_urgent_flag_reaches_staff_only()
    {
        var (nurse, nTok) = await Nurse();
        var (m, mTok, _) = await Mother();
        var id = await CheckIn(m, nurse);
        await using var staff = await Connect(fx.Factory, nTok);
        await using var mom = await Connect(fx.Factory, mTok);
        var r = await nurse.PatchAsJsonAsync($"/api/v1/staff/queue/{id}", new { urgent = true, urgentReason = "accessibility_need" });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.True(await staff.WaitCount(1));
        await Quiet();
        Assert.Equal(0, mom.Count);
    }

    // ---------- S5-A5 ----------
    [Fact]
    public async Task S5_A5_replay_200_emits_nothing_and_a_new_check_in_201_emits_exactly_once()
    {
        var (nurse, nTok) = await Nurse();
        var (m, mTok, _) = await Mother();
        await using var staff = await Connect(fx.Factory, nTok);
        await using var mom = await Connect(fx.Factory, mTok);
        var key = Guid.NewGuid().ToString();
        await CheckIn(m, nurse, key);
        Assert.True(await staff.WaitCount(1));
        Assert.True(await mom.WaitCount(1));
        await Quiet();
        Assert.Equal(1, staff.Count);
        Assert.Equal(1, mom.Count);

        var replay = await m.PostAsJsonAsync("/api/v1/checkins", new { token = await Qr(nurse), idempotencyKey = key });
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        await Quiet();
        Assert.Equal(1, staff.Count);
        Assert.Equal(1, mom.Count);
    }

    // ---------- S5-A6 ----------
    [Fact]
    public async Task S5_A6_hub_needs_a_header_token_and_a_token_in_any_URL_never_authenticates()
    {
        var anon = fx.Factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsync("/hubs/queue/negotiate?negotiateVersion=1", null)).StatusCode);

        var (_, nTok) = await Nurse();
        // Header token on the hub negotiate: accepted. The same token in the query string (the old WebSocket way) is NOT: the path is closed.
        Assert.Equal(HttpStatusCode.OK, (await WithToken(fx.Factory, nTok).PostAsync("/hubs/queue/negotiate?negotiateVersion=1", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsync($"/hubs/queue/negotiate?negotiateVersion=1&access_token={nTok}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsync("/hubs/queue/negotiate?negotiateVersion=1&access_token=not-a-token", null)).StatusCode);
        // Hub poll and close calls (GET, DELETE) with the token in the query string are refused too.
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync($"/hubs/queue?id=abc&access_token={nTok}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.DeleteAsync($"/hubs/queue?id=abc&access_token={nTok}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsync($"/hubs/queue?id=abc&access_token={nTok}", null)).StatusCode);
        // The same valid token in the query of any API route does not authenticate.
        foreach (var path in new[] { "/api/v1/staff/queue", "/api/v1/staff/rooms", "/api/v1/me", "/api/v1/queue/me" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync($"{path}?access_token={nTok}")).StatusCode);
        // The header still works on the API.
        Assert.Equal(HttpStatusCode.OK, (await WithToken(fx.Factory, nTok).GetAsync("/api/v1/staff/queue")).StatusCode);

        // The token never reaches the logs.
        Assert.DoesNotContain(nTok, fx.Logs.ToString());
    }

    // ---------- connection closes at token expiry ----------
    [Fact]
    public async Task S5_connection_is_closed_by_the_server_when_the_access_token_expires()
    {
        var a = fx.Factory.Services.GetRequiredService<IOptions<AuthOptions>>().Value;
        var token = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = a.Issuer, Audience = a.Audience,
            Expires = DateTime.UtcNow.AddSeconds(3),
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(a.Key)), SecurityAlgorithms.HmacSha256),
            Subject = new ClaimsIdentity([new Claim("sub", Guid.NewGuid().ToString()), new Claim("clinic_id", fx.ClinicA.ToString()), new Claim("role", Roles.Nurse)]),
        });
        await using var p = await Connect(fx.Factory, token);
        Assert.False(p.Closed);
        for (var t = 0; t < 40_000 && !p.Closed; t += 250) await Task.Delay(250);
        Assert.True(p.Closed, "the server should close the connection at token expiry");
    }

    // ---------- emit after commit; failure never changes the response ----------
    sealed class SpyNotifier(Func<Guid, Guid?, Task> onCall) : IQueueNotifier
    {
        public int Calls;
        public Task QueueChangedAsync(Guid clinicId, Guid? patientUserId) { Interlocked.Increment(ref Calls); return onCall(clinicId, patientUserId); }
    }

    WebApplicationFactory<Program> WithNotifier(IQueueNotifier n) =>
        fx.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => { s.RemoveAll<IQueueNotifier>(); s.AddSingleton(n); }));

    [Fact]
    public async Task S5_emit_happens_after_the_transaction_commits()
    {
        Guid patientId = default;
        string? seenAtCheckin = null, seenAtPatch = null;
        var spy = new SpyNotifier(async (_, _) =>
        {
            // A separate connection only sees committed rows.
            await using var db = fx.Owner();
            var e = await db.QueueEntries.AsNoTracking().Where(q => q.PatientId == patientId).SingleOrDefaultAsync();
            if (e is null) return;
            seenAtCheckin ??= e.Status;
            seenAtPatch = e.Status;
        });
        using var f = WithNotifier(spy);
        var p = await fx.CreatePatientAsync(fx.ClinicA, active: true, password: Pw);
        patientId = p.PatientId;
        await fx.AddAppointmentTodayAsync(fx.ClinicA, p.PatientId);
        var nurse = WithToken(f, await LoginToken(await fx.CreateStaffAsync(fx.ClinicA, Roles.Nurse, Pw)));
        var mother = WithToken(f, await LoginToken(p.Phone));

        var id = await CheckIn(mother, nurse);
        Assert.Equal(1, spy.Calls);
        Assert.Equal("waiting", seenAtCheckin);

        Assert.Equal(HttpStatusCode.OK, (await nurse.PatchAsJsonAsync($"/api/v1/staff/queue/{id}", new { status = "called" })).StatusCode);
        Assert.Equal(2, spy.Calls);
        Assert.Equal("called", seenAtPatch);

        // A rejected transition emits nothing.
        Assert.Equal(HttpStatusCode.Conflict, (await nurse.PatchAsJsonAsync($"/api/v1/staff/queue/{id}", new { status = "completed" })).StatusCode);
        Assert.Equal(2, spy.Calls);
    }

    [Fact]
    public async Task S5_emit_failure_keeps_the_201_and_the_state_change_and_is_logged()
    {
        var spy = new SpyNotifier((_, _) => throw new InvalidOperationException("hub down"));
        using var f = WithNotifier(spy);
        var p = await fx.CreatePatientAsync(fx.ClinicA, active: true, password: Pw);
        await fx.AddAppointmentTodayAsync(fx.ClinicA, p.PatientId);
        var nurse = WithToken(f, await LoginToken(await fx.CreateStaffAsync(fx.ClinicA, Roles.Nurse, Pw)));
        var mother = WithToken(f, await LoginToken(p.Phone));

        var id = await CheckIn(mother, nurse); // asserts 201
        var r = await nurse.PatchAsJsonAsync($"/api/v1/staff/queue/{id}", new { status = "called" });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(2, spy.Calls);
        await using var db = fx.Owner();
        Assert.Equal("called", (await db.QueueEntries.AsNoTracking().SingleAsync(q => q.Id == id)).Status);
        Assert.Equal(1, await db.AuditLogs.AsNoTracking().CountAsync(a => a.EntityId == id && a.Action == "status"));
        Assert.Contains("QueueChanged emit failed", fx.Logs.ToString());
    }
}
