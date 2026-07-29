# MyPetLink configuration governance

## 1. Purpose

Every configurable value in this monorepo must have exactly one authoritative
owner. This document defines the ownership categories, the decision framework
for choosing one, and the rules each category must follow.

It exists because configuration drifts: a value gets a deployment setting, then
a database row, then a frontend constant, and nobody can say which one the
customer actually experiences. The current inventory is in
[`../operations/configuration-inventory.md`](../operations/configuration-inventory.md).

This is a decision *framework*, not a lookup table. Where a value genuinely
does not fit, record the reasoning in the pull request and update this document.

## 2. Ownership categories

| Category | Owner | Changed by |
| --- | --- | --- |
| **A. Secret / App Settings** | Operations | Secret store only |
| **B. Infrastructure / App Settings** | Operations | Deployment |
| **C. Global emergency control / App Settings** | Operations | Deployment |
| **D. Database / Admin editable** | Business Admin | Admin Portal |
| **E. Database / system managed** | The application | Application code only |
| **F. Admin Portal read-only** | Operations | Not editable — display only |
| **G. Code / domain constant** | Engineering | Code review |
| **H. Remove or consolidate** | — | Delete the duplicate |

## 3. Decision tree

Work top to bottom and stop at the first match:

1. **Is it a secret?** (credential, password, API key, signing key, connection
   string, provider token) → **A**. Never in a database table, never in Admin
   Portal, never logged.
2. **Is it environment- or infrastructure-specific?** (hostnames, endpoints,
   provider selection, CORS origins, proxy configuration, worker tuning) → **B**.
3. **Must it stay controllable when the database or Admin Portal is down?**
   → **C**. Do not assume every feature needs one.
4. **Is it a runtime business value expected to change without a deployment?**
   → **D**. Typed database column plus a purpose-built Admin screen.
5. **Does Admin need awareness but not control?** → **F**.
6. **Is it an invariant, protocol rule, or security rule?** → **G**. Not every
   number belongs in configuration.
7. **Is it generated or historical state?** (references, snapshots, counters,
   processing state) → **E**.
8. **Does another source already own it?** → **H**. Delete the duplicate.

## 4. App Settings rules

- App Settings are read at startup and owned by whoever deploys.
- A new App Setting for a **runtime business value** requires written
  justification in the pull request explaining why deployment ownership is
  necessary.
- Every App Setting needs a typed Options class with `SectionName`, bound in
  `Program.cs`. Do not read raw configuration keys from services.
- Options that can break startup or security must be validated at startup with
  an `IValidateOptions<T>` implementation.
- Environment-variable form uses `__` for nesting
  (`Email__Smtp__UseStartTls`).

## 5. Secret-management rules

- Secrets live in Azure App Service configuration or another approved secret
  store — never in `appsettings*.json`, never in a database table, never in
  the repository.
- `appsettings.Example.json` uses placeholders such as
  `SET_WITH_USER_SECRETS_OR_ENV`, never real values.
- Secrets must never appear in an API response, a log line, an audit entry, or
  an error message. Admin Portal may report *whether* a secret is configured,
  never its value.

## 6. Database-configuration rules

- Prefer an existing domain table over a new one. `DeliveryRates`,
  `TagProducts`, `TagProductVariants`, `PlanLimits`, and `Promotions` are the
  established pattern.
- Use **typed columns and typed DTOs**. Do not add rows to a generic
  key/value table.
- Add unique constraints where a business key must be unique.
- Store timestamps in UTC. Convert to Malaysia time only for display and for
  business references.
- Record `UpdatedByAdminUserId` and `UpdatedAt`.
- Use `RowVersion` for optimistic concurrency, surfaced as a friendly conflict
  message rather than a 500.
- Validate server-side on write. Never trust a client value.
- Define seed and default behaviour explicitly in the migration.
- Never move a value into the database when startup depends on it *before*
  database connectivity exists.

