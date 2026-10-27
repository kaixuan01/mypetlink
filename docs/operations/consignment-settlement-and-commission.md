# Consignment settlement and sales commission (Phase 1A)

Consignment partners sell MyPetLink Smart Tags to their own customers. This page
describes how a verified sales report becomes money the partner owes, how that
money is recorded, and how the responsible salesperson's commission moves from
accrued to payable to paid.

Delivered stock is never revenue. A Delivery Order, a dispatch or a reservation
creates no settlement and no commission. Only a **verified** sales report does.

## From verified report to settlement

Verifying a sales report (Admin → Merchant Sales → Consignment → Sales reports)
now also records, in the same database transaction:

1. A **settlement** for that branch and period (`ConsignmentSettlements`, one per
   branch and period start). Its number is `MPL-CSET-yyMMdd-NNNN`.
2. An immutable **settlement revision** with one line per verified report line
   (`ConsignmentSettlementRevisions`, `ConsignmentSettlementLines`), kept by SKU
   and approved price term. No Tag Code is ever involved.
3. The period's **sales commission** as `Pending` rows in the existing
   `SalesCommissions` ledger.

A correction of the report (a new version that supersedes the verified one) adds
a new revision to the same settlement. The settlement always reflects the latest
verified version; every earlier revision stays readable.

A period that was first verified before this release has no settlement. A later
correction of such a period does not create one: its money was handled outside
the system and is never back-filled automatically. The verification is audited
as `consignment.settlement-not-started`.

### Statement figures

| Figure | Meaning |
|---|---|
| Standard / Promotion sales | Verified sale lines, classified by the approved price term's kind, never by comparing prices |
| Refunds | Verified refund lines, as a positive amount |
| Eligible customer sales | Standard + Promotion − Refunds |
| Partner commission | The agreement's own percentage. A sale uses the report's agreement version; a refund uses the version its sale was made under |
| Due to MyPetLink | Eligible customer sales − partner commission |
| Received / Outstanding | Partner payments recorded so far, and what remains |

`ConsignmentPriceTerm.UnitNetPrice` is the **customer selling price**. It is never
read as MyPetLink's share.

### Rounding

Line values are exact (a two-decimal price times whole units). The partner's
commission is rounded **once per commission-rate group**, to two decimals,
midpoint away from zero, the same convention as every other MyPetLink commission.
It is never rounded per tag:

| 100 tags | Customer sales | Partner 35% | Due to MyPetLink |
|---|---:|---:|---:|
| Standard RM39.90 | RM3,990.00 | RM1,396.50 | RM2,593.50 |
| Promotion RM34.90 | RM3,490.00 | RM1,221.50 | RM2,268.50 |

Per-tag rounding would give RM1,397.00 and RM1,222.00. Sales commission is a
fixed amount per tag, so it never needs rounding.

## Settlement status

| Status | When |
|---|---|
| Awaiting payment | Something is due and nothing has arrived |
| Partly paid | Some, not all, of what is due has arrived |
| Settled | Exactly what is due has arrived (or nothing was due) |
| Credit owed to partner | The partner paid more than a corrected statement needs, or refunds exceeded the period's sales |

## Recording partner payments

**Settlements → open a settlement → Record a payment.** Each payment records the
date the money arrived, amount, method and bank reference.

- Partial payments are allowed. A payment above the outstanding balance is
  refused; nothing is recorded once nothing is outstanding.
- Each submission carries a request key. A retried or double-clicked submission
  returns the original payment instead of recording a second one, but only when
  every detail matches field by field (date, amount, method, reference, notes;
  surrounding spaces and Unicode composition aside). The same key with any changed
  detail is refused as a conflict. All consignment
  writes run under one database lock, so two people recording at once can never
  overpay the period together.
- A payment recorded by mistake is **voided with a reason**, never edited or
  deleted, and only while the period is not yet settled. Once a period is
  settled, its commission may already be payable or paid, so its payments stay as
  recorded in this phase.
