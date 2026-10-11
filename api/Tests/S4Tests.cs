using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Data;
using Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Tests;

[Collection("db")]
public class S4Tests(DbFixture fx)
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

    async Task<(HttpClient C, DbFixture.TestPatient P)> Mother(bool appointment = true, Guid? clinic = null)
    {
        var p = await fx.CreatePatientAsync(clinic ?? fx.ClinicA, active: true, password: Pw);
        if (appointment) await fx.AddAppointmentTodayAsync(clinic ?? fx.ClinicA, p.PatientId);
        return (await As(p.Phone), p);
    }

    static async Task<JsonElement> Json(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;

    [Fact]
    public async Task S4_me_returns_own_name_clinic_and_language_and_no_phone()
    {
        var (c, p) = await Mother();
        var r = await c.GetAsync("/api/v1/me");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var body = await r.Content.ReadAsStringAsync();
        var j = JsonDocument.Parse(body).RootElement;
        Assert.Equal("Test (demo)", j.GetProperty("displayName").GetString());
        Assert.Equal("KK Demo Satu", j.GetProperty("clinicName").GetString());
        Assert.Equal("en", j.GetProperty("language").GetString());
        Assert.DoesNotContain(p.Phone, body);
        Assert.DoesNotContain(p.Phone, fx.Logs.ToString());
        // Staff and anonymous callers are refused.
        var nurse = await As(await fx.CreateStaffAsync(fx.ClinicA, Roles.Nurse, Pw));
        Assert.Equal(HttpStatusCode.Forbidden, (await nurse.GetAsync("/api/v1/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await fx.Factory.CreateClient().GetAsync("/api/v1/me")).StatusCode);
    }

    [Fact]
    public async Task S4_next_appointment_is_own_clinic_scoped_and_empty_when_none()
    {
        var (c, p) = await Mother();
        var j = await Json(await c.GetAsync("/api/v1/appointments/next"));
        Assert.Equal("routine", j.GetProperty("type").GetString());
        Assert.Equal("KK Demo Satu", j.GetProperty("clinicName").GetString());
        Assert.NotEqual(JsonValueKind.Null, j.GetProperty("scheduledAt").ValueKind);

        var (none, _) = await Mother(appointment: false);
        var e = await Json(await none.GetAsync("/api/v1/appointments/next"));
        Assert.Equal(JsonValueKind.Null, e.GetProperty("scheduledAt").ValueKind);

        // Someone else's appointment never shows: a mother with no appointment of her own sees none even though others have one.
        Assert.Equal(HttpStatusCode.Forbidden, (await (await As(await fx.CreateStaffAsync(fx.ClinicA, Roles.Nurse, Pw))).GetAsync("/api/v1/appointments/next")).StatusCode);
    }

    [Fact]
    public async Task S4_queue_me_shows_only_own_row_and_room_name_only_while_called_or_in_room()
    {
        var nurse = await As(await fx.CreateStaffAsync(fx.ClinicA, Roles.Nurse, Pw));
        var tok = (await (await nurse.PostAsJsonAsync("/api/v1/staff/qr-tokens", new { })).Content.ReadFromJsonAsync<Issued>(J))!.Token;
        var (c1, _) = await Mother();
        var (c2, _) = await Mother();
        var e1 = await Json(await c1.PostAsJsonAsync("/api/v1/checkins", new { token = tok, idempotencyKey = Guid.NewGuid().ToString() }));
        var e2 = await Json(await c2.PostAsJsonAsync("/api/v1/checkins", new { token = tok, idempotencyKey = Guid.NewGuid().ToString() }));
        var q1 = await Json(await c1.GetAsync("/api/v1/queue/me"));
        var q2 = await Json(await c2.GetAsync("/api/v1/queue/me"));
        Assert.Equal(e1.GetProperty("queueNo").GetString(), q1.GetProperty("queueNo").GetString());
        Assert.Equal(e2.GetProperty("queueNo").GetString(), q2.GetProperty("queueNo").GetString());
        Assert.NotEqual(q1.GetProperty("queueNo").GetString(), q2.GetProperty("queueNo").GetString());
        Assert.Equal(JsonValueKind.Null, q1.GetProperty("roomName").ValueKind);

        var room = await fx.CreateRoomAsync(fx.ClinicA);
        var id = e1.GetProperty("queueEntryId").GetGuid();
        await nurse.PatchAsJsonAsync($"/api/v1/staff/queue/{id}", new { roomId = room });
        Assert.Equal(JsonValueKind.Null, (await Json(await c1.GetAsync("/api/v1/queue/me"))).GetProperty("roomName").ValueKind); // assigned but still waiting
        await nurse.PatchAsJsonAsync($"/api/v1/staff/queue/{id}", new { status = "called" });
        var called = await Json(await c1.GetAsync("/api/v1/queue/me"));
        Assert.Equal("Bilik T", called.GetProperty("roomName").GetString());
        Assert.Equal(JsonValueKind.Null, (await Json(await c2.GetAsync("/api/v1/queue/me"))).GetProperty("roomName").ValueKind);
        // No urgent flag, reason code or wait estimate in the mother's view.
        var raw = await (await c1.GetAsync("/api/v1/queue/me")).Content.ReadAsStringAsync();
        foreach (var banned in new[] { "urgent", "reason", "wait", "estimate", "eta" })
            Assert.DoesNotContain(banned, raw, StringComparison.OrdinalIgnoreCase);
        await nurse.PatchAsJsonAsync($"/api/v1/staff/queue/{id}", new { status = "in_room" });
        await nurse.PatchAsJsonAsync($"/api/v1/staff/queue/{id}", new { status = "completed" });
        Assert.Equal(JsonValueKind.Null, (await Json(await c1.GetAsync("/api/v1/queue/me"))).GetProperty("roomName").ValueKind);
    }

    [Fact]
    public async Task S4_api_responses_are_never_cacheable()
    {
        var (c, _) = await Mother();
        var anon = fx.Factory.CreateClient();
        var responses = new[]
        {
            await c.GetAsync("/api/v1/me"),
            await c.GetAsync("/api/v1/queue/me"),
            await c.GetAsync("/api/v1/appointments/next"),
            await anon.PostAsJsonAsync("/api/v1/auth/login", new { identifier = "0100000001", password = "wrong-password-x" }),
            await anon.GetAsync("/api/v1/me"), // 401
        };
        foreach (var r in responses)
        {
            Assert.Contains("no-store", r.Headers.CacheControl?.ToString() ?? "");
            Assert.Contains("no-cache", string.Join(",", r.Headers.Pragma.Select(p => p.Name)));
        }
    }
}
