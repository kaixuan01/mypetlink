# Production Soft Launch Checklist

This is the operational gate for the controlled soft launch. It does not
authorize a deployment. Detailed key ownership and formats remain in
[`../operations/configuration-inventory.md`](../operations/configuration-inventory.md)
and [`../deployment/environment-variables.md`](../deployment/environment-variables.md).

## Verdict

**2026-08-14 — NO-GO FOR CONTROLLED SOFT LAUNCH.** The deployment was verified
end-to-end against live production (see
[Production verification evidence](#production-verification-evidence-2026-08-14)).
The platform passed; one launch-scope violation blocks the launch.

**Blocker — Smart Tag commerce is live.** Owner Portal shows Smart Tags navigation
and a full four-step checkout with real pricing, and the API ordering gate is not
blocking. Minimum fix is configuration only, followed by a Pages rebuild:

| Setting | Owner | Required value |
| --- | --- | --- |
| `NEXT_PUBLIC_SMART_TAGS_ENABLED` | Cloudflare Pages (Production) | `false` |
| `NEXT_PUBLIC_TAG_ORDERS_ENABLED` | Cloudflare Pages (Production) | `false` |
| `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED` | Cloudflare Pages (Production) | `false` |
| `Features__SmartTagOrderingEnabled` | Azure App Service | `false` |

Re-test after the rebuild: Smart Tags/Orders must be absent from Owner Portal
navigation, and `POST /api/v1/orders` must return `403 feature_disabled`.

**Decision required — GA4 is live.** `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set to
`G-XK7KHV8GVT` in the Production build, contrary to the guidance below. Either
confirm the consent/product decision is made and update this document, or unset
the variable and rebuild.

---

**2026-08-13 (superseded) — READY AFTER OWNER ACTIONS.** Repository code is ready
for production configuration, but this checkout cannot prove the values in
Cloudflare Pages, Azure App Service, Google Cloud Console, Azure SQL, DNS, or R2.

The repository has development-only local configuration. It is gitignored and
is not evidence of production configuration. Never copy its values into a
production build.

## Pre-deployment owner actions

### Blocking

- [ ] Confirm `mypetlink.com.my`, `api.mypetlink.com.my`, and
  `media.mypetlink.com.my` have valid HTTPS service bindings. Decide whether
  `www.mypetlink.com.my` redirects to the apex or is also served.
- [ ] Configure the Cloudflare Pages build-time and Functions runtime values in
  the tables below. Preview and Production are separate scopes.
- [ ] Configure Azure App Service and secret-store values in the tables below.
- [ ] Configure one Google Web client for the production browser origin. The
  frontend and API client IDs must be identical. This GIS ID-token flow needs
  an Authorized JavaScript origin, not an OAuth redirect URI.
- [ ] Provision Azure SQL, take/confirm the backup posture, review and apply the
  authoritative root `migration.sql` with `sqlcmd -I`, and compare
  `__EFMigrationsHistory` with `dotnet ef migrations list`. The API does not
  migrate or seed users at startup.
- [ ] Configure R2 public/private buckets, credentials, public custom domain,
  and bucket CORS for browser PUTs from the production web origin.
- [ ] Log in once with the intended Google account, create the first production
  `AdminUsers` row using the documented manual procedure, then verify admin and
  non-admin authorization.
- [ ] Verify the actual Cloudflare-to-Azure proxy chain before trusting any
  `X-Forwarded-For` source. Do not add broad trusted networks.

### Non-blocking for the first controlled launch

- [ ] Decide analytics consent/product policy. Until resolved, leave
  `NEXT_PUBLIC_GA_MEASUREMENT_ID` unset; the product remains usable.
- [ ] Leave `Email__Enabled=false` for the first launch. Later, SMTP-test with a
  controlled recipient, enable only the Owner Welcome template in Admin, and
  then turn on the global switch. Commerce templates stay off while commerce
  is off.
- [ ] Optional: select an approved Featured Sample Pet. The generic sample
  experience is complete without one.

## Production environment variables

No secret value belongs in this document.

### Cloudflare Pages build-time

| Variable | Production value/state | Required | Missing/invalid behaviour |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://mypetlink.com.my` | Yes | Server-rendered absolute links can fall back to a Pages placeholder; browser links use the current origin |
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.mypetlink.com.my` | Yes | Frontend enters local preview/fallback mode instead of using production data |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Production Google Web client ID | Yes | Google sign-in is unavailable |
| `NEXT_PUBLIC_MEDIA_BASE_URL` | `https://media.mypetlink.com.my` | Optional | API absolute media URLs still work; bare-key fallback cannot resolve |
| `NEXT_PUBLIC_PUBLIC_PROFILES_ENABLED` | `true` | Yes (explicit) | Defaults to `true` |
| `NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED` | `true` | Yes (explicit) | Defaults to `false`; finder routes still work but owner Safety links/status/QR management are hidden |
| `NEXT_PUBLIC_SMART_TAGS_ENABLED` | `false` | Yes (explicit) | Defaults to `false` |
| `NEXT_PUBLIC_TAG_ORDERS_ENABLED` | `false` | Yes (explicit) | Defaults to `false`; also requires Smart Tags on |
| `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED` | `false` | Yes (explicit) | Defaults to `false`; frontend-only mirror of the API gate |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Unset initially | No | Analytics provider and events remain inert; invalid values are rejected |
| `NEXT_PUBLIC_NOINDEX` | Unset in Production | Yes (state) | `true` suppresses indexing for the build |
| `NEXT_PUBLIC_DEV_AUTH_ENABLED` | Unset | Yes (state) | Production code still refuses the dev login UI, but do not configure it |
| `NEXT_PUBLIC_DATABASE_WAKE_MAX_ATTEMPTS` | Default `6` or a reviewed integer 1-10 | No | Bounded default applies |
| `NEXT_PUBLIC_DATABASE_WAKE_MAXIMUM_WAIT_SECONDS` | Default `45` or a reviewed integer 5-60 | No | Bounded default applies |
| `NODE_VERSION` | `22` when the Pages build image needs an override | Host-dependent | An old runtime can fail the build |

`NEXT_PUBLIC_*` values are public and baked into the static bundle. Any change
requires a rebuild and redeploy. `NEXT_PUBLIC_APP_URL` is local-development
compatibility only and should be unset in Production.

### Cloudflare Pages Functions runtime

| Variable | Production value | Required | Missing behaviour |
| --- | --- | --- | --- |
| `PUBLIC_API_BASE_URL` | `https://api.mypetlink.com.my` | Yes | `/p/*` uses generic metadata during API failure; social-card generation returns unavailable. `NEXT_PUBLIC_API_BASE_URL` is only a compatibility fallback. |

### Azure App Service API

| Variable | Production value/state | Required | Secret | Missing/unsafe behaviour |
| --- | --- | --- | --- | --- |
| `ASPNETCORE_ENVIRONMENT` | `Production` | Yes | No | Swagger/dev-only behavior can be exposed if the host is misclassified |
| `ConnectionStrings__MyPetLinkDb` | Azure SQL encrypted connection string | Yes | Yes | Current code silently falls back to LocalDB; deployment must stop |
| `Jwt__SigningKey` | Random value, at least 32 characters | Yes | Yes | Startup throws |
| `Jwt__Issuer` | Reviewed production issuer | Yes | No | Default may be used; tokens must use one stable value |
| `Jwt__Audience` | Reviewed production audience | Yes | No | Default may be used; tokens must use one stable value |
| `GoogleAuth__ClientId` | Same client ID as the frontend | Yes | No | Google endpoint returns `auth_provider_not_configured` |
| `Cors__AllowedOrigins__0` | `https://mypetlink.com.my` | Yes | No | Production permits no browser origins |
| `Cors__AllowedOrigins__1` | `https://www.mypetlink.com.my` only if served | Conditional | No | Requests from that exact origin fail CORS |
| `Storage__Provider` | `CloudflareR2` | Yes | No | Default `Local` skips R2 startup validation, but current media requests still use R2 and then fail; deployment must stop |
| `CloudflareR2__AccountId` or `CloudflareR2__ServiceUrl` | R2 service location | Yes | No | Startup validation fails when R2 is selected |
| `CloudflareR2__AccessKeyId` | R2 credential | Yes | Yes | Startup validation fails when R2 is selected |
| `CloudflareR2__SecretAccessKey` | R2 credential | Yes | Yes | Startup validation fails when R2 is selected |
| `CloudflareR2__PublicBucketName` | Public media bucket | Yes | No | Startup validation fails; must differ from private bucket |
| `CloudflareR2__PrivateBucketName` | Private files bucket | Yes | No | Startup validation fails; must differ from public bucket |
| `CloudflareR2__PublicBaseUrl` | `https://media.mypetlink.com.my` | Yes | No | Startup validation fails for missing/non-absolute URL |
| `Features__SmartTagOrderingEnabled` | `false` | Yes (explicit) | No | Defaults to `false`; API blocks new orders with `feature_disabled` |
| `Email__Enabled` | `false` initially | Yes (explicit) | No | No email is delivered; queued eligible mail is paused |
| `DevAuth__Enabled` | Unset/`false` | Yes (state) | No | Startup throws if enabled outside Development |
| `PublicSite__BaseUrl` | Unset initially; `https://mypetlink.com.my` before physical-tag production | Conditional | No | Manufacturer QR/NFC export fails closed; core profile launch is unaffected |
| `ForwardedHeaders__*` | Exact verified proxy IPs/networks only | Host-dependent | No | Untrusted forwarding is ignored; tag-scan rate limits may share a proxy IP |
| `RateLimiting__*`, `DatabaseResilience__*`, `OrderReservation__*` | Reviewed defaults | No | No | Bounded code defaults apply |

If email is later enabled, configure `Email__Provider=Smtp`, sender/brand URLs,
SMTP host/port/STARTTLS/username/password, and dispatch tuning. Validation fails
at startup when enabled SMTP configuration is incomplete. Authentication does
not use this email subsystem.

## Feature flag matrix

| Feature | Configuration | Soft-launch state | Reason |
| --- | --- | --- | --- |
| Google authentication | Google IDs + JWT + CORS | ON | Only implemented production sign-in method |
| Public Share Profile | `NEXT_PUBLIC_PUBLIC_PROFILES_ENABLED=true` | ON | Core launch value |
| Moments and Life Timeline | No flag | ON | Core retention surface |
| Care Records/due dates | No flag | ON | Core retention surface; no reminder delivery promise |
| Sample Experience | No flag; optional DB personalization | ON | Complete static fallback exists |
| Safety Profile owner UI | `NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED=true` | ON | Marketing promises the free Safety Profile/QR; explicit owner controls are safer than hiding them |
| Existing finder routes | No owner-UI dependency | ON | `/q/*`, `/t/*`, `/n/*` remain operational; finder no-contact fallback is fixed |
| Smart Tags navigation | `NEXT_PUBLIC_SMART_TAGS_ENABLED=false` | OFF | Outside controlled scope |
| Tag orders/commerce | both order flags + API ordering flag `false` | OFF | Full commerce E2E has not been production browser-verified |
| Manual payment/shipping/merchant sales | hidden with commerce; Admin remains support-only | OFF for customer launch | Not needed for free profiles |
| Premium/GPS | code/plan status | Coming Soon/Coming Later | No subscription or GPS product exists |
| Care reminder delivery | No implementation | OFF | Due-date display only |
| GA4 | measurement ID unset initially | OFF | Consent/product decision remains; non-blocking |
| Transactional email | global switch `false`; all templates off | OFF initially | Not auth-critical; reduce first-launch dependencies |

## Deploy gate

- [ ] Run the full repository verification suite and EF pending-model check.
- [ ] Confirm CI is green on the exact commit.
- [ ] Verify host-side values by name and set/unset state without copying secrets
  into tickets, chat, screenshots, or documentation.
- [ ] Build the frontend only after Production-scoped Cloudflare variables are
  set. Confirm the generated bundle contains production HTTPS origins and no
  localhost or preview `noindex` configuration.
- [ ] Deploy API only after the database migration is applied. Readiness must be
  200 before directing the frontend to it.

## Post-deployment smoke test

1. Check apex, optional `www` behavior, API live and ready endpoints, and media
   domain over HTTPS. Confirm Swagger and dev-auth routes return 404.
2. From the production origin, complete Google login, session refresh, logout,
   and protected-route redirect. Confirm a non-admin receives 403 for Admin.
3. Create a pet with a photo and contact details; reload and edit it. Confirm no
   local preview data path was used.
4. Open its Public Share Profile signed out. Confirm only owner-approved fields
   appear, its `/p/*` HTML has pet-specific metadata, and its 1200x630 social
   card returns a cache miss followed by a hit.
5. Open its Safety Profile signed out, test WhatsApp/call visibility, then turn
   contact visibility off and confirm no account contact leaks.
6. Create public/private Moments and a Care Record with yesterday/today/+30/+31
   due dates. Verify privacy and overdue/due-soon/upcoming labels after reload.
7. Exercise every Sample CTA on desktop and mobile with generic fallback; if a
   Featured Sample Pet is configured, also verify that approved projection.
8. Confirm Smart Tag/order CTAs are hidden and direct new-order API requests
   return 403 `feature_disabled`.
9. Upload/delete public pet media and a private document through signed URLs.
   Verify public custom-domain delivery and owner-only private access.
10. Confirm CORS rejects an unapproved origin, request IDs appear in safe API
    errors/logs, and expected worker/rate-limit behavior is visible without
    exposing stack traces or secrets.

## Final E2E and go/no-go

Run one uninterrupted new-owner journey on a fresh production test account:

1. Marketing -> Sample Public Share Profile -> Sample Safety Profile -> Create
   Profile -> Google login.
2. Create pet -> View Profile -> Share/copy link -> signed-out recipient view.
3. Return as owner -> add Moment -> add Care Record -> edit pet/contact/privacy
   -> verify persistence after a new browser session.
4. Signed-out finder opens Safety Profile -> sees only enabled contact/safety
   fields -> owner disables a field -> finder refresh confirms removal.
5. Admin opens owner/pet support views and audit data; non-admin remains denied.
6. Repeat critical public/owner views at 375px and desktop, with no console or
   network errors.

Go only if login, persistence, privacy, public metadata, media, and rollback
access all pass. Stop/roll back for any cross-account data exposure, incorrect
production origin, LocalDB/local-file use, migration mismatch, broken login,
public contact leak, or sustained API readiness failure.

## Production verification evidence (2026-08-14)

Verified against the live deployment at `main` @ `a06ab48`. QA data created during
this run was cleaned up or archived (see [QA data](#qa-data-created-and-cleaned-2026-08-14)).

### Environment and platform

| Check | Result |
| --- | --- |
| `https://mypetlink.com.my` | 200, valid TLS |
| `https://www.mypetlink.com.my` | 301 → apex |
| `https://api.mypetlink.com.my` | 200, valid TLS (Azure App Service, `southeastasia`) |
| `https://media.mypetlink.com.my` | Serving R2 objects; bucket listing and private paths 404 |
| `/health`, `/health/live`, `/health/ready` | All healthy; readiness probes the database |
| Production database | In use; no LocalDB fallback observed |
| Media storage | R2 only; no local-file fallback; all media URLs on the canonical media domain |
| Swagger, dev-login, API root | 404 in production |
| CORS | Apex and `www` allowed; unapproved origin rejected `400` |
| Token forgery | Invalid, `alg:none`, and forged-admin-claim JWTs all `401` |
| Request IDs | `X-Request-ID` present; error envelopes carry `meta.requestId`, no stack traces |
| Edge OG rewrite | Working — per-pet title/description and versioned social card |
| Social card | `MISS` then `HIT`, `image/jpeg`, 1200×630 |
| Robots / canonical / sitemap | Indexable, production-origin canonicals, no stray `noindex` |
| Deployed bundle | No localhost, staging, or preview origins (only a core-js URL polyfill matches "localhost") |

### Journeys

| Journey | Result |
| --- | --- |
| Anonymous marketing (`/`, `/how-it-works`, `/pet-profile`, `/pricing`, `/sample`) | All 200, unique metadata, no console errors, no horizontal overflow at 375×812 |
| Sample experience | Static fallback renders both profile types, one conversion CTA |
| Google sign-in | GIS loads and renders on the production origin (proves the Authorized JavaScript origin); login, session persistence across reload, and logout all work |
| New-owner activation | Create pet → success screen with exactly one filled primary CTA (View Profile) and one outline secondary (Add First Moment); reload created no duplicate |
| Public Share Profile | Renders R2 photo, owner-approved fields only, no owner controls for anonymous visitors |
| Copy Link | `https://mypetlink.com.my/p/<slug>?share=<public version hash>` — production origin, no internal IDs |
| Moments | Create, edit (PATCH), public/timeline flags, and delete all work; public projection reflects them |
| Care Records | Create/edit/delete work; Malaysia-calendar derivation correct — past → `overdue`, today → **Due today**, +6d → **Due soon**, +109d → **Upcoming**, no due date → `complete`. Dashboard orders Overdue → Due today → Due soon under "Care due dates" with no reminder-delivery wording |
| Safety Profile — no contact | "Contact unavailable" fallback, no misleading "options below" copy, zero contact leakage |
| Safety Profile — contact available | Correct instruction plus only the enabled channel; a stored phone with `showPhone` off was **not** exposed |
| Lost Mode | Enables urgent finder state with last-seen area; reverted |
| Finder routes | Invalid `/q`, `/t`, `/n` render branded not-found pages, not raw 404s |
| R2 media | Signed upload URL → browser `PUT` 200 (bucket CORS OK) → complete → canonical public URL → retrievable; delete removes the origin object |
| Cross-account (IDOR) | Another owner's pet, moments, care records, safety, and media all `404 not_found`; control request on own pet `200` |
| Admin denial | All `/api/v1/admin/*` `403 forbidden`; `/admin` renders "Access not available"; no role leakage |
| Mobile 375×812 | No unclipped horizontal overflow on marketing, sample, public profile, safety, dashboard, records, or pet pages |

### Disabled-feature state as found

| Feature | Expected | Actual |
| --- | --- | --- |
| Smart Tags navigation | OFF | **ON** — blocker |
| Customer tag commerce | OFF | **ON** — blocker |
| GA4 | OFF | **ON** — decision required |
| Premium | Coming Soon | Coming Soon |
| GPS | Coming Later | Coming Later |
| Reminder delivery | OFF | OFF — no delivery promises in UI |
| Transactional email | OFF | OFF — sign-in unaffected |

### Open items after this run

| ID | Priority | Surface | Problem |
| --- | --- | --- | --- |
| PROD-001 | P1 | Owner Portal / API | Smart Tag commerce fully live; API order gate not blocking |
| PROD-002 | P1 | Cloudflare Pages | GA4 active despite documented OFF posture |
| PROD-003 | P2 | API | Malformed Google `idToken` returns `500`; a well-formed bogus JWT correctly returns `401` |
| PROD-004 | P2 | API | No rate limit on `/api/v1/auth/google` or `/api/v1/auth/refresh` |
| PROD-005 | P2 | Cloudflare Pages | Runtime-created dynamic routes return HTTP 404 while rendering correctly; dashboard logs two prefetch 404s per load |
| PROD-006 | P2 | R2 / Cloudflare | Deleted media stays CDN-cached up to 4h (`max-age=14400`) after the origin object is removed |

### QA data created and cleaned (2026-08-14)

Created on production owner `kaixuan0131@gmail.com` (a fresh Free-plan owner with
no pre-existing pets):

| Record | Identifier | Disposition |
| --- | --- | --- |
| Pet "QA Audit Pixel 20260814" | `d9604e15-f08d-4ed9-8dbd-21b7dc88f2dd` | **Archived** — deletion returns `405` by design; public profile now 404 and Safety Profile returns `qr_safety_not_found` |
| Moment "QA Audit Public Moment" | `796f6a03-59d5-4e7e-bcc7-ee41c402d20d` | Deleted (`204`) |
| 5 care records (overdue / due today / due soon / upcoming / no due date) | — | Deleted (`204` each) |
| Profile photo uploaded to R2 | `e9bb57c5-5218-4cc7-a97a-5df6fff4671a` | Deleted; origin returns 404 on cache-bust, CDN copy expires within 4h |
| Owner contact (`+60123456789`) | Owner profile | Reverted to null |

Nothing belonging to any other user was created, modified, or deleted.

## Post-deployment-only checks

These cannot be fully proven by `next dev` or repository inspection:

- Cloudflare Pages Functions routing for `/p/*` and `/social/pets/*`, HTML
  rewriting, Cloudflare Cache behavior, custom 404 routing, and platform headers.
- Production DNS/TLS, redirects, Pages environment scoping, and absence of
  localhost values in the deployed bundle.
- Google Authorized JavaScript origin and real popup behavior.
- Azure-to-SQL connectivity, migration history, backup/restore posture, and
  proxy/client-IP resolution.
- R2 bucket CORS, public custom domain, signed upload/download, and deletion.
- GA4 Realtime/DebugView if later enabled; SMTP delivery if later enabled.
