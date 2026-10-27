# Consignment agreements and custody MVP

Status: local implementation, not deployed. No automated sales/settlements or partner portal.

Independent QA remediation (18 October 2026) strengthens this MVP as described below.

## Records and configuration ownership

Reuse Merchants. Directory publication consent is not a commercial agreement.
ConsignmentAgreements are typed Admin business records (governance category D).
Each has its own percentage, effective dates, version and pending commercial terms.
Approval requires duration/end-date policy, settlement frequency, payment deadline,
discount permissions, return/loss terms, signed reference, tracker and effective start.
An absent effective end needs explicit duration terms. No binding terms, actual partner
or inventory are seeded. The UI suggests 35% for the proposed first partner only.
Approved terms are immutable; approval of a new version closes its predecessor.
Draft editing and approval are separate capabilities. In Team Mode the approver must differ from
the creator and every substantive draft contributor, including for Super Admin. The scoped Solo exception is described below. No-op saves do not transfer authorship. An immutable contributor row records the first contribution to each version; actual term snapshots remain in the audit trail. Legacy drafts without complete attribution require a fresh reviewed version. Approval records actor/time. Older approved
rows without that evidence cannot authorize new commitments; use a reviewed revision.
Outstanding prior-version reservations block revision approval rather than becoming
stranded afterwards. Manual closure blocks while reserved, partner-held or quarantined
units remain. Supersession after dispatch retains the prior version's custody/history
and permits its reconciliation and returns; it never rewrites commercial snapshots.

ConsignmentDispatches, ConsignmentUnits and append-only ConsignmentMovements are system
history (category E). Dispatch snapshots freeze agreement/rate, seller, destination,
SKU/variant/batch and individual Tag Codes. No TagOrder, MerchantOrder, invoice, receipt,
payment, sale, revenue, SalesCommission or payout is created by custody movement.

## Inventory and concurrency

Reserve only physically received, Sale-purpose, QA Passed, unclaimed, undeleted,
unarchived and unassigned QR + NFC stock of currently sellable SKUs. Central eligibility
excludes every unreleased consignment unit, affecting catalogue, delivery quote, checkout
and merchant selection. Retail assignment checks holds explicitly.

External allocation subtracts outstanding retail quantity reservations under the existing
SKU application lock. Only selected orderable units consume that pool; unreceived legacy
wholesale stock is distinct. All consignment writes use whole retryable transactions,
a global consignment operation lock, then deterministically sorted existing SKU locks.
The global lock is an explicit MVP throughput tradeoff for the initial small rollout.

Cross-table eligibility is enforced in commands, not solely filtered indexes. Allocation
touches SmartTag.AssignmentVersion and SQL rowversion, so concurrent assignment or
activation cannot commit against the same stale tag. Direct admin assignment also checks
rowversion. No historical shared-claim backfill or unrelated retail redesign is needed.
Generic stock/ownership/lifecycle mutations cannot bypass custody. Wholesale dispatch
rechecks QA and unavailable lifecycle states; existing early wholesale activation remains.
The guard also protects Passed units needed by outstanding retail commitments. Pending
stock remains orderable through the unchanged retail catalogue rule, but cannot substitute
for inspected fulfilment stock when wholesale/consignment takes units. Failed assigned
units do not satisfy this inspected-stock guard. It applies at reservation/allocation time only. Dispatch validates the held units themselves under existing locks and rowversions; a later unrelated retail inspection backlog cannot block already-held stock. Cancellation recovers reservation capacity normally.

New reservations reference an active MerchantBranch belonging to the agreement's merchant;
the address is derived and snapshotted, and stale/mismatching addresses fail. A persisted
browser submission reference survives refresh and retry. A filtered unique active-request
fingerprint and server replay lookup also prevent accidental duplicate open reservations.
A matching active reservation reopens with an explicit reused result; clearing the form never claims to create a second delivery. Change the actual delivery/tracker content for a genuinely different request, or dispatch/cancel the existing reservation first. Existing active duplicates are reviewed before migration rather than automatically merged or rewritten.

## Lifecycle

Dispatch: Reserved -> Dispatched -> Received; Reserved -> Cancelled releases holds.
Unit: Reserved -> Dispatched -> Received. Partner-held units can enter ReturnedQuarantine
or ExternalHandover. ExternalHandover records an external-tracker customer disposition,
not a financial sale. Activation alone changes no disposition and creates no sale.
Reserved or returned-quarantine units cannot activate; dispatched/received units use the
existing QR activation and NFC guidance without exposing owner data.

Return means physical receipt of unsold stock. It resets QA to Pending, advances QaVersion
and clears inspection evidence. The unit stays held. Use existing Physical QA for fresh
QR/NFC/condition checks. Release requires a Passed inspection after the return, unclaimed
lifecycle, no owner/pet/order/activation and explicit authorization. Failed/damaged units
stay quarantined or enter WrittenOff through a separate capability, with evidence. Write-off
disables the physical tag, keeps its custody hold/history and creates no financial posting.
Missing stock cannot use this physically returned-stock action. Activated tags need a
separate customer-ownership/support procedure.

