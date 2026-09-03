# Smart Tag Order Email Operations

MyPetLink records Smart Tag order emails in `EmailOutbox` in the same database
transaction as the event: payment-proof submission, proof rejection, payment
confirmation, or shipment. A background worker sends eligible messages later.
Delivery failure never rolls back the order or payment-proof decision.

## Production configuration

Set these values in Azure App Service configuration. Keep the SMTP password in
App Service secrets or another approved secret store; never commit it.

```text
Email__Enabled=false
Email__Provider=Smtp
Email__FromAddress=support@mypetlink.com.my
Email__FromName=MyPetLink
Email__OwnerPortalBaseUrl=https://mypetlink.com.my
Email__BrandLogoUrl=https://mypetlink.com.my/logo-horizontal.png
Email__BrandAssetBaseUrl=https://mypetlink.com.my/email-assets
Email__OperationsRecipient=operations@mypetlink.com.my
Email__Smtp__Host=smtppro.zoho.com
Email__Smtp__Port=587
Email__Smtp__UseStartTls=true
Email__Smtp__Username=support@mypetlink.com.my
Email__Smtp__Password=<secret>
Email__Smtp__ConnectionTimeoutSeconds=30
```

Use `billing@mypetlink.com.my` only after Zoho confirms it is an authorized
alias for the authenticated mailbox.

Email is disabled by default. The global switch pauses otherwise eligible
`Pending` rows. A disabled or missing template instead records its event as
permanently `Suppressed`; it never enters a backlog that can be released later.
Development uses the non-network `Development` provider when explicitly
enabled. CI replaces `IEmailSender` with a fake and must never configure Zoho
credentials.

Delivery requires **both** `Email__Enabled=true` and the relevant template
switched on in Admin Portal (Configuration → Email Templates). The Smart Tag
order templates are Payment confirmation, Order shipped, Payment proof review
alert, and Payment proof rejected. Turning on the global switch alone sends
none of them.

While a template is disabled, its messages are `Suppressed` and excluded from
the dispatcher: they are never claimed, `AttemptCount` stays at zero, and they
are never marked `Failed` or later released. Re-enabling a template refreshes
`EnabledFromUtc`; pending rows older than that new boundary remain permanently
blocked. This is intentionally different from the global switch, which only
pauses otherwise eligible work and lets it resume when delivery is restored.
After launch, use `Email__Enabled=false` when delivery must be paused. Do not
disable and re-enable templates casually, because doing so advances the
eligibility boundary and can permanently strand rows queued in between.

Confirmations recorded while the template was off are stored as held-back
records. Enabling the template stamps the moment of the decision and only
releases events recorded from then on, so a historical backlog can never be
flushed to customers by flipping a switch. Held-back records stay visible in
Admin Portal for review.

## Delivery and retry policy

- Attempt 1: immediately.
- Attempt 2: after 1 minute.
- Attempt 3: after 5 minutes.
- Attempt 4: after 30 minutes.
- Attempt 5: after 2 hours.
- A permanent SMTP rejection or exhaustion of attempt 5 marks the message
  `Failed`.
- Admin Retry changes the existing row from `Failed` to `Pending`, resets the
  attempt count to zero, clears the current display error, schedules it
  immediately, and records the previous failure in the audit log. Retry is
  refused with a conflict while the master switch or this template's switch is
  off, so an operator is never told a message was requeued when it cannot send.
- `Sending` rows have a visibility lease and are reclaimed after the lease
  expires. The unique `(RelatedOrderId, MessageType)` index prevents a second
  queued payment-confirmation message for the same order.

The Official Receipt remains link-only. The email opens the authenticated Owner
Portal order page; it does not attach PDF bytes or expose a bearer token.
The template uses the shared layout in
[`../branding/email-design-system.md`](../branding/email-design-system.md).
Inspect it without sending at the loopback-only Development route
`/api/v1/dev/email-previews/payment-confirmed/normal`.

## DNS and Zoho readiness

Complete and verify these checks before enabling production delivery:

- Zoho SPF record is published and verified for `mypetlink.com.my`.
- Zoho DKIM selector and public key are published and verified.
- DMARC is configured, monitored, and aligned with the From domain.
- `support@mypetlink.com.my` is an authorized Zoho mailbox or From address.
- If Zoho 2FA is enabled, an application-specific password is stored in Azure.
- Zoho account sending limits are understood and monitored.
- Failed-message count and repeated SMTP failures are monitored.

Do not change DNS automatically from the application deployment.

## Deployment order

Keep Smart Tag commerce disabled throughout this sequence.

1. Deploy the API configuration with `Email__Enabled=false`. This is the global
   emergency pause and prevents every template from delivering during setup.
2. Configure `Email__OperationsRecipient` to a reviewed MyPetLink-owned mailbox.
   Confirm Operational Status reports the recipient as configured without
   exposing its value.
3. Apply migrations through `AddPaymentProofNotifications`, then verify all four
   Smart Tag order template rows exist and are disabled.
4. With global delivery still off, enable each required template deliberately.
   Enable Payment proof review alert only after the operations mailbox has been
   verified. Every enable action stamps a new `EnabledFromUtc`; earlier rows do
   not become eligible.
5. Validate SMTP/TLS credentials, SPF, DKIM, DMARC, sender authorization, worker
   health, Email Templates counts, and Operational Status. Resolve every high
   priority recipient warning before proceeding.
6. Set `Email__Enabled=true` only after those checks pass.
7. Verify eligible paused rows drain, new test events deliver, failure counts
   remain stable, and Zoho limits/logs are healthy.
8. Only after delivery is proven healthy, enable Smart Tag commerce in both the
   API and rebuilt web app.

Operational Status raises a high-priority warning when delivery is globally
enabled, or the Payment proof review alert template is enabled, but the current
operations recipient is missing or invalid. Customer proof submission still
succeeds; the alert is recorded as held back.

Admin Portal offers one audited recovery action only for
`AdminPaymentProofSubmitted` rows held back specifically because the operations
recipient was unavailable. It requires a currently valid recipient and enabled
template, updates the same outbox rows to `Pending`, respects the current
`EnabledFromUtc`, and is safe to repeat. It does not recover template-disabled
or historical rows, and there is no generic suppressed-message recovery.

An optional live SMTP check requires explicit authorization and must target only
an internal MyPetLink-owned mailbox. Remove or disable temporary settings after
the check.
