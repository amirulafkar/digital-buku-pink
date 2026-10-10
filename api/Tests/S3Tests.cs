using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Data;
using Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Tests;

[Collection("db")]
public class S3Tests(DbFixture fx)
{
    const string Pw = "Correct-horse-1";
    static readonly JsonSerializerOptions J = new(JsonSerializerDefaults.Web);
    record Tok(string AccessToken, string RefreshToken, int ExpiresIn, string Role);
    record CheckIn(Guid QueueEntryId, string QueueNo, string Status, DateTimeOffset CheckedInAt);

    async Task<HttpClient> As(string identifier)
    {
        var c = fx.Factory.CreateClient();
        var r = await c.PostAsJsonAsync("/api/v1/auth/login", new { identifier, password = Pw });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var t = (await r.Content.ReadFromJsonAsync<Tok>(J))!;
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", t.AccessToken);
        return c;
    }
    async Task<HttpClient> Nurse(Guid? clinic = null) => await As(await fx.CreateStaffAsync(clinic ?? fx.ClinicA, Roles.Nurse, Pw));
    async Task<HttpClient> Admin() => await As(await fx.CreateStaffAsync(fx.ClinicA, Roles.ClinicAdmin, Pw));

    async Task<(HttpResponseMessage R, string Body)> Do(HttpClient c, HttpMethod m, string url, object? body = null)
    {
        var req = new HttpRequestMessage(m, url);
        if (body is not null) req.Content = JsonContent.Create(body);
        var r = await c.SendAsync(req);
        return (r, await r.Content.ReadAsStringAsync());
    }

    async Task<(Guid PatientId, string Name)> NamedPatient(string unique, Guid? clinic = null)
    {
        await using var db = fx.Owner();
        var p = new Patient { ClinicId = clinic ?? fx.ClinicA, DisplayName = unique + " (demo)", Phone = DbFixture.NewPhone(), Language = "ms" };
        db.Patients.Add(p);
        await db.SaveChangesAsync();
        return (p.Id, p.DisplayName);
    }

    Task<(HttpResponseMessage R, string Body)> Search(HttpClient c, string q) => Do(c, HttpMethod.Post, "/api/v1/staff/patients/search", new { q, limit = 20 });

    static string Uniq() => "Q" + Guid.NewGuid().ToString("N")[..8];

    // ---------- search ----------
    [Fact]
    public async Task S3_search_requires_two_chars_and_returns_only_name_and_appointment()
    {
        var nurse = await Nurse();
        var u = Uniq();
        var (pid, name) = await NamedPatient(u);
        await fx.AddAppointmentTodayAsync(fx.ClinicA, pid);
        Assert.Equal(HttpStatusCode.BadRequest, (await Search(nurse, "a")).R.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Do(nurse, HttpMethod.Post, "/api/v1/staff/patients/search", new { })).R.StatusCode);

        var (r, b) = await Search(nurse, u[..5].ToLower());
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var rows = JsonDocument.Parse(b).RootElement.EnumerateArray().ToList();
        var mine = Assert.Single(rows, x => x.GetProperty("id").GetGuid() == pid);
        Assert.Equal(name, mine.GetProperty("displayName").GetString());
        Assert.Equal("routine", mine.GetProperty("todayAppointment").GetProperty("type").GetString());
        Assert.DoesNotContain("phone", b, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("language", b, StringComparison.OrdinalIgnoreCase);
        Assert.InRange(rows.Count, 1, 20);
    }

    [Fact]
    public async Task S3_search_by_phone_fragment_is_clinic_scoped_and_audit_has_no_query_text()
    {
        var u = Uniq();
        var (pidA, _) = await NamedPatient(u);
        string phone;
        await using (var db = fx.Owner()) phone = (await db.Patients.SingleAsync(p => p.Id == pidA)).Phone;
        var (pidB, _) = await NamedPatient(u, fx.ClinicB);
        var nurseA = await Nurse();
        var nurseB = await Nurse(fx.ClinicB);

        var frag = phone[^6..];
        var a = await Search(nurseA, frag);
        Assert.Contains(pidA.ToString(), a.Body);
        Assert.DoesNotContain(pidB.ToString(), a.Body);
        Assert.DoesNotContain(phone, a.Body);
        var b = await Search(nurseB, u);
        Assert.Contains(pidB.ToString(), b.Body);
        Assert.DoesNotContain(pidA.ToString(), b.Body);

        await using var o = fx.Owner();
        var rows = await o.AuditLogs.Where(x => x.Action == "search").ToListAsync();
        Assert.NotEmpty(rows);
        Assert.All(rows, r => Assert.Matches(@"^\{""resultCount"": \d+\}$", r.Detail!));
        Assert.DoesNotContain(frag, fx.Logs.ToString());
        Assert.DoesNotContain(u, string.Join("|", rows.Select(r => r.Detail)));
    }

