# Solo Operator Mode — implementation and local verification

18 October 2026. Approved local scope in `C:\Project\MyPetLink`. Prior N1–N9 release-gate conclusions remain intact. This is a scoped follow-up, not a deployment approval. No stage, commit, push, production migration or real-stock dispatch was performed.

## Implementation

| Requirement | Implemented behavior |
| --- | --- |
| Team / Solo policy | Typed organisation singleton, SQL Server-backed, seeded Team with no founder. RowVersion, actor/UTC timestamps, confirmed changes and before/after audit. Missing policy cannot enable self-review. |
| Explicit authorization | Solo AND current active nominated founder AND `consignment.self_review` AND normal action capability AND confirmed evidence attestation. Nomination grants no role or other capability. |
| Scope | Only agreement contributor exclusion, dispatcher receipt separation, and dispatcher/issue-recorder discrepancy review separation. Unknown legacy authors/recorders still fail closed. |
| External evidence | Signed partner acceptance for agreement; actual partner acknowledgment and counts for receiving; new evidence for self-reviewed discrepancy resolution. No signature, count, date or financial transaction is manufactured. |
| Durable distinction | Agreement and receiving movements show `Self-reviewed (Solo)`. Append-only journal retains actor, time, policy version, request reference, reason and evidence. Team and independent Solo reviews retain independent labels; legacy reviews are not guessed. |
| Admin configuration | Small purpose-built card: current mode, nominated founder, active permission eligibility, reason, warning confirmation and latest 20 mode changes. Existing capability catalogue and roles UI remain authoritative. |
| Reconciliation | Manifest/reconciliation CSV include review modes; bounded full review-log export preserves each individual event and policy change. Controlled export capability and CSV sanitization retained. |
| Safeguards | Inventory locks, held-unit QA/lifecycle checks, receiving holds, physical returns, fresh QA release, idempotency, rowversions, immutable PDF bytes, Tag Code privacy and zero financial posting retained. |

The sensitive capabilities are `consignment.self_review` and `consignment.approval_policy.manage`. Neither is granted to any ordinary built-in role template. Existing Super Admin catalogue expansion is unchanged, but Super Admin status alone cannot self-review: a separate confirmed policy change must explicitly nominate that founder. A non-Super founder also needs the explicit role capability grant. The nomination is an additional business authorization constraint, not a general per-user permission override. No self-role-edit exception was added.

All sensitive decisions and policy writes use the existing consignment transaction/application lock. A mode change cannot slip between the review decision and its commit. Role/account revocation is checked on the next request. Exact receipt replay retains its original completed outcome without a second journal entry, even if policy later changes; altered attestation is a conflict, not a new acknowledgment.

Solo agreement approval must cite the actual version's signed acceptance reference. Solo receipt/review attestation must cite exactly the same external evidence as its receiving request. A Solo discrepancy resolution cannot reuse any earlier receiving-event evidence reference for that delivery. It must still identify a valid changed outcome; missing stock cannot be invented as received or returned. Return quarantine, issue holds and fresh QA gates are unchanged. An independent review made while Solo is enabled stays `Independent (Solo)`.

The journal's self-review marker is written only after explicit confirmation validation; its response/export also identifies confirmation. EF refuses journal updates/deletes and a SQL Server trigger rejects direct UPDATE/DELETE. Existing `IAuditLogService` entries commit atomically with the operation. History is append-only through the application, not a claim against unrestricted DBA privileges.

## Schema and compatibility

New migration: **20261018035952_AddConsignmentSoloOperatorPolicy**.

