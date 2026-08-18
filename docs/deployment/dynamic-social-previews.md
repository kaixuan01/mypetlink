# Dynamic public-profile social previews

MyPetLink serves public-profile metadata and JPEG social cards at request time. A pet created or updated after the frontend build therefore does not require a new Cloudflare Pages deployment.

## Route matrix

Every shareable pet URL now receives pet-specific metadata from the same edge
pipeline. Finder routes previously fell through to the static shell, which
produced a preview titled "Loading | MyPetLink" (`MPL-GROWTH-PROD-003`).

| Route | Metadata | Image | `X-MyPetLink-Metadata` |
| --- | --- | --- | --- |
| `/p/{slug}` | Public Share Profile | 1200 x 630 card | `dynamic-public-profile` |
| `/p/{slug}/` | 308 to the canonical path, query preserved | — | `canonical-redirect` |
| `/q/{safetyCode}` | Safety Profile preview | pet card when the Public Share Profile is on, otherwise `og-image.png` | `dynamic-finder-profile` |
| `/q/{tagCode}` | Falls back to the tag lookup, matching the page | as above | `dynamic-finder-profile` |
| `/t/{tagCode}`, `/n/{tagCode}` | Tag page preview | as above | `dynamic-finder-profile` |
| Any finder code that does not resolve | Generic MyPetLink finder copy, `no-store` | `og-image.png` | `generic-finder` |
| `/social/pets/{slug}.jpg` | — | card variants | — |

Finder previews are always `noindex,follow`, whatever the Public Share Profile
chooses, because they are per-pet safety URLs.

## Request flow

1. Cloudflare Pages Functions intercepts `/p/*`, `/q/*`, `/t/*`, `/n/*` and `/social/pets/*` (see `apps/web/public/_routes.json`).
0. Any request whose path ends in a slash is answered with a `308` to the canonical path first, preserving the query string. The Function claims these routes, so the platform's own trailing-slash normalisation never runs; without this step `/p/{slug}/` answered `503` with generic preview metadata (`MPL-GROWTH-PROD-002`).
2. The Function calls the restricted Azure API projection at `GET /api/v1/public/pets/{slug}/social`.
3. A valid `/p/{slug}` request passes through to the exported Next.js HTML shell. `HTMLRewriter` removes the existing title, description, robots, canonical, Open Graph, and Twitter elements and inserts one pet-specific set into the initial response.
4. The injected `og:image` points to `/social/pets/{slug}.jpg?v={publicProfileVersion}` on the canonical site origin.
5. The social-card Function revalidates the current public projection, checks Cloudflare Cache with the current slug, version, and variant identity, and fetches `GET /api/v1/public/pets/{slug}/social-card.jpg` only on a miss.
6. The API renders the default 1200 x 630 Open Graph JPEG with SkiaSharp. It also keeps a short-lived in-process cache and deduplicates concurrent generation for the same public code, profile version, card variant, and renderer version.

The former static `/share/pets/{slug}.jpg` route and its separate renderer were removed so there is one card template and one privacy boundary. Existing build-time metadata remains a fallback for a static asset response, but production `/p/*` responses are replaced at the edge.

## Renderer variants

The same restricted renderer also accepts
`GET /api/v1/public/pets/{slug}/social-card.jpg?v={publicProfileVersion}&variant=share-card`
for a 1080 x 1350 Pet Share Card JPEG. Missing, `open-graph`, and unknown variant
values preserve the existing Open Graph layout and bytes. The Share Card uses
its own `pet-share-card-v3` template identity in the API memory-cache key and
ETag, so it cannot collide with the Open Graph entry. The API exposes that
identity in `X-Social-Card-Template-Version` for the later edge integration.

Cloudflare exposes the Share Card through the same stable public resource:
`/social/pets/{slug}.jpg?v={publicProfileVersion}&variant=share-card`. The edge
forwards only the controlled `share-card` variant, requires renderer identity
`pet-share-card-v3`, and keeps that identity in the cache key and response ETag.
Unknown variants continue to resolve to the ordinary Open Graph card.

Two occasion variants use the same renderer and 1080 x 1350 JPEG output:

- `variant=birthday` with template `pet-birthday-card-v3`;
- `variant=adoption` with template `pet-adoption-card-v3`.

They are available only when the exact stored date matches today in the
Malaysia calendar. Estimated birth years do not qualify, and Memorial or
Archived pets are excluded. The restricted social DTO is unchanged: the API
derives only the celebration count internally and never adds an exact date to
the edge projection. Occasion cache keys also contain the current Malaysia day,
so a card from a previous anniversary cannot be reused in a later year.

The owner Share Card controls are build-time gated by
`NEXT_PUBLIC_SHARE_CARDS_ENABLED` (default `false`). Turning the owner UI off
does not remove either image route. The image is requested only after an owner
opens the Share Card dialog. The Dashboard may show a lightweight occasion
prompt from pet data it already holds, but ordinary Dashboard, pet management,
and Public Share Profile loads do not request or generate image bytes. Only the
selected modal variant is loaded.

