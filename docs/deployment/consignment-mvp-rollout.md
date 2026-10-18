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