- Adds `ConsignmentApprovalPolicies` and append-only `ConsignmentReviewEvents`, restrictive relationships, lookup indexes and rowversion.
- Adds nullable `ConsignmentAgreements.ApprovalReviewMode` and `ConsignmentMovements.ReviewMode`.
- Seeds only Team; no founder, partner, approval, stock movement or financial event is seeded.
- Preserves all original contributor, agreement, custody, PDF and external evidence. Historical review modes remain unknown rather than falsely independent or Solo.
- Extends guarded Down behavior to any policy-change, review-journal or consignment business history. All four consignment migrations retain the protection.
- Root `migration.sql` regenerated idempotently; current assembly hash recorded in [migration-hash.log](migration-hash.log).

Changes are additive to request/response contracts. The self-review attestation is optional for existing independent clients and mandatory only for actual self-review. Existing action endpoints still enforce their normal capability; the conditional extra capability is checked in the service. The capability coverage test explicitly documents that conditional enforcement instead of adding a dummy endpoint.

## Test results

The runs overlap and must not be added into a unique-test total.

| Run | Passed | Failed | Skipped | Evidence and disposition |
| --- | ---: | ---: | ---: | --- |
| Broad B2C / Wholesale / Consignment / QA / authorization regression | 991 | 1 | 0 | [TRX](api-regression.trx), [log](api-regression.log); 992 total, 23m45s. The single failure was the capability coverage inventory requiring an explanation for a capability used conditionally inside a service rather than as an endpoint policy. Corrected and verified in the final gate below; no business regression failed. |
| Final Solo + capability coverage gate | 20 | 0 | 0 | [TRX](api-final-gates.trx), [log](api-final-gates.log), [individual cases](targeted-test-evidence.md); 1m19s. Includes 14 actual SQL Server cases, one HTTP authorization case and five capability coverage checks. All final export/script/Super Admin assertions are included. |
| Full frontend | 4,346 | 0 | 7 | [JSON](web-full.json), [log](web-full.log); 4,353 total, 426.99s. Seven existing conditional skips are individually recorded in [frontend-skips.json](frontend-skips.json). |
| Final focused UI, final source | 23 | 0 | 0 | [Log](web-focused-final.log). Policy warning/nomination, Team switching, historical labels, agreement and receipt attestations, no-permission visibility and existing partial receiving UI. |

Final [typecheck](web-typecheck.log) (app and functions), [scoped ESLint](web-lint-final.log), [production build](web-build.log), [EF model consistency](ef-model.log) and [script hash verification](migration-hash.log) passed. Production export generated 160 pages with all three Smart Tag commerce flags ON, Safety Profile owner UI ON and Social OFF; release-flag and SEO verifiers completed. No pending EF model change. Root migration SHA256: `C7C45D2912DD6F3BB29E28041A300AF75E69C39C840315DAB4CD45A6BC487EC1`.

SQL coverage includes Team contributor/dispatcher/recorder independence, Solo with and without permission, an explicitly different nominated founder even for Super Admin, invalid/missing attestation, actual signed acceptance, partial good/damaged/missing receiving, new-evidence-only self-resolution, actual return/quarantine/release restrictions, exact retry vs altered attestation, unchanged PDF bytes/privacy, zero money postings, manifest and reconciliation modes, stale/concurrent policy changes and approval-vs-Team switching, populated migration, append-only trigger/EF guard, blocked Down, fresh idempotent script and replay without resetting an enabled policy.

The broader run predates the final coverage-test explanation and added test-only export/script/Super Admin assertions; runtime implementation did not change after that run began. The final 20-case gate covers those corrections/additions. The full frontend run predates the final dialog reset refactor; the final focused run, lint, typecheck and build cover the final UI. No new skip was added. Existing two unrelated API compiler warnings, Node module/type-stripping warnings and SEO-M4 limited initial Share Profile text warning remain. Commands and scope qualifications are in [verification-commands.md](verification-commands.md).

The capability inventory failure is resolved; it is retained in the broad result rather than erased or reported as a clean run. No confirmed requested software defect remains open after the final checks.

