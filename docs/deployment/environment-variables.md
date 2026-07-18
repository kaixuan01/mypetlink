# MyPetLink Production Environment Variables

All required variables for the Phase 1 production stack. **No real values appear here.** Secrets must live in the host's secret store (Cloudflare Pages env, Azure App Service configuration / Key Vault, or user-secrets locally) — never in the repo, never in `.env.local` committed to git.

Config-key note: .NET reads nested config with a **double underscore** (`__`) in environment variables (e.g. `Jwt__SigningKey` maps to `Jwt:SigningKey`). The connection-string key the code actually reads is **`MyPetLinkDb`** — i.e. `ConnectionStrings__MyPetLinkDb` — not `DefaultConnection`.

## Frontend (Cloudflare Pages — `apps/web`)

These are `NEXT_PUBLIC_*`, so they are **baked into the static bundle at build time**. Changing them requires a rebuild + redeploy, and they are visible in the client (not secret, but the Google client id is public by design).

| Variable | Secret? | Purpose | Example shape |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | No | Canonical public site URL (no trailing slash). Used to build absolute share links and to generate QR codes (`/p`, `/q`, `/t`) client-side. **Must be set before the production build**, or QR/link URLs fall back to a placeholder host. | `https://mypetlink.com.my` |
| `NEXT_PUBLIC_API_BASE_URL` | No | Base URL of the production .NET API (no trailing slash) | `https://api.mypetlink.com.my` |
| `NEXT_PUBLIC_MEDIA_BASE_URL` | No | Optional public media domain (no trailing slash). The API already returns ready-to-render absolute photo URLs, so this is only a fallback used to resolve bare object keys. Must be an absolute `https://` URL if set. | `https://media.mypetlink.com.my` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | No (public by design) | Google OAuth Web client id used by the GIS button | `<id>.apps.googleusercontent.com` |
| `NEXT_PUBLIC_PUBLIC_PROFILES_ENABLED` | No | Owner-facing Public Profile sharing and management UI. Defaults to `true`; keep enabled for the current release. Public routes remain compatible if the owner UI is temporarily hidden. | `true` |
| `NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED` | No | Owner-facing Safety Profile badges, links, and management entry points. Defaults to `false` for the current release. Existing `/q/*` routes remain available. | `false` |
| `NEXT_PUBLIC_SMART_TAGS_ENABLED` | No | Owner-facing Smart Tags navigation, badges, and management entry points. Defaults to `false` for the current release. Existing tag routes and Admin functionality remain available. | `false` |
| `NEXT_PUBLIC_TAG_ORDERS_ENABLED` | No | Owner-facing tag-order navigation and history. Requires Smart Tags to be enabled and defaults to `false`. Existing order routes remain available. | `false` |
| `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED` | No | Frontend build-time feature flag for Smart Tag order CTAs. Keep `false` or unset for the free-profiles launch; set `true` only when the backend flag is also enabled and physical tags are ready. | `false` |
| `NODE_VERSION` | No | Cloudflare Pages build runtime. Set this to Node 22 for Production and Preview if the dashboard has an explicit override or uses an older build image. The app-root `.nvmrc` is the repository source of truth. | `22` |
| `NEXT_PUBLIC_NOINDEX` | No | Search-indexing guard for the static build. **Leave unset in Production** — public marketing/profile pages are then indexable by default (so production can never accidentally inherit a preview `noindex`). Set to `true` **only in the Preview/staging Cloudflare Pages environment** to force `noindex,nofollow` on those deploys. Private routes (login, owner/admin portal, edit/checkout, non-sample public profiles, QR/tag pages) stay `noindex` regardless of this flag. | `true` (Preview only) |

Cloudflare Pages Functions also consume this request-time variable:

| Variable | Secret? | Purpose | Example shape |
| --- | --- | --- | --- |
| `PUBLIC_API_BASE_URL` | No | Azure API origin used by the `/p/*` metadata Function and `/social/pets/*` card Function. Set it for Production and Preview. `NEXT_PUBLIC_API_BASE_URL` is accepted only as a compatibility fallback. | `https://api.mypetlink.com.my` |

This runtime value lets newly created and updated profiles receive metadata without rebuilding the static frontend. No R2 binding is required for social cards; the Functions use Cloudflare Cache and the API reads existing public media URLs. See [Dynamic public-profile social previews](dynamic-social-previews.md).

QR codes are generated entirely in the browser from these URLs — no external QR service is called. If `NEXT_PUBLIC_SITE_URL` is unset, the app falls back to `NEXT_PUBLIC_APP_URL`, then to `window.location.origin` in the browser.

Local dev equivalents live in `apps/web/.env.local` (gitignored): `NEXT_PUBLIC_API_BASE_URL=http://localhost:5281`, `NEXT_PUBLIC_APP_URL=http://localhost:3000` (used as the QR base locally), and the dev Google client id.

## Backend (.NET 8 API — `apps/api/MyPetLink.Api`)

