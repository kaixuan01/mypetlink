# Consignment MVP rollout and rollback

Local implementation only. This document does not authorize production deployment or dispatch.

## Migration and access prerequisites

SQL Server EF migration AddConsignmentAgreementAndCustody adds four tables, restrictive
relationships, indexes, check constraints and rowversions. No partner, agreement, stock,
financial balance or global rate is seeded. Existing history is not reclassified.
Root migration.sql is authoritative; database/migration.sql is stale. No MySQL scripts.

The follow-up migration 20261017103941_HardenConsignmentOperationalControls adds
independent approval/receipt metadata, a validated Merchant Branch destination,
issued PDF bytes/hash, discrepancy state and append-only external handover records.
Review and apply all four migrations from the current root script. If duplicate active
reservation fingerprints already exist, the follow-up fails before changing them.
Review the cartons and cancel only confirmed duplicate unshipped reservations, then
retry. No migration merges claims or manufactures missing evidence.

The third migration, 20261017160448_CompleteConsignmentReceivingAndApproval, adds
version-specific draft contributors and per-unit receiving classifications/issue recorders.
New drafts collect their creator and every substantive editor; old drafts have incomplete
history and require a fresh version. Existing unambiguous custody states backfill only known
receiving facts. Existing open discrepancies become ReviewRequired, retaining the last
recorded issue operator where available. Review those units independently using actual
partner/return evidence; an unknown recorder fails closed and needs a separately reviewed
recovery plan. No migration fabricates a missing/good count, signed evidence or contributor.

Migration 20261018125029_AddConsignmentSalesReportingLedger (sales reports, Phase 1A) adds
four tables — ConsignmentStockLedgerEntries (append-only, with a trigger), ConsignmentPriceTerms,
ConsignmentSalesReports and ConsignmentSalesReportLines — and three nullable columns:
ConsignmentReviewEvents.SubjectType/SubjectId and ConsignmentHandoverRecords.Attribution. It also
rebuilds IX_ConsignmentReviewEvents_DispatchId_Action_RequestReference as (DispatchId, Action)
INCLUDE (RequestReference): the old key could reach 2,096 bytes, past SQL Server's 1,700-byte
limit. Nothing is seeded. Its Down step refuses (THROW 51044) once any sales report, price,
ledger entry, subject review or handover attribution exists. Deliveries received before this
migration are not in SKU stock until an operator with consignment.sales_reports.verify runs
"Bring into stock tracking" for that branch; it is idempotent. New capabilities
consignment.price_terms.manage, consignment.sales_reports.record and
consignment.sales_reports.verify are added to no ordinary built-in role template (Operations,
Administrator, Sales and the others); grant them explicitly through Access Management. Super Admin
holds them already, as it resolves every catalogue capability. That does not make a Super Admin
independent of their own work: Team Mode still refuses approval or verification by any
contributor, Super Admin included, and self-review still needs Solo Mode's explicit nomination.
Approving a price reuses consignment.agreements.approve. Starting a sales report correction needs
consignment.sales_reports.verify; editing and recording the correction needs
consignment.sales_reports.record.

Migration 20261018164233_HardenConsignmentSalesReporting (Phase 1A remediation) is additive and
follows the Phase 1A migration; it does not rewrite it. It adds ConsignmentRecordContributors
(creators, substantive editors and recorders of price terms and sales reports; append-only in EF),
ConsignmentSalesReportLines.SealedReturnConfirmed/SealedReturnEvidence with the check constraint
CK_ConsignmentSalesLine_SealedReturn, and widens UX_ConsignmentSalesReportLines_Line to include
RefundOfPeriodStart (filter [PriceTermId] IS NOT NULL), so one report can refund sales from two
periods at the same price. It backfills creators and recorders already on record; editors before
this migration were never stored and are not invented. Restocked refund lines entered before
sealed confirmation existed are labelled "Entered before sealed-return confirmation was required"
with SealedReturnConfirmed = 0, never marked confirmed; an unverified one must be corrected before
it can be verified. Its Down step refuses (THROW 51045) once any contributor row or sealed-return
value exists. Deploy it with the Phase 1A migration, API and web together: the web now sends
sealed-return fields and a correction reason, and reads per-unit tracking.