## 7. Admin Portal rules

- Every Admin-editable setting needs a purpose-built, typed screen. **Do not
  build a generic key/value editor.**
- Required for each editable setting: active Admin authentication, the correct
  role, server-side validation, a safe DTO with no mass assignment, an audit
  event capturing previous and new values, `UpdatedBy`, `UpdatedAt`, and
  `RowVersion`.
- High-impact changes require explicit confirmation: enabling ordering,
  changing delivery fees or product prices, enabling a customer email template,
  changing plan limits, and changing public availability.
- Admin Portal must never expose raw secrets, connection details, stack traces,
  or a complete configuration dump.

## 8. Admin read-only status rules

Safe presentations only:

- `Configured` / `Not configured`
- `Enabled` / `Disabled`
- `Available` / `Unavailable`
- `Healthy` / `Degraded`
- Last successful run, pending and failed counts

Never expose connection strings, keys, passwords, internal network topology,
stack traces, full SMTP responses, or storage endpoints.

A read-only status must be **derived from the value actually in effect**. A
hardcoded status string that merely looks like a status is worse than no status,
because it reports confidently and wrongly.

## 9. Code-constant rules

Use a code constant when the value is an invariant rather than a setting:
security validation rules, protocol constants, state-machine transitions,
supported enum mappings, and identifier formats. These require code review and
tests to change — which is the point.

Do not move a number into configuration merely because it *could* be
configurable. Configurability is a cost: it adds a failure mode, a validation
surface, and a question at every incident.

## 10. Feature-flag rules

Classify every flag:

| Kind | Owner | Notes |
| --- | --- | --- |
| Deployment safety | App Settings | Off by default |
| Emergency kill switch | App Settings | Must work without the database |
| Gradual rollout | App Settings | Remove once fully rolled out |
| Business availability | Database / Admin | Typed column |
| User entitlement | `PlanLimits` | Never a global flag |
| Temporary development | App Settings | Must have a removal date |
| Obsolete | — | Delete |

**A database business switch must never override a global infrastructure kill
switch.** Two-level controls are `AND`, never `OR`. The reference
implementation is `EmailTemplateGate`: delivery requires the `Email:Enabled`
App Setting **and** that message type's `EmailTemplateSettings` row.

The two switches mean different things and must behave differently:

* A **global infrastructure kill switch** (`Email:Enabled`) PAUSES work.
  Messages stay `Pending`, remain visible as a held backlog, and resume when it
  is turned back on.
* A **per-template business switch** (`EmailTemplateSettings.IsEnabled`)
  SUPPRESSES work. Events recorded while it is off become `Suppressed` and are
  never sent, even after the template is switched on later.

Where a switch controls customer communication, enabling it must not release
work that accumulated while it was off. `EmailTemplateSettings.EnabledFromUtc`
is the pattern: only events recorded at or after the moment of the decision
become eligible, and events recorded while the switch was off are written as
non-dispatchable `Suppressed` records rather than ordinary queued work.

## 11. Source-of-truth rules

- One authoritative source per business fact.
- A mirrored value (frontend copy of a backend fact) is permitted only when the
  precedence is documented in code *and* the mirror cannot be financially or
  security authoritative.
- The frontend is never the authority for price, entitlement, or permission.
- Where a fallback exists, the code comment must state which side wins and why.
  Silent precedence is a defect.

## 12. Caching and multi-instance rules

- Database-backed settings are read per request or through a short cache. If a
  cache is added, document the maximum staleness window.
- Assume multiple API instances. A setting change must not require a restart to
  take effect unless it is an App Setting, where a restart is expected.
- Never cache a security decision longer than the underlying token lifetime.

## 13. Validation and fail-safe rules

Every setting must have a defined answer to: what happens when it is missing,
and what happens when it is malformed?

**Financial, security, routing, and external-service configuration must fail
closed.** Specifically:

