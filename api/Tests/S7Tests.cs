using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Data;
using Data.Entities;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Tests;

/// <summary>S7 deployment checks: exact-origin CORS, forwarded client address, health without a database. No feature, no endpoint.</summary>
[Collection("db")]
public class S7Tests(DbFixture fx)
{
    const string Pw = "Correct-horse-1";
    const string StaffOrigin = "https://dbp-staff.pages.dev";
    const string MotherOrigin = "https://dbp-mother.pages.dev";

    // UseSetting reaches the host configuration that Program.cs reads at start; lazily read options use the in-memory layer.
    WebApplicationFactory<Program> With(Dictionary<string, string?>? early = null, Dictionary<string, string?>? late = null) =>
        fx.Factory.WithWebHostBuilder(b =>
        {
            foreach (var (k, v) in early ?? []) b.UseSetting(k, v);
            if (late is not null) b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(late));
        });

    WebApplicationFactory<Program> CorsFactory() => With(new() { ["Cors:AllowedOrigins"] = $"{StaffOrigin}, {MotherOrigin}" });

    static HttpRequestMessage Req(HttpMethod m, string url, string? origin)
    {
        var r = new HttpRequestMessage(m, url);
        if (origin is not null) r.Headers.TryAddWithoutValidation("Origin", origin);
        return r;
    }

    static HttpRequestMessage Preflight(string url, string origin, string method, string headers)
    {
        var r = Req(HttpMethod.Options, url, origin);
        r.Headers.TryAddWithoutValidation("Access-Control-Request-Method", method);
        r.Headers.TryAddWithoutValidation("Access-Control-Request-Headers", headers);
        return r;
    }

    static string? Header(HttpResponseMessage r, string name) => r.Headers.TryGetValues(name, out var v) ? string.Join(",", v) : null;

    // S7-A1 (NFR-01, NFR-02): exactly the two origins, nothing else, no credentials.
    [Theory]
    [InlineData(StaffOrigin)]
    [InlineData(MotherOrigin)]
    public async Task S7A1_Listed_origin_gets_its_own_origin_back_and_no_credentials_header(string origin)
    {
        using var f = CorsFactory();
        var r = await f.CreateClient().SendAsync(Req(HttpMethod.Get, "/health", origin));
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(origin, Header(r, "Access-Control-Allow-Origin"));
        Assert.Null(Header(r, "Access-Control-Allow-Credentials"));
    }

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData("https://abc123.dbp-staff.pages.dev")] // a preview deployment
    [InlineData("https://dbp-staff.pages.dev.evil.example")]
    [InlineData("http://dbp-staff.pages.dev")] // wrong scheme
    [InlineData("https://dbp-staff.pages.dev:8443")] // wrong port
    [InlineData("null")]
    public async Task S7A1_Unlisted_or_preview_origin_gets_no_allow_origin_on_the_response_or_the_preflight(string origin)
    {
        using var f = CorsFactory();
        var c = f.CreateClient();
        var get = await c.SendAsync(Req(HttpMethod.Get, "/health", origin));
        Assert.Null(Header(get, "Access-Control-Allow-Origin"));
        var pre = await c.SendAsync(Preflight("/api/v1/auth/login", origin, "POST", "authorization,content-type"));
        Assert.Null(Header(pre, "Access-Control-Allow-Origin"));
        Assert.Null(Header(pre, "Access-Control-Allow-Headers"));
        var hub = await c.SendAsync(Preflight("/hubs/queue/negotiate", origin, "POST", "authorization,x-signalr-user-agent"));
        Assert.Null(Header(hub, "Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task S7A1_REST_preflight_allows_Authorization_and_only_GET_POST_PATCH_and_the_hub_path_adds_DELETE()
    {
        using var f = CorsFactory();
        var c = f.CreateClient();
        var ok = await c.SendAsync(Preflight("/api/v1/staff/queue/00000000-0000-0000-0000-000000000000", StaffOrigin, "PATCH", "authorization,content-type"));
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);
        Assert.Equal(StaffOrigin, Header(ok, "Access-Control-Allow-Origin"));
        var allowedHeaders = (Header(ok, "Access-Control-Allow-Headers") ?? "").ToLowerInvariant();
        Assert.Contains("authorization", allowedHeaders);
        Assert.Contains("content-type", allowedHeaders);
        var methods = Header(ok, "Access-Control-Allow-Methods") ?? "";
        foreach (var m in new[] { "GET", "POST", "PATCH" }) Assert.Contains(m, methods);
        foreach (var m in new[] { "DELETE", "PUT" }) Assert.DoesNotContain(m, methods); // REST routes never get DELETE
        Assert.Null(Header(ok, "Access-Control-Allow-Credentials"));
        Assert.DoesNotContain("*", Header(ok, "Access-Control-Allow-Origin")!);

        // The SignalR negotiate call from a browser.
        var hub = await c.SendAsync(Preflight("/hubs/queue/negotiate", MotherOrigin, "POST", "authorization,x-signalr-user-agent"));
        Assert.Equal(MotherOrigin, Header(hub, "Access-Control-Allow-Origin"));

        // The long polling poll and stop calls from a browser: GET and DELETE on the hub path (and only there) with the Authorization header.
        foreach (var m in new[] { "GET", "POST", "DELETE" })
        {
            var poll = await c.SendAsync(Preflight("/hubs/queue?id=abc", MotherOrigin, m, "authorization,x-signalr-user-agent"));
            Assert.Equal(MotherOrigin, Header(poll, "Access-Control-Allow-Origin"));
            Assert.Contains(m, Header(poll, "Access-Control-Allow-Methods") ?? "");
            Assert.Contains("authorization", (Header(poll, "Access-Control-Allow-Headers") ?? "").ToLowerInvariant());
            Assert.DoesNotContain("PATCH", Header(poll, "Access-Control-Allow-Methods") ?? "");
        }
        // DELETE on a REST path: the preflight does not list it, so a browser would refuse the real request.
        foreach (var path in new[] { "/api/v1/staff/queue", "/api/v1/staff/queue/00000000-0000-0000-0000-000000000000", "/api/v1/checkins", "/api/v1/auth/login" })
            Assert.DoesNotContain("DELETE", Header(await c.SendAsync(Preflight(path, StaffOrigin, "DELETE", "authorization")), "Access-Control-Allow-Methods") ?? "", StringComparison.Ordinal);

        // Not listed: PUT and an arbitrary request header. The answer lists only the allowed methods and headers, so a browser refuses the real request.
        var put = await c.SendAsync(Preflight("/api/v1/staff/queue", StaffOrigin, "PUT", "authorization"));
        Assert.DoesNotContain("PUT", Header(put, "Access-Control-Allow-Methods") ?? "");
        var evil = await c.SendAsync(Preflight("/api/v1/staff/queue", StaffOrigin, "GET", "authorization,x-evil"));
        Assert.DoesNotContain("x-evil", (Header(evil, "Access-Control-Allow-Headers") ?? "").ToLowerInvariant());
    }

    // The API has no DELETE route. Every REST path refuses it, signed in or not (405 or 404, or 401 before any sign-in), and nothing changes.
    [Fact]
    public async Task S7A1_Every_REST_route_refuses_DELETE_with_and_without_a_Bearer()
    {
        var anon = fx.Factory.CreateClient();
        var user = await fx.CreateStaffAsync(fx.ClinicA, Roles.Nurse, Pw);
        var login = await fx.Factory.CreateClient().PostAsJsonAsync("/api/v1/auth/login", new { identifier = user, password = Pw });
        var token = JsonDocument.Parse(await login.Content.ReadAsStringAsync()).RootElement.GetProperty("accessToken").GetString()!;
        var signedIn = fx.Factory.CreateClient();
        signedIn.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var id = "00000000-0000-0000-0000-000000000000";
        string[] paths = ["/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout", "/api/v1/auth/activate", "/api/v1/staff/queue", $"/api/v1/staff/queue/{id}", "/api/v1/staff/audit",
            "/api/v1/staff/qr-tokens", "/api/v1/staff/checkins", "/api/v1/staff/patients/search", $"/api/v1/staff/patients/{id}", "/api/v1/staff/activation-codes", "/api/v1/staff/nurses",
            "/api/v1/staff/rooms", "/api/v1/checkins", "/api/v1/me", "/api/v1/appointments/next", "/api/v1/queue/me", "/health"];
        foreach (var path in paths)
        {
            var noToken = await anon.DeleteAsync(path);
            Assert.Contains(noToken.StatusCode, new[] { HttpStatusCode.Unauthorized, HttpStatusCode.NotFound, HttpStatusCode.MethodNotAllowed });
            var withToken = await signedIn.DeleteAsync(path);
            Assert.Contains(withToken.StatusCode, new[] { HttpStatusCode.NotFound, HttpStatusCode.MethodNotAllowed });
        }
    }

    [Fact]
    public async Task S7A1_With_no_origins_configured_dev_and_tests_get_no_CORS_headers_at_all()
    {
        var c = fx.Factory.CreateClient();
        Assert.Null(Header(await c.SendAsync(Req(HttpMethod.Get, "/health", StaffOrigin)), "Access-Control-Allow-Origin"));
        Assert.Null(Header(await c.SendAsync(Preflight("/api/v1/auth/login", StaffOrigin, "POST", "authorization")), "Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task S7A1_Authorisation_is_unchanged_by_CORS()
    {
        using var f = CorsFactory();
        var c = f.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(Req(HttpMethod.Get, "/api/v1/staff/queue", StaffOrigin))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(Req(HttpMethod.Post, "/hubs/queue/negotiate?negotiateVersion=1", StaffOrigin))).StatusCode);
    }

    [Theory]
    [InlineData("*")]
    [InlineData("https://*.pages.dev")]
    [InlineData("https://dbp-staff.pages.dev/")]
    [InlineData("https://dbp-staff.pages.dev/app")]
    [InlineData("ftp://dbp-staff.pages.dev")]
    [InlineData("dbp-staff.pages.dev")]
    public void S7A1_A_wildcard_path_or_odd_origin_in_config_stops_the_API_at_start(string bad)
    {
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Cors:AllowedOrigins"] = $"{StaffOrigin},{bad}" }).Build();
        Assert.Throws<InvalidOperationException>(() => Cors.OriginsFrom(cfg));
        using var f = With(new() { ["Cors:AllowedOrigins"] = bad });
        Assert.ThrowsAny<Exception>(() => f.CreateClient());
    }

    [Fact]
    public async Task S7A1_Plain_http_origins_are_accepted_only_in_Development()
    {
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Cors:AllowedOrigins"] = "http://localhost:4200" }).Build();
        Assert.Equal(["http://localhost:4200"], Cors.OriginsFrom(cfg, allowHttp: true));
        Assert.Throws<InvalidOperationException>(() => Cors.OriginsFrom(cfg)); // default: https only
        Assert.Throws<InvalidOperationException>(() => Cors.OriginsFrom(cfg, allowHttp: false));

        // Through the real start-up: Production refuses an http origin, accepts https; Development accepts http.
        WebApplicationFactory<Program> Env(string env, string origin) => fx.Factory.WithWebHostBuilder(b =>
        {
            b.UseEnvironment(env);
            b.UseSetting("Cors:AllowedOrigins", origin);
        });
        using (var prod = Env("Production", "http://dbp-staff.pages.dev")) Assert.ThrowsAny<Exception>(() => prod.CreateClient());
        using (var prodOk = Env("Production", StaffOrigin)) Assert.Equal(HttpStatusCode.OK, (await prodOk.CreateClient().GetAsync("/health")).StatusCode);
        using (var dev = Env("Development", "http://localhost:4200")) Assert.Equal(HttpStatusCode.OK, (await dev.CreateClient().GetAsync("/health")).StatusCode);
    }

    [Fact]
    public void S7A1_Origins_can_be_a_comma_separated_value_or_an_array_and_empty_means_none()
    {
        var csv = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Cors:AllowedOrigins"] = $"{StaffOrigin}, {MotherOrigin}" }).Build();
        Assert.Equal([StaffOrigin, MotherOrigin], Cors.OriginsFrom(csv));
        var arr = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Cors:AllowedOrigins:0"] = StaffOrigin, ["Cors:AllowedOrigins:1"] = MotherOrigin }).Build();
        Assert.Equal([StaffOrigin, MotherOrigin], Cors.OriginsFrom(arr));
        Assert.Empty(Cors.OriginsFrom(new ConfigurationBuilder().Build()));
    }

    // S7-A2 (NFR-01, NFR-10): behind a proxy the rate limiter and audit ip see the client.
    async Task<string?> LoginIpAsync(HttpClient c, string? xff)
    {
        var user = await fx.CreateStaffAsync(fx.ClinicA, Roles.Nurse, Pw);
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/login") { Content = JsonContent.Create(new { identifier = user, password = Pw }) };
        if (xff is not null) req.Headers.TryAddWithoutValidation("X-Forwarded-For", xff);
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(req)).StatusCode);
        await using var db = fx.Owner();
        var acc = await db.UserAccounts.AsNoTracking().SingleAsync(a => a.Username == user);
        var row = await db.AuditLogs.AsNoTracking().Where(a => a.ActorUserId == acc.Id && a.Action == "login_success").SingleAsync();
        return row.Ip?.ToString();
    }

    [Fact]
    public async Task S7A2_Trusted_forwarded_header_gives_the_client_address_to_the_audit_row_and_the_last_entry_wins()
    {
        using var f = With(new() { ["Hosting:TrustForwardedHeaders"] = "true" });
        var c = f.CreateClient();
        Assert.Equal("198.51.100.7", await LoginIpAsync(c, "198.51.100.7"));
        // ForwardLimit 1: only the entry added by the nearest proxy counts; an earlier, client-supplied entry is ignored.
        Assert.Equal("198.51.100.8", await LoginIpAsync(c, "203.0.113.50, 198.51.100.8"));
        Assert.Equal(DbFixture.TestIp, await LoginIpAsync(c, null)); // no header: the socket address
    }

    [Fact]
    public async Task S7A2_Without_the_setting_the_header_is_ignored_so_dev_behaves_as_before()
    {
        Assert.Equal(DbFixture.TestIp, await LoginIpAsync(fx.Factory.CreateClient(), "198.51.100.9"));
    }

    [Fact]
    public async Task S7A2_Rate_limit_is_counted_per_forwarded_client_not_per_proxy()
    {
        using var f = With(new() { ["Hosting:TrustForwardedHeaders"] = "true" }, new() { ["Auth:RateLimitPerMinute"] = "3" });
        var c = f.CreateClient();
        async Task<HttpStatusCode> Try(string ip)
        {
            var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/login") { Content = JsonContent.Create(new { identifier = "nobody-s7", password = "x" }) };
            req.Headers.TryAddWithoutValidation("X-Forwarded-For", ip);
            return (await c.SendAsync(req)).StatusCode;
        }
        for (var i = 0; i < 3; i++) Assert.Equal(HttpStatusCode.Unauthorized, await Try("198.51.100.21"));
        Assert.Equal(HttpStatusCode.TooManyRequests, await Try("198.51.100.21"));
        Assert.Equal(HttpStatusCode.Unauthorized, await Try("198.51.100.22")); // a different client has its own bucket
    }

    [Fact]
    public async Task S7A2_Health_is_200_without_touching_the_database()
    {
        using var f = With(late: new() { ["ConnectionStrings:Default"] = "Host=127.0.0.1;Port=1;Database=none;Username=none;Password=none;Timeout=1;Command Timeout=1" });
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var r = await f.CreateClient().GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.True(sw.Elapsed < TimeSpan.FromSeconds(1), $"health took {sw.ElapsedMilliseconds} ms");
        Assert.Equal("", await r.Content.ReadAsStringAsync());
    }
}
