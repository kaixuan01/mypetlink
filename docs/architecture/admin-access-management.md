# Admin access management

Who can use the Admin Portal, and what each of them may do.

## The model

```
Admin user  →  one or more Roles  →  Capabilities
```

- **Admin user** — an `AdminUsers` row. Having one is what makes someone an
  administrator at all; switching it off removes Admin Portal access entirely.
- **Role** — an `AdminRoles` row: a reusable, named set of permissions.
- **Capability** — a permission key such as `orders.manage` or
  `inventory.generate`. The complete list lives in
  `apps/api/MyPetLink.Api/Auth/AdminCapabilities.cs`, described for the portal
  in `AdminCapabilityCatalog.cs`.

There are no per-user permission overrides. Someone's access is exactly the
union of the capabilities their roles grant, which keeps "what can this person
do?" answerable by looking at their roles.

## How a request is authorized

Every protected Admin endpoint names a capability:

```csharp
[Authorize(Policy = AdminCapabilities.InventoryGenerate)]
public async Task<IActionResult> Generate(...)
```

At startup, `Program.cs` registers one policy per capability in the catalogue.
`AdminCapabilityRequirementHandler` resolves the caller's capabilities through
`IAdminAccessResolver`, which reads

```
AdminUsers → AdminUserRoles → AdminRoles → AdminRoleCapabilities
```

from the database **on every request**. A role change or a switched-off account
takes effect on that operator's very next request — no sign-out, no token
refresh. The JWT carries identity only; its role claim is never an
authorization decision.

Two properties follow, and both are load-bearing:

- **Deny by default.** An administrator with no roles has no capabilities.
  `AdminCapabilityCoverageTests` fails the build if an Admin endpoint ships
  without naming a capability.
- **The catalogue is the only vocabulary.** A stored capability row whose key is
  not in the catalogue is ignored when access is resolved, and a request that
  asks for an unknown key when saving a role is refused rather than stored.

The one deliberate exception is a role flagged `GrantsAllCapabilities`
(Super Admin). It holds every capability that exists now and every capability
added later, so a new module is never invisible to the people responsible for
the whole system.

### The two remaining non-capability policies

`AuthorizationPolicies.Admin` ("is an active administrator") still guards two
routes, both reachable by everyone by design:

- `/api/v1/admin/auth/check` — the access check itself.
- `/api/v1/admin/dashboard` — the landing page. Its counts are aggregates, and
  its detailed sections are filtered by capability inside `AdminService`.

## Built-in roles

| Role | Covers |
| --- | --- |
| **Super Admin** | Everything, including access management. Only a Super Admin can grant or remove Super Admin. |
| **Administrator** | Every operational area, plus commission accounting and payout preparation. Not payout settlement, commission reversal, commission rules, or access management. |
| **Operations** | Orders, shipping, inventory, Smart Tags, customer support information, business configuration, and sales performance visibility. |
| **Owner Support** | Customer-facing operational work. No sales, commission, payout or access management. |
| **Sales** | Resellers, salespeople, referral credit, quotations, merchant orders, and commission visibility. No stock creation, payment approval or payouts. |
| **Marketing** | Promotions, the sample experience, and campaign and referral reporting. No payment proofs, payouts, stock costs or access management. |
| **Finance** | Payment approval, invoices and receipts, commission accounting, payouts, financial reporting. No stock creation, Smart Tag operations or access management. |
| **Support** | Owners, pets, Smart Tags and order visibility. No financial approval, no stock creation, no customer data downloads. |
| **Read Only / Auditor** | Can open every module and read it, including the activity history. Cannot change, approve or download anything. |

Built-in roles can have their permissions tuned but can never be deleted. The
Super Admin role's permissions cannot be edited at all — narrowing it is how a
business locks itself out.

The definitions live in `AdminRoleTemplates.cs`.

### Why Operations and Owner Support are broad

The first four roles reproduce, capability for capability, what each legacy
`AdminRole` value could already do — see *Migration* below. They are broader
than the new templates on purpose, so that applying this release changes
nobody's access. Narrow them deliberately from **Access Management → Roles**
once you have decided who should keep what.

### Why there is no `resellers.*`

A reseller and a merchant are the same record in this system, already governed
by `sales.view` / `sales.manage`. A parallel `resellers.*` key would be a second
way to say the same thing, which is exactly the duplication this design exists
to avoid.

## Privilege escalation protection

Enforced in `AdminAccessManagementService`, on the server, regardless of what
the portal showed:

1. **Nobody can change their own roles or switch off their own access.** Someone
   else with permission has to make the change. This blocks self-promotion and
   accidental self-lockout in one rule.
