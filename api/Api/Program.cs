using System.Security.Claims;
using System.Text;
using Api;
using Data;
using Data.Entities;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using System.Net;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Http.Connections;

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseSerilog((ctx, lc) => lc.ReadFrom.Configuration(ctx.Configuration).WriteTo.Console());

builder.Services.Configure<AuthOptions>(builder.Configuration.GetSection("Auth"));
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<PatientRepository>();
builder.Services.AddScoped<AppointmentRepository>();
builder.Services.AddScoped<RoomRepository>();
builder.Services.AddScoped<QueueRepository>();
builder.Services.AddScoped<QueueService>();
builder.Services.AddScoped<StaffService>();
builder.Services.AddScoped<PatientService>();
// S7 (deployment, no feature): exact-origin CORS from config. Empty list (dev, tests) means no CORS headers at all.
var corsOrigins = Cors.OriginsFrom(builder.Configuration, allowHttp: builder.Environment.IsDevelopment());
// Two path-scoped policies: REST routes allow GET, POST, PATCH only; the hub (long polling) allows GET, POST and DELETE (the client ends its connection with DELETE).
builder.Services.AddCors(o =>
{
    foreach (var (name, methods) in new[] { ("DemoApi", new[] { "GET", "POST", "PATCH" }), ("DemoHub", new[] { "GET", "POST", "DELETE" }) })
        o.AddPolicy(name, p => p
            .WithOrigins(corsOrigins)
            .WithMethods(methods)
            .WithHeaders("Authorization", "Content-Type", "X-SignalR-User-Agent") // the SignalR JS client adds the last one on negotiate
            .SetPreflightMaxAge(TimeSpan.FromMinutes(10)));
});
// S7: behind a platform proxy (Render) the client address is the last X-Forwarded-For entry. Off unless Hosting:TrustForwardedHeaders=true, which the human sets as a Render env var (never baked into the image: with KnownProxies cleared, any direct peer could spoof X-Forwarded-For).
var trustForwarded = builder.Configuration.GetValue<bool>("Hosting:TrustForwardedHeaders");
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor;
    o.ForwardLimit = 1;
    o.KnownProxies.Clear();
    o.KnownIPNetworks.Clear();
});
builder.Services.AddOpenApi();
builder.Services.AddSignalR();
builder.Services.AddSingleton<IQueueNotifier, QueueNotifier>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<AuthOptions>>((o, auth) =>
    {
        var a = auth.Value;
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = a.Issuer,
            ValidAudience = a.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(a.Key)),
            NameClaimType = "sub",
            RoleClaimType = "role",
            ClockSkew = TimeSpan.FromSeconds(30),
        };
        // The token comes from the Authorization header only, on every route including the hub (the hub is long polling, so browsers can send the header).
        // A token in a URL never authenticates anything.
    });
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("auth", ctx =>
    {
        var limit = ctx.RequestServices.GetRequiredService<IOptions<AuthOptions>>().Value.RateLimitPerMinute;
        return RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = limit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 });
    });
    // Separate per-user buckets so a clinic's shared Wi-Fi (one IP) is not throttled together.
    foreach (var (name, pick) in new (string, Func<AuthOptions, int>)[] { ("checkin", a => a.CheckinPerMinute), ("qr", a => a.QrPerMinute), ("search", a => a.SearchPerMinute) })
        o.AddPolicy(name, ctx =>
        {
            var limit = pick(ctx.RequestServices.GetRequiredService<IOptions<AuthOptions>>().Value);
            var key = ctx.User.FindFirstValue("sub") ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            return RateLimitPartition.GetFixedWindowLimiter(name + ":" + key,
                _ => new FixedWindowRateLimiterOptions { PermitLimit = limit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 });
        });
});
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("Staff", p => p.RequireRole(Roles.Nurse, Roles.ClinicAdmin))
    .AddPolicy("Nurse", p => p.RequireRole(Roles.Nurse))
    .AddPolicy("ClinicAdmin", p => p.RequireRole(Roles.ClinicAdmin))
    .AddPolicy("Patient", p => p.RequireRole(Roles.Patient))
    .AddPolicy("Live", p => p.RequireRole(Roles.Nurse, Roles.ClinicAdmin, Roles.Patient)); // hub: any signed-in role; groups decide what each hears

var app = builder.Build();

// Fail fast on weak secrets.
{
    var a = app.Services.GetRequiredService<IOptions<AuthOptions>>().Value;
    if (Encoding.UTF8.GetByteCount(a.Key ?? "") < 32) throw new InvalidOperationException("Auth:Key must be at least 32 bytes.");
    if (Encoding.UTF8.GetByteCount(a.CodePepper ?? "") < 16) throw new InvalidOperationException("Auth:CodePepper must be at least 16 bytes.");
}

