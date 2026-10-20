# MyPetLink — Independent QA remediation

17 October 2026. Local implementation and verification in `C:\Project\MyPetLink`.

This report supersedes the readiness conclusions in the earlier implementation report and independent QA report for the code changed here. Those historical reports and their original evidence remain intact. No stage, commit, push, deployment, production connection, production migration, real partner acknowledgment, or physical stock dispatch was performed. All runtime business records below are synthetic and disposable.

## Decision

Final validation counts and release decisions are recorded in the validation section below. Production and first-100 physical dispatch remain **NO-GO** until the staging, signed-term, operator, evidence-retention and hardware gates in the [rollout runbook](../../docs/deployment/consignment-mvp-rollout.md) are completed. This implementation does not authorize that rollout.

## Confirmed findings and fixes

| Finding | Root cause | Implemented correction and regression evidence |
| --- | --- | --- |
| **H1 — Inspected retail stock** | Shared availability intentionally counted Pending and Passed stock for retail ordering, and the business allocation guard treated that quantity as inspected fulfillment capacity. | Retained retail catalogue/checkout behavior. Added a separate Passed-stock invariant for wholesale/consignment allocations: remaining received, on-shelf Passed units must cover outstanding committed retail quantities; only Passed assignments satisfy that stricter commitment count. Recheck before dispatch after intervening QA changes. SKU locks precede fresh tag reads in wholesale Ready/Shipment. SQL tests cover paid unassigned and PendingPayment reservations, mixed QA, insufficient Passed stock, failure after reserve, cancellation/recovery and simultaneous real checkout/wholesale/consignment claims. See `InventoryCustodyRules`, `TagOrderInventoryAvailabilityService`, `MerchantFulfilmentService`, P01 and triple-race tests. |
| **H2 — Independent authorization/evidence** | Agreement manage also approved; no last-editor or dispatcher separation; receipt was an arbitrary string. | Added catalogued `consignment.agreements.approve`, mirrored to web, plus maker/checker comparison against the last draft editor. Dispatcher cannot record receipt or discrepancy resolution. These business rules apply to Super Admin too. Receipt requires actual recipient, receipt date, total counted, missing/damaged counts and a signed evidence reference. Existing installed roles are not automatically broadened. Legacy active terms without independent approval metadata cannot authorize new reserve/dispatch; create a reviewed revision. SQL maker/checker/receipt tests and HTTP capability/revocation tests pass. |
| **H3 — Reconciliation foundations** | One mutable free-text unit reference lacked unique event identity, dates, actor, sale amounts and correction lineage; failed returns could never resolve. | Added append-only application handover records with merchant/agreement/dispatch/unit, unique merchant-scoped normalized event reference, event/recording timestamps, actor, optional actual MYR sale price and discount, evidence and superseded record ID. Corrections/reversals retain originals and require a new reference. Reported sales are explicitly **Unverified external report** and generate no finance records. Restricted bounded date-range CSV contains dates, merchant/agreement, Tag Code, actor and lineage. Separate `consignment.write_off` handles unowned physically returned Failed/NeedsReview units, disables the tag and retains its inventory hold/history. Failed stock cannot be released or resold. P04/P10, export, reversal and SQL zero-finance assertions cover this. |
| **H4 — Destructive rollback** | Original EF Down dropped custody tables regardless of business use. | Both original and follow-up Down methods acquire SQL table locks and THROW 51040 if any agreement, custody, movement or reconciliation history exists. The guard includes historical/released records. Real migrated SQL Server databases tested with historical-only agreement and active dispatched custody reject downgrade and retain records/migration history. Empty unused schema alone may downgrade. Runbook forbids bypassing the guard or running obsolete rollback scripts. |
| **M1 — Revision strands reservations** | Approval closed the predecessor while valid Reserved dispatches still depended on it. | Revision approval refuses while predecessor reservations remain. Dispatch while valid or explicitly cancel before approving the revision. Already-dispatched custody remains reconciliable under its original terms. Expiry has no invented grace period. P02/P03 SQL tests. |
| **M2 — Close with stock held** | Closure changed agreement status without checking custody. | Manual closure refuses while Reserved, Dispatched, Received or ReturnedQuarantine units remain. Released, external handover or WrittenOff are operationally reconciled states; closure never proves financial settlement. Supersession after dispatch retains original custody and permits receipt/returns. SQL tests and live closure409. |
| **M3 — Refresh duplicates** | Idempotency key lived only in component memory; a new key bypassed duplicate recognition. | Persist user-scoped fingerprint/key in sessionStorage across remount/refresh; keep it after successful submission. Explicit separate-reservation action resets it. Server reuses an equivalent active Reserved fingerprint even with a new key; filtered unique index backs this up. Preflight refuses existing duplicates without merging history. Component test remounts; SQL changed-key replay and real browser reload/resubmit retain one four-unit dispatch. |
| **M4 — Codes in errors** | Consignment reused a validation helper that interpolated the physical Tag Code. | Consignment eligibility and inspection errors now use generic unit messages. Ordinary details/history omit codes; controlled manifests/CSV remain separately authorized. SQL and HTTP assertions plus browser early-release rejection show no Tag Code in the error. |
| **M5 — Sensitive caching** | Consignment controller lacked the existing no-store convention. | Controller ResponseCache NoStore/None covers successful JSON, manifest JSON/CSV, reconciliation CSV and PDF. HTTP middleware tests and real localhost successful download headers verify `no-store`. Authorization still refuses independently with403. |
| **M6 — Mutable dispatch PDF** | Download re-rendered current status, allowed pre-dispatch printing and contradictory receiving/signature language; a code-free PDF required code export rights. | Dispatch atomically stores issued PDF bytes, SHA-256 and issuance time. Pre-dispatch download409; receipt/returns do not alter bytes. Legacy dispatches without archived bytes fail closed for document review. Code-free download needs view capability; controlled manifests require export. Footer separates the issued custody record from actual externally retained signed partner evidence. No automatic signature or payable document. SQL PDF tests and live hashes before/after receipt/returns pass; rendered one-page PDF visually inspected. |
| **M7 — Wholesale DO reissue** | Shipment unconditionally voided a prior issued Delivery Order even with unchanged allocation. | Shipment retains an existing valid DO when allocation is unchanged. Allocation release still explicitly voids it; next issuance receives its own document number. Void audit actions now appear in the order timeline. Issued operational/commercial snapshot remains unchanged; actual tracking lives on shipment and shipped email. SQL unchanged-allocation and changed-allocation/document regressions cover both branches. |
| **M8 — Short/damaged receipt** | Receiving immediately marked every unit Received without discrepancy evidence. | Short/damaged acknowledgment409 and remains Dispatched. Explicit record-discrepancy captures structured evidence and blocks receipt/customer handover. Only complete undamaged recount with resolution evidence clears the hold, followed by separate receipt. Permanent shortages stay on hold pending business policy. SQL and live HTTP short/missing/discrepancy/recount/receive sequence pass. |
| **M9 — Destination** | Reservation accepted any free-text address. | Requires an active existing branch belonging to the agreement merchant and the canonical branch-derived address snapshot. Stale/foreign destination is refused. UI uses the existing merchant listing client and branch selector. SQL branch validation and live browser reservation cover this. |
| **M10 — Real return QA gap** | Original test directly changed QaStatus to Passed. | Return tests now use real PhysicalQaService capture/save and chip evidence. Live browser returned two synthetic units, refused premature release, saved damaged/Failed inspection through Physical QA, displayed fresh Passed inspection, released the Passed unit and separately wrote off the Failed one. Positive QR/NFC reader inputs were simulated through actual capture/save HTTP endpoints, never direct QA database mutation. Actual Android camera/NFC hardware remains a staging requirement. |

