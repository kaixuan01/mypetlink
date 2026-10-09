# Smart Tag physical QA — implementation report

Fourth revision, after the third independent audit (F4-A and F4-B). The operational
procedure is the [physical QA runbook](smart-tag-physical-qa.md).

## What physical QA does

1. Existing inventory gains an independent QA result, version and inspection
   identity. A shipment is enrolled from its exact manifest; enrollment holds
   the tags and keeps every unshipped order and merchant allocation.
2. Admin capture/save/history/summary/export endpoints behind the sensitive
   `inventory.qa.manage` capability. Passing is decided by the server from
   sealed camera and Web NFC reader results; retries are idempotent and
   competing saves return 409.
3. One release rule, `PhysicalQaReleaseRules.Released`, gates retail stock and
   checkout, order assignment/change/replacement, Admin claim/pet/transfer,
   merchant eligibility, quotations, bulk outbound actions, retail and merchant
   shipping, and public activation. Historical tags outside the cohort (NULL)
   keep their behaviour.
4. A mobile inspection panel in Tag Inventory: in-page QR decoding, Web NFC
   reading events, strict URL checks with explanatory refusals, one-tap pass,
   automatic next-package reset with a cooldown for the package just finished,
   a switch prompt instead of silent re-targeting, manifest reconciliation,
   filters, history and CSV.

## Changes made in this revision

| Audit item | Change | Files |
| --- | --- | --- |
| B1 release isolation | QA migration re-scaffolded on HEAD as `20261008040000_AddSmartTagPhysicalQa`, ordered before the unfinished Community migration; Community designer regenerated so the chain is consistent; QA-only release packaged as a staging patch | `Migrations/20261008040000_*`, `Migrations/20261008040433_AddCommunityModerationActions.Designer.cs`, root `migration.sql` |
| B2 URL compatibility | Strict `/q/` + `/n/` on the configured host kept (expected format; one example code checked, the shipment and NDEF/UID behaviour not yet hardware-verified); every refusal names the problem and the expected link, including the legacy `/t/` route, swapped routes, wrong host and NFC record encodings | `PhysicalQaService.CheckUrl`, `physicalQaReaders.ts` |
| B3 enrollment window | Unshipped retail and merchant commitments enroll and stay held; shipped/activated/inconsistent tags still block; acknowledgement covers commitments and reservations; atomic, SKU-locked, idempotent; complete freeze documented | `PhysicalQaService` (`ReconcileAsync`, `Assess`, `EnrollAsync`), runbook |
| I1 admin token exposure | External USB reader workflow removed from this release: no token copy, no external-evidence endpoint, `ExternalReader` source removed, helper script removed; documented as deferred | `AdminPhysicalQaPanel.tsx`, `AdminPhysicalQaController.cs`, `PhysicalQaEnums.cs`, runbook |
| I3 activation | Public activation refuses Pending/Failed/Needs Review with `tag_not_ready` and an owner-facing message; historical tags unchanged | `SmartTagService.cs`, `ownerOrderErrors.ts` |
| I4 scanner reset | Last finished code ignored until a different code is seen; re-read only after ~1 s of empty frames; another package's QR opens a switch prompt and records nothing; NFC tap without an open package explains itself | `AdminPhysicalQaPanel.tsx` |
| I5 reconciliation | Preview returns entries, distinct, found, eligible, duplicates, invalid, missing, SKU and batch breakdowns with batch codes outside the manifest, commitments, truncation flag | `PhysicalQaDtos.cs`, `PhysicalQaService.cs`, panel |
| I6/I7 rules | One SQL-translatable expression composed into every stock query; NULL behaviour documented; generation-starts-Pending covered | `PhysicalQaReleaseRules.cs`, `TagOrderInventoryAvailabilityService.cs`, `OrderService.cs`, `MerchantInventoryEligibility.cs` |
| Duplicate chips | The stored chip UID is set only by a pass and never replaced, so a duplicate package read after a Needs Review cannot later pass; every observed UID is in the audit entry | `PhysicalQaService.SaveAsync` |
| P2 | 2-minute receipt clock allowance; QA-specific busy message; CRLF CSV; history rendered once; Excel manifest guidance; Data Protection and `PublicSite:BaseUrl` documented; catalog copy no longer says generated stock is sellable | service, panel, `AdminCapabilityCatalog.cs`, configuration inventory |