// Seed mode: `dotnet run --project api/Api -- seed` (dev only, uses Seed:ConnectionString = owner role).
if (args.Contains("seed"))
{
    if (!app.Environment.IsDevelopment()) throw new InvalidOperationException("seed runs only in Development.");
    var cs = app.Configuration["Seed:ConnectionString"] ?? throw new InvalidOperationException("Seed:ConnectionString not set");
    var pw = app.Configuration["Seed:StaffPassword"] ?? throw new InvalidOperationException("Seed:StaffPassword not set");
    await using var sdb = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(cs).Options);
    var res = await Seeder.SeedAsync(sdb, pw, app.Configuration["Auth:CodePepper"]!);
    if (res.AlreadySeeded) Console.WriteLine("Already seeded.");
    else
    {
        Console.WriteLine("Activation codes (dev only, shown once):");
        foreach (var (phone, code) in res.ActivationCodesByPhone) Console.WriteLine($"  {phone}  {code}");
    }
    return;
}

if (trustForwarded) app.UseForwardedHeaders(); // first, so rate limits and audit ip see the client
if (corsOrigins.Length > 0)
{
    // before auth and the hub; the hub path gets its own policy
    static bool IsHub(HttpContext c) => c.Request.Path.StartsWithSegments(QueueGroups.Path);
    app.UseWhen(IsHub, b => b.UseCors("DemoHub"));
    app.UseWhen(c => !IsHub(c), b => b.UseCors("DemoApi"));
}
if (app.Environment.IsDevelopment()) app.MapOpenApi();
// Responses carry personal or session data: never let a browser, app or proxy cache them.
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/api"))
        ctx.Response.OnStarting(() => { ctx.Response.Headers.CacheControl = "no-store"; ctx.Response.Headers.Pragma = "no-cache"; return Task.CompletedTask; });
    await next();
});
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter(); // after auth so per-user policies can read the token
app.MapGet("/health", () => Results.Ok());
// S5: live refresh signal, server to client only. CloseOnAuthenticationExpiration ends the connection when the 15 min access token expires; the client reconnects with a fresh one.
app.MapHub<QueueHub>(QueueGroups.Path, o => { o.CloseOnAuthenticationExpiration = true; o.Transports = HttpTransportType.LongPolling; }).RequireAuthorization("Live");

var auth = app.MapGroup("/api/v1/auth").RequireRateLimiting("auth"); // HSTS: set at the host (Cloudflare Pages _headers); CORS is exact-origin config
auth.MapPost("/login", async (LoginRequest r, AuthService s, HttpContext c) =>
{
    var res = await s.LoginAsync(r.Identifier, r.Password, r.DeviceName, c.Connection.RemoteIpAddress);
    return res is null ? Results.Unauthorized() : Results.Ok(res);
});
auth.MapPost("/refresh", async (RefreshRequest r, AuthService s, HttpContext c) =>
{
    var res = await s.RefreshAsync(r.RefreshToken, c.Connection.RemoteIpAddress);
    return res is null ? Results.Unauthorized() : Results.Ok(res);
});
auth.MapPost("/logout", async (RefreshRequest r, AuthService s, HttpContext c) =>
{
    await s.LogoutAsync(r.RefreshToken, c.Connection.RemoteIpAddress);
    return Results.NoContent();
});
auth.MapPost("/activate", async (ActivateRequest r, AuthService s, HttpContext c) =>
{
    var ok = await s.ActivateAsync(r.Code, r.Phone, r.Password, c.Connection.RemoteIpAddress);
    return ok ? Results.NoContent() : Results.Json(new { error = "code invalid or expired" }, statusCode: 400);
});

// Staff routes: clinic comes from the token claim only.
var staff = app.MapGroup("/api/v1/staff").RequireAuthorization("Staff");
// Search text travels in the JSON body only, never in a URL (URLs end up in logs, history and proxies).
staff.MapPost("/patients/search", async (SearchRequest r, ClaimsPrincipal u, StaffService s, HttpContext c) =>
    Send(await s.SearchPatientsAsync(ClinicOf(u), UserOf(u), r.Q, r.Limit, IpOf(c)))).RequireAuthorization("Nurse").RequireRateLimiting("search");
staff.MapGet("/nurses", async (ClaimsPrincipal u, StaffService s) => Results.Ok(await s.NursesAsync(ClinicOf(u))));
staff.MapPost("/activation-codes", async (IssueCodeRequest r, ClaimsPrincipal u, StaffService s, HttpContext c) =>
    Send(await s.IssueCodeAsync(ClinicOf(u), UserOf(u), r.PatientId, IpOf(c)))).RequireAuthorization("Nurse").RequireRateLimiting("qr");
// Read-only list: clinic_admin may view (human decision); the code and hash are never returned.
staff.MapGet("/activation-codes", async (Guid? patientId, ClaimsPrincipal u, StaffService s) =>
    Results.Ok(await s.ListCodesAsync(ClinicOf(u), patientId)));
