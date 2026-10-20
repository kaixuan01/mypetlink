# Stage 1 correctness fixes and Stage 2 consignment MVP

17 October 2026. Project: C:\Project\MyPetLink. Local implementation only.

## Outcome and dispatch decision

The five approved Stage 1 defects are addressed. Stage 2 adds versioned agreements,
individual tag custody, controlled documents, receipt acknowledgment, reconciliation
references and inspected returns within the existing Merchant Sales workspace.

**First 100 physical tags: NO-GO at this handoff.** No real partner agreement or stock
movement has been created. The commercial terms remain unconfirmed, and production
migration, deployment and operational checks require separate approval. Complete
`docs/deployment/consignment-mvp-rollout.md` before any real dispatch.

Nothing was staged, committed, pushed or deployed. Production data was not changed.
Database verification used disposable MyPetLinkTest_* databases on local SQL Server
LocalDB. Existing unrelated checkout changes were preserved.

## Stage 1 changes and evidence

| Defect | Result | Evidence |
| --- | --- | --- |
| Wholesale consumes B2C reservations | Wholesale allocation and bulk outbound movement preserve outstanding retail SKU quantities under the existing stock locks. Consignment uses the same protection. | ExistingRetailReservationCannotBeConsumedByWholesaleOrConsignment; real concurrent checkout/wholesale/consignment test; existing merchant allocation concurrency regressions. |
| Quote line/header precision mismatch | Reject money with more than two decimal places before saving; applies to unit price, line discount, order discount and delivery fee. | Four precision cases in ConsignmentCorrectnessTests, plus existing quotation/billing/document tests. |
| Cancelled invoice looks payable | Cancelled status, original total clearly labeled, no bank/payment instructions, explicit do-not-pay notice. Replacement invoice gets a different number. | CancelledInvoiceHasNoPayableInstructionsAndCannotBeMistakenForReplacement. |
| Stale Delivery Order | Releasing allocations voids the previous document. Shipping retains void history and issues a fresh immutable copy with actual tracking and batch details inside a retryable transaction. Voided PDFs carry a warning and omit the receiving block. | DeliveryOrderChangesAreVoidedAndFinalShipmentFreezesActualBatchesAndTracking, merchant fulfilment/document/shipped-email regressions. |
| Conflicting lifecycle/owner mutations | Generic mutation paths reject live custody; direct assignment checks SQL rowversion. Allocation touches the tag row to serialize against concurrent assignment/activation. Wholesale shipment rechecks QA and unavailable lifecycle states. | Custody mutation guard, stale token, QA and assignment/activation regressions. |

The existing supported early activation of wholesale stock is retained. An activation
does not become evidence of a sale.

## Stage 2 behavior

- Reuses Merchants; no second partner directory, partner account or partner portal.
- Agreements have partner-specific percentages, start/end dates, version, status,
  signed reference and typed commercial terms. Drafts expose pending terms. Approval
  requires every required term and reference; approved terms cannot be edited.
  Approval of a successor closes its prior active version. Existing dispatches keep
  immutable agreement, seller, SKU, batch, destination and percentage snapshots.
- The UI proposes 35% for the initial partner, with an explicit confirmation reminder.
  The API requires an explicit percentage. No global rate or binding commercial terms
  are seeded. Unconfirmed duration, frequency, deadlines, discounts and return/loss
  rules remain pending. The complementary MyPetLink share is displayed.
- Reservation selects exact eligible tags, with deterministic automatic selection or
  explicit tag IDs through the API. The Admin form supports multiple SKU quantities.
  Received, commercial, QA Passed, unowned, available QR + NFC stock is required.
  The reservation request is protected by a fingerprint-bound idempotency key.
- Reserved, dispatched, received, returned-quarantine and external-handover units
  remain excluded from central stock until an authorized release. Dispatch is custody,
  with a distinct document number; it creates no sale, invoice, receipt, payment,
  revenue, salesperson commission or settlement record.
