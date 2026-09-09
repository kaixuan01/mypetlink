# Sales commission lifecycle

`SalesCommissions` is the single internal, append-only financial ledger for
legacy merchant-order, reseller, and direct retail commission. It does not
change an invoice, payment, receipt, or order amount.

## Sources and historical classification

- Existing legacy merchant commissions are `MerchantOrder` /
  `MerchantOrderPercentage`. The Phase 3B migration sets those two
  classifications without changing historical amounts, statuses, attribution,
  payout timestamps, or reversal history. These commissions continue using the
  merchant order's perpetual percentage snapshot. Existing merchants are
  explicitly backfilled to `MerchantCommissionPlan.LegacyPercentage`; neither
  historical nor future behavior is inferred from a creation date.
- Merchants created by the Phase 3C application explicitly use
  `AcquisitionAndRepeat`. They never generate `MerchantOrderPercentage`.
- Direct attributed Smart Tag sales are `TagOrder` /
  `DirectRetailPercentage`.
- Reseller activation orders are `MerchantOrder` / `ResellerAcquisitionBonus`;
  eligible later orders are `MerchantOrder` / `ResellerRepeatPercentage`.
- Database checks keep the source discriminator and nullable source foreign keys
  consistent. Filtered, type-scoped unique indexes permit reversed history but
  prevent more than one financially effective commission of a type per source.

## Merchant eligibility and calculation

- A merchant commission becomes **Payable** only when an administrator records
  the full payment for an issued merchant invoice.
- Salesperson identity and percentage come from immutable merchant-order
  snapshots. Later salesperson changes do not affect it.
- The base is invoice merchandise subtotal less invoice discount. Delivery is
  excluded. The current model has no tax or payment-fee commission inputs.

## Reseller acquisition and repeat entitlement

- `AssignedSalespersonId` is current account servicing. Acquisition ownership is
  stored separately in `AcquiredBySalespersonId`; changing servicing never moves
  the acquisition, restarts a window, or creates another bonus.
- A new merchant initially copies its active assigned salesperson into the
  acquisition owner. Admin may correct that owner with `RowVersion` and an
  old/new audit entry until activation. Activation permanently locks it.
- An inactive salesperson cannot receive a new acquisition. Deactivation after
  activation does not cancel or transfer the already established entitlement.
- Activation uses the paid invoice item quantity, not allocation or fulfilment
  quantity. The first order matching an active acquisition tier gets only its
  fixed bonus. A below-tier paid order is valid but does not set an activation
  date or start the repeat window.
- Seeded global acquisition tiers are 10–19 units / RM50, 20–49 / RM80,
  50–99 / RM150, and 100+ / RM250. These are effective-dated `CommissionRule`
  rows, not billing-service constants.
- At activation the applicable repeat rule is resolved and its rule id,
  effective date, percentage, eligibility months, salesperson identity, start,
  and end are snapshotted on the merchant. The seeded global terms are 3% for
  three months. Later rule edits affect only later activations.
- The repeat window is half-open UTC:
  `[FirstQualifyingPaidOrderAt, RepeatCommissionEligibleUntil)`. The activation
  order is explicitly excluded. A different order paid immediately before the
  end qualifies; payment at the exact end does not.
- Repeat base uses the same merchandise-minus-discount calculator and two-decimal
  midpoint-away-from-zero rounding as legacy merchant commission. Shipping and
  non-product fees are excluded.
- The payment transaction takes a serializable merchant relationship lock.
  Application guards plus filtered indexes enforce one acquisition bonus per
  merchant and one effective commission of a type per merchant order/payment.

## Direct retail eligibility and calculation

- A direct retail commission becomes **Payable** in the same serializable
  transaction that approves the latest payment proof and confirms the order.
  Unpaid orders and rejected proofs create no commission.
- The salesperson comes only from the immutable `TagOrder` attribution
  snapshot. The owner's current referral attribution is never re-read.
- The applicable `CommissionRule` is active at the payment-confirmation UTC
  timestamp, covers the order quantity and currency, and is resolved in this
  deterministic order: salesperson-specific rule, then global rule, then most
  recent `EffectiveFrom`. Active rules with overlapping time and quantity ranges
  in the same scope are rejected.
- The seeded global Phase 3B rule is 15% MYR from 1 January 2026. The service
  does not hardcode this rate. The rule id, rule effective date, percentage,
  seller identity, eligible base, amount, and trigger timestamp are snapshotted
  on the commission.
- Eligible base is `SUM(TagOrderItem.FinalAmount)`. These line totals already
  include promotions. Delivery, payment fees, and every non-product amount are
  excluded.
