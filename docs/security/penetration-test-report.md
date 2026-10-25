# Digital Buku Pink - Penetration Testing & Security Assessment Report

**System Name:** Digital Buku Pink (Prototype)
**Date of Assessment:** May 2026
**Assessment Type:** Static Application Security Testing (SAST), Software Composition Analysis (SCA), Architecture & Threat Modeling Audit
**Assessor:** Jules (Software Security Lead & Penetration Tester)
**Target Repository:** Digital Buku Pink Monorepo (`api/`, `db/`, `web/`, `mobile/`)

---

## 1. Executive Summary

Digital Buku Pink is an antenatal queue and clinic check-in management system prototype for Malaysian maternal clinics, featuring an ASP.NET Core API (C#), PostgreSQL database, SignalR hub, Angular staff dashboard (`web/`), and Ionic/Angular mother PWA (`mobile/`).

A comprehensive penetration test and security review was conducted across the codebase, focusing on OWASP Top 10, OWASP API Security Top 10, multi-tenant isolation, cryptographic token hygiene, data privacy, and append-only audit enforcement.

### Overall Risk Posture
The repository demonstrates an **exceptionally strong security posture**. Architecture choices strictly adhere to privacy-by-design and defense-in-depth principles:
- No critical or high-risk business logic vulnerabilities were identified.
- Tenant isolation (clinic scoping) is systematically enforced via verified JWT claims across all endpoints and queries, preventing Insecure Direct Object Reference (IDOR) vulnerabilities.
- Audit logs are database-enforced as append-only for application roles (`dbp_app`).
- Minimal synthetic schema design strictly avoids storing clinical data, IC numbers, or full addresses.

| Severity | Count | Summary |
| --- | --- | --- |
| **Critical** | 0 | None identified |
| **High** | 0 | None identified |
| **Medium** | 1 | Known vulnerable transitive npm dependencies in frontend dev tooling |
| **Low** | 2 | Development-mode CORS fallback allowance; `sessionStorage` usage for web refresh token |
| **Informational** | 1 | Un-rate-limited SignalR long-polling hub connection footprint |

---

## 2. Scope & Methodology

### 2.1 Scope of Assessment
The security review covered all components in the repository:
1. **API Engine (`api/Api/`, `api/Data/`)**: REST controllers, SignalR hub (`QueueHub`), authentication middleware (`AuthService`), rate limiters, EF Core repositories, and business logic.
2. **Database Layer (`db/`, PostgreSQL)**: Entity framework configurations, database constraints, migration DDLs, role permissions (`dbp_app` vs owner), and audit triggers.
3. **Staff Web Dashboard (`web/`)**: Angular app, auth interceptors, route guards, token handling, CSP meta tags, and `sessionStorage` management.
4. **Mother App (`mobile/`)**: Ionic/Angular PWA, in-memory token store, QR check-in flows, and CSP headers.

### 2.2 Testing Methodology
- **Static Application Security Testing (SAST)**: Manual code review combined with custom regex/AST security tools analyzing data flows, authorization boundaries, and cryptographic operations.
- **Software Composition Analysis (SCA)**: Automated package vulnerability scanning via `dotnet list package --vulnerable` and `npm audit`.
- **Threat Modeling & Logic Audit**: Verification of OWASP API Security Top 10 risks:
  - API1: Broken Object Level Authorization (BOLA/IDOR)
  - API2: Broken Authentication
  - API3: Broken Object Property Level Authorization
  - API4: Unrestricted Resource Consumption (Rate Limiting)
  - API5: Broken Function Level Authorization
  - API8: Security Misconfiguration
  - API9: Improper Inventory Management

---

## 3. Vulnerability Assessment Findings

### [SEC-01] Transitive Vulnerabilities in Frontend Development Dependencies
- **Severity**: Medium
- **Component**: `web/` and `mobile/` (`package-lock.json`)
- **CVSS Score**: 5.3 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L)
- **Description**: `npm audit` flagged vulnerabilities in build/dev dependencies including `@angular/build`, `undici`, `vite`, `fast-uri`, and `@modelcontextprotocol/sdk`. These relate to dev server EventSource parsing and Zod memory consumption.
- **Impact**: Dev-server Denial of Service during local development builds. Production built assets served via CDN or static web server remain unimpacted.
- **Remediation**: Execute `npm audit fix` for safe minor updates prior to production pilot release.

### [SEC-02] HTTP Allowed in CORS preflight during Development Mode
- **Severity**: Low
- **Component**: `api/Api/Program.cs` (`Cors.OriginsFrom`)
- **Description**: Plain `http://` origins are accepted when `builder.Environment.IsDevelopment()` is true.
- **Impact**: Acceptable for local dev/testing; in Production, `OriginsFrom` enforces strict `https://` exact-origin checks (rejecting wildcards, paths, or `http://`).
- **Remediation**: Ensure `ASPNETCORE_ENVIRONMENT=Production` is explicitly set in staging/production deployments.