- Partner receipt acknowledgment records an evidence reference. An external customer
  handover attaches the external tracker entry to specific units without representing
  a financial sale. Activated units lacking that reference are highlighted.
- Cancellation releases only unshipped reservations. Physical returns reset inspection
  evidence and enter quarantine. Release requires a new Passed inspection after the
  return, an unchanged unowned lifecycle and separate authorization. Activated/customer-
  owned tags cannot enter the stock-return process.
- The non-payable PDF reuses the merchant QuestPDF layout. Normal detail/list responses
  omit Tag Codes. Manifest view, CSV and PDF require a separate export capability and
  are audited. CSV applies the shared spreadsheet-formula sanitizer. No private owner,
  pet or finder fields enter the new projections.
- The responsive Admin panel handles loading, empty, success and failure states,
  pending terms, confirmations, pagination, concurrency conflicts and controlled
  downloads. It uses real API endpoints and existing UI/auth patterns.

## Security, API and inventory safety

Eight capabilities cover view, agreement management, allocation, dispatch,
reconciliation, return, release and manifest export. Each sensitive endpoint names
its specific capability and also requires consignment.view. Authorization uses the
current JWT subject and current database access. No role-name checks were introduced.
The actor cannot be supplied in a request. Writes retain UTC timestamps, current
rowversion checks and atomic audit/movement history.

Existing installed roles are not automatically broadened. Reviewed grants are a
deployment prerequisite. Custom agreement editors need sales.view for the existing
Merchant selector; stock allocators need catalog.view for the existing SKU selector.
Physical QA remains separately authorized through inventory.qa.manage.

The new API is under `/api/v1/admin/merchant-sales/consignment`, with agreement and
dispatch list/create/detail/action endpoints. Lists use page/pageSize and the existing
response envelope. Validation, not-found, conflict and forbidden responses use the
existing application error conventions. Downloads are authenticated files.

Consignment commands use retryable SQL transactions, a global consignment application
lock and deterministically ordered existing SKU locks. The global lock deliberately
trades throughput for simple MVP serialization. Unique active custody and document/
idempotency indexes supplement command validation. Tag rowversion updates protect
against cross-table races with legacy assignment/activation. Central eligibility,
catalogue, checkout, wholesale selection and retail assignment observe custody holds.

Actual SQL tests cover exclusive 100-tag allocation, B2C reservations, overlapping
wholesale/consignment claims and three simultaneous real checkout/wholesale/consignment
claims against the same four tags. They also cover stale tokens, failed QA, return
inspection, cancellation, revisions, activation without sales, and document controls.
New relational release tests fail when SQL Server is unavailable instead of skipping.

## Database changes

Migration: **20261017082802_AddConsignmentAgreementAndCustody**.

Adds ConsignmentAgreements, ConsignmentDispatches, ConsignmentUnits and
ConsignmentMovements, with restrictive foreign keys, bounded fields, percentage/date/
status/release checks, rowversions and lookup/unique indexes. A composite movement-to-
unit relationship prevents cross-dispatch unit references. No destructive change or
business-data backfill is included. No actual Merchant, agreement, rate or stock claim
is seeded. Existing order/financial history is unchanged.

The EF snapshot and root migration.sql were regenerated together. Model drift check
reports no pending changes. Tests migrated a fresh SQL database, then replayed the
entire root idempotent script without business-data changes. The stale script in
database/ was not used. These are SQL Server migrations, not MySQL scripts.

## Validation record

Runs overlap; the counts below must not be added as a unique total.