Receipt records actual recipient, date, physically counted quantity (including damaged units),
signed evidence reference and explicit disjoint good/damaged/missing unit IDs. A complete
undamaged first receipt may omit IDs for compatibility. Partial receipts confirm only good
units, which can proceed to external handover even while other units remain under investigation.
Missing/damaged/unconfirmed units cannot have handovers. Known Missing, Damaged and ReviewRequired receiving holds also block owner activation. Already owner-linked units cannot be reclassified as missing/damaged stock; review their customer handover instead. Unconfirmed dispatched scan activation keeps its existing behavior. Delivery status remains Dispatched
until receiving is complete; counts and holds remain per unit. Repeated exact receiving
references replay without another movement; changed evidence requires a new reference.

In Team Mode, discrepancy resolution needs a different authorized reviewer from both the dispatcher and
that unit's discrepancy recorder. Review can confirm a located good unit, record located
damage, or confirm a physical return already recorded. Returned IDs are not counted at the
partner. A missing unit located centrally can be explicitly physically returned with actual
return evidence, quarantined and reviewed under the approval policy; no false partner receipt is required.
Failed returned stock can be written off without blocking good partner stock. A returned unit with an unresolved receiving issue stays unavailable even after QA passes; receiving review under the approval policy must complete before release. Unlocated
shortages remain held; no liability, settlement or financial adjustment policy is invented.

Unit receiving classifications are separate from custody status. Original evidence and actor
remain in movements; current unresolved issues retain their recorder. Unit references use the
full immutable custody GUID prefixed CU-, never a sort-order label or a hidden Tag Code.
Issued PDF bytes/hash remain frozen; ordinary list/detail and CSV queries exclude PDF content.
The sale-report validation ceiling matches existing B2B numeric inputs (MYR999,999.99,
two decimals) and does not impose the current catalogue price or authorize a discount.

## Authorization and documents

Capabilities: consignment.view, consignment.agreements.manage, consignment.allocate,
consignment.dispatch, consignment.reconcile, consignment.return, consignment.release,
consignment.manifest.export. Current JWT identity supplies the actor. Sensitive changes
require current rowversion tokens and append audit history atomically.
List/detail projections omit Tag Codes, pet/account/finder identity and scan history.
Manifest viewing and CSV downloads require export permission; code-free issued PDFs
require view permission. All these accesses are audited.
CSV uses the shared spreadsheet formula sanitizer. PDFs reuse the merchant QuestPDF
layout and frozen seller; no bank instructions, prices or commission amounts are printed.

Additional capabilities are consignment.agreements.approve and consignment.write_off.
Code-free issued PDFs require consignment.view; controlled manifests and reconciliation
CSV require consignment.manifest.export. Restricted responses set no-store. Consignment
validation errors never interpolate selected Tag Codes. The shared authenticated binary
client supports token refresh. Installed roles are not automatically broadened.

Consignment PDF bytes/hash are stored atomically at dispatch. No pre-dispatch note is
issued, and later receipt/return status cannot change issued content. Legacy deliveries
without an archived issued copy require review rather than guessed historical rendering.
Paper receiving/signature blocks are replaced by explicit separately retained actual
partner evidence. Wholesale allocation changes still void old Delivery Orders with a
visible audit timeline entry. Shipping an unchanged allocation keeps its issued number;
actual courier/tracking details remain on the shipment and email, not silently rewritten
into the earlier issued snapshot. Further document revision/pack automation is deferred.

Endpoints: /api/v1/admin/merchant-sales/consignment/agreements and /dispatches, with
page/pageSize. Reserve supports explicit per-SKU tag IDs or deterministic automatic
selection and a fingerprint-bound idempotency key. Actions require reasons/references.
Identical dispatch/receipt acknowledgments can replay after a lost response.

ConsignmentHandoverRecords are append-only category E external reports, not financial
sales. Each unit event has merchant/agreement/dispatch, unique normalized merchant-scoped
entry reference, actual timestamp, recorder/time, evidence reference, optional reported
actual MYR selling price/discount and explicit Unverified external report classification.
Sale reports require price and discount information; custody-only events carry no amounts.
Corrections/reversals use fresh references and point to the current record, retaining the
original. Reversal changes the custody record, never customer ownership or activation.
Movement history identifies the unit and operator. Controlled date-range CSV includes
merchant, agreement/version, Tag Code, dates, actor, amounts, original links and status.
No verification, tax, commission, invoice, receipt, settlement or bank posting is inferred.

## External sales and settlement reconciliation

> **Updated by Phase 1A (October 2026).** A verified sales report now records the
> period's settlement statement, partner payments and the responsible salesperson's
> pending commission inside MyPetLink. See
> [`docs/operations/consignment-settlement-and-commission.md`](../operations/consignment-settlement-and-commission.md).
> The steps below still apply to custody reconciliation and to periods verified
> before that release, which are never back-filled.

1. Export the controlled reservation manifest and physically verify every SKU, variant,
   batch and Tag Code. Retain it in restricted business storage; arrange a second count.
2. Add dispatch number and unit IDs/Tag Codes to the external tracker. Confirm physical
   dispatch and retain the partner's actual signed receipt acknowledgment.
3. Record retail sales externally: unique shop reference, Tag Code, SKU, actual timestamp,
   actual price, approved discount and linked refunds. Never enter proxy orders/invoices
   or use Salesperson commissions. The external tracker owns money during this MVP.
4. Record the exact external entry against selected units using External Customer Handover.
   This is custody acknowledgment only. Investigate activated tags without such references;
   activation is not proof of a sale or proof of settlement.
