# First Admin User Setup (Production)

MyPetLink admin access is **data-driven, not code-driven**. The admin policy (`ActiveAdminRequirement`) authorizes a request only when the signed-in user has an **active `AdminUsers` row** — never from a role claim or a hardcoded email. So the first admin is created by promoting a normal user account once, directly in the production database.

No admin email is hardcoded in code, and there is **no auto-running admin seed in production**. The `InitialCreate` migration seeds plans, plan limits, and app settings only — it does **not** create any `AdminUsers` row. Nothing admin-related runs automatically in production; the step below is deliberate and manual.

> **Local development only:** to make `/admin` reachable while testing, the API can auto-promote a configured email on Google login **when running in the Development environment**. The tracked `appsettings.Development.json` keeps `AdminSeed:Emails` empty; add a local-only value with user-secrets or uncommitted development settings if you need this convenience. This is guarded by `IsDevelopment()` and does **not** run in production (production config has no `AdminSeed` section). It only reactivates or creates one idempotent `AdminUsers` row after the user has logged in with Google. **Production admins are still promoted manually with the steps below** — do not rely on the dev auto-admin for production.

## Production first admin account

The initial production admin (first `SuperAdmin`) is:

```txt
admin@mypetlink.com.my
```

This is an operator account identifier, not a secret. It is still **not** auto-promoted by code; it must be promoted manually after a normal Google login.

Rules for this account in production:

1. It **must log in once through Google Login** so its `Users` row is created — the standard flow, no special handling.
2. After that login, production admin access is granted **manually** by inserting/activating the matching `AdminUsers` row in the production database (see Steps below).
3. **Do not auto-promote this email in production.** The Development auto-promote allowlist (`AdminSeed:Emails`) is for local testing only and never runs in production; production must not have a hardcoded admin email or backdoor.

Notes on which email to use:

- **`admin@mypetlink.com.my` must be a real Google Workspace or domain Google account.** Cloudflare Email Routing alone only forwards mail and cannot authenticate with Google.
- If this account replaces an earlier production administrator, complete the login-once-then-manual-insert flow below, verify the new account, and then revoke the old `AdminUsers` row.

## Steps

1. **Log in once with Google** on the production frontend using `admin@mypetlink.com.my`. This creates the normal `Users` row (and `OwnerProfile` on the Free plan) through the standard `/api/v1/auth/google` flow. No special handling.
2. **Find the user id** in the production database:
   ```sql
   DECLARE @AdminEmail NVARCHAR(320) = N'admin@mypetlink.com.my';
   SELECT Id, Email, DisplayName FROM Users WHERE Email = @AdminEmail;
   ```
3. **Insert an active `AdminUsers` row** for that user (idempotent guard so re-running is safe):
   ```sql
   INSERT INTO AdminUsers (Id, UserId, Role, IsActive, CreatedAt, UpdatedAt)
   SELECT NEWID(), u.Id, 'SuperAdmin', 1, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
   FROM Users u
   WHERE u.Email = @AdminEmail
     AND NOT EXISTS (SELECT 1 FROM AdminUsers a WHERE a.UserId = u.Id);
   ```
   `Role` may be `Admin` or `SuperAdmin` — Phase 1 treats them equivalently in policy (`OwnerSupport`/`Operations` are reserved for later).
4. **Verify admin access.** With that account's bearer token:
   ```txt
   GET https://api.mypetlink.com.my/api/v1/admin/auth/check   → 200, returns { admin: { role, isActive: true } }
   ```
5. **Verify a non-admin is rejected.** With any other signed-in owner's token:
   ```txt
   GET https://api.mypetlink.com.my/api/v1/admin/auth/check   → 403
   GET .../api/v1/admin/dashboard (no token)                  → 401
   ```
   In the UI, a signed-in non-admin visiting `/admin` sees the access-denied screen; an anonymous visitor is redirected to `/admin/login`.

## Safety notes

- **Do not hardcode** an admin email or auto-grant admin in code. Keep it a manual DB action so admin membership is auditable and environment-specific.
- Run the insert against the **production** database only when intended; the same snippet is used against `MyPetLinkDev` for local testing (see `apps/api/README.md`), so double-check which database your connection points at.
- To revoke admin access, set `IsActive = 0` (or `DisabledAt = SYSDATETIMEOFFSET()`) on the `AdminUsers` row — the policy checks `IsActive AND DisabledAt IS NULL AND the user is active`.
- Admin mutations are audited; the operator's `AdminUsers`/user id will appear as the actor in `AuditLogs`.