Related small fixes: clearing commission preserves null rather than zero; displayed percentage complement uses fixed decimal precision; saved agreement reference is immutable in the form; closure requires the operator's reason; dispatch deep link survives refresh; export downloads reuse authenticated blob/refresh handling; operational references warn against customer personal data. The date-dependent Community failure was isolated to a test clock: Date.now is frozen to that test's stated date and restored afterward; no Community production behavior changed.

## Security, data, API and frontend impact

- Authorization remains database-resolved capability based. Controllers use existing response envelopes, request validation and status conventions:400 invalid evidence,403 missing authority/independence,409 state/concurrency conflicts,201 reserve/create. Existing list pagination is preserved; reconciliation export is bounded to366days and10,000records.
- New additive SQL Server EF migration `20261017103941_HardenConsignmentOperationalControls` adds nullable historical metadata, archived PDF fields and `ConsignmentHandoverRecords`, indexes/checks/FKs. Existing agreement/dispatch/unit/movement tables remain authoritative. No new App Setting, secret store, generic editor, settlement engine or automatic money posting.
- Merchant Sales → Consignment reuses current layout, clients, confirmation dialog, capability checks and responsive controls. Physical QA continues using the existing screen/service. Frontend hiding is backed by API policies and service checks.
- A signed-evidence reference points to a retained external artifact; the app does not authenticate an external signature or independently verify a reported sale. Finance/operator review remains necessary. Application history is append-only through these endpoints; this is not a claim of protection from privileged direct DBA changes.