- An overpayment created by a later correction (status *Credit owed to partner*)
  is resolved with the partner outside the system for now.

## Sales commission

### Who earns it

The **servicing salesperson** earns a period's commission: the person assigned to
the merchant (`Merchant.AssignedSalespersonId`) for the **whole** period.

- Every change of assigned salesperson is now kept as dated history
  (`MerchantServicingAssignments`). A reassignment takes effect from the moment it
  is recorded and never moves an earlier period.
- Reported periods carry no sale dates. If the assignment changed during a period,
  was missing, or the salesperson is inactive, the system does **not** guess: the
  settlement shows *Salesperson to confirm* and earns nothing until an
  administrator confirms who earns it (or that nobody does), with a reason. That
  decision is audited and permanent.
- History starts at rollout. Each merchant's salesperson at deployment time is
  recorded from that moment (`Source = Rollout`). Earlier periods therefore always
  need an administrator's decision; nothing before rollout is assumed.

### Which terms apply

A salesperson earns consignment commission only for periods fully covered by their
**recorded v1.1 commission terms** (`SalespersonPolicyAssignments`, recorded from
the salesperson's page). Without them, the salesperson stays on their existing
terms, which pay no consignment commission.

- Terms record when the salesperson accepted them, the date they take effect
  (never before the acceptance) and where the acceptance is kept.
- Terms count for a period only if they were accepted and in effect **from the
  period's start to its end**. Reported sales carry no sale dates, so a period the
  terms cover only partly earns no commission under them; the settlement says so.
  Naming the salesperson when confirming who earns a period never extends their
  terms. There is no contractual-exception path in this phase.
- **Rollout order: record each salesperson's accepted terms before verifying the
  first report they should earn on.** If terms that were accepted before a period
  began are recorded only after it was verified, open the settlement and
  **Recalculate** it with a reason (`consignment_settlements.resolve`). The terms
  apply only if they cover the whole period, the salesperson stays the same, and
  nothing for that salesperson is paid or reserved in that period. The change is
  audited with the terms before and after. Other periods are never changed.
- One salesperson is under one set of terms at a time; overlapping terms are
  refused. Terms can be ended only from a date that has not passed.
- Recording terms requires `sales_commissions.rules.manage`.

### Rates

The v1.1 rate card is seeded as two commission rules, **RM4.50 per verified sold
tag at a Standard price** and **RM4.00 at a Promotion price**. They pay nobody by
themselves. A salesperson-specific rule for the same policy overrides the card.

- A period keeps the rate it was first calculated at for each kind of sale, across
  every later revision, even if one revision temporarily had none of that kind. A
  later rule change never re-prices a correction of that period. A new period
  uses the rate in force for it.
- A rule that has calculated any commission can no longer change its terms; it
  can only be ended, switched off or annotated. New terms start as a new rule.
  This now applies to every rule type, including the legacy ones.
- If a salesperson's terms cover a period but no rate does, the period shows a
  note and earns nothing until a rate is added and the period is recalculated.

### Lifecycle

```
verified report ──► Pending ──(period fully paid by the partner)──► Payable ──► reserved in a payout ──► Paid
                       │                                              │
                       └──── correction before payment: replaced ─────┘
```

- **Pending** rows exist only for consignment. They cannot be selected for a
  payout.
- When the period's remittance is received in full, every Pending row of that
  period becomes **Payable** in the same transaction (`PayableAt` records when).
- Commission is payable **only while its period is received in full**. Every
  correction re-checks this, even one that changes only the price (the quantity
  and rate are the same, but more is now due): unpaid rows go back to Pending
  until the partner pays the corrected amount. Payout preparation and recording a
  payout as paid check it again independently.
- A correction or a refund changes the period's entitlement:
  - unpaid rows of a changed group are reversed with a reason and one new row is
    issued for the corrected quantity;
  - **paid rows are never changed**;
  - a row reserved in a prepared payout refuses any correction that would change
    it or leave the period not fully paid. The verification is refused as a whole
    (409, naming the payout); cancel the payout, then verify again.
- A refund belongs to **the period whose sale it reverses**. When a later report
  refunds an earlier period's sale, the earlier period's commission is
  recalculated for the salesperson who earned that sale, at that sale's rate (a
  new revision of that settlement records why). The refund period's own
  salesperson is never charged for it.
  - If that commission is still unpaid, it is simply re-issued lower. That is not
    a recovery.
  - Only commission **already paid** above the corrected entitlement becomes a
    **recovery obligation** (`ConsignmentCommissionRecoveries`): one record per
    paid row, naming the salesperson, the paid commission row, its payout, and the
    settlement whose report caused it (the same period for a correction, the
    refund period for a refund).
