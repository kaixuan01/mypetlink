# Google OAuth Setup (MyPetLink)

MyPetLink signs in with **Google Identity Services (GIS)**: the frontend renders the Google button, receives an **ID token**, and posts it to `POST /api/v1/auth/google`. The backend validates that ID token against `GoogleAuth:ClientId`. This is the **ID-token flow**, not a server redirect flow — which shapes the Google Cloud Console setup below.

## What you configure (and what you don't)

- You **do** configure **Authorized JavaScript origins** = the origins that render the button (frontend domains). GIS checks the requesting origin against this list.
- You generally do **not** need **Authorized redirect URIs** for the GIS button/ID-token flow — there is no server-side OAuth redirect. Leave redirect URIs empty unless you later add a redirect-based flow.
- The **same** Web client id is used in two places and they must match: the frontend build (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`) and the backend (`GoogleAuth:ClientId`).

## Google Cloud Console steps

1. **Create/select a project** in [Google Cloud Console](https://console.cloud.google.com/).
2. **OAuth consent screen**:
   - User type: External.
   - App name: MyPetLink; support email; developer contact.
   - Scopes: the default `openid`, `email`, `profile` are sufficient (MyPetLink only needs identity).
   - While testing, the app can stay in **Testing** with your Google account added as a test user. To let any Google user sign in, **publish** the consent screen to Production (basic identity scopes usually need no verification review).
3. **Create credentials → OAuth client ID → Web application**:
   - Name: e.g. "MyPetLink Web".
   - **Authorized JavaScript origins** — add each origin that serves the button:
     - Local dev: `http://localhost:3000`
     - Production frontend: `https://mypetlink.com.my` (and `https://www.mypetlink.com.my` if used)
   - **Authorized redirect URIs**: leave empty for the GIS ID-token flow.
   - The **backend origin** (`https://api.mypetlink.com.my`) does **not** need to be listed — the API validates tokens server-side and does not render the button.
4. Copy the generated **Client ID** (`<id>.apps.googleusercontent.com`).

## Local dev setup

- Frontend `apps/web/.env.local`: `NEXT_PUBLIC_GOOGLE_CLIENT_ID=<client id>`.
- Backend user-secret: `dotnet user-secrets set --project apps/api/MyPetLink.Api "GoogleAuth:ClientId" "<client id>"`.
- Ensure `http://localhost:3000` is in Authorized JavaScript origins.
- You may use one client id for both dev and prod (add both origins), or create a separate dev client id — either works as long as frontend and backend use the *same* id in each environment.

## Production setup

- Add the production frontend origin(s) to Authorized JavaScript origins.
- Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in Cloudflare Pages (Production) and **rebuild** the frontend (value is baked at build time).
- Set `GoogleAuth:ClientId` in the API host to the **same** client id.
- Publish the OAuth consent screen so non-test users can sign in.

## How to test

1. Open the production (or preview) frontend `/login`.
2. Confirm the Google button renders (no console error like `origin mismatch` / `idpiframe_initialization_failed`).
3. Click it, choose an account, complete the popup.
4. The frontend should call `POST /api/v1/auth/google` and store a session; you land on `/dashboard`.
5. Confirm `GET /api/v1/auth/me` returns your user.

## Common mistakes

- **Origin not authorized** — the button fails to init or the popup errors. Add the exact scheme+host to Authorized JavaScript origins (no trailing slash, no path).
- **Client id mismatch** — frontend built with one client id, backend validating against another → login returns 401 `invalid Google token`. They must be identical.
- **Forgot to rebuild the frontend** after changing `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — the old id stays baked in the static bundle.
- **Consent screen left in Testing** — only added test users can log in; publish to Production for public launch.
- **Adding redirect URIs and expecting them to matter** — they're not used by the GIS ID-token flow; the origin list is what governs access.
- **Localhost vs 127.0.0.1** — GIS treats them as different origins; use `http://localhost:3000` to match the dev server.