## Validation evidence

| Check / evidence | Passed | Failed | Skipped | Result |
| --- | ---: | ---: | ---: | --- |
| First consignment run, [TRX](consignment-remediation-first.trx) | 40 | 0 | 0 | Pass; before final additional cases. |
| Broad relevant API regression, [TRX](api-remediation-regression.trx) / [log](api-regression.log) | 888 | 2 | 0 | Two fixture failures diagnosed below; not concealed as a clean run. 890 total, about20m14s. |
| Corrected consignment + Merchant Directory regression, [TRX](api-corrected-regression.trx) | 47 | 0 | 0 | Both fixture corrections confirmed,2m38s. |
| Final consignment/wholesale allocation/fulfillment/shipped regression, [TRX](api-final-custody.trx) / [log](api-final-custody.log) | **148** | **0** | **0** | Final API changes;10m23s. |
| Full frontend suite, [log](web-full.log) | **4,333** | **0** | **7** | 373 files passed,1file skipped,4,340cases. Existing skips retained. This run precedes the final added refresh test and lint adjustment. |
| Final focused frontend suite, [log](web-final-focused.log) | **26** | **0** | **0** | ConsignmentPanel, Physical QA panel and Community moderation, after final UI changes. |
| API/test build, [log](api-build.log) | — | — | — | Pass. Two existing test warnings; final API run also rebuilt successfully. |
| Typecheck app + functions, [log](web-typecheck.log) | — | — | — | Pass, final generated types and UI code. |
| ESLint scoped frontend files, [log](web-lint.log) | — | — | — | Pass, zero errors/warnings. Empty log means clean exit0. |
| Production web build, [log](web-production-build.log) | — | — | — | Pass, four explicit flags true/true/true/false; static export, flag and SEO verifiers complete. |
| EF pending model changes, [log](ef-model-consistency.log) | — | — | — | Pass: no model changes since last migration. Design-only disposable connection name; no database update. |
| Live browser/API/SQL/PDF | — | — | — | Pass for synthetic workflow; physical hardware explicitly untested. |

Counts are per run, overlap, and must not be added into a unique-test total. Required SQL cases did not skip. The seven skips in the ordinary full frontend run remain reported; standalone conditional merchant-directory HTTP smoke tests require their loopback harness. No new skip was added. Reproduction commands and flag selections are in [verification-commands.md](verification-commands.md).

| Environment / use | Decision | Reason |
| --- | --- | --- |
| Local remediation code | **GO** | Implemented fixes, corrected regressions, real SQL concurrency/migration tests, local E2E and final static checks pass. |
| Controlled staging validation | **GO for validation only** | Use separately authorized staging deployment and synthetic records; complete migration, least-privilege, retained evidence and physical reader checks before promotion. No staging deployment was performed here. |
| Production deployment | **NO-GO** | Staging/promotion evidence and approved packaging/release are still outstanding. Existing mixed working tree must be deliberately reviewed and packaged. |
| First100 physical tags | **NO-GO** | Signed terms, named operators, actual destination, tracker/Finance process, physical stock/hardware/second count and approved production rollout remain outstanding. |


