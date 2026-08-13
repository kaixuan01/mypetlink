# MyPetLink configuration inventory

Every configurable value discovered in the monorepo, its authoritative source,
and its ownership category under
[`../architecture/configuration-governance.md`](../architecture/configuration-governance.md).

This inventory references typed Options classes and domain tables rather than
restating every default, so it stays maintainable. Read the referenced class or
table for current values. No secret values appear here.

Categories: **A** secret · **B** infrastructure · **C** global emergency
control · **D** database/Admin editable · **E** database/system managed ·
**F** Admin read-only · **G** code constant · **H** remove/consolidate.

Repository defaults and local `.env.local`/Development settings do **not** prove
that a value exists in Cloudflare, Azure, Google, SQL Server, or R2. Host-side
production values remain owner-verified operational state. See the executable
gate in
[`../launch/PRODUCTION_SOFT_LAUNCH_CHECKLIST.md`](../launch/PRODUCTION_SOFT_LAUNCH_CHECKLIST.md).

---

## Secrets (A)

Owner: Operations. Environment-scoped. Never in Admin Portal, never logged.
Source: Azure App Service configuration or another approved secret store.

| Key | Purpose | Startup behaviour when missing |
| --- | --- | --- |
| `ConnectionStrings:MyPetLinkDb` | Database connection | Falls back to LocalDB — **must** be set in Production |
| `Jwt:SigningKey` | Token signing | Startup throws |
| `Email:Smtp:Password` | Zoho SMTP auth | Validation fails when `Email:Enabled` |
| `Email:Smtp:Username` | Zoho SMTP auth | Validation fails when `Email:Enabled` |
| `CloudflareR2:AccessKeyId` | R2 credential | `CloudflareR2OptionsValidator` |
| `CloudflareR2:SecretAccessKey` | R2 credential | `CloudflareR2OptionsValidator` |

Typed sources: `Auth/JwtOptions.cs`, `Common/EmailOptions.cs`,
`Storage/CloudflareR2Options.cs`.

## Infrastructure (B)

Owner: Operations. Changing requires redeploy or restart.

| Key | Typed source | Notes |
| --- | --- | --- |
| `Jwt:Issuer`, `Jwt:Audience`, `Jwt:AccessTokenMinutes`, `Jwt:RefreshTokenDays` | `JwtOptions` | Token lifetimes are security policy — code-reviewed, not Admin-editable |
| `GoogleAuth:ClientId` | `GoogleAuthOptions` | Non-secret public client id |
| `Cors:AllowedOrigins` | bound inline in `Program.cs` | **Empty allows no origins** — fail-closed but total |
| `ForwardedHeaders:ForwardLimit`, `KnownProxies`, `KnownNetworks` | bound inline | Unset ⇒ rate limiting partitions on the proxy IP |
| `Storage:Provider`, `Storage:LocalRoot`, `Storage:PublicBaseUrl` | `StorageOptions` | `Provider=CloudflareR2` activates R2 validation/status. Current media requests always use `IObjectStorageService`; Local settings are not a working media fallback. See R3. |
| `CloudflareR2:*` (non-secret members) | `CloudflareR2Options` | Bucket names, service URL, presign expiry |
| `PublicSite:BaseUrl` | `PublicSiteOptions` | Manufacturer QR/NFC export only; intentionally empty so tag production fails loudly. Optional while physical tags are deferred, required before export. |
| `Email:Provider`, `FromAddress`, `FromName`, `OwnerPortalBaseUrl`, `BrandLogoUrl`, `BrandAssetBaseUrl` | `EmailOptions` | Brand asset URLs validated HTTPS-only |
| `Email:Smtp:Host`, `Port`, `UseStartTls`, `ConnectionTimeoutSeconds` | `SmtpEmailOptions` | `UseStartTls` must be true |
| `Email:Dispatch:PollIntervalSeconds`, `BatchSize`, `MaxConcurrency`, `VisibilityTimeoutSeconds` | `EmailDispatchOptions` | Worker tuning — must not be exposed to business Admin |
| `OrderReservation:ExpiryEnabled`, `PollIntervalSeconds`, `BatchSize` | `OrderReservationOptions` | Unpaid-order expiry worker tuning. Admin sees safe read-only status; the payment window itself is database-owned. |
| `DatabaseResilience:*` | `DatabaseResilienceOptions` | Retry tuning |
| `RateLimiting:PublicTagScan`, `RateLimiting:TagActivation` | `SmartTagRateLimitingOptions` | Abuse protection — security-adjacent, keep in App Settings |
| `Logging:LogLevel:*`, `AllowedHosts` | ASP.NET built-ins | Standard |

