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