5. Reconcile opening + dispatches to partner-held, external handovers, returned-quarantine
   and released returns. Track loss/damage investigations externally; do not disguise them
   as sales, returns or handovers. Retain supporting references for each discrepancy.
6. Finance reviews external statements and bank receipts under the signed agreement.
   Ten MYR34.90 sales = MYR349.00; aggregate 35% retention = MYR122.15; remittance =
   MYR226.85. Do not round commission per tag. Mixed rate/version groups stay separate.
7. Retain statement/payment/refund/accounting references externally. No automated financial
   correctness, credit note, refund, tax or e-Invoice compliance is claimed by this MVP.

## Deferred roadmap

Stage 3: individual sale/import events, discounts/refunds, unique financial references,
aggregate calculation policies, settlement claims, statements, partial remittances, bank
allocation and aging. Qualified review decides tax/e-Invoice, issuer and principal/agent
questions before financial automation.
Stage 4: branch analytics, losses/write-offs, partial wholesale shipments, wholesale tier
approval, optional isolated partner portal and accounting/MyInvois integrations. CardBiz
and payment-gateway work remain separate.

Rollback is guarded in all four consignment Down methods: SQL table locks plus THROW block
destructive downgrade whenever any historical agreement/custody/evidence exists. Retain
schema and hold-aware code after use. The rollout runbook covers legacy review, duplicate
preflight, session settings and operational freeze/recovery.

## Solo Operator Mode (18 October 2026)

The organisation policy is owned only by the typed singleton `ConsignmentApprovalPolicies`
(category D). Migration `20261018035952_AddConsignmentSoloOperatorPolicy` seeds Team,
with no nominated founder. A missing policy never permits self-review. No App Setting,
frontend flag or role name owns this decision.

Self-review requires **all** of: Solo Mode, explicit nomination of the current active
administrator, `consignment.self_review`, the original operation capability and an
explicit confirmed attestation with a 10–1,000 character reason and actual external
evidence reference. Nomination restricts the capability; it grants no other permission.
No ordinary built-in role template receives either new sensitive capability. As with
all catalogue permissions, Super Admin resolves them, but cannot self-review until a
separate confirmed, audited policy change explicitly nominates that founder. No shared
access resolver, role grant or self-role-edit exception was introduced.

Only agreement contributor exclusion, dispatcher/receipt separation and dispatcher/
issue-recorder discrepancy separation admit this exception. Unknown legacy contributor,
dispatcher or issue-recorder evidence still fails closed. Independent reviews remain
independent even while Solo is enabled, and are labelled `Independent (Solo)`.

Agreement self-review references this version's actual signed partner acceptance; the
confirmation presents the full commercial term summary before freezing. Receiving
self-review references the exact signed partner acknowledgment/count or actual review
evidence in the receiving request. A Solo discrepancy resolution must cite new evidence
different from all earlier receiving-event evidence on that delivery. Unlocated shortages
stay held; an actual return and subsequent review are separate events. QA release,
write-off permissions, custody lifecycle, idempotency, restricted Tag Codes, immutable
PDF bytes and the zero-finance boundary do not change.

`ConsignmentReviewEvents` is the append-only journal for every new approval/receiving
review and policy change. It snapshots actor, UTC time, mode, policy version, request
reference, reason and external evidence; policy changes retain both previous and new
mode/founder. `Self-reviewed (Solo)` means the server validated explicit confirmation.
The agreement and receiving movement retain that label. Legacy approvals are not
retroactively relabelled. Existing `IAuditLogService` entries commit in the same
transaction. EF rejects journal updates/deletes; SQL Server's append-only trigger also
refuses them. No routine edit/delete endpoint exists.

Policy writes and reviews use the existing consignment transaction/application lock,
so a policy change cannot commit between a review decision and its custody write.
Policy writes also require `RowVersion`; stale writes return 409. Permission and account
revocation take effect on the next request. Switching to Team clears the nomination
and restores every independence rule; historical Solo evidence remains unchanged.

Admin Consignment includes the purpose-built policy card (view: `consignment.view`,
change: `consignment.approval_policy.manage`), attestation confirmation and history.
The latest 20 policy changes are shown; the controlled date-range review-log CSV keeps
all journal events, bounded at 366 days/10,000 rows. Manifest and reconciliation CSVs
include agreement and receiving review modes; the separate review log provides each
actor/reason/evidence rather than misrepresenting a self-review as independent approval.

## Sales reports and SKU stock ledger (Phase 1A, 18 October 2026)

Design: `artifacts/consignment-stocktake-audit/mvp-design-final.md`. Partners report sales by
SKU for fixed half-month periods (1st–15th, 16th–month end, Malaysia time). No Tag Code is ever
attributed to an aggregate sale, and nothing here creates an invoice, payment, commission or
settlement.

- **Approved prices** (`ConsignmentPriceTerms`): Standard prices and Promotions per agreement
  version and SKU. Draft → Approved through `Review()` with the partner's acceptance reference
  (`consignment.agreements.approve`); approved prices are immutable and can only be ended from a
  date onward. A renewed version receives the previous approved prices as drafts, never approved.
