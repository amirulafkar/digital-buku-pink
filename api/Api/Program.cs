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
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseSerilog((ctx, lc) => lc.ReadFrom.Configuration(ctx.Configuration).WriteTo.Console());

builder.Services.Configure<AuthOptions>(builder.Configuration.GetSection("Auth"));
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<PatientRepository>();
builder.Services.AddScoped<AppointmentRepository>();
builder.Services.AddScoped<RoomRepository>();
builder.Services.AddOpenApi();

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
});
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("Staff", p => p.RequireRole(Roles.Nurse, Roles.ClinicAdmin));

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

if (app.Environment.IsDevelopment()) app.MapOpenApi();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/health", () => Results.Ok());

var auth = app.MapGroup("/api/v1/auth").RequireRateLimiting("auth"); // CORS/HSTS: confirm at the reverse proxy later
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
staff.MapGet("/patients", async (ClaimsPrincipal u, PatientRepository repo) =>
    Results.Ok((await repo.ListAsync(ClinicOf(u))).Select(PatientDto.From)));
staff.MapGet("/patients/{id:guid}", async (Guid id, ClaimsPrincipal u, PatientRepository repo) =>
    await repo.GetAsync(ClinicOf(u), id) is { } p ? Results.Ok(PatientDto.From(p)) : Results.NotFound());
staff.MapGet("/rooms", async (ClaimsPrincipal u, RoomRepository repo) =>
    Results.Ok((await repo.ListAsync(ClinicOf(u))).Select(r => new { r.Id, r.Name })));

static Guid ClinicOf(ClaimsPrincipal u) => Guid.Parse(u.FindFirstValue("clinic_id")!);

app.Run();

public record LoginRequest(string Identifier, string Password, string? DeviceName = null);
public record RefreshRequest(string RefreshToken);
public record ActivateRequest(string Code, string Phone, string Password);
public record PatientDto(Guid Id, string DisplayName, string Language)
{
    public static PatientDto From(Patient p) => new(p.Id, p.DisplayName, p.Language);
}

public partial class Program { }