- Base and commission are rounded to two decimal places, midpoint away from
  zero, once over the complete eligible order. Thus RM29.90 at 15% is RM4.49;
  three tags totalling RM89.70 produce RM13.46, not RM13.47.
- An inactive salesperson still receives an eligible historical order's
  commission because the order snapshot, not current assignment eligibility,
  is authoritative.

## Same-account exclusion

`Salesperson.UserId` is an optional, unique, restrictive link to an
authenticated account. When it is known, the application refuses a new or
corrected self-attribution and omits the salesperson snapshot on a new
self-referred order. A historical order that already contains such attribution
is checked again at payment confirmation: the purchase remains valid and is
confirmed, but no commission is generated and the exclusion is audited.

Email equality is never treated as identity. Linking an account does not rewrite
existing attributions, orders, or commissions. The deployment diagnostic reports
known historical same-account cases for Admin review.

## Payout and reversal

Phase 3D-B pays commissions through append-only payout batches. Preparing a
batch is already a financial reservation: it snapshots an exact set of payable
MYR ledger rows for one salesperson and one half-open earning period. There is
no editable draft. A filtered unique index permits only one unreleased payout
item per commission.

- Admin or SuperAdmin may prepare or cancel a payout. Only SuperAdmin may mark
  it paid. All transitions use `RowVersion`, a serializable transaction and
  deterministic commission-row locks.
- Preparation validates the exact selected count, salesperson, period,
  currency, payable status, unclaimed state and authoritative total. Its
  idempotency key is bound to a fingerprint of the canonical sorted request.
- Payment revalidates every active item and reconciles the item snapshots to
  the header total, then marks the payout and every commission paid at one UTC
  timestamp and by one administrator. It cannot partially succeed.
- Cancellation retains the header and items, records a reason on each released
  item, and leaves the underlying commissions Payable so a new payout can claim
  them.
- The legacy individual `Mark Paid` endpoint remains for compatibility, but it
  rejects a commission reserved in a Prepared payout. Such historical direct
  payments are reported as `LegacyIndividualPaid`.

- Only a **Payable** commission transitions to **Paid**. Retrying the same paid
  action is a no-op and does not alter the original payout time or actor.
- A **Payable** or **Paid** commission may transition to **Reversed**. Reversal
  requires an operational reason and records its time and administrator.
- Reversing a paid commission preserves `PaidAt` and `PaidByAdminUserId`; it does
  not silently erase the payout that must be recovered. If the commission was
  part of a Paid payout, that payout remains Paid and its detail reports the
  amount as explicit recovery exposure. No automatic offset is created.
- A commission reserved in a Prepared payout cannot be reversed directly; the
  batch must be cancelled first.
- A **Reversed** commission cannot be paid. Repeating its reversal is a no-op.
- Admin cancellation of a paid, unshipped retail order is an authoritative
  invalidation and reverses its direct retail commission atomically. There is no
  complete retail refund-accounting workflow yet, so every other refund or
  financial correction must use the existing explicit audited reversal action.

Phase 3D-C exposes this lifecycle through the Admin Portal's **Payouts** section.
Admin and SuperAdmin may inspect, filter, prepare, cancel, and download payout
statements; only SuperAdmin sees the action that records a completed external
payment. The preparation screen submits only the explicitly selected
`PayableAndUnclaimed` commission IDs and keeps the same idempotency key for the
life of that preparation attempt. The normal invoice and commission screens no
longer offer individual payment actions; the compatibility endpoint remains for
historical and integration safety.

The server generates each Commission Payout Statement on demand from the
immutable payout header and item snapshots. Every item, including items released
after cancellation, must reconcile exactly to `PreparedAmount` and the payout
currency before a PDF is rendered. Prepared statements say that they are not
proof of transfer, cancelled statements preserve the released item history, and
paid statements show payment details. Reversals after payment appear in a
separate recovery-required section and never rewrite the original paid total.

## Attribution correction

Merchant-order attribution can be corrected only while the order awaits payment
and has no payment or commission history. Owner referral attribution can be
corrected only for future retail orders. Both changes require `RowVersion`, are
Admin-only, and audit old/new values. Neither flow rewrites a historical order or
commission.

Reseller acquisition attribution is a separate Admin-only correction. It is
available only to `AcquisitionAndRepeat` merchants before activation, uses the
merchant `RowVersion`, and does not run through the normal merchant edit model.
After activation, neither servicing edits nor commission reversal clear or
rewrite the acquisition relationship. Resetting a truly invalid activation
would require a future explicit audited recovery workflow.
