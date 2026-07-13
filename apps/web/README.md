# MyPetLink Web App

This is the frontend app of the MyPetLink monorepo, located at `apps/web`. See the [repo root README](../../README.md) for the monorepo structure.

MyPetLink is a Malaysia-focused frontend MVP for safe and shareable pet profiles. Pet owners can create a free pet profile first, then add optional one-time MyPetLink QR or QR + NFC smart tags when they want extra collar safety. Premium care features are coming soon.

Preferred tagline: "A safe and shareable profile for your pet."

Primary domain examples:

- `https://mypetlink.com.my`
- `https://mypetlink.com.my/p/milo-k7q2`
- `https://mypetlink.com.my/q/MPL-SAFE-MILO`
- `https://mypetlink.com.my/t/8KX29A`

The owner pet flow can now run against the .NET backend API when `NEXT_PUBLIC_API_BASE_URL` is configured. If the API base URL is missing, the app keeps the local preview flow for static/UI work. There is still no Smart Tag, Orders, Payment Proof, Memories/Records, Admin Portal, Apple Login, Email OTP, password login, real file storage, NFC writing, GPS tracking, or supplier integration in this frontend slice.

## Phase 1 Product Rules

- Free Profile is RM0 and available now, with up to 3 pets and up to 10 memories per pet.
- Every pet gets a Public Share Profile and pet-level QR Safety Page without buying a physical tag.
- QR Pet Tag (RM19.90) and QR + NFC Smart Tag (RM39.90) are optional one-time add-ons.
- Premium Plan is Coming Soon only; there is no subscription, upgrade, or payment flow in this frontend MVP.
- GPS Safety is Coming Later.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- ESLint
- Backend API client with local preview fallback

## Run Locally

From the repo root:

```bash
npm install
npm run dev:web
```

Or from this folder (`apps/web`):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To use the backend-backed owner pet flow locally, run the API at `http://localhost:5281` and set:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:5281
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

Do not commit real `.env.local` values. Without a real Google client ID, the login button can load but a full Google sign-in cannot be completed.

## Cloudflare Pages Deployment

Use Cloudflare Pages as a static site deployment for this frontend-only staging build.

- Framework preset: `Next.js`
- Root directory: `apps/web` (this app lives inside the MyPetLink monorepo)
- Build command: `npm run build`
- Build output directory: `out`
- Node.js version: Node 22 (tracked in `.nvmrc`)

Cloudflare Pages build settings should set `NODE_VERSION=22` for both Production and Preview if the project has an explicit Node override or still uses an older build image. The current Pages v3 image defaults to Node 22 and also reads this app-root `.nvmrc`.

This project is configured with Next.js static export, so `npm run build` writes the deployable site to the `out` folder. Public marketing pages are indexable; Owner Portal, Admin Portal, QR Safety, tag-scan, and normal owner-created public profiles remain excluded according to [`docs/SEO_INDEXING_POLICY.md`](docs/SEO_INDEXING_POLICY.md).

## Public Website Routes

- `/` - Marketing landing page
- `/sample` - Sample public profile and finder safety experiences
- `/pricing` - Free Profile, Smart Tag Add-ons, Premium Coming Soon, and GPS Safety Coming Later pricing
- `/privacy` - Privacy Notice
- `/terms` - Terms of Use
- `/login` - Owner login
- `/p/milo-k7q2` - Public Share Profile for family, friends, and pet communities
- `/q/MPL-SAFE-MILO` - Pet-level QR Safety Page for finders
- `/t/8KX29A` - Physical tag scan link; active tags show safety content and inactive tags show an inactive tag page

## Owner Portal Routes

Owner routes use Google Login through the backend when `NEXT_PUBLIC_API_BASE_URL` is set. When the API base URL is missing, routes use the local preview login flow.

- `/dashboard`
- `/pets`
- `/pets/new`
- `/pets/pet_milo`
- `/pets/pet_milo/edit`
- `/pets/pet_milo/records`
- `/pets/pet_milo/moments`
- `/pets/pet_milo/moments/new`
- `/pets/pet_milo/timeline`
- `/pets/pet_milo/tags`
- `/pets/pet_milo/tags/order`
- `/tags`
- `/orders`
- `/settings`

## Admin Portal Routes

Admin routes are protected by localStorage auth. Use `/admin/login`, then click `Continue as Admin`.

- `/admin`
- `/admin/pets`
- `/admin/users`
- `/admin/qr-profiles`
- `/admin/plans`

## Service Layer

The services return response envelopes and switch by environment:

- API mode: `NEXT_PUBLIC_API_BASE_URL` is set in the browser. Owner auth, owner profile, pets, public profiles, and QR safety use the backend.
- Local preview mode: `NEXT_PUBLIC_API_BASE_URL` is missing. The same flows use local data/localStorage for static preview work.

- `src/services/authService.ts`
- `src/services/apiClient.ts`
- `src/services/ownerProfileService.ts`
- `src/services/petService.ts`
- `src/services/recordService.ts`
- `src/services/momentService.ts`
- `src/services/tagService.ts`
- `src/services/adminService.ts`

Local data lives in:

- `src/data/mockPets.ts`
- `src/data/mockUsers.ts`
- `src/data/mockRecords.ts`
- `src/data/mockPlans.ts`
- `src/data/mockMoments.ts`
- `src/data/mockTags.ts`
- `src/data/mockOrders.ts`

## Future Planned Features

- Real authentication and route protection
- Persisted tags and orders
- Real payment and delivery workflow for MyPetLink Smart Tags
- Reminder notifications
- Admin role and permission controls
- Family sharing controls
- Data deletion and privacy controls

## Environment Variables

Copy `.env.example` to `.env.local` for local backend integration:

- `NEXT_PUBLIC_API_BASE_URL` - backend API origin, for example `http://localhost:5281`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` - browser Google OAuth client ID used by Google Identity Services

Leave `NEXT_PUBLIC_API_BASE_URL` empty only when you intentionally want local preview mode.