The broad regression selection covers B2C reservation/payment/assignment and activation, wholesale allocation/fulfillment/billing/documents, inventory Physical QA, business identity, authorization and consignment. It is a relevant regression selection, not a rerun of every API test in the repository. SQL tests use actual SQL Server LocalDB, ordinary Fact/Theory assertions and disposable `MyPetLinkTest_*` databases; required SQL scenarios have zero skips.

The two failures in the broad run were test fixture defects and are retained in the evidence: the new active rollback fixture omitted required AgreementVersionSnapshot=1; the existing historical Merchant Directory migration fixture manually dropped MerchantBranches before accounting for the new restrictive consignment FK. The fixture now guards its disposable database and removes/recreates that future FK only around its historical-schema exercise. Production migration logic was not relaxed. Both corrected fixtures pass in the47-case follow-up.

Initial frontend lint found synchronous branch-reset state inside an effect and an unescaped apostrophe. Branch reset now occurs in the selection event; copy uses a typographic apostrophe. Final lint was rerun. Initial build invocation used incorrect flag names and correctly failed closed. A subsequent build encountered a malformed generated `.next/dev/types/validator.ts`; restarting Next dev regenerated it, with no generated file manually edited. The final production build uses all four explicit supported flags. Existing Node module/type-stripping, jsdom navigation and SEO warnings are recorded in logs; they are not consignment failures.

### Live disposable browser/API run

See [live assertions](e2e-results.log), [SQL balance and zero-finance counts](e2e-stock-finance.log), [browser custody proof](browser-final-custody.jpg), [narrow-screen proof](browser-narrow-custody.jpg), and [rendered synthetic PDF](dispatch-note-synthetic-1.jpg).

Two synthetic operators, one synthetic merchant/branch, six synthetic received Passed tags, loopback API5192/web5191. Browser exercised maker self-approval403, reservation, refresh/retry, dispatch, returns, early release409, failed Physical QA save, approved return release and damaged write-off. The date entry for draft approval was completed through HTTP using the same maker after the browser date-control adapter did not commit its value. Independent approval and detailed receipt/discrepancy/handover/CSV assertions used authenticated real HTTP. This is mixed browser/API evidence, not a claim that every field was operated through the browser.

Final SQL balance: **3 central available + 2 partner-held + 1 WrittenOff = 6**. TagOrders, MerchantOrders, MerchantInvoices, MerchantReceipts, MerchantPayments, SalesCommissions and CommissionPayouts each contain **0**. Original PDF bytes remain identical after receipt, release and write-off. Agreement closure with the two partner-held units returns409.375px browser view has responsive navigation and no document-level horizontal overflow. Physical Android reader access was unavailable; positive reader inputs were synthetic. Expired local test JWTs and two probe request/SQL mistakes were corrected before final assertions; none was an application bypass.

Both foreground servers were stopped. The exact owned `MyPetLinkTest_Remediation_a6928d71bfea475e8e669f4706278920` database was deleted by a name-guarded cleanup harness; no other pre-existing test databases were removed. Local test JWT state was removed. See [cleanup log](e2e-cleanup.log). No external email or real business record was sent.

## Migration safety and release/rollback

Root [migration.sql](../../migration.sql) was regenerated from the current EF migrations; `database/migration.sql` remains non-authoritative. Fresh migration/idempotent replay SQL tests and the EF no-pending-model-changes check are part of validation. Up refuses duplicate active fingerprints with THROW51041 before modifying their claims. It does not auto-merge reservations, fabricate independent approvals, signed receipt evidence or historical PDF bytes. Review legacy rows before enabling new operations.

Use the [updated rollout and rollback instructions](../../docs/deployment/consignment-mvp-rollout.md): separately approved environment backup/preflight → migrations with `sqlcmd -I` → API → web → staging checks → explicitly reviewed capability grants. New grants do not silently flow to installed roles. Confirm branch/destination, approval and receipt operators, actual evidence retention, external tracker ownership and physical stock count.

