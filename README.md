# MyPetLink

MyPetLink is a Malaysia-focused platform for safe and shareable pet profiles. Pet owners create a free pet profile first, then add optional one-time MyPetLink QR or QR + NFC smart tags for extra collar safety.

This repository is a monorepo. The current product surface is the frontend app in `apps/web`.

## Structure

```
MyPetLink
├─ apps
│  ├─ web        Next.js app: Landing Page, Owner Portal, Public Profile,
│  │             QR Safety Page, and the future Admin Portal UI
│  └─ api        C# .NET 8 API skeleton
├─ database      Future migrations, seed scripts, and database docs (placeholders)
└─ docs          Product, architecture, API, database, and operations documentation
```

## Current status

- The frontend is built in `apps/web` (Next.js App Router, TypeScript, Tailwind CSS, static export).
- The backend skeleton exists in `apps/api/MyPetLink.Api`; business logic is intentionally still placeholder-level.
- The database is not implemented yet (`database/` holds placeholders).
- Premium is Coming Soon.
- GPS Safety is Coming Later.
- Smart Tags are optional one-time add-ons.

## Common commands

Run from the repository root:

```bash
npm install        # installs workspace dependencies
npm run dev:web    # start the web app dev server
npm run build:web  # build the web app (static export to apps/web/out)
npm run lint:web   # lint the web app
```

You can also run the same scripts directly inside `apps/web` (`npm run dev`, `npm run build`, `npm run lint`).

Backend commands:

```bash
dotnet restore apps/api/MyPetLink.Api.sln
dotnet build apps/api/MyPetLink.Api.sln
dotnet run --project apps/api/MyPetLink.Api
```

## Cloudflare Pages

After this restructure, update the Cloudflare Pages project settings to build from the app folder:

- Root directory: `apps/web`
- Build command: `npm run build`
- Build output directory: `out`
- Node.js version: `22` (from `apps/web/.nvmrc`)

The web app uses Next.js static export (`output: "export"` in production builds), so `npm run build` writes the deployable site to `apps/web/out`.

## More documentation

- Frontend app guide: [`apps/web/README.md`](apps/web/README.md)
- Frontend agent/developer reference: [`apps/web/docs/AI_AGENT_REFERENCE.md`](apps/web/docs/AI_AGENT_REFERENCE.md)
- Repo-wide docs index: [`docs/README.md`](docs/README.md)