- *Commission to recover* on a settlement is the total of the current obligations
  its own report caused. The same obligations appear as recovery exposure on the
  paid payout, on its PDF statement (marked "Corrected") and as "recovery
  required" in the commission ledger, so every view reconciles to the same
  records. Correcting the figure back clears the obligation; nothing is counted
  twice. Nothing is deducted automatically in this phase, and no negative
  commission or payout row is ever written.
- Consignment commission can't be reversed or marked paid one row at a time; it
  follows its settlement and is paid only through a payout.

## Payouts

Consignment rows join the existing payout batches unchanged: one salesperson,
one earning period, an exact set of payable rows, idempotent preparation and
whole-batch payment. The payout statement lists them as *Consignment (Standard
price)* and *Consignment (Promotion price)*.

Recording a payout as paid now also requires **the date the money was
transferred** (`CommissionPayouts.TransferredOn`), separate from the moment it
was recorded (`PaidAt`). It can't be in the future or before the payout period.
Payouts recorded before this release keep a blank transfer date.

Preparing a payout and recording it as paid each check, on their own, that every
selected consignment row's settlement is still received in full. If a correction
has left money outstanding the request is refused (409,
`commission_settlement_not_received`) and nothing is reserved or paid.

A paid payout shows **recovery exposure**: the full amount of any of its rows
that were later reversed, plus the current consignment recovery obligations
linked to it. Each affected item shows how much is to be recovered, and the PDF
statement lists it. The payout total and the paid rows themselves never change.

## Release and rollback

The release adds two migrations: `AddConsignmentSettlementsAndCommissionPolicies` and
`AddConsignmentCommissionRecoveries`. Apply the root `migration.sql` before the
API (it is idempotent and can be replayed). Each migration's `Down` refuses to
run once its tables hold data, so financial history is never dropped silently.

Rolling the API back alone is not safe once settlements exist: an older build
would verify reports without writing settlements, receipts or recovery
obligations, and its payout checks know nothing about them. After the first
settlement is written, fix forward, or roll back only to a build that understands
these tables.

## Permissions

| Capability | Permits |
|---|---|
| `consignment_settlements.view` | Settlements, their statements and the commission each period carries |
| `consignment_settlements.record_receipt` | Recording, and voiding by mistake, partner payments |
| `consignment_settlements.resolve` | Confirming who earns a period, and recalculating a period |
| `sales_commissions.rules.manage` | Recording or ending a salesperson's commission terms, and per-tag rates |

The three settlement capabilities are in no built-in role template, so only Super
Admin holds them until somebody is given them. In Solo Operator Mode one Super
Admin can verify, record payments, confirm attribution, prepare and record a
payout. No second approver is required. Recording a payout as paid asks for
explicit confirmation, and every action is audited with its actor.

Merchant documents, emails and public pages never show settlements, sales
commission or salesperson earnings.

## Cost of goods (later phase)

Settlement lines keep branch, SKU, price term and quantity for every verified
sale and refund. Consignment units are dispatched only from receipt-linked stock,
so each branch's custody holds units whose `InventoryReceipts` landed cost is
known. Phase 2 can value sold quantities at the per-branch, per-SKU weighted
average of those units without assigning Tag Codes. Losses and damage are not
sales: they move to the stock ledger's loss buckets and never enter a settlement.
