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
  owner attribution or order history.

## Admin correction

Admin may change an existing owner's attribution to an active salesperson that
has a public referral code. The request requires the current `RowVersion` and
the audit log records old and new values. The change applies only to retail
orders created afterward; no historical order snapshot is rewritten.

## Deferred identity decision

Phase 3A cannot enforce self-referral rules authoritatively because a
`Salesperson` is not linked to an authenticated `User`. Email matching would be
an unreliable identity substitute and is intentionally not used. Phase 3B/3C
must define the salesperson-to-user identity relationship before adding B2C
commission eligibility or self-referral enforcement.