- **Sales reports** (`ConsignmentSalesReports` + lines): Draft → Recorded (unverified, values
  frozen) → Verified or Disputed; a correction is a new version that supersedes the original.
  A line references an approved price; a price no term matches can be recorded as reported but
  never verified. Discounts are derived (list − net), never entered. Evidence level is Documented
  or Summary.
- **Agreement versions meet at the successor's start.** Reporting under a version ends at its own
  end or where a later approved version of the same agreement starts, whichever comes first, so
  an open-ended version superseded mid-month splits that period exactly there. Signed terms are
  not rewritten. A revision can't be approved to start inside a period already reported under an
  earlier version; it must start after those reports, or they must be corrected first.
- **Refunds** name the report period their sale was verified in — the start of a real report at
  the branch, which is mid-month when an agreement version starts mid-month — and the price the
  sale was made at, which may belong to an earlier version of the partner's agreement. A refund
  may never exceed the verified sales of that SKU, at that price, in that period. Restocking needs
  a persisted confirmation that the packages came back sealed and unopened, with how that was
  checked; anything opened or activated becomes unsellable stock.
- **Stock ledger** (`ConsignmentStockLedgerEntries`, append-only): quantities move between
  External, Sellable, Unsellable, Investigation, SoldUnidentified and LostUnidentified per branch
  and SKU. Each source posts once (unique source key) inside the same transaction as the status
  change that causes it; corrections post reversals. No posting may take a bucket below zero.
  Existing per-unit actions post too: a unit counted good at the partner, a return of a counted
  unit, and an identified handover (which now needs an attribution — aggregate sale or non-sale
  withdrawal — and carries no price for a tracked unit). Tracking is decided per unit: one delivery
  can hold units received before tracking began and units counted since.
- **One handover, one movement.** The ledger knows a handover by the record that began it.
  Evidence corrections chain back to that record, so a correction never posts again, "Bring into
  stock tracking" recognises a handover already posted, and a reversal undoes exactly that one
  movement.
- **Custody tie-out**: units in partner custody (Received/Good) must equal the sum of the five
  partner buckets per branch and SKU; the stock position shows it per SKU.
- **Verification** refuses unapproved or mismatched prices, periods outside the agreement's
  dates, periods that haven't reached their exclusive end in Malaysia time, negative stock and
  uncovered refunds; activations exceeding sales and late reports are warnings that must be
  acknowledged. Solo self-review must cite the report's own evidence reference.
- **A correction is one movement.** Verifying it reverses the version it replaces and posts its
  own sales and returns together; only the final position must be valid, and any negative final
  bucket refuses the whole transaction. It also rechecks every refund the replaced sales covered,
  so a correction can never leave more verified refunds than verified sales. A correction of a
  disputed correction replaces the last verified version, which is reversed exactly once.
- **Independence.** `ConsignmentRecordContributors` keeps one immutable row per admin who created,
  substantively edited or recorded a price term or sales report (no-op saves contribute nothing).
  Whether a save changed anything is decided field by field on the stored values (amounts as
  numbers, dates as instants, text exactly), never on joined text, so no name or evidence wording
  can disguise a price change. Contributor rows are append-only in SQL Server too (trigger,
  THROW 51046), like the ledger and the review journal. Records that existed before contributor
  history was kept are marked `ContributorHistoryComplete = false`: unknown editors are never
  treated as proof of independence, so in Team Mode nobody may approve or verify them, and in Solo
  Mode only the named founder may self-review them. Recovery keeps history intact: a draft price is
  withdrawn and added again (its new maker is known); a report is disputed if only recorded, then
  re-entered from the partner's evidence as a new, empty version whose contributor history starts
  afresh, and is verified by someone who didn't re-enter or record it.
  In Team Mode nobody listed for a price term — or for a report or any version it corrects — can
  approve or verify it, whatever their role, and disabling or re-enabling the account changes
  nothing. Solo Mode keeps its scoped self-review exception, labelled `Self-reviewed (Solo)`.
  Starting a correction copies figures and contributes none; it reopens reviewed figures, so it
  needs `consignment.sales_reports.verify` and a reason, audited on both versions.
- **Retries.** A sales report submission carries a submission reference. Retrying it returns the
  saved report only when every value matches; a changed retry updates the draft only while its
  sender is its only contributor, and is otherwise refused with `submission_changed`. Earlier
  values are never returned or recorded in silence.

Monthly stocktake, period close and carry forward are Phase 1B.

## Monthly stocktake, period close and carry forward (Phase 1B, 19 October 2026)

Design: `artifacts/consignment-stocktake-audit/mvp-design-final.md` §2, §3.5–3.8, §6–8. Built on the
Phase 1A SKU ledger; there is no second ledger. Counts are by SKU: shop staff never scan Tag Codes,
open sealed packages or return unsold stock for a routine count, and no count changes a
`ConsignmentUnit`, assigns a Tag Code to an aggregate figure or creates a financial record.

- **Two layers.** Shelf counts confirm what is physically at the shop (Sellable and Unsellable). Sold,
  lost and investigated quantities stay the partner's responsibility under the original per-unit
  custody records until identified. The custody tie-out (units in custody = all five partner buckets)
  must balance before a month can close.
- **Counting** (`ConsignmentStocktakes`, `ConsignmentStocktakeLines`). One open count per branch, on the
  15th or the last day of a month: its cutoff (the next midnight, Malaysia time) is always a sales
  period boundary, so no report can straddle a close. Expected figures are the ledger balances before
  the cutoff, computed by the server; "expected on the shelf" adds open surplus notes, which are never
  verified stock (shown as verified + extra noted).