Initial evidence is retained: `solo-focused.trx` (11 passing), `solo-final.trx` (13 passing). These precede the last export/fresh-script assertions. An initial UI run had 21 pass / 1 failure from a test's ambiguous Team text query; the selector was corrected. Lint caught a synchronous state reset in an effect; resetting at dialog-opening events resolved it. An initial EF check and one final-gates build attempt hit Windows DLL locks while the local API or another testhost was running; servers were stopped and the final gates use isolated build output. These attempts are not represented as successful test runs.

### Real browser and SQL evidence

The loopback walkthrough used three synthetic administrators, six synthetic tags and a separately owned disposable SQL Server database. Team/no-founder was visible initially. The actual founder used the policy warning, nominated themselves, entered the operating reason and confirmed Solo. They opened the complete synthetic agreement summary, explicitly checked the self-review attestation, supplied a reason and matching partner-reference, then saw an Active agreement labelled `Self-reviewed (Solo)`. Restoring Team cleared nomination and preserved the Solo label and both policy-change events. No tag was reserved or dispatched in this walkthrough.

Actual authenticated HTTP and SQL then confirmed the Team policy, cleared nomination, single self-reviewed agreement, journal evidence and review-log CSV. All six synthetic tags remained central and there were zero custody units, dispatches, B2C/merchant orders, invoices, receipts, payments and commissions. The 375px view had 360px document width and no horizontal overflow. Initial helper identity/key mismatches were corrected before the successful run; they were test-fixture issues, not runtime authorization bypasses.

Evidence: [browser/HTTP assertions](e2e-results.log), [SQL facts](e2e-sql.log), [synthetic review export](synthetic-review-log.csv), [policy warning](browser-policy-warning.jpg), [attestation](browser-attestation.jpg), [self-reviewed result](browser-self-reviewed.jpg), [Team and historical review](browser-team-history.jpg), [mobile](browser-mobile.jpg).

The browser logged out; local API/web stopped; only the exact owned database was removed; JWT state was deleted. The first defective fixture was also deleted by exact guarded name. [Cleanup](e2e-cleanup.log), [initial fixture reset](e2e-fixture-reset.log). No real hardware was used and no real partner acceptance is asserted by synthetic test references.

## Operational instructions

1. After separately approved migration/API/web release, sign in with Consignment view and approval-policy management access. Use existing Access Management for a non-Super founder's `consignment.self_review` and normal action permissions. Enabling Solo never grants these automatically.
2. Open Admin → Merchant Sales → Consignment → Consignment approval policy. Choose Solo, explicitly nominate the one active founder, write the reason and confirm the warning.
3. For each review of your own work, check the Solo confirmation, enter a meaningful reason and the exact genuine external evidence reference. Retain the original signed partner artifacts separately. For discrepancies, obtain new supporting evidence and identify truthful per-unit outcomes.
4. Confirm the visible `Self-reviewed (Solo)` marker. Download the review log and reconciliation for periodic partner/accountant review.
5. To restore independence, choose Team, record the reason and confirm. Nomination clears immediately. Later re-enablement requires a new explicit nomination and confirmed change. Historical evidence never changes.

The detailed procedure is in [the rollout runbook](../../docs/deployment/consignment-mvp-rollout.md); policy ownership and invariants are in [architecture](../../docs/architecture/consignment-mvp.md), [configuration inventory](../../docs/operations/configuration-inventory.md) and [access management](../../docs/architecture/admin-access-management.md).

## Release and rollback

Deploy nothing from this working tree without an isolated, reviewed B2B release package. Schema first, matching policy-aware API/web next, then explicitly enable Solo only after approved staging verification. No App Setting activates it and existing installations remain Team. Review populated upgrades, fresh script application, idempotency, append-only trigger, Team/Solo switching, unauthorized requests, partial returns, PDF/privacy and blocked Down in staging.

Routine rollback is switch to Team and stop affected operations. Retain additive schema/history and policy-aware inventory code. Once any policy change, review or consignment business history exists, the new Down guard refuses destructive downgrade. An old API cannot safely interpret Solo history; do not deploy it after use or delete journal/history to evade safeguards. Existing custody rollback protections remain. `sqlcmd -I` is still required for filtered-index session settings. Production migration/deployment requires separate approval.