## Global emergency controls (C)

Must remain effective when the database or Admin Portal is unavailable.

| Key | Typed source | Semantics |
| --- | --- | --- |
| `Email:Enabled` | `EmailOptions` | Master switch. Stops **all** delivery. Read-only in Admin. |
| `Features:SmartTagOrderingEnabled` | `FeatureOptions` | Gates creating a **new** order only |
| `DevAuth:Enabled` | `DevAuthOptions` | Startup throws if true outside Development |

Delivery requires the master App Setting **AND** the message type's
`EmailTemplateSettings` row. `Services/EmailTemplateGate.cs` is the single
decision point for the dispatcher, the enqueue path, and Admin retry. This is
the reference pattern for two-level controls.

Per-template enablement moved out of App Settings on 29 Jul 2026. The keys
`Email__Templates__OwnerWelcomeEnabled` and
`Email__Templates__PaymentConfirmedEnabled` no longer exist in code.

## Database / Admin editable (D)

Typed domain tables with audit and `RowVersion`. This is the correct pattern.

| Domain | Table | Admin screen | Notes |
| --- | --- | --- | --- |
| Delivery | `DeliveryRates` | `/admin/delivery-rates` | Fee, zone, free-shipping threshold, active flag. `RowVersion` + audit. **All four seeded zones ship inactive**, so checkout fail-closes until activated. |
| Shipping and fulfilment | `ShippingFulfilmentSettings`, `ShippingCourierProviders` | `/admin/shipping-fulfilment` | Operational sender/return address, parcel defaults, active/default courier choices and optional HTTPS tracking templates. Separate from customer delivery pricing. Customer tracking links seed disabled. |
| Product catalog | `TagProducts`, `TagProductVariants` | `/admin/tag-products` | `BasePrice`, `CompareAtPrice`, availability. Server-authoritative pricing. |
| Variant presets | `TagVariantPresets` | `/admin/tag-products` | Lightweight / Standard |
| Promotions | `Promotions`, `PromotionVariants` | `/admin/tag-products` | Discounts |
| Plans | `Plans`, `PlanLimits` | `/admin/plans` (read-only today) | `MaxPets`, `MaxMemoriesPerPet`, `MaxCareRecords`, `ScanHistoryDays`, entitlement booleans. **Editing requires product approval — see pending decisions.** |
| Inventory | `SmartTagBatches`, `SmartTags` | `/admin/tag-inventory` | Batch generation, stock lifecycle |
| Email templates | `EmailTemplateSettings` | `/admin/email-templates` | One row per message type. `IsEnabled` + `EnabledFromUtc`, audited, `RowVersion`. Missing row = disabled. |
| Order checkout | `OrderCheckoutSettings` | `/admin/order-checkout` | Unpaid payment-reservation duration (30 minutes to 72 hours), snapshotted onto each order. Audited with `RowVersion`. |
| Public Sample Experience | `PublicSiteSettings`, `Pets.IsSampleEligible` | `/admin/sample-experience`, `/admin/pets` | Optionally personalizes the homepage and `/sample` previews with one explicitly Admin-approved pet referenced by `PetId`; never copies pet or owner data. Both settings and eligibility changes are audited and concurrency controlled. Missing or invalid selection fails closed to intentional static sample content without selecting another database pet. |

### Email outbox counts

Admin counts are operational, not raw status tallies:

| Count | Meaning |
| --- | --- |
| **Ready to send** (`EligibleCount`) | `Pending`, template on, `CreatedAt >= EnabledFromUtc`, global delivery on. The worker will claim these next run. |
| **Paused** (`PausedCount`) | Would be ready, but `Email:Enabled` is off. Resumes automatically. |
| **Blocked** (`BlockedCount`) | `Pending` but permanently non-dispatchable: predates `EnabledFromUtc`, or the template is off. Never sends automatically. |
| **Held back** (`SuppressedCount`) | Recorded while the template was off. Never sends. |
| **Not delivered** (`FailedCount`) | Attempted and failed; Admin Retry available while the template can send. |
| **Sent** (`SentCount`) | Delivered. |

