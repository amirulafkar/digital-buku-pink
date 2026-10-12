using System.Net;
using System.Security.Claims;
using System.Text;
using Data;
using Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Api;

public class AuthOptions
{
    public string Key { get; set; } = "";
    public string Issuer { get; set; } = "dbp";
    public string Audience { get; set; } = "dbp";
    public int AccessMinutes { get; set; } = 15;
    public int RefreshDays { get; set; } = 14;
    public int MaxFailedLogins { get; set; } = 5;
    public int LockMinutes { get; set; } = 15;
    public string CodePepper { get; set; } = "";
    public int RateLimitPerMinute { get; set; } = 10;
    public int CheckinPerMinute { get; set; } = 30; // per user
    public int QrPerMinute { get; set; } = 12;      // per user
    public int SearchPerMinute { get; set; } = 60;  // per user
    public int HubPerMinute { get; set; } = 60;     // hub negotiate, per IP
    public int MaxHubConnections { get; set; } = 3; // per user
}

public record TokenResponse(string AccessToken, string RefreshToken, int ExpiresIn, string Role);

public class AuthService(AppDbContext db, Microsoft.Extensions.Options.IOptions<AuthOptions> opt)
{
    private readonly AuthOptions _o = opt.Value;
    private static readonly PasswordHasher<UserAccount> Hasher = new();
    private static readonly string DummyHash = Hasher.HashPassword(new UserAccount(), "dummy-password-for-timing");

    private record Principal(UserAccount Account, Guid ClinicId, string Role);

    // Auth lookups are necessarily pre-token (the clinic is derived from the account); all later queries use the token's clinic_id.
    private async Task<Principal?> FindByIdentifierAsync(string identifier)
    {
        var id = identifier.Trim();
        if (id.Any(char.IsLetter))
        {
            return await (from a in db.UserAccounts
                          join s in db.Staff on a.StaffId equals s.Id
                          where a.Username == id.ToLowerInvariant() && s.Active
                          select new Principal(a, s.ClinicId, s.Role)).FirstOrDefaultAsync();
        }
        var phone = Phone.Normalise(id);
        return await (from a in db.UserAccounts
                      join p in db.Patients on a.PatientId equals p.Id
                      where p.Phone == phone
                      select new Principal(a, p.ClinicId, Roles.Patient)).FirstOrDefaultAsync();
    }

    public async Task<TokenResponse?> LoginAsync(string identifier, string password, string? deviceName, IPAddress? ip)
    {
        var pr = await FindByIdentifierAsync(identifier ?? "");
        var now = DateTimeOffset.UtcNow;
        if (pr is null)
        {
            Hasher.VerifyHashedPassword(new UserAccount(), DummyHash, password ?? ""); // equalise timing
            Audit.Add(db, null, null, "login_failure", "user_account", null, ip, new { reason = "unknown" });
            await db.SaveChangesAsync();
            return null;
        }

        var a = pr.Account;
        string? failure = null;
        if (a.Status != AccountStatus.Active || a.PasswordHash is null) failure = "not_active";
        else if (a.LockedUntil is { } lu && lu > now) failure = "locked";
        else
        {
            var r = Hasher.VerifyHashedPassword(a, a.PasswordHash, password ?? "");
            if (r == PasswordVerificationResult.Failed)
            {
                failure = "bad_credentials";
                a.FailedLogins++;
                if (a.FailedLogins >= _o.MaxFailedLogins)
                {
                    a.LockedUntil = now.AddMinutes(_o.LockMinutes);
                    a.FailedLogins = 0;
                    failure = "locked_now";
                }
            }
        }

        if (failure is "not_active" or "locked")
            Hasher.VerifyHashedPassword(new UserAccount(), DummyHash, password ?? ""); // equalise timing
        if (failure is not null)
        {
            Audit.Add(db, null, pr.ClinicId, "login_failure", "user_account", a.Id, ip, new { reason = failure });
            await db.SaveChangesAsync();
            return null;
        }

        a.FailedLogins = 0;
        a.LockedUntil = null;
        var resp = IssueTokens(a, pr.ClinicId, pr.Role, deviceName);
        Audit.Add(db, a.Id, pr.ClinicId, "login_success", "user_account", a.Id, ip, new { role = pr.Role });
        await db.SaveChangesAsync();
        return resp;
    }