| Variable (env form) | Config key | Secret? | Purpose |
| --- | --- | --- | --- |
| `ConnectionStrings__MyPetLinkDb` | `ConnectionStrings:MyPetLinkDb` | **Yes** | Production SQL Server connection string. App falls back to LocalDB only if unset — must be set in prod. |
| `Jwt__SigningKey` | `Jwt:SigningKey` | **Yes** | HMAC signing key for JWT access tokens. **The API refuses to start if this is empty.** Use a long (≥ 32 char) random secret. |
| `Jwt__Issuer` | `Jwt:Issuer` | No | Token issuer, e.g. `MyPetLink.Api`. Must match between issuing and validation (same app, so just set once). |
| `Jwt__Audience` | `Jwt:Audience` | No | Token audience, e.g. `MyPetLink.Production`. |
| `Jwt__AccessTokenMinutes` | `Jwt:AccessTokenMinutes` | No | Access token lifetime. Recommended 30 (default 15 if unset). |
| `Jwt__RefreshTokenDays` | `Jwt:RefreshTokenDays` | No | Refresh token lifetime. Recommended 30. |
| `GoogleAuth__ClientId` | `GoogleAuth:ClientId` | No (public by design) | Google Web client id the API validates incoming ID tokens against. **Must equal `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.** |
| `Cors__AllowedOrigins__0` | `Cors:AllowedOrigins[0]` | No | First allowed browser origin (the production frontend), e.g. `https://mypetlink.com.my`. Add `__1`, `__2` for more (e.g. `https://www.mypetlink.com.my`). |
| `Storage__Provider` | `Storage:Provider` | No | Set to `CloudflareR2` for production media uploads. Use `Local` only when intentionally disabling R2 in development. |
| `Storage__LocalRoot` | `Storage:LocalRoot` | No | Local upload root used only when `Storage:Provider=Local`. |
| `Storage__PublicBaseUrl` | `Storage:PublicBaseUrl` | No | Local storage public base URL; leave empty when using Cloudflare R2. |
| `CloudflareR2__AccountId` | `CloudflareR2:AccountId` | No | Cloudflare account id used to derive the R2 S3 service URL. |
| `CloudflareR2__AccessKeyId` | `CloudflareR2:AccessKeyId` | **Yes** | R2 S3 access key id. |
| `CloudflareR2__SecretAccessKey` | `CloudflareR2:SecretAccessKey` | **Yes** | R2 S3 secret access key. |
| `CloudflareR2__ServiceUrl` | `CloudflareR2:ServiceUrl` | No | Optional explicit service URL, e.g. `https://<accountId>.r2.cloudflarestorage.com`. |
| `CloudflareR2__PublicBucketName` | `CloudflareR2:PublicBucketName` | No | Public media bucket (pet profile/cover photos, public moments). Default: `mypetlink-public-media`. Must differ from the private bucket. |
| `CloudflareR2__PrivateBucketName` | `CloudflareR2:PrivateBucketName` | No | Private files bucket (documents, receipts). Default: `mypetlink-private-files`. |
| `CloudflareR2__PublicBaseUrl` | `CloudflareR2:PublicBaseUrl` | No | Public media custom domain. **Must be an absolute `https://` URL** (e.g. `https://media.mypetlink.com.my`), never a bucket name — a non-URL value makes public photo URLs render as broken relative links and the API fails validation at startup. |
| `CloudflareR2__PresignedUploadExpiryMinutes` | `CloudflareR2:PresignedUploadExpiryMinutes` | No | Signed PUT URL lifetime. Default: `5`. |
| `CloudflareR2__PresignedDownloadExpiryMinutes` | `CloudflareR2:PresignedDownloadExpiryMinutes` | No | Signed private GET URL lifetime. Default: `5`. |
| `Features__SmartTagOrderingEnabled` | `Features:SmartTagOrderingEnabled` | No | Backend feature flag for creating new Smart Tag orders. Keep `false` for the free-profiles launch; set `true` only when physical tags are ready. |
| `ASPNETCORE_ENVIRONMENT` | — | No | Set to `Production`. Disables Swagger and the dev-only CORS fallback (localhost origins). |

### Public app URL note

`PublicApp__BaseUrl=https://mypetlink.com.my` is **not currently read by the .NET API**. Public share and QR links are generated by the static frontend from `NEXT_PUBLIC_SITE_URL`. Do not treat `PublicApp__BaseUrl` as a required production backend variable until backend code is added to consume it.

### CORS behavior to know

- When `Cors:AllowedOrigins` is empty **and** the environment is Development, the API falls back to localhost origins (`3000`/`3001`). In **Production** with no configured origins, **no cross-origin requests are allowed** — so you must set `Cors__AllowedOrigins__0` to the real frontend origin or the browser will block API calls.
- Set the exact scheme + host, no trailing slash, no wildcard.

### AppSettings values

The five operational `AppSettings` rows (tag prices `RM19.90` / `RM39.90`, `premium.status = Coming Soon`, `gps.status = Coming Later`, `payment.mode = Manual QR Payment`) are seeded by the `InitialCreate` migration and read from the database — they are **not** environment variables and need no config entries.

## Where each secret goes

- **Cloudflare Pages**: set `NEXT_PUBLIC_*` in the Pages project → Settings → Environment variables (Production scope), then redeploy.
- **Azure App Service**: `ASPNETCORE_ENVIRONMENT`, `Jwt__SigningKey`, `Jwt__Issuer`, `Jwt__Audience`, `GoogleAuth__ClientId`, `Cors__AllowedOrigins__0`, `Storage__Provider`, `CloudflareR2__*`, and `Features__SmartTagOrderingEnabled` as Application settings; `ConnectionStrings__MyPetLinkDb` under Connection strings (type: SQLServer). For stronger secret handling, reference Azure Key Vault.
- **Local dev**: backend secrets via `dotnet user-secrets`; frontend via `apps/web/.env.local` (gitignored). Never commit either.

See [Cloudflare R2 Media Setup](../cloudflare-r2-media-setup.md) for bucket, CORS, custom domain, and troubleshooting details.