- A missing delivery rate must block checkout, never charge RM 0.
- A missing public site URL must block physical tag export, never emit a tag
  pointing at the wrong host.
- Missing CORS origins must allow nothing, never everything.
- An unknown storage provider must not silently fall back to local disk in
  Production.
- A disabled email template must leave messages queued, never mark them failed,
  and never release a historical backlog as a side effect of an unrelated
  switch.

## 14. Audit and concurrency requirements

Admin-editable settings must append an `AuditLog` entry containing the actor,
the action, the entity and entity id, and both the previous and new state
snapshots. Concurrency uses `RowVersion`; a conflict returns a friendly
"changed by another administrator" message, never a raw exception.

## 15. Migration requirements

- Update the EF migration, the model snapshot, and root `migration.sql`
  together.
- `migration.sql` must stay idempotent — every block guarded by
  `IF NOT EXISTS (SELECT * FROM [__EFMigrationsHistory] ...)`.
- Test both a fresh database and a populated upgrade against disposable local
  databases before release.
- Apply `migration.sql` with `sqlcmd -I`. Filtered indexes require
  `QUOTED_IDENTIFIER ON`, which sqlcmd does not set by default.
- Retiring a table is a **two-release** operation: stop reading it in one
  release, drop it in a later one. Dropping a table in the same release that
  stops reading it makes an application rollback impossible.
- Preserve historical business snapshots. Order and receipt values captured at
  the time of sale must never change because configuration changed later.
- A migration must never activate a customer-facing feature. Seed new switches
  as disabled.

## 16. Deployment and rollback requirements

- Deploy the schema first, then the code, then enable switches.
- Never remove an App Setting before the deployed code has stopped reading it.
- Every ownership migration needs a documented rollback value.
- Because switches are additive and default to off, code rollback should not
  require a schema rollback.

## 17. Examples from this repository

| Value | Category | Why |
| --- | --- | --- |
| `Jwt:SigningKey` | A | Secret; startup throws when absent |
| `Cors:AllowedOrigins` | B | Environment-specific; empty allows nothing |
| `Email:Enabled` | C | Must stop all delivery without database access |
| `EmailTemplateSettings.IsEnabled` | D | Per-template business decision, audited, `RowVersion` |
| `DeliveryRates.Fee` | D | Business decision, typed table, audited, `RowVersion` |
| `TagOrders.ReceiptNumber` | E | Generated once, immutable history |
| `PublicSite:BaseUrl` configured yes/no | F | Operationally critical, not editable |
| `MalaysiaDelivery.States` | G | Domain mapping; changing it is a code change |
| `EmailOutbox.Status` | E | Machine-managed; `Suppressed` is never dispatchable |

## 18. Anti-patterns

- A generic key/value settings table with a `ValueJson` column.
- An Admin screen that lists raw keys and JSON values.
- A frontend constant used as financial or entitlement authority.
- A hardcoded status string presented as live operational state.
- A second App Setting for a fact the database already owns.
- A feature switch with no documented owner or removal date.
- Deleting an App Setting from Azure before the code stops reading it.

## 19. Pull-request review checklist

- [ ] The value is classified using the decision tree in §3.
- [ ] No secret appears in a database table, an API response, or a log.
- [ ] No duplicate source of truth was introduced.
- [ ] Admin-editable values have typed validation, authorization, audit,
      UTC timestamps, and `RowVersion`.
- [ ] Missing or malformed values fail closed for money, security, routing,
      and external services.
- [ ] A database switch cannot override a global kill switch.
- [ ] `migration.sql`, the EF migration, and the model snapshot agree.
- [ ] Historical snapshots are unaffected.
- [ ] The configuration inventory and deployment docs are updated.
- [ ] No feature is enabled automatically by this change.

## 20. Current configuration inventory

See [`../operations/configuration-inventory.md`](../operations/configuration-inventory.md)
for the live inventory of every discovered value, its authoritative source, and
its ownership category.
