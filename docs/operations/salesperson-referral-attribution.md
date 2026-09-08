# Salesperson referral attribution

Phase 3A records referral attribution only. It does not calculate or create a
consumer commission, bonus, repeat-purchase window, tier, or payout.

## Invariants

- A salesperson has an internal `SalespersonCode` and an optional, separate
  public `ReferralCode`. Public codes are uppercase A–Z/0–9, 3–24 characters,
  case-insensitively unique, and cannot use `ADMIN`, `API`, `LOGIN`, `WWW`, or
  `AUTH`.
- The browser keeps one first-touch candidate for 90 days. It never replaces a
  valid existing candidate, removes only `ref` from the visible URL, and does
  not capture for an authenticated owner.
- The API is authoritative. It accepts attribution only while creating a new
  owner account, only for an active salesperson, and only when the captured
  timestamp is within `ReferralAttribution:WindowDays` according to server UTC.
  Unknown, inactive, malformed, expired, and future-dated candidates do not
  block sign-in.
- `OwnerReferralAttributions.UserId` is unique. Account and request races are
  also guarded by the existing user/external-login unique indexes, so a retry
  cannot append another attribution.
- A retail order copies the owner attribution from the database. Referral data
  is never accepted in the checkout request and is not part of its idempotency
  fingerprint. Existing orders remain unchanged after an Admin correction.
- Salesperson deactivation prevents new referral redemption. It does not erase
  owner attribution or order history, and an already-snapshotted eligible order
  can still produce its direct retail commission when payment is approved.
- `Salesperson.UserId` optionally links one salesperson to one authenticated
  account. The restrictive foreign key and filtered unique index make this the
  authoritative same-account identity; email matching is never used.
- Known same-account referral capture and Admin correction are refused. New
  orders omit known same-account attribution. Historical attributed orders are
  not rewritten, but payment confirmation excludes and audits a direct retail
  commission when the linked salesperson and purchaser are the same account.

## Admin correction

Admin may change an existing owner's attribution to an active salesperson that
has a public referral code. The request requires the current `RowVersion` and
the audit log records old and new values. The change applies only to retail
orders created afterward; no historical order snapshot is rewritten.

## Direct retail commission boundary

Phase 3B generates `DirectRetailPercentage` commission from the immutable order
snapshot only after Admin payment-proof approval. Rule resolution, calculation,
uniqueness, payout, reversal, and the remaining retail refund limitation are
documented in [Sales commission lifecycle](merchant-commission-lifecycle.md).