staff.MapGet("/patients/{id:guid}", async (Guid id, ClaimsPrincipal u, PatientRepository repo) =>
    await repo.GetAsync(ClinicOf(u), id) is { } p ? Results.Ok(PatientDto.From(p)) : Results.NotFound());
staff.MapGet("/rooms", async (ClaimsPrincipal u, RoomRepository repo) =>
    Results.Ok((await repo.ListAsync(ClinicOf(u))).Select(r => new { r.Id, r.Name })));

// S2: QR, check-in, queue. Clinic and user come from the token only.
static IResult Send<T>(Outcome<T> o) =>
    o.Ok ? Results.Json(o.Value, statusCode: o.Status) : Results.Json(new { code = o.Code, message = o.Message }, statusCode: o.Status);
static Guid UserOf(ClaimsPrincipal u) => Guid.Parse(u.FindFirstValue("sub")!);
static IPAddress? IpOf(HttpContext c) => c.Connection.RemoteIpAddress;

staff.MapPost("/qr-tokens", async (ClaimsPrincipal u, QueueService q, HttpContext c) =>
    Results.Json(await q.IssueQrAsync(ClinicOf(u), UserOf(u), IpOf(c)), statusCode: 201)).RequireRateLimiting("qr");
staff.MapPost("/checkins", async (StaffCheckInRequest r, ClaimsPrincipal u, QueueService q, HttpContext c) =>
    Send(await q.StaffCheckInAsync(ClinicOf(u), UserOf(u), r, IpOf(c)))).RequireAuthorization("Nurse");
staff.MapGet("/queue", async (ClaimsPrincipal u, QueueService q) => Results.Ok(await q.ListAsync(ClinicOf(u))));
staff.MapPatch("/queue/{id:guid}", async (Guid id, PatchRequest r, ClaimsPrincipal u, QueueService q, HttpContext c) =>
    Send(await q.PatchAsync(ClinicOf(u), UserOf(u), id, r, IpOf(c)))).RequireAuthorization("Nurse");
staff.MapGet("/audit", async (DateTimeOffset? from, DateTimeOffset? to, int? limit, ClaimsPrincipal u, QueueService q) =>
    Results.Ok(await q.AuditAsync(ClinicOf(u), from, to, limit ?? 50))).RequireAuthorization("ClinicAdmin");

var api = app.MapGroup("/api/v1").RequireAuthorization("Patient");
api.MapPost("/checkins", async (CheckInRequest r, ClaimsPrincipal u, QueueService q, HttpContext c) =>
    Send(await q.PatientCheckInAsync(ClinicOf(u), UserOf(u), r.Token, r.IdempotencyKey, IpOf(c)))).RequireRateLimiting("checkin");
api.MapGet("/me", async (ClaimsPrincipal u, PatientService s) => await s.MeAsync(ClinicOf(u), UserOf(u)) is { } me ? Results.Ok(me) : Results.NotFound());
api.MapGet("/appointments/next", async (ClaimsPrincipal u, PatientService s) => Results.Ok(await s.NextAppointmentAsync(ClinicOf(u), UserOf(u))));
api.MapGet("/queue/me", async (ClaimsPrincipal u, QueueService q) => Results.Ok(await q.MineAsync(ClinicOf(u), UserOf(u))));

static Guid ClinicOf(ClaimsPrincipal u) => Guid.Parse(u.FindFirstValue("clinic_id")!);

app.Run();

/// <summary>Reads Cors:AllowedOrigins as a comma separated string or an array. Exact origins only: a wildcard, a path or a non-https value stops the API at start (plain http is accepted only in Development).</summary>
public static class Cors
{
    public static string[] OriginsFrom(IConfiguration c, bool allowHttp = false)
    {
        var all = new List<string>();
        var section = c.GetSection("Cors:AllowedOrigins");
        if (!string.IsNullOrWhiteSpace(section.Value)) all.AddRange(section.Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        all.AddRange(section.GetChildren().Select(x => x.Value).Where(v => !string.IsNullOrWhiteSpace(v)).Select(v => v!.Trim()));
        foreach (var o in all)
            if (o.Contains('*') || !Uri.TryCreate(o, UriKind.Absolute, out var u) || (u.Scheme != "https" && !(allowHttp && u.Scheme == "http"))
                || u.AbsolutePath != "/" || !string.IsNullOrEmpty(u.Query) || o.EndsWith('/'))
                throw new InvalidOperationException($"Cors:AllowedOrigins entry '{o}' must be an exact https origin such as https://host (no wildcard, path or trailing slash; http only in Development).");
        return all.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    }
}

public record SearchRequest(string? Q, int? Limit);
public record LoginRequest(string Identifier, string Password, string? DeviceName = null);
public record RefreshRequest(string RefreshToken);
public record ActivateRequest(string Code, string Phone, string Password);
public record PatientDto(Guid Id, string DisplayName, string Language)
{
    public static PatientDto From(Patient p) => new(p.Id, p.DisplayName, p.Language);
}

public partial class Program { }
