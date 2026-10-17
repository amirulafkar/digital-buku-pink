using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Data;
using Data.Entities;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;

namespace Tests;

/// <summary>S7 follow-up: the hub is long polling only and the JWT travels in the Authorization header, never in a URL.</summary>
[Collection("db")]
public class S7LongPollTests(DbFixture fx)
{
    const string Pw = "Correct-horse-1";
    static readonly JsonSerializerOptions J = new(JsonSerializerDefaults.Web);
    record Tok(string AccessToken, string RefreshToken, int ExpiresIn, string Role);
    record Issued(string Token, DateTimeOffset ExpiresAt);

    sealed record Seen(string Method, string Url, bool HasBearer);

    sealed class Recorder(HttpMessageHandler inner, List<Seen> seen, string jwt) : DelegatingHandler(inner)
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var bearer = request.Headers.Authorization is { Scheme: "Bearer" } a && a.Parameter == jwt;
            lock (seen) seen.Add(new Seen(request.Method.Method, request.RequestUri!.ToString(), bearer));
            return base.SendAsync(request, ct);
        }
    }

    async Task<(HttpClient C, string Token)> Login(string identifier)
    {
        var c = fx.Factory.CreateClient();
        var r = await c.PostAsJsonAsync("/api/v1/auth/login", new { identifier, password = Pw });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var t = (await r.Content.ReadFromJsonAsync<Tok>(J))!.AccessToken;
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", t);
        return (c, t);
    }

    HubConnection Hub(string token, List<Seen> seen, HttpTransportType transports = HttpTransportType.LongPolling) =>
        new HubConnectionBuilder().WithUrl(new Uri(fx.Factory.Server.BaseAddress, "/hubs/queue"), o =>
        {
            o.HttpMessageHandlerFactory = _ => new Recorder(fx.Factory.Server.CreateHandler(), seen, token);
            o.Transports = transports;
            o.AccessTokenProvider = () => Task.FromResult<string?>(token);
        }).Build();

    static async Task<bool> Wait(Func<bool> done, int ms = 8000) { for (var t = 0; t < ms && !done(); t += 50) await Task.Delay(50); return done(); }

    [Fact]
    public async Task S7LP_negotiate_offers_long_polling_only()
    {
        var (c, _) = await Login(await fx.CreateStaffAsync(fx.ClinicA, Roles.Nurse, Pw));
        var r = await c.PostAsync("/hubs/queue/negotiate?negotiateVersion=1", null);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var body = await r.Content.ReadAsStringAsync();
        Assert.Contains("LongPolling", body);
        Assert.DoesNotContain("WebSockets", body);
        Assert.DoesNotContain("ServerSentEvents", body);
    }

    [Fact]
    public async Task S7LP_a_websocket_only_client_cannot_connect_even_with_a_valid_token()
    {
        var (_, token) = await Login(await fx.CreateStaffAsync(fx.ClinicA, Roles.Nurse, Pw));
        var seen = new List<Seen>();
        await using var hub = Hub(token, seen, HttpTransportType.WebSockets);
        await Assert.ThrowsAnyAsync<Exception>(() => hub.StartAsync());
    }

    [Fact]
    public async Task S7LP_connect_receive_and_reconnect_never_put_the_token_in_a_URL_and_always_send_the_header()
    {
        var (nurse, nTok) = await Login(await fx.CreateStaffAsync(fx.ClinicA, Roles.Nurse, Pw));
        var p = await fx.CreatePatientAsync(fx.ClinicA, active: true, password: Pw);
        await fx.AddAppointmentTodayAsync(fx.ClinicA, p.PatientId);
        var (mother, mTok) = await Login(p.Phone);

        var seen = new List<Seen>();
        var events = 0;
        await using var hub = Hub(nTok, seen);
        hub.On("QueueChanged", () => Interlocked.Increment(ref events));
        await hub.StartAsync();
        await Task.Delay(400);

        // An event: the mother checks in.
        var qr = (await (await nurse.PostAsJsonAsync("/api/v1/staff/qr-tokens", new { })).Content.ReadFromJsonAsync<Issued>(J))!.Token;
        var ci = await mother.PostAsJsonAsync("/api/v1/checkins", new { token = qr, idempotencyKey = Guid.NewGuid().ToString() });
        Assert.Equal(HttpStatusCode.Created, ci.StatusCode);
        Assert.True(await Wait(() => Volatile.Read(ref events) >= 1), "the long poll should deliver the event");

        // Reconnect: stop, then a new connection with the same token source.
        await hub.StopAsync();
        var before = events;
        await hub.StartAsync();
        await Task.Delay(400);
        var id = JsonDocument.Parse(await ci.Content.ReadAsStringAsync()).RootElement.GetProperty("queueEntryId").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await nurse.PatchAsJsonAsync($"/api/v1/staff/queue/{id}", new { status = "called" })).StatusCode);
        Assert.True(await Wait(() => Volatile.Read(ref events) > before), "the new connection should receive the next event");

        List<Seen> hubCalls; lock (seen) hubCalls = seen.Where(s => s.Url.Contains("/hubs/queue")).ToList();
        Assert.Contains(hubCalls, s => s.Method == "POST" && s.Url.Contains("/negotiate"));
        Assert.Contains(hubCalls, s => s.Method == "GET"); // the polls
        Assert.True(hubCalls.Count >= 5, $"saw {hubCalls.Count} hub requests");
        Assert.All(hubCalls, s => Assert.DoesNotContain("access_token", s.Url, StringComparison.OrdinalIgnoreCase));
        Assert.All(hubCalls, s => Assert.DoesNotContain(nTok, s.Url));
        Assert.Contains(hubCalls, s => s.Method == "DELETE"); // the close call is part of what is checked
        Assert.All(hubCalls, s => Assert.True(s.HasBearer, $"{s.Method} {s.Url} had no Authorization header"));
        Assert.DoesNotContain(mTok, string.Concat(hubCalls.Select(s => s.Url)));

        // Logs: neither token nor the query name appears.
        var logs = fx.Logs.ToString();
        Assert.DoesNotContain(nTok, logs);
        Assert.DoesNotContain(mTok, logs);
        Assert.DoesNotContain("access_token", logs, StringComparison.OrdinalIgnoreCase);
    }
}
