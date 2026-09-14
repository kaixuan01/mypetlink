-- Admin access management readiness.
--
-- Run BEFORE applying the access-management migration to confirm the source
-- data is sound, and AFTER applying it to confirm nobody lost access.
-- See docs/deployment/admin-access-management-rollout.md.

SET NOCOUNT ON;

PRINT '=== 1. Active administrators, by the role they hold today ===';
-- Before the migration this is the single Role column. There must be at least
-- one active SuperAdmin: it is the only role that can manage access.
SELECT
    a.Role,
    COUNT(*) AS ActiveAdministrators
FROM AdminUsers a
INNER JOIN Users u ON u.Id = a.UserId
WHERE a.IsActive = 1
  AND a.DisabledAt IS NULL
  AND u.Status = 'Active'
  AND u.DeletedAt IS NULL
GROUP BY a.Role
ORDER BY a.Role;

PRINT '=== 2. RELEASE BLOCKER: active SuperAdmin accounts (must be >= 1) ===';
SELECT u.Email, u.DisplayName, a.CreatedAt
FROM AdminUsers a
INNER JOIN Users u ON u.Id = a.UserId
WHERE a.Role = 'SuperAdmin'
  AND a.IsActive = 1
  AND a.DisabledAt IS NULL
  AND u.Status = 'Active'
  AND u.DeletedAt IS NULL;

PRINT '=== 3. ANOMALY: administrators whose role the mapping does not recognise ===';
-- These are mapped to Owner Support, the narrowest built-in role. Expect none.
SELECT u.Email, a.Role
FROM AdminUsers a
INNER JOIN Users u ON u.Id = a.UserId
WHERE a.Role NOT IN ('SuperAdmin', 'Admin', 'Operations', 'OwnerSupport');

IF OBJECT_ID('dbo.AdminRoles', 'U') IS NULL
BEGIN
    PRINT '=== Access-management tables not present yet. Run the rest after the migration. ===';
    RETURN;
END;

PRINT '=== 4. Built-in roles (expect 9, all IsSystemRole = 1) ===';
SELECT
    r.Code,
    r.Name,
    r.IsSystemRole,
    r.GrantsAllCapabilities,
    (SELECT COUNT(*) FROM AdminRoleCapabilities c WHERE c.AdminRoleId = r.Id) AS Permissions,
    (SELECT COUNT(*) FROM AdminUserRoles x WHERE x.AdminRoleId = r.Id) AS AssignedTo
FROM AdminRoles r
ORDER BY r.SortOrder;

PRINT '=== 5. ANOMALY: more or fewer than one all-access role ===';
SELECT Code, Name FROM AdminRoles WHERE GrantsAllCapabilities = 1;

PRINT '=== 6. ANOMALY: active administrators with no role at all ===';
-- Such an account can sign in but can do nothing. Expect none.
SELECT u.Email, u.DisplayName, a.Role AS LegacyRole
FROM AdminUsers a
INNER JOIN Users u ON u.Id = a.UserId
WHERE a.IsActive = 1
  AND a.DisabledAt IS NULL
  AND u.Status = 'Active'
  AND u.DeletedAt IS NULL
  AND NOT EXISTS (SELECT 1 FROM AdminUserRoles x WHERE x.AdminUserId = a.Id);

PRINT '=== 7. RELEASE BLOCKER: active administrators holding the all-access role (must be >= 1) ===';
SELECT u.Email, u.DisplayName
FROM AdminUsers a
INNER JOIN Users u ON u.Id = a.UserId
INNER JOIN AdminUserRoles x ON x.AdminUserId = a.Id
INNER JOIN AdminRoles r ON r.Id = x.AdminRoleId
WHERE r.GrantsAllCapabilities = 1
  AND a.IsActive = 1
  AND a.DisabledAt IS NULL
  AND u.Status = 'Active'
  AND u.DeletedAt IS NULL;

PRINT '=== 8. ANOMALY: administrators whose roles do not match their legacy role ===';
-- Expect none immediately after the migration. Rows here after someone has
-- used the Roles screen are deliberate changes, not faults.
SELECT
    u.Email,
    a.Role AS LegacyRole,
    STRING_AGG(r.Code, ', ') AS RolesHeld
FROM AdminUsers a
INNER JOIN Users u ON u.Id = a.UserId
INNER JOIN AdminUserRoles x ON x.AdminUserId = a.Id
INNER JOIN AdminRoles r ON r.Id = x.AdminRoleId
GROUP BY u.Email, a.Role
HAVING STRING_AGG(r.Code, ', ') <> CASE a.Role
    WHEN 'SuperAdmin' THEN 'super-admin'
    WHEN 'Admin' THEN 'administrator'
    WHEN 'Operations' THEN 'operations'
    ELSE 'owner-support'
END;

PRINT '=== 9. Effective permission counts, per administrator ===';
SELECT
    u.Email,
    CASE WHEN MAX(CAST(r.GrantsAllCapabilities AS INT)) = 1 THEN -1
         ELSE COUNT(DISTINCT c.Capability) END AS Permissions,  -- -1 means full access
    STRING_AGG(r.Name, ', ') AS RolesHeld
FROM AdminUsers a
INNER JOIN Users u ON u.Id = a.UserId
LEFT JOIN AdminUserRoles x ON x.AdminUserId = a.Id
LEFT JOIN AdminRoles r ON r.Id = x.AdminRoleId
LEFT JOIN AdminRoleCapabilities c ON c.AdminRoleId = r.Id
WHERE a.IsActive = 1 AND a.DisabledAt IS NULL
GROUP BY u.Email
ORDER BY u.Email;

PRINT '=== 10. Recent access-management activity ===';
SELECT TOP 50 l.CreatedAt, l.Action, l.Entity, l.EntityId, u.Email AS Actor
FROM AuditLogs l
LEFT JOIN AdminUsers a ON a.Id = l.ActorId
LEFT JOIN Users u ON u.Id = a.UserId
WHERE l.Action LIKE 'admin-access.%'
ORDER BY l.CreatedAt DESC;
