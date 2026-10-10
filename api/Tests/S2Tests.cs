using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Data;
using Data.Entities;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Tests;

[Collection("db")]
public class S2Tests(DbFixture fx)
{
    const string Pw = "Correct-horse-1";
    static readonly JsonSerializerOptions J = new(JsonSerializerDefaults.Web);
    record Tok(string AccessToken, string RefreshToken, int ExpiresIn, string Role);
    record Issued(string Token, DateTimeOffset ExpiresAt);
    record CheckIn(Guid QueueEntryId, string QueueNo, string Status, DateTimeOffset CheckedInAt);
    record Err(string Code, string Message);

    // Every response body is recorded for the T9 scan.
    static readonly List<string> Bodies = [];
    static void Rec(string b) { lock (Bodies) Bodies.Add(b); }

    async Task<HttpClient> As(string identifier)
    {
        var c = fx.Factory.CreateClient();
        var r = await c.PostAsJsonAsync("/api/v1/auth/login", new { identifier, password = Pw });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var t = (await r.Content.ReadFromJsonAsync<Tok>(J))!;
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", t.AccessToken);
        return c;
    }

    async Task<(HttpResponseMessage R, string Body)> Do(HttpClient c, HttpMethod m, string url, object? body = null)
    {
        var req = new HttpRequestMessage(m, url);
        if (body is not null) req.Content = JsonContent.Create(body);
        var r = await c.SendAsync(req);
        var b = await r.Content.ReadAsStringAsync();
        Rec(b);
        return (r, b);
    }

    async Task<HttpClient> Nurse(Guid? clinic = null) => await As(await fx.CreateStaffAsync(clinic ?? fx.ClinicA, Roles.Nurse, Pw));
    async Task<string> Token(HttpClient nurse) =>
        JsonSerializer.Deserialize<Issued>((await Do(nurse, HttpMethod.Post, "/api/v1/staff/qr-tokens", new { })).Body, J)!.Token;

    async Task<(HttpClient C, DbFixture.TestPatient P)> PatientWithAppt(Guid? clinic = null)
    {
        var p = await fx.CreatePatientAsync(clinic ?? fx.ClinicA, active: true, password: Pw);
        await fx.AddAppointmentTodayAsync(clinic ?? fx.ClinicA, p.PatientId);
        return (await As(p.Phone), p);
    }

    Task<(HttpResponseMessage R, string Body)> ScanIn(HttpClient c, string token, string? key = null) =>
        Do(c, HttpMethod.Post, "/api/v1/checkins", new { token, idempotencyKey = key ?? Guid.NewGuid().ToString() });

    static CheckIn Parse(string b) => JsonSerializer.Deserialize<CheckIn>(b, J)!;

    // S2-T1
    [Fact]
    public async Task S2T1_Valid_scan_checks_in_and_token_is_shared_and_stored_hashed()
    {
        var nurse = await Nurse();
        var tok = await Token(nurse);
        var (c1, _) = await PatientWithAppt();
        var (c2, _) = await PatientWithAppt();
        var (r1, b1) = await ScanIn(c1, tok);
        Assert.Equal(HttpStatusCode.Created, r1.StatusCode);
        var e1 = Parse(b1);
        Assert.Equal("waiting", e1.Status);
        Assert.StartsWith("A", e1.QueueNo);
        var (r2, b2) = await ScanIn(c2, tok); // same token within 60 s
        Assert.Equal(HttpStatusCode.Created, r2.StatusCode);
        Assert.NotEqual(e1.QueueNo, Parse(b2).QueueNo);

        await using var db = fx.Owner();
        var hashes = await db.QrTokens.Select(t => t.TokenHash).ToListAsync();
        Assert.Contains(Crypto.Hash(tok), hashes);
        Assert.DoesNotContain(tok, hashes);
        var q = await db.QrTokens.SingleAsync(t => t.TokenHash == Crypto.Hash(tok));
        Assert.InRange((q.ExpiresAt - q.CreatedAt).TotalSeconds, 55, 65);
        Assert.Equal(fx.ClinicA, q.ClinicId);
    }