| Evidence file | Result | Scope |
| --- | --- | --- |
| b2b-consignment-baseline.trx | 528 passed; 0 failed; 0 skipped | Existing merchant quotation, invoice/payment/receipt, fulfilment, documents, shipped email, activation, physical QA, inventory, costing and SQL concurrency regressions. |
| consignment-verified.trx | 175 passed; 0 failed; 0 skipped | Consignment, corrected migration/DO tests, monetary/document tests, authorization, seeding and financial access policies. |
| consignment-last-validation.trx | 27 passed; 0 failed; 0 skipped | Final consignment unit/authorization/real SQL tests after making an omitted percentage invalid. |
| b2c-custody-regression.trx | 209 passed; 0 failed; 0 skipped | Focused customer order, payment reservation, stock administration and tag-ownership regressions. |
| web-tests.log | 386 passed in 25 files | Merchant Sales workspace, new consignment panel, capability navigation, tag activation, catalogue/order reservation and admin tag assignment. |
| typecheck.log | Passed | Application and functions TypeScript checks. |
| lint.log | Passed | Changed frontend sources and tests. |
| web-build.log | Passed | Optimized static export; tag/order flags on, Social off; release flags, social routing and SEO verification passed. |
| ef-model-check.log | Passed | No model changes since the migration. |

The final API test command also builds the API and test project. Existing warnings
remain in ReservedHandleAssignmentTests (async without await) and SocialScaleRelationalTests
(interpolated SQL in a test). The web build retains existing Node module/experimental
warnings and the documented SEO-M4 thin-content warning; none failed the checks.

One earlier expanded run, consignment-final.trx, recorded 357 passes and two failures.
Both were test-fixture errors: the DO test had no issued invoice, and the script replay
test reopened its connection between GO batches. Both were corrected and passed in
consignment-verified.trx and consignment-last-validation.trx. Earlier evidence is retained
for traceability. The initial unconfigured web build correctly required explicit release
flags; the recorded build log is the successful explicit-profile run.

A generated one-page, 100-unit dispatch note was rendered to an image and visually
inspected: logo, two-batch quantities, receiving block, footer and custody-only notice
were legible and unobstructed. This was synthetic test data, not a real dispatch note.
Component tests and export verification passed; live staging browser/mobile verification
is still an operational release gate.

## Deployment prerequisites and rollback

Full runbook: `docs/deployment/consignment-mvp-rollout.md`.

1. Obtain separate rollout approval, back up the intended SQL database and review the
   additive migration. Apply schema before the new API, then deploy the web app.
2. Confirm the actual effective seller identity, physical stock receipts/inspection and
   reviewed staff capabilities. Do not rely on changed templates to alter existing roles.
3. Complete staging inventory, concurrency, manifest, authorization, return and responsive
   browser checks. Verify the deployed API excludes active custody from every sellable pool.
4. Agree and sign the actual partner's pending terms and restricted external tracker
   process. Use the existing Merchant and exact destination. No sample terms from tests
   may be copied as binding defaults.
5. Follow the first-100 checklist in the runbook, with exact eligible stock, second count,
   manifest match, non-payable note, physical dispatch and actual partner receipt.

Rollback before business use can remove access and revert application code after
confirming no active holds. Preserve the additive schema/history by default. After
reservation or dispatch, **do not deploy old inventory logic that ignores holds and
do not drop/delete custody tables**. Freeze affected stock operations and reconcile
every unit. Cancel only unshipped reservations; receive, inspect and explicitly release
actual returns. Approve a specific rollback after reconciliation. Preserve all evidence.

## Deferred work

Stage 3: explicit retail sale/import events, discount/refund policies, duplicate financial
reference controls, aggregate commission rounding, statements, settlements, partial
remittances, bank allocation and aging. Obtain qualified business/accounting decisions
on issuer, principal/agent, tax and e-Invoice treatment before automating these.

Stage 4: branch analytics, loss/write-off handling, partial wholesale shipments, tier
approvals, optional isolated partner portal and accounting/MyInvois integration.
Payment gateway/CardBiz work remains separate. No Stage 3/4 implementation is included.

## Changed files

The adjacent changed-files.txt identifies this task's sources, tests, migration and
documents. It excludes unrelated pre-existing marketing/configuration changes and
older artifacts. Program.cs already had unrelated edits; this task added only the
ConsignmentService and ConsignmentDocumentService registrations. No new UI library,
package dependency, public route or production configuration was added.