"Ready to send" is asserted equal to what the worker would claim.

## Database / system managed (E)

Stored in the database, generated by the application, never Admin-editable.

| Value | Source | Rule |
| --- | --- | --- |
| `TagOrders.OrderNumber` | `BusinessReferenceGenerator` | `MPL-ORD-yyMMddHHmmss-NNNN`, unique index, 12-attempt retry |
| `TagOrders.ReceiptNumber` | `BusinessReferenceGenerator` | `MPL-RCP-…`, unique filtered index |
| `SmartTagBatches.BatchNo` | `BusinessReferenceGenerator` | `MPL-BAT-…`, application-level uniqueness only (no DB index — see risk R5) |
| `SmartTags.TagCode` | Tag issuance | `MPL-XXXX-XXXX` |
| Order pricing/delivery snapshots | `TagOrders`, `TagOrderItems` | Immutable history — must not change when configuration changes |
| `EmailOutbox` status, attempts, lease | `EmailOutboxDispatcher` | Machine-managed. `Suppressed` records a business event whose template was off; never dispatchable. |
| `__EFMigrationsHistory` | EF Core | Migration state |
| `AuditLogs` | `AuditLogService` | Append-only |

## Admin read-only operational status (F)

Implemented at `/admin/operational-status` (API:
`GET /api/v1/admin/operational-status`). Every value is derived from
configuration or database state actually in effect — there are no hardcoded
status literals. `Configured`, `Enabled`, and `Available` are reported
separately because they are not interchangeable.

| Section | Status | Source |
| --- | --- | --- |
| Email | Global delivery enabled/disabled | `Email:Enabled` |
| Email | Mail service configured/incomplete | `EmailOptions.Smtp` presence (never the values) |
| Email | Template configuration available and templates switched on | `EmailTemplateSettings`; unavailable when `AddEmailTemplateSettings` has not been applied |
| Email | Waiting / held back / not delivered | `EmailOutbox` counts |
| Email | Last successful delivery | most recent `EmailOutbox.SentAt` |
| Storage | Location and configuration completeness | `StorageOptions`, `CloudflareR2Options` presence |
| Public links | Public website address configured | `PublicSiteOptions.BaseUrl` |
| Public links | Tag link generation available | derived from the above |
| Ordering | Ordering enabled | `Features:SmartTagOrderingEnabled` |
| Ordering | Active delivery zones, checkout availability | `DeliveryRates` |

No secret, host, credential, endpoint, or provider error detail is exposed.
There is no write endpoint by design.

## Code / domain constants (G)

| Constant | Location | Why it stays in code |
| --- | --- | --- |
| Malaysian states, zones, aliases | `Common/MalaysiaDelivery.cs` | Domain mapping; changing it is a code change with tests |
| Tag variants | `Common/TagVariants.cs` | Enum-backed domain rule |
| Route builders `/q/ /n/ /t/` | `Common/TagLinks.cs`, `apps/web/src/lib/routes.ts` | Physical tags already printed — invariant |
| Business reference format | `Common/BusinessReferenceGenerator.cs` | Format + MYT conversion is an invariant |
| Email retry ladder | `EmailOutboxDispatcher.RetryDelays` | Delivery policy, code-reviewed |
| Upload limits (10 MB image, 50 MB video, 10 MB document) | `Services/MediaService.cs` | Abuse/security control, not a business lever |
| Allowed content types | `Services/MediaService.cs` | Security allowlist |
| Rate-limit policy names, partitions | `Common/SmartTagRateLimiting.cs` | Protocol constants |
| Email/PDF brand colours | `TransactionalEmailLayout`, `OrderDocumentService` | Design system tokens |

## Frontend configuration

Build-time `NEXT_PUBLIC_*` values baked into the static export. **None of these
is financially or security authoritative** — the API re-checks everything.