Routine rollback retains additive schema/history. After any business use, freeze affected stock operations; never deploy an older API that ignores custody holds. Cancel only genuine unshipped reservations; reconcile real returns and inspection/release, then obtain a specific recovery plan. Both current Down methods refuse historical or active records. Do not delete data or edit EF migration history to evade the guard. Direct DBA destructive privileges and obsolete previously generated scripts remain outside that application safeguard.

## Remaining decisions and limits

1. Confirm signed initial35% terms: effective start, duration/end-date, settlement frequency/deadline, discount permissions, commission base/rounding/tax/customer-document responsibility, and return/loss/damage liability. No terms were silently filled in or changed.
2. Name two-person approval/receiving operators, Finance reconciliation owner/frequency, external tracker access, unique event-reference convention, signed artifact retention/location and verification process. A custody event or activation never establishes a verified financial sale.
3. Approve an investigation/resolution policy for permanent missing or damaged partner deliveries. Current workflow safely holds unresolved deliveries; write-off handles only stock actually returned and physically failed/reviewed. No financial loss allocation or permanent-shortage settlement is invented.
4. Complete staging deployment rehearsal and rollback-guard rehearsal on its own disposable data; inspect legacy active agreements/reservations/documents and existing duplicate fingerprints before migration.
5. Test intended Android QR camera/NFC hardware, the same chip reinspection, failed/damaged packaging and the actual100-tag carton/controlled manifest with a second physical count. Local simulated reader evidence cannot satisfy this gate.

## Change isolation and review

[changed-files.txt](changed-files.txt) lists only the34 implementation/test/doc files changed by this remediation. [remediation.patch](remediation.patch) compares them with remediation-start copies in `baseline/`, separating them from the earlier uncommitted B2B implementation. Five previously clean tracked files use their original HEAD content as baseline. Program.cs was not changed during remediation: its pre-existing Marketing Demo content and earlier consignment DI registrations are preserved. Other unrelated Marketing Demo, marketing, configuration and package changes remain untouched. Nothing is staged.

### Exact changed files

