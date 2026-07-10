-- MyPetLink first-admin promotion template
-- ------------------------------------------------------------
-- PLACEHOLDERS ONLY. Do not run this blindly, especially in production.
--
-- MyPetLink admin access is data-driven: the admin policy authorizes a
-- request only when the signed-in user has an active AdminUsers row. No admin
-- email is hardcoded in code, and no migration auto-creates an admin.
--
-- NOTE (local development only): when the API runs in the Development
-- environment, a Google login with an email in AdminSeed:Emails can be
-- auto-promoted to admin. The tracked development config keeps this list
-- empty; use user-secrets or uncommitted local settings if needed.
-- This template is for PRODUCTION (and for promoting any other local account).
-- The dev auto-admin never runs in production.
--
-- First production admin (first SuperAdmin):
--   * Choose one real Google-login account and keep the address out of git.
--   * This account must log in ONCE with Google in production first, then be
--     promoted with the steps below. It is NOT auto-promoted in production.
--   * Cloudflare Email Routing addresses are not Google Login accounts and
--     cannot be promoted; use a real Google account.
--   * If MyPetLink later uses a Google Workspace / domain account, promote that
--     account instead and revoke the old row.
--
-- Order of operations:
--   1. The intended operator logs in ONCE with Google on the target
--      environment. This creates their Users row through the normal auth flow.
--   2. Run step 1 below to find that user's Id.
--   3. Run step 2 to activate admin access.
--   4. Run step 3 to verify.
--
-- Safety:
--   * Double-check which database your connection points at (dev vs prod).
--   * Only insert a row for the ONE account that should be the first admin.
--   * Keep this as a manual, auditable action.
-- ------------------------------------------------------------

-- Set the target email once. Replace this placeholder before running.
DECLARE @AdminEmail NVARCHAR(320) = N'admin@example.com';

-- Step 1 — find the user id (after the operator has logged in once with Google)
SELECT Id, Email, DisplayName, Status
FROM Users
WHERE Email = @AdminEmail;

-- Step 2 — activate admin for that user (idempotent: safe to re-run).
-- Role may be 'Admin' or 'SuperAdmin'; Phase 1 treats them equivalently.
INSERT INTO AdminUsers (Id, UserId, Role, IsActive, CreatedAt, UpdatedAt)
SELECT NEWID(), u.Id, 'SuperAdmin', 1, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
FROM Users u
WHERE u.Email = @AdminEmail
  AND NOT EXISTS (SELECT 1 FROM AdminUsers a WHERE a.UserId = u.Id);

-- Step 3 — verify the admin row exists and is active
SELECT u.Email, a.Role, a.IsActive, a.DisabledAt
FROM AdminUsers a
JOIN Users u ON u.Id = a.UserId
WHERE u.Email = @AdminEmail;

-- To revoke admin access later (do not delete the row):
-- UPDATE AdminUsers SET IsActive = 0, DisabledAt = SYSDATETIMEOFFSET(), UpdatedAt = SYSDATETIMEOFFSET()
-- WHERE UserId = (SELECT Id FROM Users WHERE Email = @AdminEmail);

-- After running, confirm over HTTP with the operator's bearer token:
--   GET /api/v1/admin/auth/check  -> 200 for this admin
--   GET /api/v1/admin/auth/check  -> 403 for any non-admin
--   GET /api/v1/admin/dashboard   -> 401 with no token
