# Sales commission lifecycle

`SalesCommissions` is the single internal, append-only financial ledger for
legacy merchant-order commission and direct retail commission. It does not
change an invoice, payment, receipt, or order amount.

## Sources and historical classification

- Existing and new legacy merchant commissions are `MerchantOrder` /
  `MerchantOrderPercentage`. The Phase 3B migration sets those two
  classifications without changing historical amounts, statuses, attribution,
  payout timestamps, or reversal history. These commissions continue using the
  merchant order's perpetual percentage snapshot until a later phase explicitly
  introduces a different reseller model.
- Direct attributed Smart Tag sales are `TagOrder` /
  `DirectRetailPercentage`.
- `ResellerAcquisitionBonus` and `ResellerRepeatPercentage` are schema
  placeholders only. Phase 3B contains no generation or rule-management path
  for either type.
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

- Only a **Payable** commission transitions to **Paid**. Retrying the same paid
  action is a no-op and does not alter the original payout time or actor.
- A **Payable** or **Paid** commission may transition to **Reversed**. Reversal
  requires an operational reason and records its time and administrator.
- Reversing a paid commission preserves `PaidAt` and `PaidByAdminUserId`; it does
  not silently erase the payout that must be recovered.
- A **Reversed** commission cannot be paid. Repeating its reversal is a no-op.
- Admin cancellation of a paid, unshipped retail order is an authoritative
  invalidation and reverses its direct retail commission atomically. There is no
  complete retail refund-accounting workflow yet, so every other refund or
  financial correction must use the existing explicit audited reversal action.

## Attribution correction

Merchant-order attribution can be corrected only while the order awaits payment
and has no payment or commission history. Owner referral attribution can be
corrected only for future retail orders. Both changes require `RowVersion`, are
Admin-only, and audit old/new values. Neither flow rewrites a historical order or
commission.
