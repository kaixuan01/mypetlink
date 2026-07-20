# Development-only Admin login

The local Admin login supports repeatable browser QA without a real Google account. It reuses the normal MyPetLink authentication model: one `Users` row, a Free `OwnerProfiles` row, an active `AdminUsers` row, JWT access tokens, rotating refresh tokens, the existing Admin authorization policy, and normal logout/revocation.

> **Never enable this feature outside a local `Development` process.** The API refuses to start when `DevAuth:Enabled=true` in any other environment. The route is not registered outside Development, and it also rejects requests whose host or remote address is not loopback.

## Enable it locally

Apply the normal EF migrations first. The runtime seed does not create schema or apply migrations:

```powershell
dotnet ef database update --project apps/api/MyPetLink.Api --startup-project apps/api/MyPetLink.Api
```

Set the API values through .NET user-secrets from the repository root:

```powershell
dotnet user-secrets set --project apps/api/MyPetLink.Api "DevAuth:Enabled" "true"
dotnet user-secrets set --project apps/api/MyPetLink.Api "DevAuth:AdminEmail" "admin.dev@mypetlink.local"
dotnet user-secrets set --project apps/api/MyPetLink.Api "DevAuth:DisplayName" "MyPetLink Dev Admin"
```

Environment-variable equivalents are `DevAuth__Enabled`, `DevAuth__AdminEmail`, and `DevAuth__DisplayName`. The email must be a fake address on a reserved `.local` domain. No password, OTP, access token, or refresh token belongs in source control.

In the gitignored `apps/web/.env.local`, enable the local UI and point it at the API:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:5281
NEXT_PUBLIC_DEV_AUTH_ENABLED=true
```

Start the API with `ASPNETCORE_ENVIRONMENT=Development`, then run the Next.js development server. Open the intended Admin URL, such as `http://localhost:3000/admin/tag-products`. The guard redirects to Admin Login; choose **Development login**. The original Admin URL is preserved and opened after the API confirms the existing Admin policy.

## Seed and session behavior

- Seeding runs only when the API environment is Development and `DevAuth:Enabled` is true.
- The configured identity is fixed at startup; the login request accepts no email, user ID, or role.
- Repeated starts and logins reuse the same User, ExternalLogin, OwnerProfile, and AdminUser records.
- Existing unrelated profile fields are not overwritten. An inactive account with the configured email stops startup so another fake `.local` address can be selected safely.
- Each Development login removes the previous refresh-token chain for this one local identity before creating the normal new session. Normal user session retention is unchanged.
- Refresh uses `POST /api/v1/auth/refresh`; logout uses `POST /api/v1/auth/logout` and revokes the current token as usual.

## Browser automation state

There is no repository Playwright suite yet. Browser automation can perform **Development login** once and then save the browser's normal local-storage state to `apps/web/playwright/.auth/admin.json` (or `apps/web/.auth/`). Both locations are gitignored. Never put a generated state file elsewhere in the repository, and never commit access tokens, refresh tokens, or captured browser profiles.

Delete saved state whenever the local database or signing key changes. A fresh login will safely recreate the same seeded Admin and keep only the new Development refresh session.

## Disable it

Remove the three `DevAuth` user-secrets (or set `DevAuth:Enabled` to `false`) and remove `NEXT_PUBLIC_DEV_AUTH_ENABLED` from `.env.local`. Restart both processes. With the API flag disabled, the route is not registered; with a production frontend build, the Development login action is not rendered even if the public flag was accidentally supplied.