Migration 20261019010452_ProtectConsignmentContributorHistory (final Phase 1A remediation) is
additive. It adds the append-only trigger TR_ConsignmentRecordContributors_AppendOnly
(THROW 51046 on UPDATE or DELETE), ConsignmentPriceTerms.ContributorHistoryComplete and
ConsignmentSalesReports.ContributorHistoryComplete/StartsFreshContributorHistory. The column
default (0) marks every price term and report that already exists as having unknown contributor
history, because its editors were never recorded; the application writes 1 for every new record.
A clean installation or an upgrade from the Solo schema has no such records, so nothing is
restricted. Where earlier Phase 1A records exist, in Team Mode nobody can approve or verify them:
withdraw a draft price and add it again, or dispute a recorded report and use "Re-enter from
evidence" (consignment.sales_reports.verify, with a reason; audited on both versions). In Solo Mode
the named founder may self-review them with the record's own evidence. Its Down step refuses
(THROW 51047) once any price, report or contributor row exists.

Migration 20261019025050_AddConsignmentStocktakeAndCarryForward (Phase 1B) is additive. It adds four
tables — ConsignmentStocktakes, ConsignmentStocktakeLines, ConsignmentStockDiscrepancies and
ConsignmentDiscrepancyResolutions — one nullable column, ConsignmentSalesReportLines.CorroboratedByStocktakeId,
and allows 'ConsignmentStocktake' as a contributor subject. Three SQL triggers keep closed months
immutable: TR_ConsignmentStocktakes_Closed (51050), TR_ConsignmentStocktakeLines_Frozen (51049) and
TR_ConsignmentDiscrepancyResolutions_AppendOnly (51048). Nothing is seeded or backfilled. Its Down step
refuses (THROW 51051) once any stocktake, discrepancy, resolution or stocktake contributor exists.
Migrations roll back one at a time: if an earlier guard refuses, later empty migrations may already be
rolled back, so check __EFMigrationsHistory and reapply Up rather than assume nothing changed.