## Second-audit fixes

| Finding | Root cause | Fix | Files |
| --- | --- | --- | --- |
| F1 missing chip ID passed | The chip comparison ran only when both stored and observed IDs were present, so an absent reading skipped it | A pass requires a normalized chip ID; once a code has passed, every later pass must read the same chip; Failed / Needs Review never bind or replace it; observed and reported IDs are audited | `PhysicalQaService.SaveAsync`, `RequirePassableChipAsync`, `NormalizeChipId` |
| F2 one chip, two codes | Chip IDs were only compared within one tag | Pre-check plus a filtered unique index on `SmartTags.QaNfcSerialNumber` (race-proof); 409 `physical_qa_chip_in_use` names the other code | `PhysicalQaService`, `MyPetLinkDbContext`, migration |
| F3 manifest changed under a reference | Idempotency was per tag: tags already in the shipment were skipped and any new code was added | `PhysicalQaShipments` records reference, expected count and a server-computed SHA-256 of the distinct normalized codes; same manifest is a no-op, anything else 409 `physical_qa_shipment_conflict`; unique index on the reference settles races | `PhysicalQaShipment.cs`, `PhysicalQaService.EnrollAsync` / `ReconcileAsync`, migration |
| F4 quotation stock race | Send and Convert counted released stock without the SKU lock, so a QA withdrawal could land between the count and the save | Superseded by the F4-A / F4-B design below | `MerchantSalesService` |

Each finding has SQL Server regression tests
(`PhysicalQaReleaseGateRelationalTests.Identity.cs`) that failed against the
previous implementation and pass now; the F4 tests hold one operation at an
exact point with a command interceptor to make the race deterministic.

The inspection screen shows the chip ID with every NFC reading and refuses to
offer a pass when the phone reported none.

## Third-audit fixes (F4-A, F4-B)

