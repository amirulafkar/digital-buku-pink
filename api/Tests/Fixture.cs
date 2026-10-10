using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using System.Net;
using System.Text;
using Data;
using Data.Entities;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Tests;

[CollectionDefinition("db")]
public class DbCollection : ICollectionFixture<DbFixture> { }

/// <summary>Real Postgres (docker compose). Creates a fresh dbp_test database, migrates as owner, seeds, hosts the API as the app role.</summary>
public class DbFixture : IAsyncLifetime
{
    public const string TestDb = "dbp_test";
    public string OwnerConn = "", AppConn = "", AdminConn = "";
    public string StaffPassword = "Seed-" + Guid.NewGuid().ToString("N");
    public string Pepper = "pepper-" + Guid.NewGuid().ToString("N");
    public const string TestIp = "203.0.113.9"; // documentation range
    public Guid ClinicA, ClinicB;
    public Dictionary<string, string> SeedCodes = [];
    public WebApplicationFactory<Program> Factory = null!;
    public StringWriter Logs = new();

    public async Task InitializeAsync()
    {
        var env = LoadEnv();
        string Get(string k) => Environment.GetEnvironmentVariable(k) ?? env.GetValueOrDefault(k) ?? throw new InvalidOperationException($"{k} missing (db/.env)");
        var host = "127.0.0.1"; var port = env.GetValueOrDefault("POSTGRES_PORT", "5433");
        string Conn(string db, string user, string pw) => $"Host={host};Port={port};Database={db};Username={user};Password={pw}";
        var ownerUser = env.GetValueOrDefault("POSTGRES_OWNER_USER", "dbp_owner");
        AdminConn = Conn("postgres", ownerUser, Get("POSTGRES_OWNER_PASSWORD"));
        OwnerConn = Conn(TestDb, ownerUser, Get("POSTGRES_OWNER_PASSWORD"));
        AppConn = Conn(TestDb, "dbp_app", Get("APP_DB_PASSWORD"));

        await using (var admin = new NpgsqlConnection(AdminConn))
        {
            await admin.OpenAsync();
            await using var cmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS {TestDb} WITH (FORCE); CREATE DATABASE {TestDb};", admin);
            await cmd.ExecuteNonQueryAsync();
        }
        await using (var db = Owner())
        {
            await db.Database.MigrateAsync();
            var seed = await Seeder.SeedAsync(db, StaffPassword, Pepper);
            SeedCodes = seed.ActivationCodesByPhone;
            ClinicA = (await db.Clinics.SingleAsync(c => c.Code == Seeder.ClinicCode)).Id;
            var b = new Clinic { Code = "KK-DEMO-B", Name = "KK Demo Dua" };
            db.Clinics.Add(b);
            await db.SaveChangesAsync();
            ClinicB = b.Id;
        }

        Logs = new StringWriter();
        Console.SetOut(TextWriter.Synchronized(Logs)); // Serilog console sink binds to Console.Out at host build
        Environment.SetEnvironmentVariable("ConnectionStrings__Default", AppConn);
        Environment.SetEnvironmentVariable("Auth__CodePepper", Pepper);
        Environment.SetEnvironmentVariable("Auth__RateLimitPerMinute", "100000");
        Environment.SetEnvironmentVariable("Auth__Key", "test-signing-key-" + Guid.NewGuid().ToString("N"));
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
            b.ConfigureTestServices(s => s.AddTransient<IStartupFilter, FakeIpFilter>()));
    }

    public Task DisposeAsync()
    {
        Factory.Dispose();
        return Task.CompletedTask;
    }

    public AppDbContext Owner() => new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(OwnerConn).Options);
    public AppDbContext App() => new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(AppConn).Options);

    static readonly PasswordHasher<UserAccount> Hasher = new();
    static readonly Random Rng = new();
    public static string NewPhone() => "0109" + Rng.Next(0, 999999).ToString("D6") + Rng.Next(0, 9);

    public record TestPatient(Guid PatientId, Guid AccountId, string Phone, string Code);

    public async Task<TestPatient> CreatePatientAsync(Guid clinicId, bool active = false, string? password = null,
        TimeSpan? codeLife = null, bool codeUsed = false)
    {
        await using var db = Owner();
        var p = new Patient { ClinicId = clinicId, DisplayName = "Test (demo)", Phone = NewPhone(), Language = "en" };
        db.Patients.Add(p);
        await db.SaveChangesAsync();
        var acc = new UserAccount { PatientId = p.Id, Status = active ? AccountStatus.Active : AccountStatus.Pending };
        if (active) acc.PasswordHash = Hasher.HashPassword(acc, password!);
        db.UserAccounts.Add(acc);
        var issuer = await db.Staff.FirstAsync(s => s.ClinicId == clinicId || true);
        var code = Crypto.NewActivationCode();
        db.ActivationCodes.Add(new ActivationCode
        {
            PatientId = p.Id, IssuedBy = issuer.Id, CodeHash = Crypto.HashCode(code, Pepper),
            ExpiresAt = DateTimeOffset.UtcNow + (codeLife ?? TimeSpan.FromDays(7)),
            UsedAt = codeUsed ? DateTimeOffset.UtcNow : null,
        });
        await db.SaveChangesAsync();
        return new TestPatient(p.Id, acc.Id, p.Phone, code);
    }

    public async Task<string> CreateStaffAsync(Guid clinicId, string role, string password)
    {
        await using var db = Owner();
        var s = new Staff { ClinicId = clinicId, DisplayName = "Staff (demo)", Role = role };
        db.Staff.Add(s);
        await db.SaveChangesAsync();
        var username = "t" + Guid.NewGuid().ToString("N")[..10];
        var acc = new UserAccount { StaffId = s.Id, Username = username, Status = AccountStatus.Active };
        acc.PasswordHash = Hasher.HashPassword(acc, password);
        db.UserAccounts.Add(acc);
        await db.SaveChangesAsync();
        return username;
    }

    static Dictionary<string, string> LoadEnv()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "db", ".env"))) dir = dir.Parent;
        var d = new Dictionary<string, string>();
        if (dir is null) return d;
        foreach (var line in File.ReadAllLines(Path.Combine(dir.FullName, "db", ".env")))
        {
            var t = line.Trim();
            if (t.Length == 0 || t[0] == '#' || !t.Contains('=')) continue;
            var i = t.IndexOf('=');
            d[t[..i]] = t[(i + 1)..];
        }
        return d;
    }
}

class FakeIpFilter : IStartupFilter
{
    public Action<Microsoft.AspNetCore.Builder.IApplicationBuilder> Configure(Action<Microsoft.AspNetCore.Builder.IApplicationBuilder> next) =>
        app =>
        {
            app.Use((ctx, n) => { ctx.Connection.RemoteIpAddress = IPAddress.Parse(DbFixture.TestIp); return n(ctx); });
            next(app);
        };
}