| Variable | Purpose | Action |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Backend origin; empty ⇒ local preview mode | Retain |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google Identity Services | Retain |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional GA4 adapter; unset disables product analytics | Retain; Operations-owned, build-time infrastructure |
| `NEXT_PUBLIC_MEDIA_BASE_URL` | Media CDN | Retain |
| `NEXT_PUBLIC_SITE_URL` | Canonical public site | Retain (primary) |
| `NEXT_PUBLIC_APP_URL` | Legacy local-dev URL | **Consolidate** into `NEXT_PUBLIC_SITE_URL` (`lib/siteUrl.ts` already prefers SITE_URL) |
| `NEXT_PUBLIC_DEV_AUTH_ENABLED` | Local Admin login affordance | Retain; never set in Production |
| `NEXT_PUBLIC_NOINDEX` | SEO suppression | Retain |
| `NEXT_PUBLIC_PUBLIC_PROFILES_ENABLED` | UI gate | Retain |
| `NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED` | UI gate | Retain |
| `NEXT_PUBLIC_SMART_TAGS_ENABLED` | UI gate | Retain |
| `NEXT_PUBLIC_TAG_ORDERS_ENABLED` | UI gate | Retain |
| `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED` | Mirrors `Features:SmartTagOrderingEnabled` | Retain; documented mirror, fail-closed |
| `NEXT_PUBLIC_DATABASE_WAKE_*` | Cold-start retry UX | Retain |

## Deprecated / to consolidate (H)

| Item | Problem | Recommended action |
| --- | --- | --- |
| `AppSettings` table (`Key`, `ValueJson`) | Generic key/value store; no runtime consumer remains | **Deprecated, physically retained.** All consumers removed 29 Jul 2026; the table and its rows are kept for one rollback window. Drop only via a future `RemoveLegacyAppSettings` migration once the conditions in the deployment docs are met. |
| `AppSettings.tag.qr.price` | Stale duplicate of `TagProductVariants.BasePrice` | **No longer read or displayed.** Row still physically present until the drop migration. |
| `AppSettings.tag.qr_nfc.price` | Same | **No longer read or displayed.** |
| `AppSettings.premium.status` / `gps.status` | Duplicated by hardcoded strings | **No longer read.** Neither is presented as an available feature. |

| `AppSettings.payment.mode` | Descriptive label, no behaviour | **No longer read.** |
| `NEXT_PUBLIC_APP_URL` | Superseded by `NEXT_PUBLIC_SITE_URL` | Deprecate after Cloudflare env update |
| `support@mypetlink.com.my` ×4 | `EmailOptions.FromAddress`, `TransactionalEmailLayout.SupportEmail`, `OrderDocumentService.SupportEmail`, `apps/web/src/config/site.ts` | Pick one backend authority; keep the frontend copy for static rendering with a comment |
| Legal identity ×2 | `OrderDocumentService` (`BusinessRegNo`, `BusinessOwner`) and `apps/web/src/config/site.ts` (`businessRegistrationNo`, `companyName`) | Keep code-owned (legal change needs review) but cross-reference so they cannot drift |

## Pending product decisions

These require an owner's approval before any implementation:

1. **Should `PlanLimits` become Admin-editable?** It is a correctly typed table
   and technically ready, but plan entitlements are commercial terms. Making
   them editable before a billing system exists risks entitlement and billing
   disagreeing. Recommendation: keep read-only until billing ownership is
   decided.
2. **Should product prices be Admin-editable without confirmation?** The model
   already supports it; the question is approval workflow for price changes.
3. **Should the four delivery zones be activated at RM 0**, or priced before
   ordering opens? Currently inactive, so checkout fail-closes.
4. ~~Retire the `AppSettings` table~~ — **done**, replaced by the read-only
   Operational Status page.

## Known runtime risks

| Id | Risk | Current behaviour |
| --- | --- | --- |
| R1 | Delivery rates seeded inactive | Checkout returns 409 `delivery_unavailable` — fail-closed, correct, but ordering is blocked until an admin activates zones |
| R2 | ~~`FileStorageEnabled: false` hardcoded~~ | **Fixed.** Storage status is derived from `StorageOptions`/`CloudflareR2Options`. |
| R3 | `Storage:Provider` defaults to `Local` | R2 validation is skipped even though current `MediaService` still uses R2; the API starts and media operations fail later. Production must set `CloudflareR2`. |
| R4 | `Cors:AllowedOrigins` empty in Production | No origins allowed; the frontend cannot reach the API at all |
| R5 | `SmartTagBatches.BatchNo` has no unique database index | Application-level 12-attempt check only |
| R6 | `PublicSite:BaseUrl` empty | Manufacturer export fails loudly — correct, but blocks tag production |