| Finding | Root cause | Fix |
| --- | --- | --- |
| F4-A wrong SKU lock after a draft edit | Send and Convert read the quotation's SKUs, locked them, then reloaded the quotation; a draft edit was never locked, so it could move the lines to another SKU in between (or after the stock check), leaving the new SKU unprotected. The optional concurrency token did not help when omitted | Draft edit, every transition and conversion take a **quotation lock** first and hold it until commit; Send and Convert reload the quotation **after** that lock and only then lock the SKUs of its current lines. While the quotation lock is held no edit can change those lines, so the protected SKU set is the one validated and written |
| F4-B lost session lock on retry | The SKU locks were owned by the SQL session and taken outside EF's retrying execution strategy. A dropped connection released them, EF retried `SaveChanges` alone on a new connection without re-locking or re-validating, the write committed against withdrawn stock, and releasing the vanished lock then threw over the committed result | The whole unit — begin transaction, lock quotation, reload, lock SKUs, validate, write, commit — runs inside `ExecuteInTransactionAsync`. The locks are **owned by that transaction** (`sp_getapplock @LockOwner = 'Transaction'`), so they end with it on commit, rollback, cancellation or a lost connection and are never released by hand. A transient failure rolls the attempt back and the next attempt re-locks and re-validates from scratch. If a commit's response is lost, the outcome is verified (Send: the quotation is in the target state; Convert: the order *this attempt* created exists for the quotation — another request's order is never taken as ours, so the attempt is retried and returns that order as already converted) instead of re-running it |

Lock order is always quotation, then SKUs in SKU-id order. Physical QA,
checkout, reservation expiry and enrollment take only SKU locks (same order),
and nothing takes a quotation lock while holding a SKU lock, so the order
cannot cycle. The existing session-owned SKU lock is unchanged; the
transaction-owned form is an addition (`AcquireForTransactionAsync`).

The SQL Server tests in `PhysicalQaReleaseGateRelationalTests.Quotations.cs`
reproduce each audited case by pausing an operation at an exact point, killing
its SQL session before the write, or failing the client after a successful
commit. They failed against the previous implementation (the lost-session case
committed and then raised "Cannot release the application lock … because it is
not currently held") and pass now.

## Database impact

`AddSmartTagPhysicalQa` (`20261008040000`, not yet applied anywhere). The F4
fixes needed no schema change.

| Object | Detail |
| --- | --- |
| `SmartTags` columns (14) | `QaStatus`, `QaShipmentReference`, `QaVersion` (int, NOT NULL, default 0, EF concurrency token), `QaInspectionId`, `QaQrUrl`, `QaNfcUrl`, `QaQrVerifiedAt`, `QaNfcVerifiedAt`, `QaNfcSource`, `QaNfcSerialNumber`, `QaPhysicalCondition` (nvarchar(32), NOT NULL, default `Unchecked`), `QaRemarks`, `QaInspectedAt`, `QaInspectedByAdminUserId`; all others nullable |
| `SmartTags` indexes (5) | `IX_SmartTags_ProductVariantId_QaStatus_Status`; `IX_SmartTags_QaInspectedByAdminUserId`; `IX_SmartTags_QaInspectionId` (unique, filtered `IS NOT NULL`); `IX_SmartTags_QaNfcSerialNumber` (unique, filtered `IS NOT NULL`); `IX_SmartTags_QaShipmentReference_QaStatus` |
| `SmartTags` foreign key (1) | `FK_SmartTags_AdminUsers_QaInspectedByAdminUserId` → `AdminUsers.Id`, `ON DELETE NO ACTION` (Restrict) |
| `PhysicalQaShipments` table | `Id` (PK `PK_PhysicalQaShipments`), `ShipmentReference` nvarchar(100), `ExpectedCount` int, `ManifestSha256` nvarchar(64), `EnrolledByAdminUserId`, `EnrolledAt`; all NOT NULL |
| `PhysicalQaShipments` indexes (2) | `IX_PhysicalQaShipments_ShipmentReference` (unique); `IX_PhysicalQaShipments_EnrolledByAdminUserId` |
| `PhysicalQaShipments` foreign key (1) | `FK_PhysicalQaShipments_AdminUsers_EnrolledByAdminUserId` → `AdminUsers.Id`, Restrict |

No check constraints, triggers or data changes. Nothing is backfilled: every
existing tag keeps `QaStatus` NULL, and the new table starts empty, so neither
unique index can conflict with existing rows. `Down` drops exactly these
objects.

`QaVersion` is an EF concurrency token, so every `SmartTags` update also checks
it. Inspection history stays in AuditLogs. The migration's design-time model
contains no unfinished Community tables.

## Release packaging

The working tree also carries unfinished Community moderation and marketing
work in some of the same files. The QA release is the exact set of QA files and
QA hunks on top of HEAD (`41c3cc9`), verified separately: it builds, its model
has no pending changes, its full test suite passes and its `migration.sql`
differs from HEAD only by `20261008040000_AddSmartTagPhysicalQa`. The working
tree keeps both features with QA ordered first.

## Verification

See the final report for exact counts. Automated tests do not establish
Android NFC or camera compatibility; the runbook lists the physical checks.

## Remaining acceptance

- Perform the physical hardware checks in the runbook on the real phone and
  packages, and a 20-package pilot, before inspecting the shipment.
- Follow the full freeze; `IsPurchasable` alone is not enough.
- Reader results are operator reports sealed by the server, not hardware
  attestation. Keep `inventory.qa.manage` to named inspectors.
- No production migration, API publication, deployment, commit or push was done.
