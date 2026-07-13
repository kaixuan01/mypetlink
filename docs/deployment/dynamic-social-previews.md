# Dynamic public-profile social previews

MyPetLink serves public-profile metadata and JPEG social cards at request time. A pet created or updated after the frontend build therefore does not require a new Cloudflare Pages deployment.

## Request flow

1. Cloudflare Pages Functions intercepts `/p/*` and `/social/pets/*` (see `apps/web/public/_routes.json`).
2. The Function calls the restricted Azure API projection at `GET /api/v1/public/pets/{slug}/social`.
3. A valid `/p/{slug}` request passes through to the exported Next.js HTML shell. `HTMLRewriter` removes the existing title, description, robots, canonical, Open Graph, and Twitter elements and inserts one pet-specific set into the initial response.
4. The injected `og:image` points to `/social/pets/{slug}.jpg?v={publicProfileVersion}` on the canonical site origin.
5. The social-card Function revalidates the current public projection, checks Cloudflare Cache with the current slug and version, and fetches `GET /api/v1/public/pets/{slug}/social-card.jpg` only on a miss.
6. The API renders a 1200 x 630 JPEG with SkiaSharp. It also keeps a short-lived in-process cache and deduplicates concurrent generation for the same public code and version.

The former static `/share/pets/{slug}.jpg` route and its separate renderer were removed so there is one card template and one privacy boundary. Existing build-time metadata remains a fallback for a static asset response, but production `/p/*` responses are replaced at the edge.

## Required configuration

Cloudflare Pages needs this non-secret runtime variable in both Production and Preview environments:

```text
PUBLIC_API_BASE_URL=https://api.mypetlink.com.my
```

`NEXT_PUBLIC_API_BASE_URL` remains a supported fallback for existing deployments. `PUBLIC_API_BASE_URL` is preferred because Pages Functions consume it at request time rather than baking it into browser JavaScript.

No Cloudflare R2 binding, KV namespace, database change, or new secret is required for social cards. Existing pet photos continue to use the configured public R2 media domain. The API renderer accepts only HTTPS images from `media.mypetlink.com.my` or the host configured by `CloudflareR2:PublicBaseUrl`; redirects, custom ports, oversized responses, and excessively large decoded images are rejected.

Cloudflare Pages must deploy the repository `apps/web/functions` directory and use a Workers compatibility date supported by the account. The repository's `npm run build:functions` command compiles the Functions with the tested compatibility date.

## Public-profile version

The API hashes the following public inputs with SHA-256 and exposes the first 16 lowercase hexadecimal characters:

- social-card template version;
- opaque public code;
- public-profile enabled state and update timestamp;
- pet update timestamp;
- pet name, species, custom species, breed, and public age label;
- public profile and cover media URLs;
- cover focal position;
- lifecycle and Lost Mode state.

Changing any card input produces a different URL while the canonical profile URL stays unchanged. Share and Copy Link actions add only `?share={version}` to the public profile URL. The application ignores that parameter for page behavior.

## Privacy and cache behavior

- The edge and renderer use only the restricted social projection. Owner contact details, account identifiers, locations, notes, records, and moments are not part of that DTO.
- Invalid, disabled, archived, deleted, and non-shared memorial profiles return generic metadata or `404` without pet data.
- API failures return generic noindex metadata and leave a functional response; they never reuse another pet's card.
- The card Function checks current visibility before consulting its image cache. An old requested version can therefore never retrieve an old private card through the Function.
- JPEG responses use `public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400`. The cache key contains the current public-profile version. In-flight generation is deduplicated at both layers.
- Lost Mode cards show an urgent banner and contact instruction without placing contact details on the image.

## Local verification

Build the static export before creating the test pet. Then run the API and Pages runtime:

```powershell
npm run build:web
dotnet run --project apps/api/MyPetLink.Api --launch-profile http
cd apps/web
npx wrangler pages dev out --port 8788 --compatibility-date=2026-07-13 --binding PUBLIC_API_BASE_URL=http://127.0.0.1:5281
```

Create a pet through the normal owner flow after the build, then verify:

```powershell
curl.exe -A "facebookexternalhit/1.1" "http://127.0.0.1:8788/p/{new-pet-slug}"
curl.exe -A "WhatsApp/2.0" "http://127.0.0.1:8788/p/{new-pet-slug}"
curl.exe -I "http://127.0.0.1:8788/social/pets/{new-pet-slug}.jpg?v={version}"
```

Update the name or public photos and repeat without rebuilding. Confirm the metadata and `X-Public-Profile-Version` changed, the image is JPEG, and the second card request reports `X-Social-Card-Cache: HIT`.

## Production verification

Deploy in this order:

1. Publish the Azure API and confirm the `/social` and `/social-card.jpg` endpoints return `200` for an existing public profile.
2. Set the Pages Function runtime variable and deploy Cloudflare Pages.
3. Create a brand-new production pet and enable public sharing. Do not reuse Topu or Milo for this proof.

Do not deploy the Pages Functions first: a missing API endpoint is treated as an unavailable/private projection and cannot produce a dynamic JPEG. Transient API failures after deployment preserve the application HTML with generic noindex metadata and `Cache-Control: no-store`; the edge never substitutes another pet's metadata.

```bash
curl -A "facebookexternalhit/1.1" "https://mypetlink.com.my/p/{new-pet-slug}"
curl -A "WhatsApp/2.0" "https://mypetlink.com.my/p/{new-pet-slug}"
curl -I "https://mypetlink.com.my/social/pets/{new-pet-slug}.jpg?v={version}"
```

Inspect the raw `<head>` for one title, description, canonical, Open Graph set, and Twitter set. Confirm that it contains no owner contact data. Share the same public profile URL through WhatsApp, update a public photo, then share its new versioned URL without redeploying.