2. **Nobody can grant a capability they do not hold themselves** — whether by
   assigning a role that contains it or by building a custom role around it.
   The same applies to removing one.
3. **Only a holder of an all-access role can grant or remove one**, or change
   another Super Admin's access at all.
4. **The last active Super Admin cannot be switched off or demoted.** In
   practice rules 1 and 3 already make this unreachable — whoever is making the
   change is always still a Super Admin afterwards — so this is a backstop kept
   in case a future bulk or automated path reaches it.
5. **Built-in roles cannot be deleted**, and a role still assigned to somebody
   cannot be deleted either.
6. **Only capabilities in the catalogue are accepted.** Anything else in a
   request payload is refused, not silently dropped.

Optimistic concurrency (`RowVersion` on `AdminUsers` and `AdminRoles`) means two
administrators editing the same person or role cannot silently overwrite each
other.

## Audit

Every access-management change appends an `AuditLogs` row in the same
`SaveChanges` as the change itself:

| Action | Recorded |
| --- | --- |
| `admin-access.user.roles-changed` | actor, target admin user, roles before and after |
| `admin-access.user.activated` | actor, target admin user, status before and after |
| `admin-access.user.deactivated` | actor, target admin user, status before and after |
| `admin-access.role.created` | actor, role, name and capabilities |
| `admin-access.role.updated` | actor, role, name and capabilities before and after |
| `admin-access.role.deleted` | actor, role, its name and capabilities |

**Access Management → Activity History** reads these back, defaulting to
access changes.

## The Admin Portal

`/api/v1/admin/auth/check` returns the operator's roles and the capabilities
they add up to. The portal renders navigation and actions from that, through
`apps/web/src/lib/adminCapabilities.ts`.

The portal decides nothing for itself. It used to derive capability booleans
from the role name in `authService.ts`, which meant the role matrix existed
twice and could drift; that derivation is gone.

- A destination with no reachable permission is removed from the sidebar and
  the mobile drawer, and a section left empty disappears with it.
- Opening the URL directly is held to the same standard: `AdminPageAccess` in
  `AdminLayout` checks the same capability list and shows a plain explanation
  instead of the page.
- Actions are gated individually — viewing inventory, changing its status, and
  generating new stock are three separate decisions.

**None of this is authorization.** Every one of those requests is refused by the
API with `403 Forbidden` if the capability is missing, whatever the portal did.

## Migration

The access-management migration (`AddAdminAccessManagement`) seeds the built-in
roles and moves every existing administrator onto the one that matches the
single role they already held:

| `AdminUsers.Role` | Built-in role |
| --- | --- |
| `SuperAdmin` | Super Admin |
| `Admin` | Administrator |
| `Operations` | Operations |
| `OwnerSupport` | Owner Support |

Nobody's access changes when it is applied. `AdminAccessSeederTests` asserts
this: every capability that used to sit behind the shared admin policy is still
reachable by all four migrated roles, and none of them gains access management.

`AdminUsers.Role` is **retained, read-only**. Nothing authorizes on it; it is
kept populated so an application rollback finds the value it expects and so the
historical deployment scripts stay readable.

`AdminAccessSeeder` repeats the same work idempotently at startup, for local
databases and for administrators created after the migration. Two rules keep it
from overwriting decisions:

- A built-in role's capabilities are written **only when the role is first
  created**. Narrowing a template in the Roles screen is never silently undone
  by the next deployment — which also means a capability added to a template in
  code does not reach an existing installation. Grant it explicitly, or rely on
  Super Admin's all-access flag.
- An administrator is given a role **only when they hold none at all**.

See [`docs/deployment/admin-access-management-rollout.md`](../deployment/admin-access-management-rollout.md)
for the deployment steps.

## Adding a capability

1. Add the constant to `AdminCapabilities.cs`.
2. Describe it in `AdminCapabilityCatalog.cs` — the name and description are
   what an administrator reads when assigning it. Mark it `Sensitive` if it
   releases money, creates stock, changes who can administer the system, or
   sends customer data out of the portal.
3. Put `[Authorize(Policy = AdminCapabilities.YourKey)]` on the endpoint.
4. Add it to `adminCapabilities` in `apps/web/src/lib/adminCapabilities.ts` and
   gate the matching navigation entry or action.
5. Grant it to whichever built-in roles should have it in
   `AdminRoleTemplates.cs`, and add a migration for existing databases if
   existing role holders need it.

`AdminCapabilityCoverageTests` fails if an endpoint has no capability, or if a
catalogue entry grants nothing.