    [Fact]
    public async Task S3_search_is_nurse_only()
    {
        var admin = await Admin();
        Assert.Equal(HttpStatusCode.Forbidden, (await Search(admin, "ab")).R.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Do(admin, HttpMethod.Get, "/api/v1/staff/nurses")).R.StatusCode);
    }

    // ---------- nurses ----------
    [Fact]
    public async Task S3_nurses_list_is_clinic_scoped()
    {
        var nurse = await Nurse();
        await Nurse(fx.ClinicB);
        var (r, b) = await Do(nurse, HttpMethod.Get, "/api/v1/staff/nurses");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var rows = JsonDocument.Parse(b).RootElement.EnumerateArray().ToList();
        Assert.NotEmpty(rows);
        await using var db = fx.Owner();
        var ids = rows.Select(x => x.GetProperty("id").GetGuid()).ToList();
        Assert.All(await db.Staff.Where(s => ids.Contains(s.Id)).ToListAsync(), s => { Assert.Equal(fx.ClinicA, s.ClinicId); Assert.Equal("nurse", s.Role); });
    }

    // ---------- activation codes ----------
    [Fact]
    public async Task S3_issue_code_returns_plaintext_once_stores_hash_and_activates()
    {
        var nurse = await Nurse();
        var p = await fx.CreatePatientAsync(fx.ClinicA);
        var (r, b) = await Do(nurse, HttpMethod.Post, "/api/v1/staff/activation-codes", new { patientId = p.PatientId });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        var code = JsonDocument.Parse(b).RootElement.GetProperty("code").GetString()!;
        var exp = JsonDocument.Parse(b).RootElement.GetProperty("expiresAt").GetDateTimeOffset();
        Assert.InRange((exp - DateTimeOffset.UtcNow).TotalDays, 6.9, 7.1);

        await using var db = fx.Owner();
        var hashes = await db.ActivationCodes.Where(c => c.PatientId == p.PatientId).Select(c => c.CodeHash).ToListAsync();
        Assert.Contains(Crypto.HashCode(code, fx.Pepper), hashes);
        Assert.DoesNotContain(code, hashes);

        // The list never exposes the code or hash.
        var list = await Do(nurse, HttpMethod.Get, $"/api/v1/staff/activation-codes?patientId={p.PatientId}");
        Assert.DoesNotContain(code, list.Body);
        Assert.DoesNotContain("hash", list.Body, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("unused", list.Body);
        Assert.DoesNotContain(code, fx.Logs.ToString());
        Assert.DoesNotContain(code, string.Join("|", await db.AuditLogs.Select(a => a.Detail).ToListAsync()));

        // It works for the mobile activation endpoint.
        var act = await fx.Factory.CreateClient().PostAsJsonAsync("/api/v1/auth/activate", new { code, phone = p.Phone, password = Pw });
        Assert.Equal(HttpStatusCode.NoContent, act.StatusCode);
    }

    [Fact]
    public async Task S3_reissue_revokes_unused_codes_and_audits()
    {
        var nurse = await Nurse();
        var p = await fx.CreatePatientAsync(fx.ClinicA);
        var first = JsonDocument.Parse((await Do(nurse, HttpMethod.Post, "/api/v1/staff/activation-codes", new { patientId = p.PatientId })).Body).RootElement.GetProperty("code").GetString()!;
        var second = JsonDocument.Parse((await Do(nurse, HttpMethod.Post, "/api/v1/staff/activation-codes", new { patientId = p.PatientId })).Body).RootElement.GetProperty("code").GetString()!;
        Assert.NotEqual(first, second);
        var bad = await fx.Factory.CreateClient().PostAsJsonAsync("/api/v1/auth/activate", new { code = first, phone = p.Phone, password = Pw });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        var ok = await fx.Factory.CreateClient().PostAsJsonAsync("/api/v1/auth/activate", new { code = second, phone = p.Phone, password = Pw });
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);

        await using var db = fx.Owner();
        Assert.Contains(await db.AuditLogs.Where(a => a.EntityId == p.PatientId).Select(a => a.Action).ToListAsync(), a => a == "activation_revoke");
        var list = await Do(nurse, HttpMethod.Get, $"/api/v1/staff/activation-codes?patientId={p.PatientId}");
        Assert.Contains("expired", list.Body);
        Assert.Contains("used", list.Body);
    }

    [Fact]
    public async Task S3_issue_code_rules_other_clinic_404_audit_ids_only_admin_can_list_not_issue()
    {
        var nurseB = await Nurse(fx.ClinicB);
        var admin = await Admin();
        var nurseA = await Nurse();
        var p = await fx.CreatePatientAsync(fx.ClinicA);
        Assert.Equal(HttpStatusCode.NotFound, (await Do(nurseB, HttpMethod.Post, "/api/v1/staff/activation-codes", new { patientId = p.PatientId })).R.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Do(admin, HttpMethod.Post, "/api/v1/staff/activation-codes", new { patientId = p.PatientId })).R.StatusCode);
        var pc = await As((await fx.CreatePatientAsync(fx.ClinicA, true, Pw)).Phone);
        Assert.Equal(HttpStatusCode.Forbidden, (await Do(pc, HttpMethod.Get, "/api/v1/staff/activation-codes")).R.StatusCode);

        await Do(nurseA, HttpMethod.Post, "/api/v1/staff/activation-codes", new { patientId = p.PatientId });
        Assert.Equal(HttpStatusCode.OK, (await Do(admin, HttpMethod.Get, "/api/v1/staff/activation-codes")).R.StatusCode);
        var u = Uniq();
        var (named, _) = await NamedPatient(u);
        await Do(nurseA, HttpMethod.Post, "/api/v1/staff/activation-codes", new { patientId = named });
        Assert.Contains(u, (await Do(nurseA, HttpMethod.Get, "/api/v1/staff/activation-codes")).Body);
        Assert.DoesNotContain(u, (await Do(nurseB, HttpMethod.Get, "/api/v1/staff/activation-codes")).Body);
        await using var db = fx.Owner();
        var row = await db.AuditLogs.Where(a => a.Action == "activation_issue" && a.ClinicId == fx.ClinicA).OrderByDescending(a => a.Id).FirstAsync();
        Assert.Matches(@"^\{""patientId"": ""[0-9a-f-]{36}""\}$", row.Detail!);
    }

    // ---------- urgent ----------
    async Task<(HttpClient Nurse, Guid Id)> WalkIn()
    {
        var nurse = await Nurse();
        var (r, b) = await Do(nurse, HttpMethod.Post, "/api/v1/staff/checkins", new { walkInName = "Urgent Tester", idempotencyKey = Guid.NewGuid().ToString() });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        return (nurse, JsonSerializer.Deserialize<CheckIn>(b, J)!.QueueEntryId);
    }

    [Fact]
    public async Task S3_urgent_needs_a_fixed_reason_code_and_audits_code_only()
    {
        var (nurse, id) = await WalkIn();
        var url = $"/api/v1/staff/queue/{id}";
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Do(nurse, HttpMethod.Patch, url, new { urgent = true })).R.StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Do(nurse, HttpMethod.Patch, url, new { urgent = true, urgentReason = "free text here" })).R.StatusCode);
        var ok = await Do(nurse, HttpMethod.Patch, url, new { urgent = true, urgentReason = "accessibility_need" });
        Assert.Equal(HttpStatusCode.OK, ok.R.StatusCode);
        Assert.Contains("\"urgent\":true", ok.Body);
        var list = await Do(nurse, HttpMethod.Get, "/api/v1/staff/queue");
        Assert.Contains("\"urgent\":true", list.Body);
        var off = await Do(nurse, HttpMethod.Patch, url, new { urgent = false });
        Assert.Equal(HttpStatusCode.OK, off.R.StatusCode);

        await using var db = fx.Owner();
        var rows = await db.AuditLogs.Where(a => a.EntityId == id && a.Action == "urgent").OrderBy(a => a.Id).ToListAsync();
        Assert.Equal(2, rows.Count);
        Assert.Contains("accessibility_need", rows[0].Detail);
        Assert.DoesNotContain("Urgent Tester", rows[0].Detail);
        var e = await db.QueueEntries.SingleAsync(q => q.Id == id);
        Assert.False(e.Urgent);
        Assert.Null(e.UrgentReason);
        Assert.Equal("waiting", e.Status); // urgency never changes status or order
    }

    [Fact]
    public async Task S3_urgent_is_nurse_only_and_clinic_scoped_and_not_on_closed_entries()
    {
        var (nurse, id) = await WalkIn();
        var admin = await Admin();
        var nurseB = await Nurse(fx.ClinicB);
        var url = $"/api/v1/staff/queue/{id}";
        var body = new { urgent = true, urgentReason = "other" };
        Assert.Equal(HttpStatusCode.Forbidden, (await Do(admin, HttpMethod.Patch, url, body)).R.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Do(nurseB, HttpMethod.Patch, url, body)).R.StatusCode);
        await Do(nurse, HttpMethod.Patch, url, new { status = "missed", reason = "other" });
        Assert.Equal(HttpStatusCode.Conflict, (await Do(nurse, HttpMethod.Patch, url, body)).R.StatusCode);
    }

    [Fact]
    public async Task S3_search_text_is_never_in_a_url()
    {
        // The old GET route is gone: a query string search no longer exists.
        var nurse = await Nurse();
        Assert.NotEqual(HttpStatusCode.OK, (await Do(nurse, HttpMethod.Get, "/api/v1/staff/patients?q=abc")).R.StatusCode);
        var r = await Search(nurse, "abc");
        Assert.Equal(HttpStatusCode.OK, r.R.StatusCode);
        Assert.DoesNotContain("abc", r.R.RequestMessage!.RequestUri!.ToString());
    }

    [Fact]
    public async Task S3_parallel_code_issue_leaves_exactly_one_unused_code()
    {
        var nurse = await Nurse();
        var p = await fx.CreatePatientAsync(fx.ClinicA);
        var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ =>
            Do(nurse, HttpMethod.Post, "/api/v1/staff/activation-codes", new { patientId = p.PatientId })));
        Assert.All(results, x => Assert.Equal(HttpStatusCode.Created, x.R.StatusCode));
        await using var db = fx.Owner();
        var now = DateTimeOffset.UtcNow;
        var unused = await db.ActivationCodes.CountAsync(c => c.PatientId == p.PatientId && c.UsedAt == null && c.ExpiresAt > now);
        Assert.Equal(1, unused);
    }

    [Fact]
    public async Task S3_parallel_issue_and_activate_never_500_and_end_consistent()
    {
        var nurse = await Nurse();
        for (var round = 0; round < 6; round++)
        {
            var p = await fx.CreatePatientAsync(fx.ClinicA); // pending account plus one code
            var activate = fx.Factory.CreateClient().PostAsJsonAsync("/api/v1/auth/activate", new { code = p.Code, phone = p.Phone, password = Pw });
            var issue = Do(nurse, HttpMethod.Post, "/api/v1/staff/activation-codes", new { patientId = p.PatientId });
            await Task.WhenAll(activate, issue);
            var a = (await activate).StatusCode;
            Assert.Contains(a, new[] { HttpStatusCode.NoContent, HttpStatusCode.BadRequest });
            Assert.Equal(HttpStatusCode.Created, (await issue).R.StatusCode);

            await using var db = fx.Owner();
            var accounts = await db.UserAccounts.Where(x => x.PatientId == p.PatientId).ToListAsync();
            var account = Assert.Single(accounts);
            var codes = await db.ActivationCodes.Where(c => c.PatientId == p.PatientId).ToListAsync();
            var now = DateTimeOffset.UtcNow;
            Assert.True(codes.Count(c => c.UsedAt == null && c.ExpiresAt > now) <= 1);
            if (a == HttpStatusCode.NoContent)
            {
                Assert.Equal("active", account.Status);
                Assert.Single(codes, c => c.UsedAt != null);
            }
            else
            {
                Assert.Equal("pending", account.Status); // no orphan or half-activated account
                Assert.DoesNotContain(codes, c => c.UsedAt != null);
            }
        }
    }

    [Fact]
    public async Task S3_failed_activation_leaves_no_new_rows_except_the_audit_row()
    {
        var p = await fx.CreatePatientAsync(fx.ClinicA);
        await using (var d = fx.Owner())
        {
            // Remove the pending account so a failed redeem would otherwise create one.
            d.UserAccounts.RemoveRange(d.UserAccounts.Where(x => x.PatientId == p.PatientId));
            await d.SaveChangesAsync();
        }
        var r = await fx.Factory.CreateClient().PostAsJsonAsync("/api/v1/auth/activate", new { code = "ZZZZ-ZZZZ-ZZ", phone = p.Phone, password = Pw });
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        await using var db = fx.Owner();
        Assert.Empty(await db.UserAccounts.Where(x => x.PatientId == p.PatientId).ToListAsync());
    }
}
