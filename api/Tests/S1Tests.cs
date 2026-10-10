using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Data;
using Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using Npgsql;

namespace Tests;

[Collection("db")]
public class S1Tests(DbFixture fx)
{
    const string Pw = "Correct-horse-1";
    record Tok(string AccessToken, string RefreshToken, int ExpiresIn, string Role);

    HttpClient Client() => fx.Factory.CreateClient();

    async Task<HttpResponseMessage> Login(string id, string pw) =>
        await Client().PostAsJsonAsync("/api/v1/auth/login", new { identifier = id, password = pw });

    async Task<Tok> LoginOk(string id, string pw)
    {
        var r = await Login(id, pw);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return (await r.Content.ReadFromJsonAsync<Tok>(new JsonSerializerOptions(JsonSerializerDefaults.Web)))!;
    }

    Task<HttpResponseMessage> Activate(string code, string phone, string pw) =>
        Client().PostAsJsonAsync("/api/v1/auth/activate", new { code, phone, password = pw });

    Task<HttpResponseMessage> Refresh(string t) => Client().PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = t });

    // T1
    [Fact]
    public async Task T1_Activate_valid_code_activates_and_stores_hash_only()
    {
        var p = await fx.CreatePatientAsync(fx.ClinicA);
        var r = await Activate(p.Code, p.Phone, Pw);
        Assert.Equal(HttpStatusCode.NoContent, r.StatusCode);

        await using var db = fx.Owner();
        var acc = await db.UserAccounts.SingleAsync(a => a.Id == p.AccountId);
        Assert.Equal("active", acc.Status);
        var code = await db.ActivationCodes.SingleAsync(c => c.PatientId == p.PatientId);
        Assert.NotNull(code.UsedAt);
        Assert.NotEqual(p.Code, code.CodeHash);
        Assert.Equal(Crypto.HashCode(p.Code, fx.Pepper), code.CodeHash);
        await LoginOk(p.Phone, Pw); // phone is the login identifier
    }

    // T2
    [Theory]
    [InlineData("used")]
    [InlineData("expired")]
    [InlineData("unknown")]
    [InlineData("wrong_phone")]
    public async Task T2_Activate_bad_code_returns_400_and_changes_nothing(string kind)
    {
        var p = await fx.CreatePatientAsync(fx.ClinicA, codeUsed: kind == "used",
            codeLife: kind == "expired" ? TimeSpan.FromMinutes(-1) : null);
        var other = await fx.CreatePatientAsync(fx.ClinicA);
        await using var before = fx.Owner();
        var lastAudit = await before.AuditLogs.MaxAsync(a => (long?)a.Id) ?? 0;
        var usedBefore = await before.ActivationCodes.Where(c => c.PatientId == p.PatientId).Select(c => c.UsedAt).SingleAsync();

        var code = kind == "unknown" ? "ZZZZ-ZZZZ-ZZ" : p.Code;
        var phone = kind == "wrong_phone" ? other.Phone : p.Phone;
        var r = await Activate(code, phone, Pw);
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Contains("code invalid or expired", await r.Content.ReadAsStringAsync());

        await using var db = fx.Owner();
        Assert.Equal("pending", (await db.UserAccounts.SingleAsync(a => a.Id == p.AccountId)).Status);
        Assert.Null((await db.UserAccounts.SingleAsync(a => a.Id == p.AccountId)).PasswordHash);
        Assert.Equal(usedBefore, await db.ActivationCodes.Where(c => c.PatientId == p.PatientId).Select(c => c.UsedAt).SingleAsync());
        Assert.Null((await db.ActivationCodes.SingleAsync(c => c.PatientId == other.PatientId)).UsedAt);
        // Failure is audited (no phone, no code), but no activation_code / user_account row changes.
        var failures = await db.AuditLogs.Where(a => a.Id > lastAudit && a.Action == "activate_failure").ToListAsync();
        Assert.Single(failures);
        Assert.Null(failures[0].ActorUserId);
        Assert.DoesNotContain(p.Phone, failures[0].Detail ?? "");
        Assert.DoesNotContain(p.Code, failures[0].Detail ?? "");
    }

    [Fact]
    public async Task T2c_Unused_code_cannot_overwrite_active_account_password()
    {
        var p = await fx.CreatePatientAsync(fx.ClinicA, active: true, password: Pw);
        var r = await Activate(p.Code, p.Phone, "Attacker-pass-9");
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        await LoginOk(p.Phone, Pw); // original password still works
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(p.Phone, "Attacker-pass-9")).StatusCode);
        await using var db = fx.Owner();
        Assert.Null((await db.ActivationCodes.SingleAsync(c => c.PatientId == p.PatientId)).UsedAt);
    }

    [Fact]
    public async Task T4c_Reusing_a_revoked_refresh_token_revokes_the_whole_family()
    {
        var p = await fx.CreatePatientAsync(fx.ClinicA, active: true, password: Pw);
        var t1 = await LoginOk(p.Phone, Pw);
        var t2 = (await (await Refresh(t1.RefreshToken)).Content.ReadFromJsonAsync<Tok>(new JsonSerializerOptions(JsonSerializerDefaults.Web)))!;
        Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(t1.RefreshToken)).StatusCode); // reuse
        Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(t2.RefreshToken)).StatusCode); // family revoked
        await using var db = fx.Owner();
        Assert.Empty(await db.RefreshTokens.Where(t => t.UserAccountId == p.AccountId && t.RevokedAt == null).ToListAsync());
        Assert.Contains(await db.AuditLogs.Where(a => a.ActorUserId == p.AccountId).Select(a => a.Action).ToListAsync(), a => a == "refresh_reuse_detected");
    }

    [Fact]
    public async Task T3c_Database_rejects_active_account_without_password_hash()
    {
        var p = await fx.CreatePatientAsync(fx.ClinicA);
        await using var c = new NpgsqlConnection(fx.OwnerConn);
        await c.OpenAsync();
        await using var cmd = new NpgsqlCommand($"UPDATE user_account SET status = 'active' WHERE id = '{p.AccountId}'", c);
        var ex = await Assert.ThrowsAsync<PostgresException>(() => cmd.ExecuteNonQueryAsync());
        Assert.Equal("23514", ex.SqlState);
    }

    [Fact]
    public async Task T2b_Activate_code_is_single_use()
    {
        var p = await fx.CreatePatientAsync(fx.ClinicA);
        Assert.Equal(HttpStatusCode.NoContent, (await Activate(p.Code, p.Phone, Pw)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Activate(p.Code, p.Phone, "Another-pass-2")).StatusCode);
    }

    // T3
    [Fact]
    public async Task T3_Login_access_token_lives_at_most_15_minutes_and_password_is_hashed()
    {
        var p = await fx.CreatePatientAsync(fx.ClinicA, active: true, password: Pw);
        var t = await LoginOk(p.Phone, Pw);
        Assert.True(t.ExpiresIn <= 15 * 60);
        var jwt = new JsonWebTokenHandler().ReadJsonWebToken(t.AccessToken);
        Assert.True(jwt.ValidTo - DateTime.UtcNow <= TimeSpan.FromMinutes(15.1));
        Assert.Equal(fx.ClinicA.ToString(), jwt.GetClaim("clinic_id").Value);
        Assert.Equal("patient", jwt.GetClaim("role").Value);
        Assert.Equal(p.AccountId.ToString(), jwt.GetClaim("sub").Value);

        await using var db = fx.Owner();
        var hash = (await db.UserAccounts.SingleAsync(a => a.Id == p.AccountId)).PasswordHash!;
        Assert.NotEqual(Pw, hash);
        Assert.DoesNotContain(Pw, hash);
        Assert.Equal("patient", t.Role);
    }

    [Fact]
    public async Task T3b_Seeded_staff_can_log_in_with_username()
    {
        var t = await LoginOk("aini.demo", fx.StaffPassword);
        Assert.Equal("nurse", t.Role);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login("aini.demo", "wrong-password")).StatusCode);
    }

    // T4
    [Fact]
    public async Task T4_Rotated_or_logged_out_refresh_token_is_rejected()
    {
        var p = await fx.CreatePatientAsync(fx.ClinicA, active: true, password: Pw);
        var t1 = await LoginOk(p.Phone, Pw);
        var r2 = await Refresh(t1.RefreshToken);
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);
        var t2 = (await r2.Content.ReadFromJsonAsync<Tok>(new JsonSerializerOptions(JsonSerializerDefaults.Web)))!;
        Assert.NotEqual(t1.RefreshToken, t2.RefreshToken);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(t1.RefreshToken)).StatusCode); // rotated

        var lo = await Client().PostAsJsonAsync("/api/v1/auth/logout", new { refreshToken = t2.RefreshToken });
        Assert.Equal(HttpStatusCode.NoContent, lo.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(t2.RefreshToken)).StatusCode); // logged out

        await using var db = fx.Owner();
        var stored = await db.RefreshTokens.Where(x => x.UserAccountId == p.AccountId).Select(x => x.TokenHash).ToListAsync();
        Assert.Contains(Crypto.Hash(t1.RefreshToken), stored); // stored value is the hash of the raw token
        Assert.DoesNotContain(t1.RefreshToken, stored);        // raw token is never stored
        Assert.DoesNotContain(t2.RefreshToken, stored);
    }

    // T5
    [Fact]
    public async Task T5_Pending_account_cannot_log_in()
    {
        var p = await fx.CreatePatientAsync(fx.ClinicA);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(p.Phone, Pw)).StatusCode);
    }

    [Fact]
    public async Task T5_Five_failures_lock_the_account_even_for_the_right_password()
    {
        var p = await fx.CreatePatientAsync(fx.ClinicA, active: true, password: Pw);
        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await Login(p.Phone, "wrong-" + i)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(p.Phone, Pw)).StatusCode);
        await using var db = fx.Owner();
        var acc = await db.UserAccounts.SingleAsync(a => a.Id == p.AccountId);
        Assert.NotNull(acc.LockedUntil);
        Assert.InRange(acc.LockedUntil!.Value - DateTimeOffset.UtcNow, TimeSpan.FromMinutes(13), TimeSpan.FromMinutes(15.1));
    }

    // T6
    [Fact]
    public async Task T6_Clinic_scoping_repository_and_routes()
    {
        var a = await fx.CreatePatientAsync(fx.ClinicA);
        var nurseB = await fx.CreateStaffAsync(fx.ClinicB, Roles.Nurse, Pw);
        var nurseA = await fx.CreateStaffAsync(fx.ClinicA, Roles.Nurse, Pw);

        await using (var db = fx.App())
        {
            var repo = new PatientRepository(db);
            Assert.Null(await repo.GetAsync(fx.ClinicB, a.PatientId));
            Assert.DoesNotContain(await repo.ListAsync(fx.ClinicB), p => p.Id == a.PatientId);
            Assert.NotNull(await repo.GetAsync(fx.ClinicA, a.PatientId));
        }

        var tb = await LoginOk(nurseB, Pw);
        var cb = Client();
        cb.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tb.AccessToken);
        Assert.Equal(HttpStatusCode.NotFound, (await cb.GetAsync($"/api/v1/staff/patients/{a.PatientId}")).StatusCode);
        var list = await cb.GetStringAsync("/api/v1/staff/patients");
        Assert.DoesNotContain(a.PatientId.ToString(), list);

        var ta = await LoginOk(nurseA, Pw);
        var ca = Client();
        ca.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ta.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await ca.GetAsync($"/api/v1/staff/patients/{a.PatientId}")).StatusCode);

        // Patient token on a staff route: 403. No token: 401.
        var pat = await fx.CreatePatientAsync(fx.ClinicA, active: true, password: Pw);
        var tp = await LoginOk(pat.Phone, Pw);
        var cp = Client();
        cp.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tp.AccessToken);
        Assert.Equal(HttpStatusCode.Forbidden, (await cp.GetAsync("/api/v1/staff/patients")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().GetAsync("/api/v1/staff/patients")).StatusCode);
    }

    // T7
    [Fact]
    public async Task T7_Audit_rows_hold_actor_clinic_action_ip_and_no_personal_data()
    {
        var p = await fx.CreatePatientAsync(fx.ClinicA);
        Assert.Equal(HttpStatusCode.NoContent, (await Activate(p.Code, p.Phone, Pw)).StatusCode);
        await LoginOk(p.Phone, Pw);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(p.Phone, "bad-password")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login("0100009999", "bad-password")).StatusCode);

        await using var db = fx.Owner();
        var rows = await db.AuditLogs.Where(a => a.EntityId == p.AccountId || a.ActorUserId == p.AccountId).OrderBy(a => a.Id).ToListAsync();
        Assert.Equal(["activate", "login_success", "login_failure"], rows.Select(r => r.Action));
        foreach (var r in rows)
        {
            Assert.Equal(fx.ClinicA, r.ClinicId);
            Assert.Equal(IPAddress.Parse(DbFixture.TestIp), r.Ip);
        }
        Assert.Equal(p.AccountId, rows[0].ActorUserId);
        Assert.Equal(p.AccountId, rows[1].ActorUserId);
        Assert.Null(rows[2].ActorUserId); // failure: actor null

        var unknown = await db.AuditLogs.OrderByDescending(a => a.Id).FirstAsync();
        Assert.Equal("login_failure", unknown.Action);
        Assert.Null(unknown.ActorUserId);

        // No phone number or password anywhere in audit rows or logs.
        var all = JsonSerializer.Serialize((await db.AuditLogs.AsNoTracking().ToListAsync()).Select(x => new { x.Id, x.ActorUserId, x.ClinicId, x.Action, x.Entity, x.EntityId, x.Detail, Ip = x.Ip?.ToString() }));
        foreach (var secret in new[] { p.Phone, "0100009999", Pw, "bad-password", p.Code })
        {
            Assert.DoesNotContain(secret, all);
            Assert.DoesNotContain(secret, fx.Logs.ToString());
        }
    }

    // T8
    [Fact]
    public async Task T8_Audit_log_is_append_only_for_app_role_and_owner()
    {
        await LoginOk("aini.demo", fx.StaffPassword); // guarantees at least one row
        foreach (var conn in new[] { fx.AppConn, fx.OwnerConn })
        {
            foreach (var sql in new[] { "UPDATE audit_log SET action = 'x'", "DELETE FROM audit_log", "TRUNCATE audit_log" })
            {
                await using var c = new NpgsqlConnection(conn);
                await c.OpenAsync();
                await using var cmd = new NpgsqlCommand(sql, c);
                var ex = await Assert.ThrowsAsync<PostgresException>(() => cmd.ExecuteNonQueryAsync());
                Assert.Equal("42501", ex.SqlState);
            }
        }
        await using var c2 = new NpgsqlConnection(fx.AppConn);
        await c2.OpenAsync();
        await using var ins = new NpgsqlCommand("SELECT count(*) FROM audit_log", c2); // SELECT allowed
        Assert.True((long)(await ins.ExecuteScalarAsync())! > 0);
    }

    // T9
    [Fact]
    public async Task T9_Schema_has_no_personal_or_clinical_columns_and_constraints_hold()
    {
        await using var c = new NpgsqlConnection(fx.OwnerConn);
        await c.OpenAsync();
        var cols = new List<string>();
        await using (var cmd = new NpgsqlCommand("SELECT table_name || '.' || column_name FROM information_schema.columns WHERE table_schema='public'", c))
        await using (var rd = await cmd.ExecuteReaderAsync())
            while (await rd.ReadAsync()) cols.Add(rd.GetString(0));
        Assert.NotEmpty(cols);
        var banned = new Regex("\\.ic(_|$)|nric|identity|address|diagnos|clinical|blood|weight|allerg|medic|symptom", RegexOptions.IgnoreCase);
        Assert.DoesNotContain(cols, x => banned.IsMatch(x));

        // No NRIC-pattern values in seeded data.
        var nric = new Regex(@"\d{6}-?\d{2}-?\d{4}");
        // Scan every text-like column of every table (hash columns excluded: random strings).
        var textCols = new List<(string T, string C)>();
        await using (var cmd = new NpgsqlCommand(
            "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' " +
            "AND data_type IN ('text','character varying','jsonb','json') AND column_name NOT LIKE '%hash'", c))
        await using (var rd = await cmd.ExecuteReaderAsync())
            while (await rd.ReadAsync()) textCols.Add((rd.GetString(0), rd.GetString(1)));
        Assert.Contains(("patient", "phone"), textCols);
        var nricStrict = new Regex(@"(?<![0-9A-Za-z])\d{6}-?\d{2}-?\d{4}(?![0-9A-Za-z])");
        foreach (var (t, col) in textCols)
        {
            await using var cmd = new NpgsqlCommand($"SELECT \"{col}\"::text FROM \"{t}\" WHERE \"{col}\" IS NOT NULL", c);
            await using var rd = await cmd.ExecuteReaderAsync();
            while (await rd.ReadAsync()) Assert.False(nricStrict.IsMatch(rd.GetString(0)), $"NRIC-like value in {t}.{col}");
        }

        await using (var cmd = new NpgsqlCommand("SELECT count(*) FROM patient WHERE phone IN ('0100000001','0100000002','0100000003','0100000004') AND is_demo", c))
            Assert.Equal(4L, await cmd.ExecuteScalarAsync());

        // is_demo = false rejected.
        var ex1 = await Assert.ThrowsAsync<PostgresException>(async () =>
        {
            await using var cmd = new NpgsqlCommand(
                $"INSERT INTO patient (clinic_id, display_name, phone, language, is_demo) VALUES ('{fx.ClinicA}', 'X (demo)', '0108888888', 'en', false)", c);
            await cmd.ExecuteNonQueryAsync();
        });
        Assert.Equal("23514", ex1.SqlState);

        // Dual-FK user_account rejected (patient + staff both set).
        var ex2 = await Assert.ThrowsAsync<PostgresException>(async () =>
        {
            await using var cmd = new NpgsqlCommand(
                "INSERT INTO user_account (patient_id, staff_id, username, status) SELECT p.id, s.id, 'dual.user', 'pending' FROM patient p, staff s LIMIT 1", c);
            await cmd.ExecuteNonQueryAsync();
        });
        Assert.Equal("23514", ex2.SqlState);

        // FKs are RESTRICT: deleting a clinic with children fails.
        var ex3 = await Assert.ThrowsAsync<PostgresException>(async () =>
        {
            await using var cmd = new NpgsqlCommand($"DELETE FROM clinic WHERE id = '{fx.ClinicA}'", c);
            await cmd.ExecuteNonQueryAsync();
        });
        Assert.Equal("23503", ex3.SqlState);
    }
}
