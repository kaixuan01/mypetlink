# Sales reporting and financial authorization

Phase 3D-A separates operational sales visibility from commission accounting.
Authorization is enforced by the API with a fresh `AdminUsers` lookup on every
request; role claims and the Admin Portal's display cache are never sufficient.

| Capability | OwnerSupport | Operations | Admin | SuperAdmin |
| --- | --- | --- | --- | --- |
| Sales performance and reseller relationships | No | Yes | Yes | Yes |
| Commission reports, ledger and CSV exports | No | No | Yes | Yes |
| Prepare a future payout | No | No | Yes | Yes |
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

Until payout batches exist, a ledger row with `PaidAt` is exported as a legacy
individual payment. That marker remains `Yes` if the paid row is later reversed,
because reversal must not erase the historical cash-payment event.

Run `docs/deployment/sql/diagnose-phase3d-financial-authorization.sql` before
deployment. At least one active SuperAdmin is a release blocker because payout,
reversal and rule-management actions are SuperAdmin-only.
