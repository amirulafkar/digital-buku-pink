using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Data;
using Data.Entities;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Tests;

/// <summary>S6 gap tests only: A1 (audit_log append-only incl. trigger path), A2 (audit read is clinic-scoped and admin-only), A3 (seed and schema privacy).</summary>
[Collection("db")]
public class S6Tests(DbFixture fx)
{
    const string Pw = "Correct-horse-1";
    static readonly JsonSerializerOptions J = new(JsonSerializerDefaults.Web);
    record Tok(string AccessToken, string RefreshToken, int ExpiresIn, string Role);
    record Issued(string Token, DateTimeOffset ExpiresAt);

    async Task<HttpClient> As(string identifier)
    {
        var c = fx.Factory.CreateClient();
        var r = await c.PostAsJsonAsync("/api/v1/auth/login", new { identifier, password = Pw });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var t = (await r.Content.ReadFromJsonAsync<Tok>(J))!;
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", t.AccessToken);
        return c;
    }

    // S6-A1 (NFR-10): S1 T8 already covers app role and owner with UPDATE, DELETE and TRUNCATE (permission denied 42501).
    // Gap closed here: single-row UPDATE and DELETE attempts too, the two guard triggers exist, and the table content (count and digest) is unchanged afterwards.
    [Fact]
    public async Task S6A1_Audit_rows_survive_every_update_delete_and_truncate_attempt_unchanged()
    {
        Assert.Equal(HttpStatusCode.OK, (await fx.Factory.CreateClient().PostAsJsonAsync("/api/v1/auth/login", new { identifier = "aini.demo", password = fx.StaffPassword })).StatusCode); // fresh login row
        await using var c = new NpgsqlConnection(fx.OwnerConn);
        await c.OpenAsync();
        async Task<(long Count, string Digest)> Snapshot()
        {
            await using var cmd = new NpgsqlCommand("SELECT count(*), coalesce(md5(string_agg(id::text || action || coalesce(entity_id::text,''), ',' ORDER BY id)), '') FROM audit_log", c);
            await using var rd = await cmd.ExecuteReaderAsync();
            await rd.ReadAsync();
            return (rd.GetInt64(0), rd.GetString(1));
        }
        await using (var t = new NpgsqlCommand("SELECT count(*) FROM pg_trigger WHERE tgrelid = 'audit_log'::regclass AND NOT tgisinternal AND tgname IN ('audit_log_no_update_delete','audit_log_no_truncate')", c))
            Assert.Equal(2L, await t.ExecuteScalarAsync());
        var before = await Snapshot();
        Assert.True(before.Count > 0);
        foreach (var conn in new[] { fx.AppConn, fx.OwnerConn })
            foreach (var sql in new[]
            {
                "UPDATE audit_log SET action = 'x'",
                "UPDATE audit_log SET detail = '{}'::jsonb WHERE id = (SELECT min(id) FROM audit_log)",
                "DELETE FROM audit_log",
                "DELETE FROM audit_log WHERE id = (SELECT min(id) FROM audit_log)",
                "TRUNCATE audit_log",
            })
            {
                // Inside a transaction that is always rolled back, so a failed guard can never damage data.
                await using var x = new NpgsqlConnection(conn);
                await x.OpenAsync();
                await using var tx = await x.BeginTransactionAsync();
                var ex = await Assert.ThrowsAnyAsync<PostgresException>(() => new NpgsqlCommand(sql, x, tx).ExecuteNonQueryAsync());
                Assert.Contains(ex.SqlState, new[] { "42501", "P0001", "23001" });
                await tx.RollbackAsync();
            }
        Assert.Equal(before, await Snapshot());
    }