- [apps/api/MyPetLink.Api.Tests/ConsignmentAuthorizationTests.cs](../../apps/api/MyPetLink.Api.Tests/ConsignmentAuthorizationTests.cs)
- [apps/api/MyPetLink.Api.Tests/ConsignmentHttpTests.cs](../../apps/api/MyPetLink.Api.Tests/ConsignmentHttpTests.cs)
- [apps/api/MyPetLink.Api.Tests/PhysicalQaHttpTests.cs](../../apps/api/MyPetLink.Api.Tests/PhysicalQaHttpTests.cs)
- [apps/api/MyPetLink.Api.Tests/Relational/ConsignmentRelationalTests.cs](../../apps/api/MyPetLink.Api.Tests/Relational/ConsignmentRelationalTests.cs)
- [apps/api/MyPetLink.Api.Tests/Relational/ConsignmentRemediationRelationalTests.cs](../../apps/api/MyPetLink.Api.Tests/Relational/ConsignmentRemediationRelationalTests.cs)
- [apps/api/MyPetLink.Api.Tests/Relational/MerchantDirectoryRelationalTests.cs](../../apps/api/MyPetLink.Api.Tests/Relational/MerchantDirectoryRelationalTests.cs)
- [apps/api/MyPetLink.Api/Auth/AdminCapabilities.cs](../../apps/api/MyPetLink.Api/Auth/AdminCapabilities.cs)
- [apps/api/MyPetLink.Api/Auth/AdminCapabilityCatalog.cs](../../apps/api/MyPetLink.Api/Auth/AdminCapabilityCatalog.cs)
- [apps/api/MyPetLink.Api/Auth/AdminRoleTemplates.cs](../../apps/api/MyPetLink.Api/Auth/AdminRoleTemplates.cs)
- [apps/api/MyPetLink.Api/Controllers/Admin/AdminConsignmentController.cs](../../apps/api/MyPetLink.Api/Controllers/Admin/AdminConsignmentController.cs)
- [apps/api/MyPetLink.Api/DTOs/ConsignmentDtos.cs](../../apps/api/MyPetLink.Api/DTOs/ConsignmentDtos.cs)
- [apps/api/MyPetLink.Api/Data/MyPetLinkDbContext.Consignment.cs](../../apps/api/MyPetLink.Api/Data/MyPetLinkDbContext.Consignment.cs)
- [apps/api/MyPetLink.Api/Entities/ConsignmentEntities.cs](../../apps/api/MyPetLink.Api/Entities/ConsignmentEntities.cs)
- [apps/api/MyPetLink.Api/Migrations/20261017082802_AddConsignmentAgreementAndCustody.cs](../../apps/api/MyPetLink.Api/Migrations/20261017082802_AddConsignmentAgreementAndCustody.cs)
- [apps/api/MyPetLink.Api/Migrations/20261017103941_HardenConsignmentOperationalControls.Designer.cs](../../apps/api/MyPetLink.Api/Migrations/20261017103941_HardenConsignmentOperationalControls.Designer.cs)
- [apps/api/MyPetLink.Api/Migrations/20261017103941_HardenConsignmentOperationalControls.cs](../../apps/api/MyPetLink.Api/Migrations/20261017103941_HardenConsignmentOperationalControls.cs)
- [apps/api/MyPetLink.Api/Migrations/MyPetLinkDbContextModelSnapshot.cs](../../apps/api/MyPetLink.Api/Migrations/MyPetLinkDbContextModelSnapshot.cs)
- [apps/api/MyPetLink.Api/Services/ConsignmentDocumentService.cs](../../apps/api/MyPetLink.Api/Services/ConsignmentDocumentService.cs)
- [apps/api/MyPetLink.Api/Services/ConsignmentService.Evidence.cs](../../apps/api/MyPetLink.Api/Services/ConsignmentService.Evidence.cs)
- [apps/api/MyPetLink.Api/Services/ConsignmentService.cs](../../apps/api/MyPetLink.Api/Services/ConsignmentService.cs)
- [apps/api/MyPetLink.Api/Services/InventoryCustodyRules.cs](../../apps/api/MyPetLink.Api/Services/InventoryCustodyRules.cs)
- [apps/api/MyPetLink.Api/Services/MerchantDocumentRenderer.cs](../../apps/api/MyPetLink.Api/Services/MerchantDocumentRenderer.cs)
- [apps/api/MyPetLink.Api/Services/MerchantFulfilmentService.cs](../../apps/api/MyPetLink.Api/Services/MerchantFulfilmentService.cs)
- [apps/api/MyPetLink.Api/Services/MerchantSalesService.cs](../../apps/api/MyPetLink.Api/Services/MerchantSalesService.cs)
- [apps/api/MyPetLink.Api/Services/TagOrderInventoryAvailabilityService.cs](../../apps/api/MyPetLink.Api/Services/TagOrderInventoryAvailabilityService.cs)
- [apps/web/src/components/admin/merchantSales/ConsignmentPanel.test.tsx](../../apps/web/src/components/admin/merchantSales/ConsignmentPanel.test.tsx)
- [apps/web/src/components/admin/merchantSales/ConsignmentPanel.tsx](../../apps/web/src/components/admin/merchantSales/ConsignmentPanel.tsx)
- [apps/web/src/lib/adminCapabilities.ts](../../apps/web/src/lib/adminCapabilities.ts)
- [apps/web/src/lib/communityModeration.test.ts](../../apps/web/src/lib/communityModeration.test.ts)
- [apps/web/src/services/adminConsignmentService.ts](../../apps/web/src/services/adminConsignmentService.ts)
- [docs/architecture/consignment-mvp.md](../../docs/architecture/consignment-mvp.md)
- [docs/deployment/consignment-mvp-rollout.md](../../docs/deployment/consignment-mvp-rollout.md)
- [docs/operations/configuration-inventory.md](../../docs/operations/configuration-inventory.md)
- [migration.sql](../../migration.sql)

