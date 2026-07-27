# Owner Welcome Email Operations

MyPetLink queues the transactional `OwnerWelcome` message when an authenticated
user successfully initializes the Owner Portal for the first eligible time.
The frontend calls `POST /api/v1/auth/owner-portal-entry` from the Owner Portal
guard. Google callbacks, token refreshes, and Admin Portal access do not trigger
the message.

The user must be active, have an Owner Profile, and have a linked external
identity whose persisted verified email exactly matches the normalized local
email. This supports Google and the development identity today and uses the same
evidence model for Apple and Email OTP when those validators are enabled.
Missing, invalid, unverified, mismatched, or header-unsafe email addresses do
not block Owner Portal access and do not create an outbox row.

## Exact-once behavior

`EmailOutbox.RelatedUserId` identifies the owner. A filtered unique index on
`(RelatedUserId, MessageType)` is the final concurrency guard, so refreshes,
repeat logins, callback replays, concurrent tabs, worker retries, and Admin
retries reuse the same logical message.

The outbox row is the delivery record. SMTP is never called by authentication
or portal initialization. The shared worker applies the standard retry policy
and records `SentAt`, safe failure details, and attempt counts.

## Configuration

The welcome template is disabled by default and is independently controlled
from payment-confirmation messages:

```text
Email__Enabled=true
Email__Templates__OwnerWelcomeEnabled=true
Email__OwnerPortalBaseUrl=https://mypetlink.com.my
Email__BrandLogoUrl=https://mypetlink.com.my/logo-horizontal.png
Email__BrandAssetBaseUrl=https://mypetlink.com.my/email-assets
```

`Email__BrandLogoUrl` must be a stable, public HTTPS image. The current source
asset is `apps/web/public/logo-horizontal.png`, published by the production Web
app as `/logo-horizontal.png`. The email remains understandable when remote
images are blocked or the configured URL is unavailable.

`Email__BrandAssetBaseUrl` must be a stable, public HTTPS directory containing
the approved optimized email PNGs published by the Web project.

The welcome CTA uses the normal authenticated `/pets/new` Owner Portal route.
All visual and copy rules are defined in
[`../branding/email-design-system.md`](../branding/email-design-system.md).

When either the overall email system or the welcome template is disabled,
portal entry succeeds without creating a welcome outbox row. Enabling the
template later makes the next eligible portal entry the first welcome event for
an owner who does not already have an `OwnerWelcome` row.

## Admin operations

The Admin Owner detail drawer shows the welcome recipient, status, creation and
send times, attempts, and a sanitized delivery note. Only `Failed` messages can
be retried. Retry resets the attempt count, clears the current display error,
schedules the same row immediately, and records an audit entry.

## Rollout

1. Apply `AddPaymentConfirmationEmailOutbox`.
2. Apply `AddOwnerWelcomeEmail`.
3. Deploy with `Email__Templates__OwnerWelcomeEnabled=false`.
4. Verify SMTP, SPF, DKIM, DMARC, sender authorization, and the public logo and
   email-asset URLs.
5. Enable the welcome template and monitor Failed outbox rows.

No live SMTP test is part of automated or local integration verification.
Use the loopback-only Development preview at
`/api/v1/dev/email-previews/welcome/normal` (or `?format=text`) for local
inspection without sending.
