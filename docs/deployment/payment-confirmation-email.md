# Payment Confirmation Email Operations

MyPetLink queues one payment-confirmation email in `EmailOutbox` in the same
database transaction that approves the payment proof. A background worker sends
the message later. Delivery failure never rolls back a confirmed payment or
removes the Owner Portal Official Receipt.

## Production configuration

Set these values in Azure App Service configuration. Keep the SMTP password in
App Service secrets or another approved secret store; never commit it.

```text
Email__Enabled=true
Email__Provider=Smtp
Email__FromAddress=support@mypetlink.com.my
Email__FromName=MyPetLink
Email__OwnerPortalBaseUrl=https://mypetlink.com.my
Email__BrandLogoUrl=https://mypetlink.com.my/logo-horizontal.png
Email__BrandAssetBaseUrl=https://mypetlink.com.my/email-assets
Email__Smtp__Host=smtppro.zoho.com
Email__Smtp__Port=587
Email__Smtp__UseStartTls=true
Email__Smtp__Username=support@mypetlink.com.my
Email__Smtp__Password=<secret>
Email__Smtp__ConnectionTimeoutSeconds=30
```

Use `billing@mypetlink.com.my` only after Zoho confirms it is an authorized
alias for the authenticated mailbox.

Email is disabled by default. Disabled delivery still records new messages as
`Pending`, so operators can apply the migration, observe the queue, and enable
delivery without losing confirmations. Development uses the non-network
`Development` provider when explicitly enabled. CI replaces `IEmailSender`
with a fake and must never configure Zoho credentials.

Delivery requires **both** `Email__Enabled=true` and the Payment confirmation
template switched on in Admin Portal (Configuration → Email Templates). Turning
on the global switch alone never sends payment confirmations, and enabling the
Welcome email cannot release queued confirmations as a side effect.

While the template is disabled, its messages are excluded from the dispatcher
query entirely: they are never claimed, `AttemptCount` stays at zero, and they
are never marked `Failed`. They remain `Pending` indefinitely and are delivered
once — each exactly once — when the template is enabled.

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

1. Deploy the additive `AddPaymentConfirmationEmailOutbox` migration.
2. Deploy the API with `Email__Enabled=false`.
3. Verify the Admin Portal can see queued delivery status and the worker is
   healthy.
4. Verify SPF, DKIM, DMARC, the authorized From address, and Azure secrets.
5. Enable `Email__Enabled=true`. No template sends yet.
6. Review held-back records in Admin Portal → Configuration → Email Templates.
7. Turn on the Payment confirmation template there and confirm the prompt.
8. Monitor the outbox failure count, application logs, and Zoho sending limits.

An optional live SMTP check requires explicit authorization and must target only
an internal MyPetLink-owned mailbox. Remove or disable temporary settings after
the check.
