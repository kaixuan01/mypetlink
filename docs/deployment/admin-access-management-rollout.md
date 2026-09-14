# Deploying admin access management

The `AddAdminAccessManagement` migration turns the Admin Portal's single-role
model into roles and capabilities. It is designed so that **no existing
administrator loses access when it is applied**.

See [`docs/architecture/admin-access-management.md`](../architecture/admin-access-management.md)
for how the model works.

## What the migration does

1. Creates `AdminRoles`, `AdminRoleCapabilities` and `AdminUserRoles`.
2. Adds `RowVersion` and `DisabledByAdminUserId` to `AdminUsers`.
3. Seeds the nine built-in roles and their permissions.
4. Moves every existing `AdminUsers` row onto the built-in role matching the
   value already in its `Role` column.

Every statement is guarded, so the script is safe to re-run. `AdminUsers.Role`
is left populated and is no longer used for authorization.

## Before deploying

Run `docs/deployment/sql/diagnose-admin-access-management.sql` against the
target database and confirm:

- **At least one active `SuperAdmin`.** This is a release blocker — Super Admin
  is the only role that can grant access management, and only a Super Admin can
  change another Super Admin.
- Every active administrator has a `Role` value the mapping recognises
  (`SuperAdmin`, `Admin`, `Operations`, `OwnerSupport`). Anything else is mapped
  to Owner Support.

## Deploying

1. Apply the root `migration.sql` as usual.
2. Re-run the diagnostic script. After the migration, all of these must hold:
   - Nine rows in `AdminRoles`, all with `IsSystemRole = 1`.
   - Exactly one role with `GrantsAllCapabilities = 1` (`super-admin`).
   - **No active administrator without a role.** Such an account can sign in
     but can do nothing, which reads to the operator as a broken portal.
   - At least one active administrator holding `super-admin`.
3. Deploy the API. On start, `AdminAccessSeeder` repeats the same work
   idempotently; if the database is still waking up it logs a warning and the
   next start converges. Access fails closed meanwhile, because an
   administrator with no roles has no capabilities.
4. Deploy the web app.

## Verifying

With a Super Admin's bearer token:

```txt
GET /api/v1/admin/auth/check            → 200, access.capabilities lists every permission
GET /api/v1/admin/access/users          → 200
GET /api/v1/admin/access/roles          → 200, nine built-in roles
```

With a non-Super-Admin administrator's token:

```txt
GET /api/v1/admin/access/users          → 200 if their role grants admin.users.view, else 403
PUT /api/v1/admin/access/users/{id}/roles → 403 unless their role grants admin.users.manage
POST /api/v1/admin/access/roles         → 403 unless their role grants admin.roles.manage
```

Confirm that hiding a control in the portal is not what protects it: call a
restricted endpoint directly with a token that lacks the capability and check
it returns `403 Forbidden`.

## After deploying: narrowing access

Until you act, Operations and Owner Support keep the broad access they had
before — that is the point of the migration. Tighten it deliberately:

1. Open **Access Management → Roles** and review what Operations and Owner
   Support grant. Most businesses will want to remove **Create new tag stock**,
   **Approve or reject payments**, **Manage business settings** and
   **Manage email settings** from both.
2. Move people onto the narrower templates (Sales, Marketing, Finance, Support,
   Read Only / Auditor) where those fit better.
3. Check **Access Management → Users** afterwards: the effective permissions
   shown for each person are what the API will enforce.

Every one of those changes is recorded in **Activity History**.

## Rolling back

The migration's `Down` drops the three new tables and the two new `AdminUsers`
columns. Because `AdminUsers.Role` was never emptied, rolling back leaves every
administrator with exactly the access they had before — the previous API reads
that column and the previous portal derives its matrix from it.

Rolling back the application without rolling back the database is also safe, for
the same reason.

## Do not

- Do not delete built-in roles or the `super-admin` row directly in SQL. The
  application refuses both; doing it by hand can leave the business unable to
  restore anyone's access.
- Do not grant capabilities by inserting `AdminRoleCapabilities` rows by hand.
  A key that is not in the application's catalogue is ignored when access is
  resolved, so the row would look like a grant and do nothing.
- Do not remove the `TagType.QrPetTag`-era history or any other historical audit
  rows to tidy the activity history. It is the record of who changed what.
