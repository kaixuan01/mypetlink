# Sales reporting and financial authorization

Phase 3D-A separates operational sales visibility from commission accounting.
Authorization is enforced by the API with a fresh database lookup on every
request; role claims and the Admin Portal's display cache are never sufficient.

These separations are now expressed as capabilities in the Admin Portal's
capability catalogue. See
[`docs/architecture/admin-access-management.md`](../architecture/admin-access-management.md)
for the model; this page describes what each of these financial capabilities
actually permits.

| Capability | Permits |
| --- | --- |
| `sales.view` | Sales performance, resellers, salespeople and referral attribution |
| `sales.manage` | Changing seller and reseller attribution. Holding `sales.view` alone lets you inspect those relationships but not rewrite them |
| `sales_commissions.view` | Commission reports and the ledger |
| `sales_commissions.export` | Commission-ledger and reseller-portfolio CSV exports |
| `merchant_invoices.record_payment` | Recording money received against an invoice, which is what makes commission payable |
| `payouts.view` | Payout batches and their statements |
| `payouts.manage` | Preparing a future payout, and cancelling one not yet paid |
| `payouts.settle` | Recording a payout or an individual commission as paid |
| `sales_commissions.reverse` | Reversing a commission |
| `sales_commissions.rules.manage` | Changing the rates and rules that decide future commission |

The built-in roles that existing administrators were migrated onto reproduce
the previous matrix exactly: Operations holds `sales.view`; Administrator adds
`sales.manage`, `sales_commissions.view`, `merchant_invoices.record_payment`,
`payouts.view` and `payouts.manage`; only Super Admin holds `payouts.settle`,
`sales_commissions.reverse` and `sales_commissions.rules.manage`.
`FinancialAuthorizationPolicyTests` asserts this has not drifted.

## Date semantics

All report ranges are half-open UTC intervals: `[from, toExclusive)`.

- Direct retail activity uses `TagOrder.PaymentConfirmedAt`.
- Merchant activity uses `MerchantPayment.PaymentDate`.
- New reseller activation uses `Merchant.FirstQualifyingPaidOrderAt`.
- Commission earned uses `SalesCommission.CalculatedAt`.
- Cash paid during a period uses `SalesCommission.PaidAt`, even if that row was
  later reversed.
- Reversal activity uses `SalesCommission.ReversedAt`.
- Profitability remains a separate shipment/COGS report.

Gross commission generated is historical event value. Current valid, payable,
paid and reversed totals classify commissions earned in the selected range by
their current ledger status. Cash paid and reversal activity instead use their
own event timestamp, which prevents later state changes from rewriting history.

A repeat relationship is `EndingSoon` during its final 30 days. Payment at the
exact repeat-window end remains ineligible because the window is half-open.

## Exports

Commission-ledger and reseller-relationship CSV exports are generated on the
server, capped at 10,000 rows, UTF-8 with a BOM, RFC-style quoted, and passed
through the shared spreadsheet-formula sanitizer cell by cell. Each export is
audited with its filters and returned row count.

The commission ledger distinguishes unclaimed Payable rows, rows reserved in a
Prepared payout, rows included in a Paid payout, and legacy individual payment.
It also offers a `PayableAndUnclaimed` filter for exact payout selection. The
legacy marker remains `Yes` if such a row is later reversed, because reversal
must not erase the historical cash-payment event. Paid-payout reversals expose
recovery-required state and the original payout number without changing the
historical Paid payout.

The Admin Portal hides the Payouts section from anyone without `payouts.view`,
and offers preparing, cancelling and recording-as-paid only to whoever holds the
matching capability. The API policies remain the authority if a client attempts
to bypass those controls. Payout statements are generated from immutable payout
snapshots and fail closed when the complete item set, currency, and prepared
total do not reconcile.

Run `docs/deployment/sql/diagnose-phase3d-financial-authorization.sql` before
deployment. At least one active Super Admin is a release blocker because payout
settlement, commission reversal and rule management are granted only by that
role out of the box — and because only a Super Admin can grant them to anyone
else.

After applying the Phase 3D-B migration and before enabling payout endpoints,
run `docs/deployment/sql/diagnose-phase3d-b-commission-payouts.sql`. All anomaly
sets must be empty and the active-SuperAdmin set must contain at least one row.