    public async Task<TokenResponse?> RefreshAsync(string refreshToken, IPAddress? ip)
    {
        var hash = Crypto.Hash(refreshToken ?? "");
        await using var tx = await db.Database.BeginTransactionAsync();
        var now = DateTimeOffset.UtcNow;
        // Atomic single use: only one concurrent caller can flip revoked_at from null.
        var flipped = await db.RefreshTokens
            .Where(t => t.TokenHash == hash && t.RevokedAt == null && t.ExpiresAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now));
        if (flipped != 1)
        {
            // Reuse of an already-revoked token: treat as theft, revoke the user's whole refresh-token family.
            var old = await db.RefreshTokens.AsNoTracking().Where(t => t.TokenHash == hash && t.RevokedAt != null)
                .Select(t => new { t.Id, t.UserAccountId }).FirstOrDefaultAsync();
            if (old is not null)
            {
                await db.RefreshTokens.Where(t => t.UserAccountId == old.UserAccountId && t.RevokedAt == null)
                    .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now));
                var acc = await db.UserAccounts.AsNoTracking().FirstAsync(a => a.Id == old.UserAccountId);
                var pp = await FindByAccountAsync(acc);
                Audit.Add(db, acc.Id, pp?.ClinicId, "refresh_reuse_detected", "refresh_token", old.Id, ip);
                await db.SaveChangesAsync();
                await tx.CommitAsync();
            }
            return null;
        }

        var tok = await db.RefreshTokens.AsNoTracking().FirstAsync(t => t.TokenHash == hash);
        var pr = await (from a in db.UserAccounts where a.Id == tok.UserAccountId select a).FirstAsync();
        var principal = await FindByAccountAsync(pr);
        if (principal is null || pr.Status != AccountStatus.Active) { await tx.CommitAsync(); return null; }

        var resp = IssueTokens(pr, principal.ClinicId, principal.Role, tok.DeviceName);
        Audit.Add(db, pr.Id, principal.ClinicId, "token_refresh", "refresh_token", tok.Id, ip);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return resp;
    }

    public async Task LogoutAsync(string refreshToken, IPAddress? ip)
    {
        var hash = Crypto.Hash(refreshToken ?? "");
        var tok = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash && t.RevokedAt == null);
        if (tok is null) return;
        tok.RevokedAt = DateTimeOffset.UtcNow;
        var acc = await db.UserAccounts.FirstAsync(a => a.Id == tok.UserAccountId);
        var p = await FindByAccountAsync(acc);
        Audit.Add(db, acc.Id, p?.ClinicId, "logout", "refresh_token", tok.Id, ip);
        await db.SaveChangesAsync();
    }

    private async Task<Principal?> FindByAccountAsync(UserAccount a)
    {
        if (a.StaffId is { } sid)
            return await db.Staff.Where(s => s.Id == sid && s.Active).Select(s => new Principal(a, s.ClinicId, s.Role)).FirstOrDefaultAsync();
        return await db.Patients.Where(p => p.Id == a.PatientId).Select(p => new Principal(a, p.ClinicId, Roles.Patient)).FirstOrDefaultAsync();
    }

    public async Task<bool> ActivateAsync(string code, string phone, string password, IPAddress? ip)
    {
        var normPhone = Phone.Normalise(phone ?? "");
        var now = DateTimeOffset.UtcNow;
        await using var tx = await db.Database.BeginTransactionAsync();

        async Task<bool> Fail(string reason)
        {
            Hasher.HashPassword(new UserAccount(), password ?? "x"); // equalise timing with the success path
            var clinic = normPhone.Length == 0 ? null
                : await db.Patients.Where(p => p.Phone == normPhone).Select(p => (Guid?)p.ClinicId).FirstOrDefaultAsync();
            Audit.Add(db, null, clinic, "activate_failure", "activation_code", null, ip, new { reason }); // no phone, no code
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return false;
        }

        if (string.IsNullOrWhiteSpace(code) || normPhone.Length == 0 || (password?.Length ?? 0) < 8) return await Fail("invalid_input");
        var hash = Crypto.HashCode(code, _o.CodePepper);

        var match = await (from c in db.ActivationCodes
                           join p in db.Patients on c.PatientId equals p.Id
                           where c.CodeHash == hash && c.UsedAt == null && c.ExpiresAt > now && p.Phone == normPhone
                           select new { CodeId = c.Id, PatientId = p.Id, p.ClinicId }).FirstOrDefaultAsync();
        if (match is null) return await Fail("code_invalid");

        // Same lock order as code issue (patient row first, then activation_code): no deadlock between the two.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM patient WHERE id = {match.PatientId} FOR UPDATE");

        // Only a Pending account (or none yet) may be activated; a code never overwrites an Active or Disabled account's password.
        var acc = await db.UserAccounts.FirstOrDefaultAsync(a => a.PatientId == match.PatientId);
        if (acc is not null && acc.Status != AccountStatus.Pending) return await Fail("account_not_pending");

        // Single use, and still valid now that the patient is locked (an issue may have just revoked it).
        var used = await db.ActivationCodes.Where(c => c.Id == match.CodeId && c.UsedAt == null && c.ExpiresAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.UsedAt, now));
        if (used != 1) return await Fail("code_invalid");

        if (acc is null)
        {
            acc = new UserAccount { PatientId = match.PatientId }; // only after a successful redeem: a failed one leaves no rows
            db.UserAccounts.Add(acc);
        }

        acc.PasswordHash = Hasher.HashPassword(acc, password!);
        acc.Status = AccountStatus.Active;
        acc.FailedLogins = 0;
        acc.LockedUntil = null;
        Audit.Add(db, acc.Id, match.ClinicId, "activate", "user_account", acc.Id, ip);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return true;
    }

    private TokenResponse IssueTokens(UserAccount a, Guid clinicId, string role, string? deviceName)
    {
        var expires = DateTime.UtcNow.AddMinutes(_o.AccessMinutes);
        var token = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = _o.Issuer,
            Audience = _o.Audience,
            Expires = expires,
            Subject = new ClaimsIdentity(
            [
                new Claim("sub", a.Id.ToString()),
                new Claim("clinic_id", clinicId.ToString()),
                new Claim("role", role),
            ]),
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_o.Key)), SecurityAlgorithms.HmacSha256),
        });
        var refresh = Crypto.RandomToken();
        db.RefreshTokens.Add(new RefreshToken
        {
            UserAccountId = a.Id,
            TokenHash = Crypto.Hash(refresh),
            DeviceName = deviceName?[..Math.Min(deviceName.Length, 60)],
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(_o.RefreshDays),
        });
        return new TokenResponse(token, refresh, _o.AccessMinutes * 60, role);
    }
}