    // S2-T2
    [Theory]
    [InlineData("unknown")]
    [InlineData("expired")]
    public async Task S2T2_Expired_or_unknown_token_is_400_and_creates_nothing(string kind)
    {
        var (c, p) = await PatientWithAppt();
        var token = "tok-" + Guid.NewGuid().ToString("N");
        if (kind == "expired")
        {
            await using var o = fx.Owner();
            o.QrTokens.Add(new QrToken { ClinicId = fx.ClinicA, TokenHash = Crypto.Hash(token), ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(-1) });
            await o.SaveChangesAsync();
        }
        var (r, b) = await ScanIn(c, token);
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Equal("token_invalid", JsonSerializer.Deserialize<Err>(b, J)!.Code);
        await using var db = fx.Owner();
        Assert.Empty(await db.QueueEntries.Where(q => q.PatientId == p.PatientId).ToListAsync());
    }

    // S2-T3
    [Fact]
    public async Task S2T3_Wrong_clinic_is_403_with_refusal_audit()
    {
        var phone = await fx.ActivateNadiaAsync(Pw);
        var tok = await Token(await Nurse());
        var nadia = await As(phone);
        var (r, b) = await ScanIn(nadia, tok);
        Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode);
        Assert.Equal("wrong_clinic", JsonSerializer.Deserialize<Err>(b, J)!.Code);
        await using var db = fx.Owner();
        var n = await db.Patients.SingleAsync(x => x.Phone == phone);
        var clinic2 = n.ClinicId;
        Assert.NotEqual(fx.ClinicA, clinic2);
        Assert.Empty(await db.QueueEntries.Where(q => q.PatientId == n.Id).ToListAsync());
        var row = await db.AuditLogs.Where(a => a.ClinicId == clinic2 && a.Action == "checkin_refused").OrderByDescending(a => a.Id).FirstAsync();
        Assert.Contains("wrong_clinic", row.Detail);
        Assert.NotNull(row.ActorUserId);
        Assert.Equal("patient", row.Entity);
        Assert.Equal(n.Id, row.EntityId);
    }

    [Fact]
    public async Task S2T4e_Checkin_audit_carries_appointment_id_and_queue_me_is_null_before_check_in()
    {
        var nurse = await Nurse();
        var (c, p) = await PatientWithAppt();
        var none = await Do(c, HttpMethod.Get, "/api/v1/queue/me");
        Assert.Equal("{\"queueNo\":null}", none.Body);
        var e = Parse((await ScanIn(c, await Token(nurse))).Body);
        await using var db = fx.Owner();
        var appt = await db.Appointments.SingleAsync(a => a.PatientId == p.PatientId);
        Assert.Equal("checked_in", appt.Status);
        var row = await db.AuditLogs.SingleAsync(a => a.EntityId == e.QueueEntryId && a.Action == "checkin");
        Assert.Contains(appt.Id.ToString(), row.Detail);
    }

    [Fact]
    public async Task S2T3b_No_appointment_today_is_422()
    {
        var tok = await Token(await Nurse());
        var p = await fx.CreatePatientAsync(fx.ClinicA, active: true, password: Pw);
        var (r, b) = await ScanIn(await As(p.Phone), tok);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, r.StatusCode);
        Assert.Contains("no_appointment_today", b);
    }

    // S2-T4
    [Fact]
    public async Task S2T4_Repeat_check_in_returns_same_entry()
    {
        var nurse = await Nurse();
        var (c, p) = await PatientWithAppt();
        var (r1, b1) = await ScanIn(c, await Token(nurse), "key-1");
        Assert.Equal(HttpStatusCode.Created, r1.StatusCode);
        var (r2, b2) = await ScanIn(c, await Token(nurse), "key-1");        // same key
        var (r3, b3) = await ScanIn(c, await Token(nurse), "key-other");    // new token and new key
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);
        Assert.Equal(HttpStatusCode.OK, r3.StatusCode);
        Assert.Equal(Parse(b1).QueueEntryId, Parse(b2).QueueEntryId);
        Assert.Equal(Parse(b1).QueueEntryId, Parse(b3).QueueEntryId);
        await using var db = fx.Owner();
        Assert.Single(await db.QueueEntries.Where(q => q.PatientId == p.PatientId).ToListAsync());

        // GET /queue/me returns own row only.
        var me = await Do(c, HttpMethod.Get, "/api/v1/queue/me");
        Assert.Contains(Parse(b1).QueueNo, me.Body);
    }

    [Fact]
    public async Task S2T4b_After_missed_a_new_entry_is_allowed()
    {
        var nurse = await Nurse();
        var (c, _) = await PatientWithAppt();
        var e1 = Parse((await ScanIn(c, await Token(nurse), "k1")).Body);
        var m = await Do(nurse, HttpMethod.Patch, $"/api/v1/staff/queue/{e1.QueueEntryId}", new { status = "missed", reason = "no_answer" });
        Assert.Equal(HttpStatusCode.OK, m.R.StatusCode);
        var replay = await ScanIn(c, await Token(nurse), "k1"); // same key as the missed entry: not a 200 replay
        Assert.Equal(HttpStatusCode.Conflict, replay.R.StatusCode);
        var (r2, b2) = await ScanIn(c, await Token(nurse), "k2");
        Assert.Equal(HttpStatusCode.Created, r2.StatusCode);
        Assert.NotEqual(e1.QueueEntryId, Parse(b2).QueueEntryId);
    }

    [Fact]
    public async Task S2T4d_Retry_after_token_expiry_returns_existing_entry()
    {
        var nurse = await Nurse();
        var (c, p) = await PatientWithAppt();
        var e1 = Parse((await ScanIn(c, await Token(nurse), "kx")).Body);
        var expired = "tok-" + Guid.NewGuid().ToString("N");
        await using (var o = fx.Owner())
        {
            o.QrTokens.Add(new QrToken { ClinicId = fx.ClinicA, TokenHash = Crypto.Hash(expired), ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(-5) });
            await o.SaveChangesAsync();
        }
        var (r, b) = await ScanIn(c, expired, "kx");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(e1.QueueEntryId, Parse(b).QueueEntryId);
        await using var db = fx.Owner();
        Assert.Single(await db.QueueEntries.Where(q => q.PatientId == p.PatientId).ToListAsync());
    }

    [Fact]
    public async Task S2T2c_Oversized_token_is_rejected_and_unknown_tokens_are_not_audited()
    {
        var (c, p) = await PatientWithAppt();
        await using var db0 = fx.Owner();
        var before = await db0.AuditLogs.CountAsync(a => a.Action == "checkin_refused");
        var (r, b) = await ScanIn(c, new string('x', 129));
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Contains("token_invalid", b);
        await ScanIn(c, "unknown-token-abc");
        Assert.Equal(before, await db0.AuditLogs.CountAsync(a => a.Action == "checkin_refused"));
    }

    [Fact]
    public async Task S2T10b_App_role_cannot_delete_queue_or_qr_rows()
    {
        foreach (var sql in new[] { "DELETE FROM queue_entry", "DELETE FROM qr_token", "UPDATE qr_token SET expires_at = now()" })
        {
            await using var c = new NpgsqlConnection(fx.AppConn);
            await c.OpenAsync();
            var ex = await Assert.ThrowsAsync<PostgresException>(() => new NpgsqlCommand(sql, c).ExecuteNonQueryAsync());
            Assert.Equal("42501", ex.SqlState);
        }
    }

    [Fact]
    public async Task S2T4c_Missed_requires_reason()
    {
        var nurse = await Nurse();
        var (c, _) = await PatientWithAppt();
        var e = Parse((await ScanIn(c, await Token(nurse))).Body);
        var m = await Do(nurse, HttpMethod.Patch, $"/api/v1/staff/queue/{e.QueueEntryId}", new { status = "missed" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, m.R.StatusCode);
    }

    // S2-T5
    [Fact]
    public async Task S2T5_Staff_walk_in_gets_W_number_and_patient_is_forbidden()
    {
        var nurse = await Nurse();
        var (r, b) = await Do(nurse, HttpMethod.Post, "/api/v1/staff/checkins", new { walkInName = "Walkin Tester", idempotencyKey = "w1" });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        var e = Parse(b);
        Assert.StartsWith("W", e.QueueNo);
        var (r2, b2) = await Do(nurse, HttpMethod.Post, "/api/v1/staff/checkins", new { walkInName = "Walkin Tester", idempotencyKey = "w1" });
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);
        Assert.Equal(e.QueueEntryId, Parse(b2).QueueEntryId);
        await using (var db = fx.Owner())
            Assert.Equal("staff", (await db.QueueEntries.SingleAsync(q => q.Id == e.QueueEntryId)).Source);

        var (pc, _) = await PatientWithAppt();
        var pr = await Do(pc, HttpMethod.Post, "/api/v1/staff/checkins", new { walkInName = "X", idempotencyKey = "w2" });
        Assert.Equal(HttpStatusCode.Forbidden, pr.R.StatusCode);

        // patientId from another clinic -> 404
        var other = await fx.CreatePatientAsync(fx.ClinicB);
        var nf = await Do(nurse, HttpMethod.Post, "/api/v1/staff/checkins", new { patientId = other.PatientId, idempotencyKey = "w3" });
        Assert.Equal(HttpStatusCode.NotFound, nf.R.StatusCode);
    }

    // S2-T6
    [Fact]
    public async Task S2T6_State_machine_and_audit()
    {
        var nurse = await Nurse();
        var (c, _) = await PatientWithAppt();
        var e = Parse((await ScanIn(c, await Token(nurse))).Body);
        var url = $"/api/v1/staff/queue/{e.QueueEntryId}";
        foreach (var s in new[] { "called", "in_room", "completed" })
        {
            var (r, b) = await Do(nurse, HttpMethod.Patch, url, new { status = s });
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            Assert.Contains(s, b);
        }
        var bad = await Do(nurse, HttpMethod.Patch, url, new { status = "waiting" });
        Assert.Equal(HttpStatusCode.Conflict, bad.R.StatusCode);
        Assert.Contains("invalid_transition", bad.Body);
        var skip = await Do(nurse, HttpMethod.Patch, url, new { status = "called" });
        Assert.Equal(HttpStatusCode.Conflict, skip.R.StatusCode);

        await using var db = fx.Owner();
        Assert.Equal("completed", (await db.QueueEntries.SingleAsync(q => q.Id == e.QueueEntryId)).Status);
        var rows = await db.AuditLogs.Where(a => a.EntityId == e.QueueEntryId && a.Action == "status").OrderBy(a => a.Id).ToListAsync();
        Assert.Equal(3, rows.Count);
        Assert.Contains("\"from\": \"waiting\"", rows[0].Detail);
        Assert.Contains("\"to\": \"called\"", rows[0].Detail);
        Assert.All(rows, r => { Assert.NotNull(r.ActorUserId); Assert.Equal(fx.ClinicA, r.ClinicId); Assert.NotNull(r.Ip); });
        Assert.Single(await db.AuditLogs.Where(a => a.EntityId == e.QueueEntryId && a.Action == "checkin").ToListAsync());
    }

    // S2-T7
    [Fact]
    public async Task S2T7_Assign_room_rules_and_order_unchanged()
    {
        var nurse = await Nurse();
        var (c1, _) = await PatientWithAppt();
        var (c2, _) = await PatientWithAppt();
        var e1 = Parse((await ScanIn(c1, await Token(nurse))).Body);
        var e2 = Parse((await ScanIn(c2, await Token(nurse))).Body);
        var roomB = await fx.CreateRoomAsync(fx.ClinicB);
        var bad = await Do(nurse, HttpMethod.Patch, $"/api/v1/staff/queue/{e2.QueueEntryId}", new { roomId = roomB });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, bad.R.StatusCode);

        var roomA = await fx.CreateRoomAsync(fx.ClinicA);
        var ok = await Do(nurse, HttpMethod.Patch, $"/api/v1/staff/queue/{e2.QueueEntryId}", new { roomId = roomA });
        Assert.Equal(HttpStatusCode.OK, ok.R.StatusCode);

        var list = JsonDocument.Parse((await Do(nurse, HttpMethod.Get, "/api/v1/staff/queue")).Body).RootElement.GetProperty("entries");
        var ids = list.EnumerateArray().Select(x => x.GetProperty("id").GetGuid()).ToList();
        Assert.True(ids.IndexOf(e1.QueueEntryId) < ids.IndexOf(e2.QueueEntryId)); // arrival order
        await using var db = fx.Owner();
        var a = await db.AuditLogs.SingleAsync(x => x.EntityId == e2.QueueEntryId && x.Action == "assign");
        Assert.Contains(roomA.ToString(), a.Detail);
        Assert.Null((await db.QueueEntries.SingleAsync(q => q.Id == e2.QueueEntryId)).StaffId);
    }

    // S2-T8
    [Fact]
    public async Task S2T8_Other_clinic_cannot_see_or_change_entries()
    {
        var nurseA = await Nurse();
        var nurseB = await Nurse(fx.ClinicB);
        var (c, _) = await PatientWithAppt();
        var e = Parse((await ScanIn(c, await Token(nurseA))).Body);
        var list = await Do(nurseB, HttpMethod.Get, "/api/v1/staff/queue");
        Assert.DoesNotContain(e.QueueEntryId.ToString(), list.Body);
        var patch = await Do(nurseB, HttpMethod.Patch, $"/api/v1/staff/queue/{e.QueueEntryId}", new { status = "called" });
        Assert.Equal(HttpStatusCode.NotFound, patch.R.StatusCode);
        await using var db = fx.Owner();
        Assert.Equal("waiting", (await db.QueueEntries.SingleAsync(q => q.Id == e.QueueEntryId)).Status);
        await using var app = fx.App();
        Assert.Null(await new QueueRepository(app).GetAsync(fx.ClinicB, e.QueueEntryId));
    }

    // Roles
    [Fact]
    public async Task Roles_admin_is_read_only_and_audit_is_admin_only()
    {
        var nurse = await Nurse();
        var admin = await As(await fx.CreateStaffAsync(fx.ClinicA, Roles.ClinicAdmin, Pw));
        var (c, p) = await PatientWithAppt();
        var e = Parse((await ScanIn(c, await Token(nurse))).Body);

        Assert.Equal(HttpStatusCode.OK, (await Do(admin, HttpMethod.Get, "/api/v1/staff/queue")).R.StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Do(admin, HttpMethod.Post, "/api/v1/staff/qr-tokens", new { })).R.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Do(admin, HttpMethod.Patch, $"/api/v1/staff/queue/{e.QueueEntryId}", new { status = "called" })).R.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Do(admin, HttpMethod.Post, "/api/v1/staff/checkins", new { walkInName = "A", idempotencyKey = "z" })).R.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Do(nurse, HttpMethod.Get, "/api/v1/staff/audit")).R.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Do(c, HttpMethod.Get, "/api/v1/staff/audit")).R.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Do(c, HttpMethod.Get, "/api/v1/staff/queue")).R.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Do(c, HttpMethod.Post, "/api/v1/staff/qr-tokens", new { })).R.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Do(nurse, HttpMethod.Get, "/api/v1/queue/me")).R.StatusCode);

        var audit = await Do(admin, HttpMethod.Get, "/api/v1/staff/audit?limit=500");
        Assert.Equal(HttpStatusCode.OK, audit.R.StatusCode);
        var rows = JsonDocument.Parse(audit.Body).RootElement.EnumerateArray().ToList();
        Assert.InRange(rows.Count, 1, 200);
        Assert.Contains(rows, r => r.GetProperty("action").GetString() == "checkin");
        Assert.DoesNotContain(p.Phone, audit.Body);
    }

    // Concurrency
    [Fact]
    public async Task Parallel_check_ins_get_unique_queue_numbers()
    {
        var nurse = await Nurse();
        var tok = await Token(nurse);
        var clients = new List<HttpClient>();
        for (var i = 0; i < 8; i++) clients.Add((await PatientWithAppt()).C);
        var results = await Task.WhenAll(clients.Select(c => ScanIn(c, tok)));
        Assert.All(results, r => Assert.Equal(HttpStatusCode.Created, r.R.StatusCode));
        var nos = results.Select(r => Parse(r.Body).QueueNo).ToList();
        Assert.Equal(8, nos.Distinct().Count());

        var walkIns = await Task.WhenAll(Enumerable.Range(0, 6).Select(i =>
            Do(nurse, HttpMethod.Post, "/api/v1/staff/checkins", new { walkInName = "Par " + i, idempotencyKey = "par-" + Guid.NewGuid() })));
        Assert.All(walkIns, r => Assert.Equal(HttpStatusCode.Created, r.R.StatusCode));
        Assert.Equal(6, walkIns.Select(r => Parse(r.Body).QueueNo).Distinct().Count());
    }

    // S2-T9
    [Fact]
    public async Task S2T9_No_personal_data_token_values_or_wait_estimates_anywhere()
    {
        var nurse = await Nurse();
        const string walkIn = "Zainab Walkinname";
        var tok = await Token(nurse);
        var (c, p) = await PatientWithAppt();
        await ScanIn(c, tok);
        await Do(nurse, HttpMethod.Post, "/api/v1/staff/checkins", new { walkInName = walkIn, idempotencyKey = "t9" });
        await ScanIn(c, "bad-token-value-123");
        await Do(c, HttpMethod.Get, "/api/v1/queue/me");
        await Do(nurse, HttpMethod.Get, "/api/v1/staff/queue");

        await using var db = fx.Owner();
        var rows = await db.AuditLogs.Where(a => a.Action == "checkin" || a.Action == "checkin_refused" || a.Action == "qr_issue" || a.Action == "status" || a.Action == "assign").ToListAsync();
        Assert.NotEmpty(rows);
        var detail = string.Join("\n", rows.Select(r => r.Detail ?? ""));
        string[] secrets = [p.Phone, walkIn, "Zainab", tok, "bad-token-value-123"];
        foreach (var s in secrets) { Assert.DoesNotContain(s, detail); Assert.DoesNotContain(s, fx.Logs.ToString()); }
        string all; lock (Bodies) all = string.Join("\n", Bodies);
        Assert.DoesNotContain(p.Phone, all.Replace(walkIn, ""));
        Assert.DoesNotContain("bad-token-value-123", all);
        // Random token values may contain letters like "eta", so scan JSON keys and message words, not raw text.
        Assert.DoesNotMatch(@"(?i)""(eta|[a-z]*(wait|estimat|minute|duration)[a-z]*)""\s*:", all);
        Assert.DoesNotContain("wait time", all, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("estimated", all, StringComparison.OrdinalIgnoreCase);
        Assert.All(rows.Where(r => r.Action == "checkin"),
            r => Assert.Matches(@"^\{""source"": ""(qr|staff)"", ""queueNo"": ""[AW]\d{3}"", ""appointmentId"": (null|""[0-9a-f-]{36}"")\}$", r.Detail!));
    }

    // S2-T10
    [Fact]
    public async Task S2T10_Audit_rows_from_S2_cannot_be_updated_or_deleted()
    {
        var nurse = await Nurse();
        await Token(nurse);
        foreach (var sql in new[] { "UPDATE audit_log SET action = 'x' WHERE action = 'qr_issue'", "DELETE FROM audit_log WHERE action = 'qr_issue'" })
        {
            await using var c = new NpgsqlConnection(fx.AppConn);
            await c.OpenAsync();
            var ex = await Assert.ThrowsAsync<PostgresException>(() => new NpgsqlCommand(sql, c).ExecuteNonQueryAsync());
            Assert.Equal("42501", ex.SqlState);
        }
    }
}