    // S6-A2 (NFR-10 query): clinic_admin sees own-clinic rows only; nurse, mother and anonymous are refused.
    [Fact]
    public async Task S6A2_Audit_read_is_own_clinic_only_and_refused_for_nurse_mother_and_anonymous()
    {
        var adminA = await As(await fx.CreateStaffAsync(fx.ClinicA, Roles.ClinicAdmin, Pw));
        var adminB = await As(await fx.CreateStaffAsync(fx.ClinicB, Roles.ClinicAdmin, Pw));
        var nurseA = await As(await fx.CreateStaffAsync(fx.ClinicA, Roles.Nurse, Pw));
        var nurseB = await As(await fx.CreateStaffAsync(fx.ClinicB, Roles.Nurse, Pw));
        var mother = await fx.CreatePatientAsync(fx.ClinicA, active: true, password: Pw);
        var motherClient = await As(mother.Phone);

        // Each clinic writes its own qr_issue row; the entity id of that row is the marker.
        async Task<string> IssueMarker(HttpClient nurse)
        {
            var r = await nurse.PostAsJsonAsync("/api/v1/staff/qr-tokens", new { });
            Assert.Equal(HttpStatusCode.Created, r.StatusCode);
            Assert.NotNull(JsonSerializer.Deserialize<Issued>(await r.Content.ReadAsStringAsync(), J)!.Token);
            await using var db = fx.Owner();
            var clinic = nurse == nurseA ? fx.ClinicA : fx.ClinicB;
            return (await db.AuditLogs.Where(a => a.Action == "qr_issue" && a.ClinicId == clinic).OrderByDescending(a => a.Id).FirstAsync()).EntityId!.ToString()!;
        }
        var markerA = await IssueMarker(nurseA);
        var markerB = await IssueMarker(nurseB);
        Assert.NotEqual(markerA, markerB);

        var a = await adminA.GetAsync("/api/v1/staff/audit?limit=200");
        var b = await adminB.GetAsync("/api/v1/staff/audit?limit=200");
        Assert.Equal(HttpStatusCode.OK, a.StatusCode);
        Assert.Equal(HttpStatusCode.OK, b.StatusCode);
        var bodyA = await a.Content.ReadAsStringAsync();
        var bodyB = await b.Content.ReadAsStringAsync();
        Assert.Contains(markerA, bodyA);
        Assert.DoesNotContain(markerB, bodyA);
        Assert.Contains(markerB, bodyB);
        Assert.DoesNotContain(markerA, bodyB);

        // Every actor in clinic A's answer belongs to clinic A, and vice versa (checked against the owner view).
        await using (var db = fx.Owner())
        {
            var staffA = await db.UserAccounts.Where(u => u.StaffId != null && db.Staff.Any(s => s.Id == u.StaffId && s.ClinicId == fx.ClinicA)).Select(u => u.Id).ToListAsync();
            var staffB = await db.UserAccounts.Where(u => u.StaffId != null && db.Staff.Any(s => s.Id == u.StaffId && s.ClinicId == fx.ClinicB)).Select(u => u.Id).ToListAsync();
            var actorsA = JsonDocument.Parse(bodyA).RootElement.EnumerateArray()
                .Select(r => r.GetProperty("actorUserId").ValueKind == JsonValueKind.Null ? (Guid?)null : r.GetProperty("actorUserId").GetGuid())
                .Where(g => g is not null).Select(g => g!.Value).ToHashSet();
            Assert.DoesNotContain(actorsA, g => staffB.Contains(g));
            var actorsB = JsonDocument.Parse(bodyB).RootElement.EnumerateArray()
                .Select(r => r.GetProperty("actorUserId").ValueKind == JsonValueKind.Null ? (Guid?)null : r.GetProperty("actorUserId").GetGuid())
                .Where(g => g is not null).Select(g => g!.Value).ToHashSet();
            Assert.DoesNotContain(actorsB, g => staffA.Contains(g));
        }

        // Limit is capped at 200.
        var capped = JsonDocument.Parse(await (await adminA.GetAsync("/api/v1/staff/audit?limit=100000")).Content.ReadAsStringAsync()).RootElement.GetArrayLength();
        Assert.InRange(capped, 1, 200);

        // Refused: nurse (either clinic), mother, anonymous. Nothing in the refusal body.
        foreach (var refused in new[] { nurseA, nurseB, motherClient })
        {
            var r = await refused.GetAsync("/api/v1/staff/audit");
            Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode);
            Assert.DoesNotContain(markerA, await r.Content.ReadAsStringAsync());
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await fx.Factory.CreateClient().GetAsync("/api/v1/staff/audit")).StatusCode);

        // Audit is read-only over HTTP: no write verbs exist for it.
        foreach (var m in new[] { HttpMethod.Post, HttpMethod.Put, HttpMethod.Patch, HttpMethod.Delete })
        {
            var r = await adminA.SendAsync(new HttpRequestMessage(m, "/api/v1/staff/audit") { Content = JsonContent.Create(new { }) });
            Assert.Contains(r.StatusCode, new[] { HttpStatusCode.MethodNotAllowed, HttpStatusCode.NotFound });
        }
    }

    // Column-name detector for S6-A3: whole underscore-separated words, so "clinic_id" is fine and "ic_no", "patient_bp" are not.
    static readonly Regex BannedWord = new(@"^(ic|nric|bp|lab)$|^(address|diagnos|vital|weight|clinical|allerg|medic|symptom)", RegexOptions.IgnoreCase);
    static bool IsBanned(string column) => column.Split('_').Any(w => BannedWord.IsMatch(w));

    [Fact]
    public void S6A3_column_name_detector_catches_clinical_and_identity_names_but_not_clinic_id()
    {
        foreach (var bad in new[] { "ic", "ic_no", "patient_nric", "home_address", "diagnosis", "lab_result", "vital_signs", "bp", "systolic_bp", "weight_kg" })
            Assert.True(IsBanned(bad), bad);
        foreach (var ok in new[] { "clinic_id", "display_name", "label", "password_hash", "queue_no", "is_demo", "walk_in_name", "urgent_reason", "labour" })
            Assert.False(IsBanned(ok), ok);
    }

    // S6-A3 (NFR-03): fresh seed holds only fictional minimal data.
    [Fact]
    public async Task S6A3_Seed_data_is_fictional_and_no_column_is_identity_or_clinical()
    {
        await using var c = new NpgsqlConnection(fx.OwnerConn);
        await c.OpenAsync();
        async Task<long> Scalar(string sql) { await using var cmd = new NpgsqlCommand(sql, c); return (long)(await cmd.ExecuteScalarAsync())!; }

        // Every patient is demo, today and in the schema (ck_patient_is_demo).
        Assert.True(await Scalar("SELECT count(*) FROM patient") >= 5);
        Assert.Equal(0L, await Scalar("SELECT count(*) FROM patient WHERE is_demo IS NOT TRUE"));
        Assert.Equal(1L, await Scalar("SELECT count(*) FROM pg_constraint WHERE conname = 'ck_patient_is_demo'"));
        var ex = await Assert.ThrowsAsync<PostgresException>(async () =>
            await new NpgsqlCommand($"INSERT INTO patient (clinic_id, display_name, phone, language, is_demo) VALUES ('{fx.ClinicA}', 'X (demo)', '0100000099', 'en', false)", c).ExecuteNonQueryAsync());
        Assert.Equal("23514", ex.SqlState);

        // Every seeded mother: all patients except the 0109 numbers the test fixture invents. Checks the phone prefix the seed uses (01000000nn) and the (demo) name suffix.
        var seeded = new List<(string Name, string Phone)>();
        await using (var cmd = new NpgsqlCommand("SELECT display_name, phone FROM patient WHERE phone NOT LIKE '0109%' ORDER BY phone", c))
        await using (var rd = await cmd.ExecuteReaderAsync())
            while (await rd.ReadAsync()) seeded.Add((rd.GetString(0), rd.GetString(1)));
        Assert.Equal(5, seeded.Count);
        Assert.All(seeded, s => Assert.Matches(@"^010000000[1-5]$", s.Phone));
        Assert.All(seeded, s => Assert.EndsWith("(demo)", s.Name));
        Assert.Equal(5, seeded.Select(s => s.Phone).Distinct().Count());
        Assert.Equal(0L, await Scalar("SELECT count(*) FROM patient WHERE phone NOT LIKE '010%'"));

        // Seeded staff and clinics are fictional too.
        await using (var cmd = new NpgsqlCommand("SELECT display_name FROM staff WHERE display_name IN ('Aini (demo)','Faridah (demo)','Rina (demo)')", c))
        await using (var rd = await cmd.ExecuteReaderAsync())
        {
            var n = 0; while (await rd.ReadAsync()) n++;
            Assert.Equal(3, n);
        }
        Assert.Equal(2L, await Scalar("SELECT count(*) FROM clinic WHERE code IN ('KK-DEMO-1','KK-DEMO-2') AND name LIKE 'KK Demo %'"));

        // No table or column name is identity or clinical (whole-word match, so clinic_id is fine).
        var names = new List<string>();
        await using (var cmd = new NpgsqlCommand("SELECT table_name || '.' || column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> '__EFMigrationsHistory'", c))
        await using (var rd = await cmd.ExecuteReaderAsync())
            while (await rd.ReadAsync()) names.Add(rd.GetString(0));
        Assert.True(names.Count > 40);
        Assert.Contains("patient.phone", names);
        Assert.DoesNotContain(names, n => IsBanned(n.Split('.')[1]) || IsBanned(n.Split('.')[0]));
    }
}