## Remaining decisions and readiness

No requested financial settlement, automated Document Pack or Partner Portal was implemented. Before real use, identify the actual founder and least-privilege access; retain signed partner terms/acceptance and acknowledge actual counts; agree monthly partner reconciliation and external accountant reviewer/cadence; confirm evidence storage/retention, shortages/liability/discount/tax/customer-document ownership. Unlocated shortages continue held pending an approved outcome. Real intended QR/NFC hardware, packaging and actual manifest must still be checked. Solo's partner-countersigned handover count replaces the impractical internal second-person count; it does not manufacture an acknowledgment.

| Target | Verdict | Gate |
| --- | --- | --- |
| Local implementation | **GO for independent targeted review** | Review the nominated-founder constraint, three exception checks, genuine-evidence attestation, journal/export and migration tests. |
| Staging | **Conditional GO for controlled UAT after review** | Accept the targeted review and isolate an approved B2B release package; rehearse the migration and both modes. This report does not authorize deployment. |
| Production | **NO-GO** | Accepted staging evidence, operational/commercial readiness and separately approved deployment. |
| First 100 real tags | **NO-GO** | Signed terms/evidence, authorized actual founder, external reconciliation/review process, real QR/NFC/packaging validation and partner-countersigned actual manifest/count. |

## Change isolation and review package

**31 scoped source/test/document/script files**: 22 changed from the captured starting tree and 9 new. [Exact list](changed-files.txt), [review patch](solo-operator-mode.patch), [baseline manifest](baseline-manifest.json), [initial dirty hashes](initial-dirty-hashes.json), [final isolation checks](final-review-checks.log). The report/evidence helpers are separate under this artifact directory.