### [SEC-03] Web Refresh Token Stored in `sessionStorage`
- **Severity**: Low
- **Component**: `web/src/app/core/auth.ts`
- **Description**: The staff web dashboard stores the refresh token in `sessionStorage` to allow page reloads without requiring nurses to re-authenticate.
- **Impact**: If an XSS vulnerability were to exist in the Angular dashboard, a script could read `sessionStorage`. However, strict CSP controls and Angular's built-in HTML escaping mitigate XSS. Access tokens remain in-memory only.
- **Remediation**: For elevated security environments, consider moving refresh tokens into HttpOnly, SameSite=Strict cookies.

### [SEC-04] SignalR Hub Long-Polling Rate Limiting Footprint
- **Severity**: Informational
- **Component**: `api/Api/Program.cs` (`MapHub<QueueHub>`)
- **Description**: While REST auth routes and check-in endpoints are guarded by per-IP and per-user rate limiters, the SignalR long-polling endpoint is protected by JWT authentication (`RequireAuthorization("Live")`) but does not apply a specific HTTP rate-limiting partition.
- **Impact**: Authenticated users could open excess long-polling connections.
- **Remediation**: Apply a connection-throttling middleware or proxy limit (e.g., Cloudflare/Nginx max concurrent connections per client) before production deployment.

---

## 4. Key Security Controls & Architecture Strengths

The system exhibits robust security engineering across multiple layers:

### 4.1 Multi-Tenant Isolation & BOLA Defense
- **Strict Token Claim Derivation**: Every clinic-scoped operation extracts `clinic_id` directly from the validated JWT claim (`ClaimsPrincipal.FindFirstValue("clinic_id")`).
- **No Client-Supplied Clinic ID**: API endpoints do not accept `clinic_id` in request bodies or query parameters for data scoping. Cross-tenant data leakage is structurally impossible.

### 4.2 Cryptographic Hygiene & Token Management
- **Single-Use Refresh Tokens**: Refresh tokens are stored as SHA-256 hashes (`Crypto.Hash`). Rotation is enforced atomically upon refresh (`ExecuteUpdateAsync` flipping `revoked_at`).
- **Token Theft / Reuse Detection**: Attempting to reuse an already-revoked refresh token revokes all tokens in the user's family and logs a `refresh_reuse_detected` security audit event.
- **Peppered Code Hashes**: Activation codes use SHA-256 with a mandatory system pepper (`CODE_PEPPER`). Plaintext codes are displayed once and never persisted or logged.
- **Fail-Fast Secret Validation**: API startup validates that `Auth:Key` is $\ge$ 32 bytes and `Auth:CodePepper` is $\ge$ 16 bytes, halting execution if weak credentials are present.

### 4.3 Database Integrity & Append-Only Audit Trail
- **Application Privilege Separation**: Database role `dbp_app` is granted `SELECT`, `INSERT`, `UPDATE` on public tables, but `UPDATE`, `DELETE`, and `TRUNCATE` rights on `audit_log` are explicitly withheld.
- **Audit Field Sanitization**: `AuditLog.Detail` records contain GUIDs and system codes only; personal names, phone numbers, and raw token values are never written to audit records.
- **Database Schema Constraints**: PostgreSQL constraints enforce data validation at the storage layer (`ck_patient_is_demo`, `ck_patient_phone_digits`, `ck_user_account_one_owner`, `ck_user_account_active_has_password`).

### 4.4 URL Privacy & Logging Safeguards
- **Sensitive Inputs Sent via POST**: Patient search (`POST /api/v1/staff/patients/search`) uses a JSON request body. Search queries never appear in URL path or query strings, preventing exposure in web server logs, browser history, or proxy caches.
- **Cache-Control Enforcement**: Middleware forces `Cache-Control: no-store` and `Pragma: no-cache` headers on all `/api` responses to prevent downstream caching of session or queue data.

---

## 5. Deployment & Production Readiness Checklist

Prior to piloting Digital Buku Pink in a clinical environment:
1. **Reverse Proxy Security**: Deploy behind a reverse proxy (e.g., Nginx, Cloudflare) with TLS 1.3 enabled and HSTS headers (`max-age=31536000; includeSubDomains; preload`).
2. **Environment Secrets**: Ensure production environment variables `JWT_KEY`, `CODE_PEPPER`, and `ConnectionStrings__Default` are sourced from secure secret stores (e.g., HashiCorp Vault, AWS Secrets Manager) and never committed.
3. **Audit Schedule**: Implement automated off-site log shipping for the `audit_log` table and periodic backup restore drills following `db/backup/restore-drill.sh`.

---

## 6. Conclusion

The Digital Buku Pink codebase is **approved from a cybersecurity and privacy perspective** for prototype testing and demonstration with fictional data. All hard rules regarding synthetic data, human queue control, clinic scoping, and audit logging are strictly met.
