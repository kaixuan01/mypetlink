# Sales reporting and financial authorization

Phase 3D-A separates operational sales visibility from commission accounting.
Authorization is enforced by the API with a fresh `AdminUsers` lookup on every
request; role claims and the Admin Portal's display cache are never sufficient.

| Capability | OwnerSupport | Operations | Admin | SuperAdmin |
| --- | --- | --- | --- | --- |
| Sales performance and reseller relationships | No | Yes | Yes | Yes |
| Commission reports, ledger and CSV exports | No | No | Yes | Yes |
| Prepare a future payout | No | No | Yes | Yes |
| View payouts and download payout statements | No | No | Yes | Yes |
| Mark commission paid | No | No | No | Yes |
| Reverse commission | No | No | No | Yes |
| Manage commission rules | No | No | No | Yes |

`SalesAdministration` is a separate Admin/SuperAdmin policy for seller and
reseller attribution changes. Operations can inspect those relationships but
cannot rewrite them.

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

The Admin Portal hides the Payouts section from OwnerSupport and Operations.
Admin and SuperAdmin can prepare or cancel a batch and download its server-made
statement; only SuperAdmin can record it as paid. The API policies remain the
authority if a client attempts to bypass those controls. Payout statements are
generated from immutable payout snapshots and fail closed when the complete item
set, currency, and prepared total do not reconcile.

Run `docs/deployment/sql/diagnose-phase3d-financial-authorization.sql` before
deployment. At least one active SuperAdmin is a release blocker because payout,
reversal and rule-management actions are SuperAdmin-only.

After applying the Phase 3D-B migration and before enabling payout endpoints,
run `docs/deployment/sql/diagnose-phase3d-b-commission-payouts.sql`. All anomaly
sets must be empty and the active-SuperAdmin set must contain at least one row.