- **When the shelf was counted** (`CountedAt`, separate from the cutoff and from when it was typed in).
  A count on the count day is accepted; one before 6 pm is closed with a warning that later sales may
  show as extra. A count after midnight (within a day, before the shop reopens) needs a documented
  confirmation that nothing moved (`CountedAfterCutoffNote`), and is refused if any stock movement is
  recorded between the cutoff and the count. Anything else is counted again on the next count date:
  a count is never entered as if taken at a cutoff it didn't see.
- **Closing a month** (`consignment.periods.close`, reviewed through `ReviewCore`). Refused while a
  draft or recorded sales report in the month is unverified, while a count date hasn't ended, while any
  SKU in the books is uncounted, while received units aren't in SKU stock, or while the tie-out doesn't
  balance. In one transaction, per SKU (design §6.2):
  - damaged stock found moves Sellable → Unsellable and opens an *UnsellableFound* discrepancy;
  - unsellable stock missing moves Unsellable → Investigation (*UnsellableShortage*);
  - a sellable shortage first uses up open surplus notes, then moves Sellable → Investigation
    (*Shortage*);
  - a surplus opens a *Surplus* note and posts nothing.
  Every posting is keyed to its stocktake line, so it can happen only once, and the final balances must
  be non-negative or the whole close is refused. Lines are then frozen. Acknowledged findings must
  come with the `ReviewFingerprint` the reviewer was shown: any receipt, return, report or resolution
  that changes the books or findings since the preview refuses the close (`review_outdated`). The closing position is the next
  month's opening: nothing is re-dispatched, reserved or rescanned. Summary-evidence sales lines in the
  month are marked corroborated for SKUs with no difference.
- **A closed month never changes.** Approved stocktakes, frozen lines and discrepancy resolutions are
  immutable in EF and in SQL Server (triggers 51050, 51049, 51048). Lines can be added, re-counted,
  moved or removed only while their stocktake is a draft, a recorded count keeps its details, and a
  discarded one never changes (51052). Any ledger posting dated before the
  branch's last close (a late receipt, return, handover or report) is dated now and flagged
  `IsPriorPeriodCorrection`.
- **Late reports.** A report for a closed month posts to the current month. Nothing it found is
  settled automatically. Only the first count after the report's period can have been affected, so
  only that count's open discrepancies of the same SKU and branch are candidates: shortages for sales,
  surplus notes for restocked returns or fewer sales. The reviewer may link the report to them, each
  with its own evidence (never the count sheet) and explanation, up to the shelf change the count
  couldn't see; a linked shortage moves Investigation → Sellable (offsetting the sale) and is resolved
  *ExplainedByLateReport*. Unlinked, the finding stays open. Linking settles the count's finding, so
  its contributors aren't independent of it, and each linked discrepancy is journaled as a review
  subject. Verifying a correction first withdraws every link of the versions it replaces: an
  append-only *AllocationWithdrawn* row reopens the quantity and the movement is reversed, then the
  correction's own links are applied, all in one transaction. Corrections of corrections, removed
  lines and refunds follow the same rule; a correction the shelf can't support is refused with a
  business error.
- **Discrepancies** (`ConsignmentStockDiscrepancies`, append-only `ConsignmentDiscrepancyResolutions`,
  `consignment.discrepancies.resolve`). Each outcome is limited by the open quantity and its source
  bucket, recorded with evidence and a reason, reviewed, and audited; partial resolution is supported.
  Shortages: found, found damaged, approved loss (only after a later count of that SKU confirms it is
  still missing, with no unexplained extra units found since). Unsellable found: confirmed damaged,
  recount sellable; damaged stock leaves the shop only through a per-unit dispatch return, never by a
  resolution. Unsellable missing: found, found sellable, approved loss. Surplus: recount error, an earlier shortage found (settles both), an earlier
  approved loss found. Nothing is ever treated as sold, returned or written off automatically, and the
  Investigation bucket always equals the open shortage quantities.
- **Independence.** The counter, editors and recorder of a stocktake are its contributors: in Team Mode
  none of them may close it or resolve what it found, including through a related discrepancy (an
  earlier shortage found settles both, so both counts' contributors are checked and both subjects are
  journaled). In Solo Mode only the named founder may: a close cites the count's own evidence, and a
  resolution needs new evidence, different from the count's and from its close review.
- **Agreement renewal** posts nothing: the ledger is per branch and SKU, so stock carries forward.

Rollback of the stocktake migration is refused once any stocktake, discrepancy or resolution exists
(51051); rollback of the hardening migration is refused once any count time or withdrawn late-report
link exists (51053). Migrations roll back one at a time: a refused multi-step downgrade may already have rolled
back later, empty migrations, so never assume it left the schema unchanged; reapply Up to recover.

## Agreement document for signature (19 October 2026)

Administrators no longer write a separate Word/PDF agreement. The agreement a partner signs is
generated server-side from the saved `ConsignmentAgreements` row, so the signed paper and the terms
the system enforces cannot drift apart. Nothing in this flow approves, signs or activates anything:
internal approval keeps its existing rules (Team/Solo) and still needs the signed agreement reference.