All three portrait variants contain a locally generated, high-contrast QR code
for the canonical Public Share Profile URL built from `PublicSite:BaseUrl` and
the restricted projection's public slug. The QR uses Q error correction, a
quiet zone, and a 218 px square. The full `/p/{slug}` URL is not printed on the
image; `mypetlink.com.my` remains as short branding. Native/text sharing and
Copy Profile Link continue to carry the clickable profile URL. Ordinary Open
Graph cards do not include a QR.

The brand logo is embedded in the API assembly from
`Assets/Brand/mypetlink-logo-horizontal.png`, with the same canonical
content-root path as a fallback. Photo-less cards use the shared opaque brand
gradient, pet initial, paw, and soft shapes rather than an empty panel.

## Required configuration

Cloudflare Pages needs this non-secret runtime variable in both Production and Preview environments:

```text
PUBLIC_API_BASE_URL=https://api.mypetlink.com.my
```

`NEXT_PUBLIC_API_BASE_URL` remains a supported fallback for existing deployments. `PUBLIC_API_BASE_URL` is preferred because Pages Functions consume it at request time rather than baking it into browser JavaScript.

The API also needs its existing canonical public-site origin in every environment
that serves portrait Share Cards:

```text
PublicSite__BaseUrl=https://mypetlink.com.my
```

The renderer accepts an HTTP loopback origin only for local development. A
missing or invalid value fails portrait rendering instead of encoding a QR for
the wrong destination; ordinary Open Graph rendering remains available.

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

The renderer identities are `social-card-v3` (Open Graph),
`pet-share-card-v3`, `pet-birthday-card-v3`, and `pet-adoption-card-v3`. Keep the
API and edge constants synchronized whenever rendered bytes change.

## Privacy and cache behavior

- The edge and renderer use only the restricted social projection. Owner contact details, account identifiers, locations, notes, records, and moments are not part of that DTO.
- Invalid, disabled, archived, deleted, and non-shared memorial profiles return generic metadata or `404` without pet data.
- API failures return generic noindex metadata and leave a functional response; they never reuse another pet's card.
- The card Function checks current visibility before consulting its image cache. An old requested version can therefore never retrieve an old private card through the Function.
- JPEG responses use `public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400`. The edge cache key contains the current public-profile version. The API cache additionally contains the card variant and its renderer version. In-flight generation is deduplicated per complete cache identity at both layers.
- Lost Mode cards show an urgent banner and contact instruction without placing contact details on the image.

### Finder preview privacy boundary

- `/q`, `/t` and `/n` previews are built from `GET /api/v1/public/safety/{code}/social` and `GET /api/v1/public/tags/{code}/social`, which return only a lifecycle state, the pet's name, and — when the Public Share Profile is switched on — the public slug and version. No contact details, owner identity, general area, notes, safety code, tag code or database identifier is in that projection.
- The tag projection is deliberately read-only. The scan routes record a `TagScan` for every call; a link preview must never appear in an owner's scan history, so the preview endpoint has its own query and records nothing.
- A pet whose Public Share Profile is off keeps its finder preview but falls back to generic MyPetLink branding, because the pet card belongs to the profile the owner switched off.
- Unclaimed, inactive, replaced and unknown tags return `404` from the projection, and the edge answers with generic finder copy — the preview never reveals tag or inventory state.
- A finder code appears only as the canonical URL of the page being shared, never in the image URL, title or description.

### External preview caches

These changes guarantee that a *new* crawler fetch receives correct metadata and
a valid image. They cannot purge a preview a platform has already cached for a
given URL: WhatsApp in particular builds previews on the sender's device and
keeps them per URL. A previously shared link may keep showing an older preview
until that platform refreshes it, which is outside our control.

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
curl.exe -I "http://127.0.0.1:8788/social/pets/{new-pet-slug}.jpg?v={version}&variant=share-card"
curl.exe -I "http://127.0.0.1:8788/social/pets/{new-pet-slug}.jpg?v={version}&variant=birthday"
curl.exe -I "http://127.0.0.1:8788/social/pets/{new-pet-slug}.jpg?v={version}&variant=adoption"
```

Update the name or public photos and repeat without rebuilding. Confirm the metadata and `X-Public-Profile-Version` changed, all eligible images are JPEG, each variant reports its documented template version, and each second card request reports `X-Social-Card-Cache: HIT` without crossing variants. Occasion routes return `404` when the matching Malaysia day is not today.

Renderer tests decode the QR on Profile, Birthday, and Adoption cards to the
exact canonical URL. The robustness case also resizes a 1080 x 1350 Profile
card to 540 x 675 and re-encodes it as JPEG at quality 68 before decoding it
again.

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
curl -I "https://mypetlink.com.my/social/pets/{new-pet-slug}.jpg?v={version}&variant=share-card"
```

Inspect the raw `<head>` for one title, description, canonical, Open Graph set, and Twitter set. Confirm that it contains no owner contact data. Share the same public profile URL through WhatsApp, update a public photo, then share its new versioned URL without redeploying.