- [apps/api/MyPetLink.Api.Tests/AdminCapabilityCoverageTests.cs](../../apps/api/MyPetLink.Api.Tests/AdminCapabilityCoverageTests.cs)
- [apps/api/MyPetLink.Api.Tests/ConsignmentSoloOperatorHttpTests.cs](../../apps/api/MyPetLink.Api.Tests/ConsignmentSoloOperatorHttpTests.cs)
- [apps/api/MyPetLink.Api.Tests/Relational/ConsignmentSoloOperatorRelationalTests.cs](../../apps/api/MyPetLink.Api.Tests/Relational/ConsignmentSoloOperatorRelationalTests.cs)
- [apps/api/MyPetLink.Api/Auth/AdminCapabilities.cs](../../apps/api/MyPetLink.Api/Auth/AdminCapabilities.cs)
- [apps/api/MyPetLink.Api/Auth/AdminCapabilityCatalog.cs](../../apps/api/MyPetLink.Api/Auth/AdminCapabilityCatalog.cs)
- [apps/api/MyPetLink.Api/Controllers/Admin/AdminConsignmentController.cs](../../apps/api/MyPetLink.Api/Controllers/Admin/AdminConsignmentController.cs)
- [apps/api/MyPetLink.Api/DTOs/ConsignmentApprovalDtos.cs](../../apps/api/MyPetLink.Api/DTOs/ConsignmentApprovalDtos.cs)
- [apps/api/MyPetLink.Api/DTOs/ConsignmentDtos.cs](../../apps/api/MyPetLink.Api/DTOs/ConsignmentDtos.cs)
- [apps/api/MyPetLink.Api/Data/MyPetLinkDbContext.Consignment.cs](../../apps/api/MyPetLink.Api/Data/MyPetLinkDbContext.Consignment.cs)
- [apps/api/MyPetLink.Api/Data/MyPetLinkDbContext.cs](../../apps/api/MyPetLink.Api/Data/MyPetLinkDbContext.cs)
- [apps/api/MyPetLink.Api/Entities/ConsignmentApprovalPolicy.cs](../../apps/api/MyPetLink.Api/Entities/ConsignmentApprovalPolicy.cs)
- [apps/api/MyPetLink.Api/Entities/ConsignmentEntities.cs](../../apps/api/MyPetLink.Api/Entities/ConsignmentEntities.cs)
- [apps/api/MyPetLink.Api/Migrations/20261018035952_AddConsignmentSoloOperatorPolicy.Designer.cs](../../apps/api/MyPetLink.Api/Migrations/20261018035952_AddConsignmentSoloOperatorPolicy.Designer.cs)
- [apps/api/MyPetLink.Api/Migrations/20261018035952_AddConsignmentSoloOperatorPolicy.cs](../../apps/api/MyPetLink.Api/Migrations/20261018035952_AddConsignmentSoloOperatorPolicy.cs)
- [apps/api/MyPetLink.Api/Migrations/MyPetLinkDbContextModelSnapshot.cs](../../apps/api/MyPetLink.Api/Migrations/MyPetLinkDbContextModelSnapshot.cs)
- [apps/api/MyPetLink.Api/Services/ConsignmentDocumentService.cs](../../apps/api/MyPetLink.Api/Services/ConsignmentDocumentService.cs)
- [apps/api/MyPetLink.Api/Services/ConsignmentService.Approval.cs](../../apps/api/MyPetLink.Api/Services/ConsignmentService.Approval.cs)
- [apps/api/MyPetLink.Api/Services/ConsignmentService.Evidence.cs](../../apps/api/MyPetLink.Api/Services/ConsignmentService.Evidence.cs)
- [apps/api/MyPetLink.Api/Services/ConsignmentService.Receiving.cs](../../apps/api/MyPetLink.Api/Services/ConsignmentService.Receiving.cs)
- [apps/api/MyPetLink.Api/Services/ConsignmentService.cs](../../apps/api/MyPetLink.Api/Services/ConsignmentService.cs)
- [apps/web/src/components/admin/merchantSales/ConsignmentApprovalPolicy.test.tsx](../../apps/web/src/components/admin/merchantSales/ConsignmentApprovalPolicy.test.tsx)
- [apps/web/src/components/admin/merchantSales/ConsignmentApprovalPolicy.tsx](../../apps/web/src/components/admin/merchantSales/ConsignmentApprovalPolicy.tsx)
- [apps/web/src/components/admin/merchantSales/ConsignmentPanel.test.tsx](../../apps/web/src/components/admin/merchantSales/ConsignmentPanel.test.tsx)
- [apps/web/src/components/admin/merchantSales/ConsignmentPanel.tsx](../../apps/web/src/components/admin/merchantSales/ConsignmentPanel.tsx)
- [apps/web/src/lib/adminCapabilities.ts](../../apps/web/src/lib/adminCapabilities.ts)
- [apps/web/src/services/adminConsignmentService.ts](../../apps/web/src/services/adminConsignmentService.ts)
- [docs/architecture/admin-access-management.md](../../docs/architecture/admin-access-management.md)
- [docs/architecture/consignment-mvp.md](../../docs/architecture/consignment-mvp.md)
- [docs/deployment/consignment-mvp-rollout.md](../../docs/deployment/consignment-mvp-rollout.md)
- [docs/operations/configuration-inventory.md](../../docs/operations/configuration-inventory.md)
- [migration.sql](../../migration.sql)

All unrelated initial dirty-file hashes are preserved. No index operation occurred. Existing Marketing Demo, Program.cs, appsettings, launch settings and unrelated B2C/Wholesale code were not edited. The scoped patch compares against this task's captured starting tree, not HEAD, and assumes prior B2B work is present. It is a review diff, not a standalone release package. Work stops here for independent targeted review of Solo policy/authorization, genuine-evidence attestation, mode transitions, journal immutability, exports and unchanged custody/financial boundaries.
