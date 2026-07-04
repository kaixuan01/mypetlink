# MyPetLink Production Environment Variables

All required variables for the Phase 1 production stack. **No real values appear here.** Secrets must live in the host's secret store (Cloudflare Pages env, Azure App Service configuration / Key Vault, or user-secrets locally) — never in the repo, never in `.env.local` committed to git.

Config-key note: .NET reads nested config with a **double underscore** (`__`) in environment variables (e.g. `Jwt__SigningKey` maps to `Jwt:SigningKey`). The connection-string key the code actually reads is **`MyPetLinkDb`** — i.e. `ConnectionStrings__MyPetLinkDb` — not `DefaultConnection`.

## Frontend (Cloudflare Pages — `apps/web`)

These are `NEXT_PUBLIC_*`, so they are **baked into the static bundle at build time**. Changing them requires a rebuild + redeploy, and they are visible in the client (not secret, but the Google client id is public by design).

| Variable | Secret? | Purpose | Example shape |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | No | Base URL of the production .NET API (no trailing slash) | `https://api.mypetlink.com.my` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | No (public by design) | Google OAuth Web client id used by the GIS button | `<id>.apps.googleusercontent.com` |

Local dev equivalents live in `apps/web/.env.local` (gitignored): `NEXT_PUBLIC_API_BASE_URL=http://localhost:5281` and the dev Google client id.

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
| `Storage__Provider` | `Storage:Provider` | No | `Local` in Phase 1 (no real object storage yet). |
| `Storage__LocalRoot` | `Storage:LocalRoot` | No | Local upload root; unused for real files in Phase 1. |
| `Storage__PublicBaseUrl` | `Storage:PublicBaseUrl` | No | Reserved for future storage; leave empty in Phase 1. |
| `ASPNETCORE_ENVIRONMENT` | — | No | Set to `Production`. Disables Swagger and the dev-only CORS fallback (localhost origins). |

### CORS behavior to know

- When `Cors:AllowedOrigins` is empty **and** the environment is Development, the API falls back to localhost origins (`3000`/`3001`). In **Production** with no configured origins, **no cross-origin requests are allowed** — so you must set `Cors__AllowedOrigins__0` to the real frontend origin or the browser will block API calls.
- Set the exact scheme + host, no trailing slash, no wildcard.

### AppSettings values

The five operational `AppSettings` rows (tag prices `RM19.90` / `RM39.90`, `premium.status = Coming Soon`, `gps.status = Coming Later`, `payment.mode = Manual QR Payment`) are seeded by the `InitialCreate` migration and read from the database — they are **not** environment variables and need no config entries.

## Where each secret goes

- **Cloudflare Pages**: set `NEXT_PUBLIC_*` in the Pages project → Settings → Environment variables (Production scope), then redeploy.
- **Azure App Service**: `Jwt__SigningKey`, `GoogleAuth__ClientId`, `Cors__AllowedOrigins__0`, `ASPNETCORE_ENVIRONMENT` as Application settings; `ConnectionStrings__MyPetLinkDb` under Connection strings (type: SQLServer). For stronger secret handling, reference Azure Key Vault.
- **Local dev**: backend secrets via `dotnet user-secrets`; frontend via `apps/web/.env.local` (gitignored). Never commit either.
