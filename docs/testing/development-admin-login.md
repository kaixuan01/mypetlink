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

## Using the same session for Community QA

The session this login creates is an **ordinary owner session** — the same
`Users` row, `OwnerProfiles` row, JWT and refresh chain any Google sign-in
produces. Nothing about it is admin-only, so it is also how you reach the
signed-in Community surfaces (`/feed`, `/notifications`, `/community/profile`,
`/community/profile/edit`) that otherwise need a real Google account.

Point `DevAuth:AdminEmail` at **`admin.dev@mypetlink.local`**. The development
social seeder already gives that account a Community history, so the signed-in
surfaces have something to show:

| | |
| --- | --- |
| Handle | `@devadminhouse` |
| Pets | 3, two of them in Community |
| Following | 3 households, whose public Moments fill `/feed` |
| Discoverable | off, so its own pets stay out of Explore |
| Notifications | none — `/notifications` shows its empty state |

**Its admin role does not affect Community testing.** No social service and no
part of the Community shell branches on `AdminUsers`; the admin surfaces live
in their own layout under `/admin`. A Community page renders identically for
this account and for a plain owner.

Do **not** repoint `AdminEmail` at one of the plain seeded owners
(`social.a@mypetlink.local` and friends) to get richer data. The seeder grants
`AdminRole.Admin` to whatever address it is given, so that would silently
promote a fixture that other tests rely on being an ordinary owner.

The same **Development sign in** action is also shown separately beneath Google
on `/login` while the local frontend gate is enabled. This lets browser QA
exercise the real owner-login redirect path, including
`/login?redirect=/feed`, without changing Google sign-in or writing a session
directly. Google remains the primary real-user method, and production builds
never render the development action because the existing environment gate is
unchanged.

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

Remove the three `DevAuth` user-secrets (or set `DevAuth:Enabled` to `false`) and remove `NEXT_PUBLIC_DEV_AUTH_ENABLED` from `.env.local`. Restart both processes.

The backend switch is the one that matters. With `DevAuth:Enabled=false` the
route is not registered and returns `404` even while the frontend flag is still
`true` — the public flag can hide or show a button, never create a session. In a
production frontend build the action is not rendered at all, because the gate
compiles against `NODE_ENV`, even if the public flag was accidentally supplied.