Migration 20261019060824_HardenConsignmentStocktakeReconciliation (Phase 1B remediation) is additive.
It adds ConsignmentStocktakes.CountedAt and CountedAfterCutoffNote (nullable: only counts entered
before it lack them, and those can't close a month), ConsignmentDiscrepancyResolutions.ReversesResolutionId
with a self-reference, unique filtered indexes for one link per report version and discrepancy and one
withdrawal per link, and a check that only withdrawals reverse a link. It replaces the two stocktake
triggers with versions that also refuse adding, moving, re-counting or removing lines outside a draft
and changing a recorded or discarded count (51052); 51049 and 51050 are unchanged. Nothing is seeded
or backfilled. Its Down step refuses (THROW 51053) once any count time or withdrawn link exists, then
restores the earlier triggers exactly.

New capabilities consignment.stocktake.record, consignment.periods.close and
consignment.discrepancies.resolve are added to no ordinary built-in role template; Super Admin resolves
them like every catalogue capability. Grant them explicitly. In Team Mode the person who counted,
edited or recorded a stocktake can't close it or resolve what it found.

Monthly routine: verify the month's sales reports, then on the 15th or last day of the month record the
shop's count by SKU (Stocktake & reconciliation → Record stocktake) with its evidence and the actual
time it was counted, then close the month. If the shop can only count the next morning, record that
real time and how you know nothing was sold, delivered or returned since midnight; otherwise count
again on the next count date. Never enter a later count as if it were taken on the count date.
Investigate each discrepancy until it is resolved with new evidence. When a late report arrives for a
closed month, link it to what that count found only where the partner's records show it accounts for
it. Ship the API, web and both Phase 1B migrations together with the three Phase 1A migrations.

Migration 20261023171109_AddConsignmentDeliveryOrders is additive. It adds ConsignmentDeliveryOrders
(one issued Delivery Order per dispatch: unique dispatch, unique number, delivered quantity > 0, the
snapshot, PDF bytes and hash) with an append-only trigger (51059). Nothing is seeded or backfilled:
historical deliveries get a Delivery Order only when an operator generates one. Its Down step refuses
(THROW 51060) once any Delivery Order exists. No new capability or configuration: generating uses
consignment.dispatch and downloading consignment.view. Ship the migration, then API, then web.

Migration 20261024151533_AddDocumentSignatures is additive and ships with the Delivery Order. It adds
DocumentSignatures (each administrator's own signature versions: at most one on file per administrator,
image erased when retired, history trigger TR_DocumentSignatures_History THROW 51061) and six nullable
signing columns on ConsignmentDeliveryOrders (signature, signer, signing time, printed name and
position, image SHA-256) with a check constraint that a signed Delivery Order is signed in full, by its
issuer, at its issue time. Check constraints also require every retired signature version to record
exactly Replaced or Removed, and every name, position and fingerprint to be present and well formed.
They are created with the tables, so they validate existing rows: existing Delivery Orders are unsigned
and pass. Nothing is seeded; existing rows stay unsigned. Its Down step refuses
(THROW 51062) once any signature has been saved or any Delivery Order signed. It adds one capability,
document_signature.manage, which no built-in role template grants: after deployment, grant it only to
the administrators who will sign (Super Admin already holds it). Each signer then adds their own
signature under Configuration > My Signature. Generating a signed Delivery Order also needs
consignment.dispatch. No configuration value or storage bucket is involved: images stay in SQL Server.

Operating decisions (approved 24 October 2026):
- The first consignment handover on 23 October 2026 keeps its paper Delivery Order MPL-DO-2026-000001
  as the original record. Do not generate a system Delivery Order for that dispatch; there is no legacy
  reference import.
- A Delivery Order may be generated after dispatch and before receipt. Unconfirmed counts, inspection
  confirmations and signatures stay blank or marked unverified. The issued copy never changes: record
  later receiving evidence through receiving, and keep the signed paper or scanned copy in controlled
  business storage. A downloaded Delivery Order is not proof of signing.
- The shared Delivery Order series keeps its format. Numbers already committed are never reset or reused.

Use sqlcmd -I (QUOTED_IDENTIFIER ON) for deployment and manual support scripts;
filtered indexes require the correct SQL session settings. Never use a script that
changes production data without separately approved scope.

Approved rollout: backup and preflight, migration first, API next, web next, then approved
staging/production checks. All agreements begin Draft with unconfirmed terms pending.
New-install Operations templates include custody actions, Administrator includes agreement
draft editing. Independent approval uses consignment.agreements.approve; damaged-return
write-off uses consignment.write_off. Existing installed roles are deliberately not broadened automatically; Super
Admin already resolves the full capability catalog. Grant reviewed capabilities explicitly
through Access Management, preserving custom role decisions.

Custom roles need consignment.view alongside each intended action capability.
Agreement editors also need sales.view for the existing Merchant selector; stock
allocators need catalog.view for the existing tag-option selector. Manifest access
is separately controlled by consignment.manifest.export. Physical inspectors use
the existing inventory.qa.manage capability; inspection does not release custody.
Branch selection also uses sales.view. Code-free issued PDFs require consignment.view;
Tag Code manifests and reconciliation CSVs require consignment.manifest.export.

In Team Mode, agreement approval excludes the creator and every substantive draft editor, even for
Super Admin. A no-op Save does not change that. Partner receipt operators differ from the
dispatcher. Issue resolution additionally differs from the affected unit's issue recorder:
plan for three distinct authorized operators when discrepancies occur. Solo Mode is the explicit scoped alternative below. No role-name bypass.

Receiving requires actual recipient/date, signed evidence reference and disjoint good,
damaged and missing unit IDs. Counted quantity includes damaged units. Example:100 dispatched,
98 good +1 damaged physically present +1 missing =99 counted,1 damaged,1 missing. Confirmed
good units can proceed; the others retain their holds. Exact retries reopen recorded evidence;
use a fresh event reference for a new finding. Unconfirmed stock is not acknowledged implicitly.

Record actual physical returns separately and inspect them through Physical QA. A missing
unit located centrally needs explicit actual return evidence; it is never automatically
returned by a count adjustment. An independent reviewer can resolve the selected damaged
unit as physically returned, with zero of those selected units counted at the partner.
A separately located good missing unit may be received by review with its actual count.
Partial resolution leaves the remaining shortage open. A QA Passed result alone does not clear a receiving investigation: complete independent
review before releasing the affected return. Failed returns may be separately
written off; they do not block unrelated confirmed good units. Permanent unlocated shortages,
liability and money adjustments await an approved policy, never a fabricated full recount.
The application retains external evidence references and applies no signatures automatically.

Legacy active agreements without independent approval metadata need a reviewed new
version before new reservation/dispatch. Legacy reservations without a branch must be
reviewed/cancelled and reserved against the approved version and correct active branch.
Existing shipped custody can still be reconciled and returned. Legacy deliveries with
no archived issued PDF cannot be silently re-rendered as if a historical copy existed;
retain their actual original outside the app pending an explicit document-review workflow.

Approve a revision only after all prior-version unshipped reservations are dispatched
while valid or explicitly cancelled. Expiry never gains an automatic grace period.
Manual agreement closure requires reservations, partner-held and quarantined units to
be reconciled. Superseding an agreement after dispatch preserves that stock under its
original version and permits receipt, handover, corrections and returns; it does not
rewrite the original rate/terms or prove financial settlement.

## Release gates

At reservation/allocation time Passed stock remains protected for prior retail commitments.
At dispatch validate the already-held units, not a later unrelated retail inspection backlog.
Confirm the100/98-good/1-damaged/1-missing case, damaged physical return, independent partial
resolution, unchanged PDFs, same-unit races and honest reused-reservation messages in staging.

Run ConsignmentRelationalTests against disposable local SQL Server. They deliberately use
ordinary Fact attributes so unavailable SQL Server fails instead of silently skipping.
Run merchant allocation/fulfilment/billing/document, B2C reservation/payment/assignment,
owner activation, physical QA and authorization regressions. Inspect skipped counts.
Run component tests, type checking, lint and narrow-screen Admin verification. Confirm
exact stock exclusion, protected B2C quantities, concurrent claim handling, authorized
manifest access, fresh return QA and absence of financial effects from dispatch.

## First 100 tags: explicit go/no-go

NO-GO until every entry is complete:
- [ ] Local test evidence and approved staging checks pass. Production migration/deploy
      separately approved, performed and verified.
- [ ] Actual existing Merchant and physical delivery destination selected.
- [ ] Signed 35% agreement includes effective start, duration/end-date policy, settlement
      frequency, deadline, discount permissions and return/loss responsibility. Confirm
      commission base/rounding and tax/customer-document responsibilities externally.
- [ ] Team operators named, or Solo Mode explicitly enabled for the authorized founder; actual signed
      receipt retention and per-unit partial receiving/investigation procedure ready.
- [ ] Restricted external sales/settlement tracker and Finance reviewer ready.
- [ ] Named operators have least-privilege capabilities; independent count or Solo partner-countersigned count arranged.
- [ ] Exactly 100 correct SKU/variant tags received, QA Passed and available after existing
      retail reservations, wholesale allocation and other consignment holds. Pending QA
      stock never substitutes for Passed stock required by committed customer orders.
- [ ] Controlled manifest matches carton and contains no duplicate codes.
- [ ] Non-payable dispatch note retained; no proxy invoice, receipt, payment, sale or commission.
- [ ] Physical dispatch recorded; actual partner receipt acknowledgment obtained afterward.
- [ ] Immutable issued PDF downloaded and archived. Matching allocation keeps the existing
      wholesale Delivery Order number; shipment details remain recorded on the shipment.
- [ ] Reconciliation owner/frequency agreed; quarantine and fresh inspection understood.
- [ ] Unique per-tag external entry references, actual event dates, optional unverified
      sale price/discount and correction/reversal references reconciled. No duplicate
      external entries, inferred sales from activation, or automated money postings.
- [ ] Real returned-tag QR/NFC inspection and chip identity checked on the intended
      Android hardware in staging; failed/damaged physical returns remain quarantined
      or are separately authorized for write-off, never released to available stock.

## Rollback

Before business use: remove consignment access, stop writers and roll back web/API only
when no active custody holds exist. Retain additive tables and history by default.
After reservation/dispatch: never drop tables/delete holds or deploy an API that ignores
consignment inventory, because it could resell held tags. Freeze affected stock operations,
reconcile every active unit, cancel only unshipped reservations, receive actual returns,
inspect and release where appropriate, then approve a specific rollback plan. Preserve
movement history, manifests, external references, financial evidence and tag ownership.
No destructive Down migration is a routine business rollback.

All four consignment Down methods enforce this rule in SQL: table locks and THROW 51040
block rollback whenever any agreement/custody/movement/reconciliation history exists,
including released or written-off history. Empty unused schemas alone may be removed.
Use the current migration assembly; discard older unguarded rollback scripts. Do not
delete history to evade this guard, or edit __EFMigrationsHistory to claim a downgrade.
The guard does not make old API inventory logic safe: keep the stock-operation freeze
and retain current hold-aware inventory code until a separately reviewed recovery plan
has completed. Direct DBA DROP/DELETE privileges must remain outside routine app use.

## Enabling Solo Operator Mode

Local implementation is approved; deployment remains separately controlled. Apply the
fourth additive migration and matching API/web together after independent review and
staging verification. Do not activate Solo through an environment variable or direct
SQL update. Existing installations stay Team until an explicit Admin decision.

1. Sign in with `consignment.view` and `consignment.approval_policy.manage`.
   The latter is sensitive, granted to no ordinary role template. Super Admin resolves
   it through the existing catalogue. A delegated operator needs a reviewed role grant.
2. Open Admin → Merchant Sales → Consignment → Consignment approval policy. Check the
   current mode, authorized founder and change history. Confirm the founder is active
   and has `consignment.self_review` plus the intended ordinary approval/reconcile
   capabilities. A non-Super founder needs the sensitive capability granted explicitly
   through existing Access Management by an authorized operator. No role is broadened
   by enabling Solo, and nobody gains a self-role-edit exception.
3. Choose Solo, explicitly choose the one founder and record the operating reason.
   Review the warning, then confirm. This nomination is the additional explicit
   authorization: Super Admin status or a role capability alone never enables self-review.
4. For each review of that founder's own work, check the Solo attestation box and enter
   a reason plus the exact actual partner acceptance/acknowledgment/evidence reference.
   Review the full term summary before agreement approval. Keep original signed artifacts
   in restricted business storage. This application stores references, not signatures.
5. Receipt evidence must name the actual partner recipient and real date/counts, including
   damaged units. For a discrepancy, obtain new supporting evidence, identify the exact
   located good or physically returned units and retain unresolved holds. Never re-use
   the original finding as self-resolution evidence. Quarantined returns still need fresh
   Physical QA and explicit release/write-off authorization as appropriate.
6. Verify `Self-reviewed (Solo)` on the agreement or receiving history. Download the
   controlled review log and reconciliation for the actual period. Reconcile with the
   partner monthly and arrange periodic external accountant review; agree the named
   reviewer, cadence, retention and shortage/liability decisions before real use.
7. When independent staff are available, select Team, record a reason and confirm. New
   self-review stops immediately and the nomination clears; old Solo evidence stays.
   Re-enabling Solo requires a fresh explicit nomination and confirmed policy change.

If the founder loses capability or active access, self-review fails closed even if the
policy still says Solo. Restore reviewed access or switch to Team; do not edit evidence.
Refresh after stale-write conflicts and review the current policy before trying again.

Migration seeds no founder or business/financial event. It preserves old approval,
PDF, custody and contributor evidence without guessing a historical review mode.
The new Down guard blocks on any journal/policy-change or historical consignment
business data. Retain the additive schema and policy-aware API after use. Routine
rollback is switch to Team and stop affected work; do not restore an older API that
cannot read Solo evidence or drop review history. The existing inventory hold/rollback
protections remain in effect. Rehearse fresh/upgrade/idempotent script and blocked
Down paths on disposable SQL Server before any separately approved deployment.

## Agreement document for signature (local only, 19 October 2026)

Not deployed. Production deployment needs separate authorization.

- **Migration** `20261019110531_AddConsignmentAgreementDocuments` adds `ConsignmentAgreementDocuments`
  and `ConsignmentSignedAgreements` with restrictive foreign keys, append-only triggers (51054) and a
  guarded Down (51055 once any issued or signed agreement exists). It changes no existing table and
  seeds nothing. The root `migration.sql` carries its idempotent section.
- **Order.** Apply the migration before the API that writes the new tables; the web build can follow.
  An older API ignores the new tables, so rolling the API back is safe; the schema stays.
- **Before first use** confirm Admin → Business identity has the legal business name, registration
  number and complete registered address, and that each partner merchant record has its legal name,
  registration number and billing address. The document refuses to generate without them. No
  signatory is configured: the signature blocks are blank and filled in by hand.
- **Permissions.** No capability is added or granted. Issuing and recording signed copies follow
  `consignment.agreements.manage`; opening files needs manage or approve. Viewers see status only.
- **Operational check.** Preview an existing draft, issue it, confirm the fingerprint on each page,
  download, print and, after signing, record the signed copy. Approval still requires the signed
  agreement reference and the existing review rules. Use synthetic agreements in staging; never
  upload fake signed copies to Production.
- **Rollback.** Roll the API and web back freely. Keep the tables: they hold what partners were sent
  and what they signed. The guarded Down refuses once any exists.

## Automatic references and default terms (local only, 19 October 2026)

Not deployed. Apply `20261019124347_AddConsignmentReferencesAndDefaultTerms` after the agreement-document
migration and before the matching API. It adds three tables and three nullable agreement columns, seeds
the suggested default terms **inactive**, and refuses to start (51056) if two merchants share an agreement
reference and version — resolve those by hand first. Existing references are never renamed.

- **Before first use:** an approver reviews Agreement Settings → Default agreement terms, edits every clause
  to the confirmed policy and puts them in use. Until then new drafts start with empty terms.
- **Prefixes:** for an existing partner such as Ank Pets, open New agreement, choose the merchant and check
  the suggested prefix before saving the first draft; change it if needed. Hand-typed historical references
  (for example `ANKPETS-CONS-2026-001`) are kept and their numbers skipped.
- **Rollback:** roll the API and web back freely. The guarded Down (51058) refuses once any reference,
  creation key or default revision exists.
