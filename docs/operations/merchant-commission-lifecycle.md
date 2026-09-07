# Merchant commission lifecycle

Merchant commissions are internal financial records derived from a fully paid
merchant invoice. They do not change merchant invoices, payments or receipts.

## Eligibility and calculation

- A commission becomes **Payable** only when an administrator records the full
  payment for an issued merchant invoice.
- The salesperson identity and percentage come from the immutable merchant
  order snapshots. Later changes to the salesperson record do not affect it.
- The base is invoice merchandise subtotal less the invoice discount. Delivery
  is excluded. The current merchant billing model has no tax or payment-fee
  commission inputs.
- The shared merchant money convention rounds to two decimal places, midpoint
  away from zero.
- At most one commission whose status is not **Reversed** may exist for a
  merchant order. Reversed history is retained.

## Payout and reversal

- Only a **Payable** commission transitions to **Paid**. Retrying the same paid
  action is a no-op and does not change its original payout time or actor.
- A **Payable** or **Paid** commission may transition to **Reversed** when the
  underlying sale is refunded, invalidated or otherwise no longer eligible.
- Reversal requires an operational reason and records the time and administrator.
  If the commission was already paid, its original payout time and administrator
  remain intact so the recovery remains visible in history.
- A **Reversed** commission cannot be paid. Repeating its reversal is a no-op.

Merchant payments are immutable settlement records in the current model, and a
paid merchant invoice/order cannot be cancelled through the cancellation flow.
Therefore a later refund or invalidation is represented by the explicit audited
commission reversal; it does not delete or rewrite the payment, receipt, invoice
or order.

## Attribution correction

An administrator may correct the salesperson attribution only while the order
is awaiting payment and has no payment or commission history. The request must
carry the order RowVersion. The service snapshots the selected salesperson's
current code, name and default percentage and audits the complete old and new
attribution. Once financial history exists, attribution is immutable.