- **Source of truth.** Terms come only from the saved row: reference, version, partner commission
  (and MyPetLink's complement), effective dates, duration and renewal, settlement frequency, payment
  deadline, discount, return and loss terms, printed verbatim. The renderer
  (`ConsignmentAgreementRenderer`) adds headings and signature blocks, never clauses or values.
  Price terms, stock quantities and dispatches have their own approval lifecycle and are **not**
  contractual schedules of this document. The external tracker and signed agreement references are
  evidence, not terms, and are not printed.
- **Parties.** The company is the configured business identity (`BusinessIdentitySettings`: legal
  name, registration number, registered address, support email, brand); the partner is the stored
  merchant (legal and trading name, registration number, billing address, contact person and email).
  A missing field blocks the document with a list of what is needed (`agreement_document_incomplete`):
  nothing is invented, and no signatory is configured — signature blocks are blank.
- **Preview** renders the saved draft, watermarked "Draft preview — not for signature", and stores
  nothing. It needs the agreement's concurrency token, so a preview can never show terms the operator
  has not seen (unsaved form values never reach the server; someone else's later save is refused).
- **Issue for signature** freezes the document: `ConsignmentAgreementDocuments` keeps the PDF bytes,
  their SHA-256, a JSON snapshot of both parties and the terms, and a **terms fingerprint** (SHA-256
  of the commercial terms alone, printed as `XXXX-XXXX-XXXX` on every page). Issues are numbered per
  agreement version. Re-issuing identical saved content returns the existing issue; after any edit the
  old issue is kept but is no longer current, and a new issue is produced.
- **Signed copy.** `ConsignmentSignedAgreements` stores the partner's actual file (PDF, JPEG or PNG,
  up to 8 MB; type detected from the bytes and required to match the declared type and extension, then
  opened in full — a PDF must parse with readable pages and no encryption, an image must decode completely
  within 12,000 px per side and 40 megapixels — so nothing unreadable is kept as evidence),
  its SHA-256, the issue it answers and that issue's fingerprint, the partner signatory, optional
  MyPetLink signatory, signing dates (between the issue date and today, Malaysia time) and the
  uploader. A copy for an issue whose terms no longer match is refused. Once a signed copy exists, the
  draft's commercial terms are locked: changing them requires a new agreement version, signed again.
  Evidence references stay editable so the signed reference can be recorded for approval.
- **Status** shown in Admin is derived, never stored: Draft — Incomplete, Ready for Signature, Issued
  for Signature, Signed Copy Received, Approved, Closed.
- **Storage.** Files live in SQL Server beside the agreement (as dispatch notes already do), not in
  object storage: they are reached only through authorized API endpoints, never a public or
  predictable URL. Both tables are append-only in EF and in SQL Server (trigger 51054).
- **Access.** Status (metadata only): `consignment.view`. Opening any agreement file (preview, issued
  PDF, signed copy) additionally needs `consignment.agreements.manage` or
  `consignment.agreements.approve`, checked in the service. Issuing and recording a signed copy:
  `consignment.agreements.manage`. Every file id is looked up together with its agreement id. Preview,
  issue, download and upload are audited.
- **Sharing.** Download, print (the PDF itself, in the browser's print flow) and the device share sheet
  where the browser supports sharing files; otherwise an attach-it-yourself dialog with a suggested
  message. MyPetLink never records an agreement as sent. Emailing the PDF from the transactional
  outbox was assessed and deferred: it needs a new message type, attachment resolver entry and a
  disabled-by-default template switch under the configuration governance rules.

Rollback of the agreement-document migration is refused once any issued or signed agreement exists
(51055).

## Automatic agreement references and default terms (19 October 2026)

**References.** A new agreement's reference is assigned by the server when its first draft is saved:
`{PREFIX}-CONS-{yyyy}-{nnn}`, for example `ANKPETS-CONS-2026-001`. Administrators no longer type it.

- **Prefix** (`ConsignmentPartnerPrefixes`, one row per merchant, kept apart from `Merchants` so merchant
  edits never race it). Suggested from the trading or legal name: whole words up to 12 letters and digits,
  legal-form words (Sdn, Bhd, PLT…) dropped. Unique across merchants (unique index); a collision takes the
  next free `PREFIX2`, `PREFIX3`…, and a stem already used by another partner's hand-typed references is
  never offered to someone else. Historical references are read case-insensitively (`legacy-cons-2025-001`
  reserves `LEGACY` and holds its number) and never rewritten; one without a usable stem reserves nothing. Adjustable (`consignment.agreements.manage`, audited) until its first
  reference locks it; never re-derived when a merchant is renamed. The existing `MerchantCode`
  (`MPL-MER-00001`) is stable but not name-based, so it is not reused.
- **Sequence.** `DocumentNumberCounters` key `consignment-agreement:{PREFIX}:{yyyy}`, Malaysian calendar
  year. The increment runs inside the draft's transaction (locked single-statement update, plus the
  consignment application lock), so a failed save releases the number and a committed one is never
  reissued — closing or withdrawing an agreement does not free it. Numbers already taken by a
  hand-typed historical reference are skipped. `(Reference, Version)` is unique across all merchants.
- **Retries.** The wizard sends an idempotency key (`CreationKey`, unique); a retried request with the
  same content returns the draft it already created, and the same key with different content is refused.
- **Revisions** inherit the original reference with the next version number and take no new number.
- **History.** Existing references are untouched. Issued PDFs, file names and signed copies already read
  the agreement's stored reference, so they carry the generated one without change.

**Default agreement terms** (Agreement Settings → Default agreement terms; `ConsignmentDefaultTerms`,
a single typed row with RowVersion, and append-only `ConsignmentDefaultTermsRevisions`).

- Partner commission, trial duration (days), duration and renewal, settlement frequency, payment
  deadline, discount, return and loss clauses. Never dates, signed references, signing dates or trackers.
- Seeded by the migration with the suggested starting terms **inactive**. Nothing reaches an agreement
  until an approver reviews and puts them in use; activation requires every field. Editing needs
  `consignment.agreements.approve` (the people who review commercial terms); viewing needs
  `consignment.view`. Every save is a new revision with operator, UTC time, old and new values in the
  audit log; stale saves are refused.
- A new draft's form is filled once from the active revision; every field stays editable, and
  "Restore default terms" asks before replacing edits. The trial length suggests the end date, counting
  the start day as day 1, until the operator picks one. The agreement records which revision it started
  from (`DefaultTermsRevision`, audit only). Saving copies the values into the agreement: nothing —
  preview, issue, PDF or approval — ever reads the template again. Revisions start from their
  predecessor, never the current defaults. The former hard-coded 35% "proposed rate" button is removed.

Rollback of `AddConsignmentReferencesAndDefaultTerms` is refused (51058) once a reference locked a prefix,
a draft used a creation key or default revision, or the defaults were revised. Default-term revisions
are append-only in EF and SQL Server (51057). The migration refuses to start (51056) if two merchants
already share a reference and version.

## Delivery Order (24 October 2026)

A consignment delivery can produce a **Delivery Order / Handover** form: the document both parties sign
when stock changes hands, laid out like the paper form used for the first consignment handover. It is a
document about an existing `ConsignmentDispatch`, never a second delivery workflow.

- **When.** Only once stock is dispatched (`Dispatched` or `Received`, `DispatchedAt` set). Reserved and
  cancelled deliveries are refused (`consignment_delivery_order_unavailable`). Historical deliveries,
  including ones already received, can generate one at any time.
- **Content.** Built from stored records only: the seller identity frozen on the dispatch, the partner's
  legal/trading name and registration number, the branch name, the dispatch's destination snapshot,
  the merchant contact person and the branch phone (else the merchant phone), the agreement reference
  and version snapshots, the dispatch number and date, and delivered quantities grouped by the units'
  SKU, product and variant snapshots. Delivered means every unit that left on the dispatch, never only
  what was counted. Tag Codes, commission and the free-text shipment reference are not printed. Missing
  optional details stay blank write-in lines; nothing is invented.
- **Receipt.** Issuing before receipt is allowed: the count, condition and receiver fields are then
  blank for handwriting, and later receiving evidence is recorded through receiving, never on the DO.
  When receiving was already recorded, the DO rebuilds it from the retained receiving events
  (`receive` / `record-discrepancy` evidence and their per-unit records), not from the units' current
  states or the dispatch's latest-receipt fields. Each unit's first receiving finding is what was found
  at receipt: counted = good + damaged, per SKU, across every receipt event. Later discrepancy
  resolutions (for example a damaged unit returned to MyPetLink) are listed separately and dated, and
  never reduce what was counted. Units with no unit-level receiving record (awaiting confirmation, under
  review, or received before unit-level receiving) are shown as unverified.
- **Confirmations.** A box is ticked only when the stored evidence shows it. All units counted: every
  delivered unit was counted good or damaged at a recorded receipt. No visible damage: additionally,
  every one was recorded good. Partial count: some, not all, were counted. Count pending: any unit is
  unverified. Nil/Short: only once every unit has a recorded finding (Short = units recorded missing).
  Damage / exceptions: damage or a shortage was recorded. Sealed packs only and Excess are never ticked
  by the system. A missing unit is not a counted unit, and the absence of a damage finding is not a
  recorded inspection.
- **Signers.** Unsigned by default: the confirming dispatcher's name is pre-printed in Delivered By and
  both parties sign the printed copies by hand. Received By shows a receiver only when exactly one
  receipt event counted units; several receipts are listed instead. Received By is never signed by the
  system: partner signing evidence is recorded separately through receiving.
- **Signing Delivered By (24 October 2026).** The administrator generating the DO may sign Delivered By
  with their own signature on file (see *Document signatures* below). They choose to sign, may preview
  the signed form, and must confirm (`confirmed: true`) before generating; otherwise the DO is issued
  unsigned. The signer is always the issuer (the JWT subject): the API refuses another administrator's
  signature (`403 signature_not_yours`), a replaced or removed one (`409 signature_changed`), an
  unconfirmed request (`400 signature_not_confirmed`) and anyone without `document_signature.manage`
  (`403`). Every refusal happens before a number is taken. The signature image is drawn on the Delivered
  By line with the signatory's name, position and the signing time (= issue time, Malaysia time). The
  row records `SignatureId`, `SignedByAdminUserId` (= `IssuedByAdminUserId`), `SignedAt` (= `IssuedAt`),
  the printed name and position, and the image's SHA-256; the snapshot carries the same without the
  image. `CK_ConsignmentDeliveryOrder_Signature` makes SQL Server refuse anything else: a row is either
  unsigned with every signing column empty, or signed in full, with every column present (each tested
  `IS NOT NULL`, since a comparison with NULL would otherwise pass a check constraint), signer = issuer,
  signing time = issue time, a name and position that aren't blank and a 64-character hexadecimal
  fingerprint. The image exists only inside the frozen PDF, so replacing
  or removing the signature later never changes an issued DO. A repeated identical request returns the
  issued copy; asking to sign, unsign or re-sign an issued DO is refused (`409`). Audited as
  `consignment.delivery-order-issued` (with the signing fields) and `document-signature.applied`.
- **Preview.** `GET dispatches/{id}/delivery-order/preview.pdf[?signatureId=]` renders the DO as it would
  be issued now, watermarked PREVIEW - NOT ISSUED, with no number. It takes no number, stores nothing,
  moves nothing and is refused once a DO exists. A signed preview shows only the caller's own signature
  (same ownership checks, no confirmation needed) and is audited as `document-signature.previewed`.
- **Number.** Shares the existing Delivery Order series (`DocumentNumberCounters` key
  `merchant-delivery-order:{yyMMdd}`, `MPL-DO-{yyMMdd}-{nnnn}`), so a consignment DO can never take the
  number of a B2B sales DO. Allocated inside the issuing transaction under the consignment application
  lock; a refused request burns no number. The B2B manual issue (`MerchantFulfilmentService.IssueDeliveryOrderAsync`)
  allocates, saves and audits in one transaction too (24 October 2026), as shipping already did, so a
  failed save or a losing concurrent attempt releases its number. Counter values already committed are
  never reset or reused.
- **Layout.** Each SKU row is one unbreakable line (SKU, design, size, delivered quantity and count
  box) under a header repeated on every page; a row that does not fit moves whole to the next page.
- **Frozen.** `ConsignmentDeliveryOrders` (one row per dispatch, unique dispatch and number) keeps the
  snapshot JSON, the exact PDF bytes and their SHA-256. Generating again or downloading returns that same
  copy; later merchant, branch, identity or receiving changes never alter it. Append-only in EF and SQL
  Server (51059).
- **Stock.** Generating and downloading write no unit, movement, handover or ledger row and leave the
  dispatch row version unchanged. Issuing and each download are audited
  (`consignment.delivery-order-issued`, `consignment.document-downloaded`).
- **Access.** Generating needs `consignment.dispatch`; downloading an issued DO needs `consignment.view`,
  like the dispatch note.

The existing Consignment Dispatch Note is unchanged and still issued at dispatch.

### Document signatures (24 October 2026)

An administrator may keep **their own** signature on file to sign Delivery Orders they generate. It is
not a company stamp and not an e-signature platform: there is no partner-side signing, certificate or
automatic acknowledgement.

- **Personal.** `api/v1/admin/document-signature` (`GET`, `PUT`, `POST remove`, `GET image`) always acts
  on the caller's own signature; no request names an account. Requires `document_signature.manage`
  (sensitive, in no built-in role template; Super Admin holds it through grant-all). Another
  administrator can't see, replace, remove or apply it.
- **Private storage.** The image is stored in `DocumentSignatures.Image` (SQL Server), never in public
  media storage, and is served only to its owner with `Cache-Control: no-store, private`. Responses and
  audit entries never contain the image.
- **Validation.** PNG or JPEG, at most 2 MB, bytes matching the declared type, at most 6,000 pixels a side
  and 16 megapixels (checked from the header before decoding), fully decodable, with visible dark ink
  that is not most of the image. A JPEG is first turned the way its EXIF orientation says (all eight
  values, mirrored ones included), exactly once and before cropping, so the kept copy is upright as the
  browser showed it; the decoder returns the pixels as stored and never applies it. An orientation outside
  1-8 or unreadable EXIF is treated as upright, as browsers do. PNG pixels are never turned. The kept
  copy is redrawn from the decoded pixels: cropped to the ink,
  paper made transparent, scaled to at most 1200 x 480 and encoded as a fresh PNG, so no metadata or
  appended data survives. Name and position: 1-60 characters each, short enough for a signed form to
  fit one page in ordinary use (at the maximum, the signature section moves whole to a second page).
- **Versions.** Saving a new image or new wording creates a new version and retires the previous one;
  removing retires the current one. Retiring erases the image and keeps the fingerprint, dates and who
  ended it. SQL Server checks each version is complete: on file with an image and no ending, or retired
  with no image, an end time, who ended it and a reason of exactly `Replaced` or `Removed` (compared as
  bytes, so empty, blank, padded or lower-case reasons are refused); a name and position that aren't
  blank; a 64-character hexadecimal fingerprint (`CK_DocumentSignature_Lifecycle`, `_Signatory`,
  `_Image`). At most one signature on file per administrator (filtered unique index). Saved versions are
  never edited or deleted (EF guard and trigger `TR_DocumentSignatures_History`, THROW 51061); a version
  a DO was signed with is also held by that DO's foreign key. Changes from a stale page are refused
  (`409 signature_changed`). Audited as `document-signature.saved` and `document-signature.removed`.
- **Agreements unchanged.** Agreement documents never use a signature on file. Issued agreements stay
  unsigned for wet or separate signing, and signed copies are still uploaded as evidence.
