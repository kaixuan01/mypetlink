# MyPetLink SEO Audit

**Audit date:** 2026-10-10
**Scope:** `apps/web` (Next.js static export + Cloudflare Pages Functions in `apps/web/functions` and `apps/web/edge`), public API and media subdomains, repository docs and marketing material.
**Production site:** https://mypetlink.com.my
**Mode:** Audit only. No application code was changed.
**Status:** Phase 1 implemented locally on 2026-10-10 — see [`phase-1-implementation.md`](phase-1-implementation.md).

## How this audit was verified

Findings come from the code, but every claim about live behaviour was checked against production with read-only `GET`/`HEAD` requests on 2026-10-10:

- Live `robots.txt`, `sitemap.xml`, all 11 sitemap marketing pages, the sample Share Profile and Safety Profile, made-up `/q`, `/n`, `/t`, `/p`, `/u`, `/moments` and `/activate` codes, and 15 Owner Portal, auth and Admin routes.
- `apps/web/scripts/verify-seo-output.mjs` (the project's own build-output checker) was run unchanged against a mirror of the **live** HTML. It passes on its 8 hard-coded pages. When the three sitemap pages it omits are added, it **fails on `/explore`** ("initial HTML is too thin").
- Vitest, default flags: 14 SEO, edge, terminology and commerce test files, **220/220 passing**.
- The same SEO and marketing tests with **production flag values** (`SMART_TAG_ORDERING`, `SMART_TAGS`, `TAG_ORDERS`, `SOCIAL`, `SAFETY_PROFILES_OWNER_UI` = `true`): **4 failures**. See [SEO-H2](#seo-h2).
- The live public tag catalogue (`GET https://api.mypetlink.com.my/api/v1/tag-products`) was compared with the marketing price.

The production flag posture (every public web flag ON, Smart Tag sold live) was confirmed from the live HTML: "Available now", "RM39.90", Where to Buy and Explore are present in the sitemap.

---

## 1. Executive Summary

MyPetLink's technical SEO foundation is **better than typical for a site this young**. Indexing policy is centralised in `src/lib/seo.ts`. Every finder, private and admin route is correctly `noindex` in production. Canonicals use `https://mypetlink.com.my`. `www` and `http` 301 to the apex, and trailing slashes 308 to the canonical path. The sitemap is hand-curated, and an edge layer gives finder links good social previews without making them indexable.

**No Critical issues were found.** No finder Safety Profile, tag route, Owner Portal page or Admin page is indexable or listed in the sitemap.

The main gaps are:

1. **`/explore` is in the sitemap and indexable, but its server HTML is empty:** 8 words, no H1, one link. Search engines are asked to index a blank page. ([SEO-H1](#seo-h1))
2. **The SEO tests guard the pre-launch configuration, not the one in production.** Under production flags four tests fail. The build verifier skips `/explore`, `/safety-profile`, `/where-to-buy` and the sample Share Profile, so the `/explore` problem passed unnoticed. ([SEO-H2](#seo-h2))
3. **The Smart Tag product page is the weakest commercial page.** It has no product photo, no "Get a Smart Tag" action, no Product/Offer structured data, and only 329 words. ([SEO-H3](#seo-h3), [SEO-H4](#seo-h4))
4. **Smart Tag facts have several owners.** The display price is a constant, the charged price lives in the catalogue, and availability comes from a build flag that defaults to "Coming Soon". The catalogue names the products "Pawsome" and "My Boss"; marketing calls them "QR + NFC Smart Tag". Structured data would publish whichever source is wrong. ([SEO-H5](#seo-h5))
5. **The API and media subdomains have no indexing policy.** Pet photos and public JSON can be indexed by search engines on their own. Pet media is also not cached at the Cloudflare edge. ([SEO-H6](#seo-h6))
6. **No content exists beyond product pages.** There is no guide content for the questions Malaysian pet owners actually search, such as finding a lost pet or choosing a QR vs NFC tag. ([§12](#12-content-opportunities))

A recommended Phase 1 scope (the safest, highest-impact changes) is at the [end of this document](#phase-1-recommended-scope).

---

## 2. Current SEO Architecture

| Concern | Where it lives | Notes |
|---|---|---|
| Site identity | `apps/web/src/config/site.ts` | `url: "https://mypetlink.com.my"`, product and company names |
| Robots policies | `src/lib/seo.ts` | `indexableRobots`, `privateRobots` (noindex,nofollow), `directAccessRobots` (noindex,follow). `NEXT_PUBLIC_NOINDEX=true` makes a preview deployment noindex |
| Marketing metadata | `createMarketingMetadata()` in `src/lib/seo.ts` | Absolute title, description, self canonical, OG and Twitter, 1200×630 image |
| Share Profile metadata | `createPublicProfileMetadata()` (build-time) **and** `edge/publicProfileEdge.ts` (request-time HTMLRewriter) | Only the Topu sample is `index`; every other `/p` is `noindex,follow` |
| Finder preview metadata | `edge/publicProfileEdge.ts` → `handleFinderPreviewRequest` | `/q`, `/n`, `/t`: always `noindex,follow`, personalised OG preview |
| Community metadata | `edge/ownerProfileEdge.ts`, `edge/momentEdge.ts`, `edge/ownerConnectionsEdge.ts` | `/u`, `/moments`, followers and following |
| Private sections | `layout.tsx` in `admin`, `dashboard`, `pets`, `orders`, `tags`, `settings`, `records`, `moments` export `privatePageMetadata`; `activate` and `t` use `directAccessPageMetadata` | Explicit per-page `robots` on `feed`, `notifications`, `search`, `community/profile*`, `u/*` |
| Sitemap | `src/app/sitemap.ts` ← `indexableSitemapEntries` in `src/lib/seo.ts` | Static list with stable `lastModified` dates; `/explore` and `/where-to-buy` are flag-gated |
| robots.txt | `src/app/robots.ts` | `Allow: /` plus a sitemap reference. Correct: noindex routes must stay crawlable for the tag to be seen |
| Structured data | `homepageStructuredData` in `src/lib/seo.ts`, injected only on `/` | Organization + WebSite |
| Edge routing | `public/_routes.json` | Functions claim `/p/*`, `/q/*`, `/t/*`, `/n/*`, `/u/*`, `/moments/*`, `/social/pets/*` |
| Tests | `src/lib/seo.test.ts`, `PublicLayout.seo.test.tsx`, `edge/*.test.ts`, `scripts/verify-seo-output.mjs` (`npm run verify:seo`) | See [§14](#14-automated-test-plan) |
| Analytics | `components/analytics/AnalyticsProvider.tsx` | GA4 via `next/script` `afterInteractive` |

Host canonicalisation (verified live): `https://www.` → 301 apex; `http://` → 301 https; `/pricing/` → 308 `/pricing`.

---

## 3. Route Indexing Matrix

The **Live** column was observed on production on 2026-10-10.

### INDEX

| Route | Live robots | In sitemap | Notes |
|---|---|---|---|
| `/` | index,follow + rich directives | ✅ | One H1, ~977 words, Organization + WebSite JSON-LD |
| `/pricing` | index | ✅ | Dedicated OG image |
| `/how-it-works` | index | ✅ | ~303 words |
| `/smart-pet-tags` | index | ✅ | ~329 words, no product image (SEO-H3) |
| `/pet-profile` | index | ✅ | Pet Profile marketing page, ~276 words |
| `/safety-profile` | index | ✅ | **Marketing page** about Safety Profiles. Not a finder page |
| `/sample` | index | ✅ | Links to the sample Share Profile and Safety Profile |
| `/where-to-buy` | index | ✅ | Flag-gated (`showWhereToBuy`); noindex,follow when ordering is off |
| `/privacy` | index | ✅ | |
| `/terms` | index | ✅ | |
| `/explore` | index | ✅ | **Empty server HTML** (SEO-H1). Should stay INDEX only once fixed; noindex it until then |
| `/#faq` | — | — | FAQ is a homepage section. There is no `/faq` route (404) |

### NOINDEX: finder and tag entry (must never become searchable)

| Route | Live robots | Notes |
|---|---|---|
| `/q/{safetyCode}` and `/q/{tagCode}` | noindex,follow (edge) + static `directAccessRobots` | Verified for the sample and an unknown code; never in the sitemap |
| `/n/{tagCode}` | noindex,follow (edge) | |
| `/t/{tagCode}` | noindex,follow (edge) + `t/layout.tsx` | Retained for printed tags |
| `/activate/{tagCode}` | noindex (`activate/layout.tsx`) | Redirects into the `/q` activation flow |
| `/social/pets/{slug}.jpg` | n/a (image) | Social card image; recommend `X-Robots-Tag: noindex` (SEO-M1) |

### NOINDEX: auth, Owner Portal, orders and payments

| Route(s) | Live robots |
|---|---|
| `/login` | noindex,nofollow |
| `/dashboard` | noindex,nofollow |
| `/pets`, `/pets/new`, `/pets/{id}`, `/pets/{id}/edit`, `/qr`, `/records`, `/moments`, `/moments/new`, `/timeline`, `/tags`, `/tags/order` | noindex,nofollow (`pets/layout.tsx`) |
| `/records`, `/moments` (owner lists) | noindex,nofollow |
| `/tags`, `/tags/order` | noindex,nofollow |
| `/orders`, `/orders/view?order=…` (incl. payment proof) | noindex,nofollow |
| `/settings` | noindex,nofollow |
| `/community/profile`, `/community/profile/edit` | noindex,nofollow |
| `/feed`, `/notifications` | noindex,nofollow |
| `/search` | noindex,follow |

### NOINDEX: Admin Portal

| Route(s) | Live robots |
|---|---|
| `/admin`, `/admin/login`, and every `/admin/*` page (24 routes) | noindex,nofollow (`admin/layout.tsx`) |

### REQUIRES PRODUCT DECISION

| Route | Current | Recommendation |
|---|---|---|
| `/p/{sample}` (Topu) | **index**, in sitemap | Its server HTML is a loading shell (16 words, no H1), and `/sample` already covers the intent. Either keep it indexable and server-render its content, or make it `noindex,follow` and drop it from the sitemap. Recommended: drop it (SEO-M4) |
| `/p/{slug}` (owner Share Profiles) | noindex,follow | **Keep noindex.** Future opt-in model in [§10](#10-community-seo-recommendation) |
| `/u/{handle}` | noindex | **Keep noindex.** Same opt-in model |
| `/u/{handle}/followers`, `/following` | noindex,nofollow | Keep noindex permanently |
| `/moments/{id}` | noindex(,follow) | **Keep noindex.** Revisit only with the opt-in model |
| Lost Mode Share Profiles | noindex | Searchable lost-pet notices could help reunions, but they publish a general area and contact path. This needs an explicit owner choice; it must not happen automatically |

### Utility

| Route | Status |
|---|---|
| `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` | 200 |
| Unknown path | 404 (correct status), but its title is "Loading" (SEO-L8) |

---

## 4. Critical Issues

**None found.** The checks behind this result:

- Finder routes `/q`, `/n`, `/t` and `/activate` are noindex both in the static export metadata and in the edge rewrite. None appear in the sitemap.
- Every Owner Portal, order, payment, settings and Admin route is noindex,nofollow live.
- Every canonical uses `https://mypetlink.com.my`. No `pages.dev`, `www`, `api.` or `media.` canonical was found (there is a test for `pages.dev`).
- The production build does not inherit a preview noindex (`buildIndexableRobots` plus tests).

The items below harden these guarantees: SEO-H2 (tests), SEO-H6 (subdomains) and SEO-M1 (headers).

---

## 5. High Priority Improvements

<a id="seo-h1"></a>
### SEO-H1: `/explore` is indexable and in the sitemap, but serves an empty page

- **Severity:** High
- **Affected:** `src/app/explore/page.tsx`, `src/components/social/SocialExploreView.tsx`, `src/lib/seo.ts` (`indexableSitemapEntries`)
- **Current behaviour:** `SocialExploreView` calls `useSearchParams()` and is wrapped in `<Suspense fallback={null}>`. In a static export this sends the whole subtree, H1 included, to client rendering. Live `/explore` HTML has **8 visible words, 0 headings, 1 link**. The page carries `index, follow` and is in the sitemap. The project's verifier fails it ("initial HTML is too thin") but never runs on it.
- **SEO/user impact:** Search engines may index a near-blank page or classify it as soft-404/thin. All content depends on Googlebot executing JS and reaching `api.mypetlink.com.my`, which may be cold-starting (the app has a database wake-up flow). It is also the only Community page offered to search engines.
- **Recommended fix:** Render a static H1, an intro paragraph and a short "what is MyPetLink Community" section *outside* the Suspense boundary, and give the boundary a meaningful fallback. Keep the dynamic feed client-side. Until that ships, remove `/explore` from the sitemap and serve `noindex,follow`.
- **Complexity:** Low–Medium

<a id="seo-h2"></a>
### SEO-H2: SEO regression tests do not cover the shipped configuration

- **Severity:** High
- **Affected:** `src/lib/seo.test.ts`, `src/app/page.test.tsx`, `src/app/pricing/page.test.tsx`, `scripts/verify-seo-output.mjs`
- **Current behaviour:**
  - Vitest runs with the code defaults (ordering OFF, Social OFF). With production flag values, 4 tests fail. They assert that Where to Buy is noindex, that Where to Buy is not in the sitemap, that the Smart Tag button reads "Coming Soon", and that no purchase action exists.
  - `marketingPageCases` omits `/safety-profile`, `/explore` and `/where-to-buy`.
  - `verify-seo-output.mjs` hard-codes 8 pages and its own copy of the `lastModified` dates. It skips 4 of the 12 live sitemap URLs.
  - The sitemap exclusion checks only cover `admin|dashboard|pets|q|orders|settings` (unit) and `admin|dashboard|login|pets|orders|settings|q|t|activate` (build). `/n`, `/u`, `/moments`, `/feed`, `/notifications`, `/search`, `/records`, `/tags`, `/community` and non-sample `/p` are not guarded.
  - No test checks that a newly added route is classified at all.
- **SEO/user impact:** The configuration customers actually see is untested. SEO-H1 reached production through exactly this gap. A new route or a flag change could enter the index silently.
- **Recommended fix:** See [§14](#14-automated-test-plan): a route registry, a flag matrix, and a verifier driven by the sitemap.
- **Complexity:** Medium

<a id="seo-h3"></a>
### SEO-H3: The Smart Tag page has no product image and no way to buy

- **Severity:** High
- **Affected:** `src/app/smart-pet-tags/page.tsx`
- **Current behaviour:** The only images are the logo (twice). The only calls to action are "Create Free Pet Profile" and a link to How It Works. There is no "Get a Smart Tag" action and no in-content link to `/pricing` or `/where-to-buy`, although `/pricing` and the homepage both have one. The page has ~329 visible words. Real product photos already exist in the catalogue (`media.mypetlink.com.my/tag-products/…`).
- **SEO/user impact:** This is the page that should rank for "QR pet tag Malaysia", "NFC pet tag Malaysia" and similar searches. Without a product image it cannot appear well in image search, cannot carry valid Product structured data (Google requires an `image`), and gives buyers nothing to look at. Visitors arriving from search are led away from the purchase.
- **Recommended fix:** Add 1–3 curated product photos served from the main domain (`public/`), with descriptive alt text and explicit dimensions. Add the "Get a Smart Tag" action, gated on `publicCommerceAvailability.onlineOrderingAvailable` like the homepage. Add useful sections: Lightweight vs Standard (cats/small pets vs dogs), what a finder sees, what happens when a tag is lost or replaced, and NFC phone compatibility. Add contextual links to `/safety-profile`, `/pricing` and `/where-to-buy`.
- **Complexity:** Low–Medium (content and a product-photo choice)

<a id="seo-h4"></a>
### SEO-H4: No Product/Offer structured data for the only physical product

- **Severity:** High
- **Affected:** `src/lib/seo.ts`, `src/app/smart-pet-tags/page.tsx`
- **Current behaviour:** JSON-LD exists only on `/` (Organization, WebSite). No page declares the Smart Tag as a Product.
- **SEO/user impact:** The site misses product rich results (price and availability in results) and the strongest machine-readable signal for its commercial query cluster.
- **Recommended fix:** Add a `Product` + `Offer` on `/smart-pet-tags`, generated from the same source as the visible price and availability. Emit the Offer **only when ordering is available**. See [§9](#9-structured-data-recommendations) for the exact shape. **Depends on SEO-H3 (image) and SEO-H5 (one source of truth).**
- **Complexity:** Low once SEO-H3 and SEO-H5 are settled

<a id="seo-h5"></a>
### SEO-H5: Smart Tag price, name and availability have several owners

- **Severity:** High (it becomes a correctness problem the moment structured data is published)
- **Affected:** `src/lib/planLimits.ts` (`smartTagAddOn`, `smartTagAddOnsStatus`), `src/lib/features.ts` (`smartTagOrderingEnabled`, default `false`), tag catalogue (database), seeded AppSettings `tag.qr_nfc.price` / `tag.qr.price` (`MyPetLinkDbContext.cs:3184`)
- **Current behaviour:**
  - **Price:** the display price is the constant `"RM39.90"`. Orders are charged from the catalogue. Live catalogue on 2026-10-10: two products, each variant `finalPrice 39.9 MYR`. **They agree today**, but nothing enforces that. An unused, admin-editable AppSetting holds the same figure, contrary to `configuration-governance.md` rule 4.
  - **Availability:** "Available now" vs "Coming Soon" comes from a build-time flag whose code default is OFF. Any release built without `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED=true` silently re-labels the tag "Coming Soon" and removes `/where-to-buy` from the sitemap.
  - **Name:** marketing uses "MyPetLink QR + NFC Smart Tag". The catalogue sells "MyPetLink Pawsome Pet Tag" and "MyPetLink My Boss Pet Tag", both QR + NFC. Catalogue fields such as `material`, `shape` and `colour` are `"-"`, and `description` is `null`.
- **SEO/user impact:** If a catalogue price change or promotion is not mirrored in the constant, the page, meta description and Product schema publish a wrong price. Google treats structured-data price mismatches as a quality problem, and customers see one price on the page and another at checkout. A design-name mismatch confuses product search and any future Merchant Center feed.
- **Recommended fix:** See [§8 Recommendation](#single-source-of-truth-recommendation). In short: keep **one** display source and add a release-time check that compares it with the live catalogue and **fails closed**. Retire the unused AppSettings through a migration. Decide how the named designs relate to "QR + NFC Smart Tag" (product decision).
- **Complexity:** Medium

<a id="seo-h6"></a>
### SEO-H6: API and media subdomains have no indexing policy, and pet media is not edge-cached

- **Severity:** High (privacy hardening)
- **Affected:** `api.mypetlink.com.my` (Azure App Service, Kestrel), `media.mypetlink.com.my` (Cloudflare R2 custom domain)
- **Current behaviour:**
  - Neither subdomain has a `robots.txt` (both return 404), and neither sends `X-Robots-Tag`.
  - The API's public JSON (e.g. `/api/v1/public/...`, `/api/v1/tag-products`) has no `Cache-Control` or `X-Robots-Tag`.
  - Pet photos on `media.` (`/pets/…`) are served `cf-cache-status: DYNAMIC` with no `Cache-Control`. A 96×96 avatar is a 67 KB original. Tag product photos (`/tag-products/…`) do get `Cache-Control: max-age=14400`.
- **SEO/user impact:** Pet photos linked from noindex pages (Share Profiles, Moments, Explore) can still be indexed by Google Images on their own. An owner who chose "share by link" may not expect their pet's photos to be findable in image search. Uncached media slows Explore and Share Profiles. Indexing of either subdomain was **not observed** (it cannot be checked without Search Console); this is a preventive control.
- **Recommended fix:**
  - API: add an `X-Robots-Tag: noindex` response header to all API responses (ASP.NET middleware). **Do not** `Disallow` the API in robots.txt. Googlebot must fetch it to render JS pages such as `/explore`.
  - Media: add a Cloudflare Transform Rule setting `X-Robots-Tag: noindex` on `/pets/*` and Moment media paths. Leave `/tag-products/*` indexable if product images will be used there.
  - Media: set a long `Cache-Control` on immutable, content-hashed media keys.
- **Complexity:** Low (one middleware, two Cloudflare rules)

---

## 6. Medium Priority Improvements

<a id="seo-m1"></a>
### SEO-M1: Noindex on finder and private routes relies only on HTML meta tags

- **Severity:** Medium
- **Affected:** `edge/publicProfileEdge.ts` (`handleFinderPreviewRequest`), `edge/ownerProfileEdge.ts`, `edge/momentEdge.ts`; static private routes
- **Current behaviour:**
  - If the asset is not HTML, `handleFinderPreviewRequest` returns `context.next()` without rewriting.
  - `ownerProfileEdge` and `momentEdge` replace `<title>` but rely on the *static shell's* robots meta for noindex; they do not emit robots themselves.
  - No response anywhere carries `X-Robots-Tag`.
- **Impact:** The guarantee for `/q`, `/n`, `/t`, `/u` and `/moments` is correct today but indirect. A change to a static page's metadata could remove it without any edge test failing.
- **Fix:**
  - Set `X-Robots-Tag: noindex, follow` in every finder response (including the `context.next()` path) and `noindex` in the `/u`, `/moments` and social-card responses.
  - Have the owner and moment edges emit an explicit robots meta.
  - Add a `public/_headers` file with `X-Robots-Tag: noindex, nofollow` for `/admin/*`, `/dashboard*`, `/pets/*`, `/orders*`, `/settings*`, `/tags*`, `/login`, `/feed`, `/notifications`, `/community/*`.
  - Assert the headers in `edge/*.test.ts`.
- **Complexity:** Low

<a id="seo-m2"></a>
### SEO-M2: The homepage advertises retail partners that do not exist

- **Severity:** Medium
- **Affected:** `src/components/marketing/WhereToBuyTeaser.tsx`
- **Current:** It says "Find MyPetLink near you. Order online, or pick one up from an authorised partner." with a **"Find a Retail Partner"** button. `publicRetailPartners` is an empty array, and `/where-to-buy` says partners will be listed "here" in future.
- **Impact:** This is an inaccurate claim on the highest-authority page, and it disappoints users who click.
- **Fix:** Branch the copy on `hasPublicRetailPartners`: "Order your Smart Tag online" / "Get a Smart Tag" now, and the partner wording only when partners exist.
- **Complexity:** Low

<a id="seo-m3"></a>
### SEO-M3: Sitemap `lastmod` dates are stale and duplicated

- **Severity:** Medium
- **Affected:** `src/lib/seo.ts` (`indexableSitemapEntries`), `scripts/verify-seo-output.mjs`
- **Current:** `/`, `/pricing`, `/smart-pet-tags`, `/how-it-works`, `/pet-profile`, `/privacy` and `/terms` all say `2026-07-18`, but their sources last changed 2026-09-22. The Smart Tag went on sale after 2026-07-18. The verifier carries a second copy of the dates.
- **Impact:** Google only uses `lastmod` when it proves consistently accurate. Stale dates teach it to ignore the signal.
- **Fix:** Update the dates for pages whose visible content changed, and make the verifier read them from the generated sitemap. Keep the existing "no build-time dates" rule.
- **Complexity:** Low

<a id="seo-m4"></a>
### SEO-M4: The indexable sample Share Profile is a loading shell

- **Severity:** Medium
- **Affected:** `/p/topu-pnpr4ipnr6ppelnsn`, `isSearchIndexableSample`, `edge/publicProfileEdge.ts` (`indexableSamplePublicCode`)
- **Current:** It is `index,follow` and in the sitemap, but the server HTML reads "Getting this pet's profile ready… Loading" (16 words, no H1). Its content duplicates `/sample`.
- **Impact:** It is a thin, JS-dependent URL that competes with `/sample`.
- **Fix (decision):** Recommended: `noindex,follow` and remove it from the sitemap, leaving `/sample` as the indexable explanation. Alternative: server-render the sample's content at build time from `staticSampleExperiencePet`.
- **Complexity:** Low

<a id="seo-m5"></a>
### SEO-M5: Fonts and the logo compete with the LCP element

- **Severity:** Medium
- **Affected:** `src/app/layout.tsx`, `public/logo-horizontal.svg`
- **Current:** Six `woff2` files are preloaded on every page (Poppins 500/600/700/800/900 + Noto Sans). `logo-horizontal.svg` is **73 KB** because it wraps a base64 PNG; it is preloaded as an image on every page and appears twice (header and footer).
- **Impact:** Bandwidth contention on mid-range Android phones on mobile data delays LCP.
- **Fix:** Cut Poppins to the 2–3 weights actually used for headings, and let Noto Sans be the only body font. Replace the logo with a true vector SVG (a few KB) or an optimised PNG/WebP with explicit size.
- **Complexity:** Low

<a id="seo-m6"></a>
### SEO-M6: Marketing pages ship Owner Portal and Community JavaScript

- **Severity:** Medium
- **Affected:** `src/components/layouts/PublicLayout.tsx`, `PublicNav.tsx` (client components), root-layout globals (`ServiceWakeUpState`, `ReferralCapture`, `AnalyticsProvider`)
- **Current:** The homepage loads 27 JS chunks: **~450 KB compressed (~1.5 MB uncompressed)**. Chunks include owner-profile and social-notification API clients (`/api/v1/owner/profile`, `/api/v1/social/notifications/unread`).
- **Impact:** Main-thread work hurts INP and TBT, worst on low-end devices.
- **Fix:** Run a bundle analysis (`next build` with the analyzer). Load signed-in-only navigation (unread counts, owner profile) after hydration or on interaction, and check that `ServiceWakeUpState` is not needed on static marketing pages.
- **Complexity:** Medium

<a id="seo-m7"></a>
### SEO-M7: Core product pages are thin

- **Severity:** Medium
- **Affected:** `/pet-profile` (~276 words), `/how-it-works` (~303), `/smart-pet-tags` (~329), `/sample` (~318), `/where-to-buy` (~223)
- **Impact:** These pages are less likely to rank for informational queries, and leave owners with unanswered questions.
- **Fix:** Add a short page-specific FAQ (visible content, not FAQPage schema), concrete examples and the finder's perspective. No keyword padding.
- **Complexity:** Medium (copywriting)

<a id="seo-m8"></a>
### SEO-M8: Unresized R2 media in feeds and profiles

- **Severity:** Medium
- **Affected:** `src/lib/mediaUrl.ts`, Community and Share Profile components; `next.config.ts` (`images.unoptimized: true`, which the static export requires)
- **Current:** Originals are served at every display size (e.g. a 67 KB image for a 96 px avatar). There is no `srcset` and no AVIF/WebP. Video tiles use `<video preload="metadata">`, which costs a request per tile in a feed.
- **Impact:** Slower LCP on Share Profiles and Explore, and more mobile data used.
- **Fix:** Generate size variants at upload (the API already signs uploads) or use Cloudflare Image Resizing on `media.`. Add `srcset`/`sizes`. Use a still poster image for feed video tiles.
- **Complexity:** Medium

<a id="seo-m9"></a>
### SEO-M9: The pricing share image is very large

- **Severity:** Medium (Malaysia shares heavily over WhatsApp)
- **Affected:** `public/pricing-og.png` (**814 KB**)
- **Impact:** WhatsApp and some other apps are known to drop link previews for large images. Keeping OG images under ~300 KB is a safe target.
- **Fix:** Re-export as an optimised JPEG/PNG under ~300 KB at 1200×630.
- **Complexity:** Low

---

## 7. Low Priority Improvements

| ID | Issue | Affected | Current → Fix | Complexity |
|---|---|---|---|---|
| SEO-L1 | Homepage canonical vs sitemap trailing slash | `createMarketingMetadata`, Next output | Canonical renders `https://mypetlink.com.my`, the sitemap says `https://mypetlink.com.my/`. They are equivalent for the root, but make them identical | Low |
| SEO-L2 | `lang="en"` | `src/app/layout.tsx` | Use `en-MY` to match `og:locale en_MY` and WebSite `inLanguage` | Low |
| SEO-L3 | Organization data incomplete | `homepageStructuredData` | Logo is 540×140 (Google prefers a square logo ≥112 px); no `contactPoint`; no `sameAs`. See §8 | Low |
| SEO-L4 | Cloudflare email obfuscation | Cloudflare setting | Adds `/cdn-cgi/l/email-protection#…` links to every page. Harmless crawl noise; turn it off or accept it | Low |
| SEO-L5 | Unavailable Share Profile sends mixed signals | `createUnavailablePublicProfileMetadata`, `buildUnavailableProfileHead` | `noindex` plus a canonical to `/pet-profile`. Drop the canonical on noindex error pages | Low |
| SEO-L6 | Share Profile head built twice | `src/lib/seo.ts` + `edge/publicProfileEdge.ts` | They are identical today. Add a parity test so title, description and robots cannot drift | Low |
| SEO-L7 | Where to Buy metadata is generic | `src/app/where-to-buy/page.tsx` | e.g. "Buy the MyPetLink QR + NFC Smart Tag in Malaysia" with a description naming online ordering and the price | Low |
| SEO-L8 | 404 page title "Loading" | `src/app/not-found.tsx` (`RuntimeRouteFallback`) | Status is correctly 404, but the initial HTML says "Getting this pet's profile ready". Use "Page not found" for non-pet paths | Low |
| SEO-L9 | No `twitter:site` | `src/app/layout.tsx` | Add it only if an official X account exists | Low |
| SEO-L10 | Admin housekeeping | `/admin/community-reports`, `/admin/qr-profiles` (no title); `/admin/login` (2 H1s) | Not an SEO risk (noindex). Clean up when convenient | Low |

---

## 8. Content Consistency Issues

### What is correct today

The live marketing pages are consistent with the current product:

- QR + NFC Smart Tag, **RM39.90 one-time**, **Available now**
- Premium: **Coming Soon**
- GPS Safety: **Coming Later**
- "Not a GPS tracker" disclaimers
- "Our only physical tag"
- Lightweight and Standard variants

No public page mentions a QR-only tag or RM19.90. `src/lib/tagCapabilities.ts` blocks QR-only sales, and every Owner Portal "coming soon" Smart Tag message is correctly gated on `smartTagOrderingEnabled`.

### Inconsistencies found

| # | Severity | Where | Problem | Recommended fix |
|---|---|---|---|---|
| CC1 | High | `src/lib/features.ts` default + `planLimits.smartTagAddOnsStatus` | Availability is a build flag that **defaults to "Coming Soon"**; production only shows "Available now" because of env vars | See the single-source-of-truth recommendation below. At minimum, the release build must assert the flag (as `build-release.mjs` already does for Social) |
| CC2 | High | Tag catalogue vs `smartTagAddOn.name` | The catalogue sells "Pawsome Pet Tag" and "My Boss Pet Tag"; marketing says "QR + NFC Smart Tag". `AGENTS.md` says design options are deprecated, yet two named designs are live | Product decision: are these designs of one product (then name them as variants of "MyPetLink QR + NFC Smart Tag") or separate products? |
| CC3 | Medium | `WhereToBuyTeaser.tsx` | "Pick one up from an authorised partner" / "Find a Retail Partner" with zero partners | SEO-M2 |
| CC4 | Medium | `marketing/xiaohongshu/00-product-audit.md` (line 50) | Tells the content team the tag is **Coming Soon**, ordering is **off**, and "No post may drive a tag purchase" | Update before more posts are produced. This file steers public marketing |
| CC5 | Medium | `src/app/pricing/page.test.tsx`, `src/app/page.test.tsx`, `src/lib/seo.test.ts` | Tests assert "Coming Soon" and no purchase action, which is the opposite of production | Run under a flag matrix (SEO-H2) |
| CC6 | Low | `docs/operations/order-and-payment-proof-flow.md`, `docs/operations/smart-tag-lifecycle.md` | "Launch state: ordering disabled" banners | Update the banners to the current state |
| CC7 | Low | `docs/launch/SOFT_LAUNCH_SCOPE.md`, `SOFT_LAUNCH_READINESS.md`, `docs/deployment/smoke-test-script.md` step 8 | Describe Smart Tag commerce as deferred | Mark as historical or update |
| CC8 | Low | `apps/web/README.md:78` | "Smart Tag Add-ons" (plural) | "Smart Tag add-on" |
| CC9 | Low | Seeded AppSettings `tag.qr_nfc.price`, `tag.qr.price` | Unused duplicates of a business fact (governance rule 4) | Retire through a migration with rollout and rollback notes |
| CC10 | Low | Catalogue data quality | Variant `material`, `shape`, `colour` = `"-"`, `description: null` | Fill in before any of it feeds Product schema or a shopping feed |
| CC11 | Info | `src/data/mockOrders.ts`, admin and API "QR Pet Tag" labels, `OrderDocumentService` | Legacy QR-only references | **Keep.** These are required history fallbacks (`AGENTS.md` hard rule 6) |

<a id="single-source-of-truth-recommendation"></a>
### Single source of truth: recommendation

The repository already has the right foundation. `smartTagAddOn` in `src/lib/planLimits.ts` is documented as the only place the retail price is written, and `smartTagAddOnsStatus` derives availability from `publicCommerceAvailability`. **Do not add a third constant.** Instead:

1. **Move the product facts into one typed module** (e.g. `src/config/smartTagProduct.ts`, or extend `smartTagAddOn`): name, short name, description, display price, **numeric price `39.90`**, **currency `"MYR"`**, canonical URL `/smart-pet-tags`, and product image paths. Metadata, page copy and JSON-LD all read from it, so schema never parses `"RM39.90"`.
2. **Keep availability derived, never typed.** JSON-LD `availability` and the visible badge must both come from `publicCommerceAvailability.onlineOrderingAvailable`.
3. **Add a release-time check that fails closed.** A script run before deploy fetches `GET /api/v1/tag-products` and fails if any active QR + NFC variant's `finalPrice`/`currency` differs from the constant, or if the production build was produced without the ordering flag. It must run before deploy, not on every page view: the static export cannot read the catalogue at request time, and making the build depend on a live API call would be fragile.
4. **Retire the unused AppSettings** (CC9) so the configuration inventory has one owner per fact.
5. **Promotions:** the catalogue supports `promotionName`/`discountAmount`. If promotions are used, the marketing price and Offer must reflect them, or the check in (3) must block the release. Decide which before running any promotion.

---

## 9. Structured Data Recommendations

### Existing

`/` only: Organization (`name`, `legalName`, `url`, `logo` = `/logo-horizontal.png`, `areaServed: Malaysia`) and WebSite (`name`, `url`, `publisher`, `inLanguage: en-MY`). It parses as valid JSON-LD, escapes `<` correctly, and contains no fake ratings (there is a test for that).

### Recommended

| Type | Page(s) | Fields | Notes |
|---|---|---|---|
| **Organization** (extend) | `/` | Add `logo` as a **square** ≥112 px image (e.g. `/app-icon-512.png`); `contactPoint: { contactType: "customer support", email: support@mypetlink.com.my, areaServed: "MY", availableLanguage: ["en"] }`; `sameAs` **only** for official accounts that exist (e.g. the Xiaohongshu brand account if it is official and public) | Keep `legalName` = GBB Software Solutions. Do not add an address unless it is published |
| **WebSite** (keep) | `/` | No `SearchAction`: the sitelinks search box is retired and `/search` is noindex | Already good |
| **Product + Offer** (new) | `/smart-pet-tags` | See draft below | Emit the Offer only while ordering is available |
| **BreadcrumbList** | Future `/guides/*`; optional on `/smart-pet-tags`, `/safety-profile`, `/pet-profile` | Home → Section → Page | Low value while the IA is flat (every page is one level deep). Introduce it with the guide cluster |
| **FAQPage** | — | **Not recommended** | Google limited FAQ rich results to well-known government and health sites in 2023. Keep FAQs as visible content |
| **AggregateRating / Review** | — | **Do not add** | MyPetLink has no collected reviews. Fabricated ratings violate Google policy |

### Product/Offer draft (recommendation only, not implemented)

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": "https://mypetlink.com.my/smart-pet-tags#product",
  "name": "MyPetLink QR + NFC Smart Tag",
  "description": "A QR + NFC smart pet tag. A finder can scan the QR code or tap with an NFC phone to open your pet's Safety Profile. One-time purchase, not a GPS tracker.",
  "brand": { "@type": "Brand", "name": "MyPetLink" },
  "image": [
    "https://mypetlink.com.my/products/smart-tag-front.jpg"
  ],
  "url": "https://mypetlink.com.my/smart-pet-tags",
  "offers": {
    "@type": "Offer",
    "url": "https://mypetlink.com.my/smart-pet-tags",
    "price": "39.90",
    "priceCurrency": "MYR",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition",
    "seller": { "@id": "https://mypetlink.com.my/#organization" },
    "areaServed": { "@type": "Country", "name": "Malaysia" }
  }
}
```

Verification checklist for this schema:

- `name`, `description` and `price` come from the shared module (§8). `priceCurrency` = `MYR`.
- `availability` is derived. When ordering is off, **omit `offers` entirely**. Do not emit a misleading `PreOrder`.
- `InStock` assumes stock exists. If inventory can run out, connect this to a real signal or accept that the page itself also says "Available now".
- `image` must be a real product photo hosted on `mypetlink.com.my` (SEO-H3), not the logo or mascot.
- `url` is the canonical product page.
- Add `shippingDetails` / `hasMerchantReturnPolicy` **only** if they are fixed and published facts. Delivery rates are admin-managed today (`/admin/delivery-rates`), so leave them out at first.
- If the named designs (CC2) become variants, use `ProductGroup` with `hasVariant` later. Do not invent `sku`/`gtin` values.

### Community and profile structured data (identify only)

Possible later: `ProfilePage` for `/u/{handle}` (with an `Organization` or `Person`-like `mainEntity` for the household) and `ProfilePage`/`CreativeWork` for opted-in Share Profiles. **Do not implement** until the opt-in indexing model in §10 exists. Structured data on noindex pages has no search value and only adds a data-exposure surface.

---

## 10. Community SEO Recommendation

### Current state (correct, keep it)

`/u/{handle}`, `/moments/{id}` and every non-sample `/p/{slug}` are noindex. Only the `/explore` doorway is offered to search engines. This matches the explicit intent in `src/app/explore/page.tsx`, and the social-foundation rule that `IsDiscoverable` is a *within-MyPetLink* discovery control, not consent to appear in search engines.

### Should these pages be indexed now? **No.**

| Factor | Assessment |
|---|---|
| Thin content | Most profiles are a name, a photo and a few Moments. Mass-indexing thousands of near-identical "Meet {pet}" pages risks a site-wide quality signal |
| Duplicate content | Share Profile, Community Profile and Moments overlap. Canonical rules would have to be defined first |
| Privacy | Share Profiles can show a general area, Lost Mode status and care badges. "Share this link" (`IsPublicProfileEnabled`) is **not** consent to appear on Google |
| Owner consent | There is no owner-facing "Show in search engines" control today, and no copy tells owners how search engines treat their pages |
| UGC moderation | Moderation exists (Community reports and restrictions), but indexed UGC needs removal to propagate quickly: noindex plus cache purge |
| SEO value | Individual pet pages have little search demand beyond the pet's name. The value is in the brand and the topical cluster, not in profile volume |
| Canonical behaviour | Share Profile canonical = `/p/{slug}` (slug-change history needs 301s); `/u/{handle}` (handle changes need 301s); Moment canonical = `/moments/{id}` |

### Future model: opt-in **and** quality threshold

A profile becomes indexable only when **both** of these hold:

1. **The owner opts in** with a new, separate switch, off by default for existing and new rows: "Let search engines like Google show {pet}'s Share Profile". It is independent of Share ON and Community Discoverable, following the one-way dependency rule: indexing requires Share ON, never the reverse.
2. **The profile passes a server-side quality check**, for example:
   - A profile photo and a bio of ≥ N characters
   - ≥ 3 public Moments
   - The profile is ≥ 7 days old
   - No open moderation reports and no account restrictions
   - Not in memorial state without explicit consent
   - Lost Mode handled as a separate explicit choice

Implementation notes for later:

- The API public projection returns a computed `searchIndexable` boolean. The edge reads it to choose `index` vs `noindex`. Privacy is enforced in the projection, not the component (`AGENTS.md` social rule 1 pattern).
- Indexable profiles need a **dynamic sitemap** (the static export cannot list them): a Pages Function at `/sitemaps/profiles.xml` backed by the API, referenced from a sitemap index.
- Turning the switch off must flip to `noindex` immediately (`Cache-Control` already allows this). Owners should be told that removal from Google can take days to weeks.
- Owner-facing copy must explain the difference between "anyone with the link", "people browsing MyPetLink" and "search engines".

---

## 11. Internal Linking and Information Architecture

### What works

- Every marketing page links to every other through the header's Product menu (Pet Profiles, Safety Profile, Smart Tags, How It Works), the Pricing/Community/Where to Buy items and a four-column footer. Live HTML confirms every sitemap page has 10 inbound internal links. **There are no orphan pages.**
- All links are real `<a href>` anchors (enforced by `PublicLayout.seo.test.tsx` and the verifier).
- The homepage tells a coherent story with contextual links to the samples, `/smart-pet-tags` and `/pricing`.

### Gaps

| Gap | Recommendation |
|---|---|
| Linking is almost entirely navigational. Pages rarely link to each other *in context* | Add 2–4 contextual links per page where they help the reader. For example: `/safety-profile` → "how a finder opens it with a Smart Tag" (`/smart-pet-tags`); `/smart-pet-tags` → "what the finder sees" (`/safety-profile`), "price" (`/pricing`), "buy" (`/where-to-buy`); `/pet-profile` → the sample Share Profile |
| `/smart-pet-tags` has no buy path (SEO-H3) | Add the gated "Get a Smart Tag" action and a Where to Buy link |
| `/explore` links only to `/` in its server HTML | Static intro with links to `/pet-profile` and How It Works (SEO-H1) |
| No informational content layer | Introduce `/guides` (§12) as the hub for lost-pet and identification topics, linking down to the product pages |
| Topic clusters are implicit | Make the clusters explicit (table below) |

### Topic clusters

| Cluster | Pillar page | Supporting pages (existing → proposed) |
|---|---|---|
| Pet profiles | `/pet-profile` | `/sample`, `/how-it-works` → guide: "What to include in a pet profile" |
| Lost pet safety and finder contact | `/safety-profile` | `/how-it-works`, `/sample` → guides: lost-pet first 24 hours; found a pet |
| QR/NFC Smart Tags and pet identification | `/smart-pet-tags` | `/pricing`, `/where-to-buy` → guides: QR vs NFC; what to put on a pet ID tag; microchip vs tag |
| Privacy and trust | `/privacy` (legal) | → guide: "How a Safety Profile protects your contact details" |
| Pet community | `/explore` | Individual profiles stay noindex (§10) |
| Malaysian pet owners | Cross-cutting | Malaysian context inside each guide. Do not create separate city or state landing pages |

---

## 12. Content Opportunities

Every topic below is a **hypothesis** until Search Console impressions or keyword data confirm demand. The aim is a small cluster (**5–7 pages**) that a real Malaysian pet owner or finder would find useful, each answering one intent and linking to the product page that helps.

| Priority | Working title | Search intent (hypothesis) | Links to |
|---|---|---|---|
| 1 | Found a lost cat or dog in Malaysia? How to help it get home | finder: "found lost dog Malaysia", "found cat with tag" | `/safety-profile` |
| 2 | Lost your pet? What to do in the first 24 hours (Malaysia) | owner: "lost cat Malaysia what to do" | `/safety-profile`, `/pet-profile` |
| 3 | QR vs NFC pet tags: what's the difference? | "QR pet tag", "NFC pet tag Malaysia" | `/smart-pet-tags` |
| 4 | What to put on a pet ID tag, and what to leave off | "pet ID tag Malaysia", privacy-conscious owners | `/smart-pet-tags`, `/safety-profile` |
| 5 | Microchip, collar tag or Safety Profile? How they work together | "pet microchip Malaysia" + tags | `/smart-pet-tags` |
| 6 | How Safety Profiles keep your phone number private | "pet tag privacy", trust | `/safety-profile`, `/privacy` |
| (fold-in) | Lightweight vs Standard: choosing a tag for a cat or a dog | product question | Section on `/smart-pet-tags`, not a separate page |

Guidelines:

- **Facts must be verified.** Statements about Malaysian rules (e.g. DVS guidance, local-council dog licensing, microchipping practice) need a cited, current source or should be left out. Do not guess at regulations.
- Write in plain English first. **Bahasa Malaysia and Chinese** versions are candidates if Search Console shows demand. The Xiaohongshu programme suggests a Chinese-speaking audience. Treat that as a later decision with proper `hreflang`, not machine-translated pages.
- Do not create city or state variants ("QR pet tag Kuala Lumpur", "… Penang") or mass-generated pages.
- Each guide gets one H1, a clear answer in the first paragraph, original images where possible (the brand mascot Linko is distinctive), and 2–3 contextual links to the pillar page.

---

## 13. Core Web Vitals Risks

Measured from production HTML on 2026-10-10. Field data (CrUX/Search Console Core Web Vitals) was not available. Confirm with Search Console's Core Web Vitals report and PageSpeed Insights before optimising.

| Metric | Risk | Evidence | Opportunity |
|---|---|---|---|
| LCP | Medium | Six font preloads plus a 73 KB embedded-PNG logo preload compete with the hero. The hero image (`linko-hero.png`, 33 KB, 440×440) is fine and preloaded | SEO-M5: trim weights, real vector logo, and consider `fetchPriority="high"` on the hero image only |
| LCP (Share Profile, Explore) | Medium–High | Content renders client-side after an API call; the API may cold-start; pet media is uncached (`DYNAMIC`) and unresized | SEO-H6 caching, SEO-M8 resizing, static shells (SEO-H1) |
| INP | Medium | ~450 KB compressed JS on the homepage, including Owner Portal and Community clients | SEO-M6 |
| CLS | Low | All marketing `<img>` tags have width and height; `next/font` uses size-adjusted fallbacks | Keep explicit dimensions in new components and in feed media placeholders |
| Third-party scripts | Low | Only GA4 (`afterInteractive`) and Cloudflare's email decoder | Keep GA4 deferred. Consider `lazyOnload` on marketing pages |
| Community feed | Medium | Many `<video preload="metadata">` tiles; full-size images | Poster images; IntersectionObserver playback already exists (per social-foundation) |
| Hydration | Low–Medium | `PublicLayout` and `PublicNav` are client components wrapping server-rendered content | Fine structurally. Shrink what the client components import |
| Images in general | Medium | `images.unoptimized: true` (required by static export): no responsive variants | Pre-generate WebP/AVIF for static marketing images; resize R2 media at upload or the edge |

Do not trade UX for scores. For example, keep the mascot hero and the real product photos; just size them correctly.

---

## 14. Automated Test Plan

The existing tests are a good base: `seo.test.ts`, `PublicLayout.seo.test.tsx`, `edge/*.test.ts` and `verify-seo-output.mjs`. The recommended architecture adds **one source of truth for route policy** and runs the checks at three layers.

### Layer 0: a route SEO registry (single source of truth)

Add a typed registry in `src/lib/seo.ts` (or `src/lib/seoRoutes.ts`) mapping every route pattern to a policy:

```ts
type SeoPolicy = "index" | "noindex-follow" | "private";
// "/" → index, "/q/[safetyCode]" → noindex-follow, "/admin" (prefix) → private, …
```

`indexableSitemapEntries` derives from it. Tests, the verifier and the `_headers` file (SEO-M1) all read it.

### Layer 1: unit tests (Vitest, every `npm test`)

1. **Every route is classified.** Walk `src/app/**/page.tsx` and fail if any route has no registry entry, so a new page cannot ship unclassified.
2. **Indexable routes:** a unique title (≤ 60 chars, non-generic), a unique description (70–160 chars), a self-referencing canonical on `https://mypetlink.com.my`, robots `index,follow`, and OG plus Twitter images.
3. **Noindex routes:** `/q`, `/n`, `/t` and `/activate` metadata `index: false`; every private layout `index: false, follow: false`.
4. **Sitemap:** the URL set equals the registry's `index` set exactly; every URL is on `https://mypetlink.com.my/`; no URL matches any noindex or private pattern (driven by the registry, not a hand-written regex).
5. **Smart Tag consistency:** Product JSON-LD `name`, `price` (`"39.90"`) and `priceCurrency` (`MYR`) equal the shared module; `availability` equals the visible badge state; no `aggregateRating` or `review` keys anywhere.
6. **Structured data is valid:** `JSON.parse` succeeds, `@context` is `https://schema.org`, required fields are present per type (optionally typed with `schema-dts`).
7. **Edge parity:** `buildPublicProfileHead` and `createPublicProfileMetadata` produce the same title, description and robots.
8. **Flag matrix.** Run the SEO suites twice, once with code defaults and once with production values, using a Vitest `projects` entry with `env` (or `vi.stubEnv` + `vi.resetModules`). Expectations branch on `publicCommerceAvailability` and `socialEnabled` instead of hard-coding "Coming Soon".

### Layer 2: build-artifact verification (`npm run verify:seo`, in CI after the release build)

Extend `scripts/verify-seo-output.mjs` to:

- **Derive the page list from `out/sitemap.xml`** instead of a hard-coded array, so `/explore`, `/safety-profile`, `/where-to-buy` and future pages are checked automatically.
- Assert exactly one H1 per indexable page, visible text above the existing threshold, and JSON-LD that parses.
- Assert that every private and finder HTML file in `out/` carries a noindex robots meta.
- Assert `out/_headers` contains the `X-Robots-Tag` rules (after SEO-M1).
- Run it against the `build:social-on` artifact with production commerce flags.

### Layer 3: edge function tests (existing `edge/*.test.ts`)

- Assert the `X-Robots-Tag` header on `/q`, `/n`, `/t` (including the `context.next()` fallback), `/u`, `/moments` and social-card responses.
- Assert that the sample `/p` policy matches the registry.

### Layer 4: post-deploy smoke check (read-only, manual or scheduled)

A small script (like the one used for this audit) that fetches production and checks:

- `robots.txt` and the `sitemap.xml` URL set
- index robots plus self canonical on each sitemap URL
- noindex on a known sample `/q`, an unknown `/n` and `/t`, `/u/{handle}`, `/login`, `/admin`
- the `www`/`http`/trailing-slash redirects
- the Smart Tag price on `/smart-pet-tags` matches the catalogue API

Run it after every production deploy. It never writes anything.

---

## 15. Google Search Console Workflow

No direct Search Console API access is assumed.

### What to export, and how often

**Monthly** (every two weeks during the first three months after launch), for the last 28 days with "Compare to previous period" switched on:

| Export | Search Console location | Tabs / filters |
|---|---|---|
| Performance | Search results → Export → CSV | Queries, Pages, Countries, Devices, Dates. Search type: Web (Image separately if relevant) |
| Performance by page | Same, filtered to one page | For the 5 most important pages: the queries driving each page (needed for cannibalisation, because a plain export does not cross queries with pages) |
| Indexing | Indexing → Pages → Export | "Why pages aren't indexed" with example URLs, especially *Crawled – currently not indexed*, *Discovered – currently not indexed*, *Duplicate without user-selected canonical*, *Excluded by 'noindex' tag* |
| Sitemaps | Indexing → Sitemaps | Screenshot or note of discovered vs indexed counts |
| Core Web Vitals | Experience → Core Web Vitals | Mobile and desktop status |

Drop the files into a **gitignored** local folder such as `seo-data/gsc/YYYY-MM/`. Query data can contain pet names or codes and does not belong in git. Ask me to analyse that folder.

> UI exports cap at 1,000 rows per table. That is enough at MyPetLink's current scale. If it becomes limiting, the Looker Studio connector or Search Console's BigQuery bulk export removes the cap without new code.

### How each report is used

| Question | Method | Typical action |
|---|---|---|
| **High-impression, low-CTR pages** | Pages and queries with impressions above a floor (start at ≥100 per 28 days) and CTR well below the norm for their position band | Rewrite title and description for the user's actual query; check that the snippet matches the intent |
| **Positions 4–20 ("striking distance")** | Queries with average position 4–20, sorted by impressions, mapped to their landing page | Improve that page's depth, add the contextual internal links from §11, answer the query explicitly in a section |
| **Content gaps** | Queries with impressions whose landing page is a poor match (e.g. the homepage ranking for "found a cat what to do") | Candidate for one of the §12 guides, confirming the hypothesis with data |
| **Keyword cannibalisation** | The same query receiving impressions on ≥2 URLs, from the per-page exports | Differentiate the pages' intents, consolidate, or point one to the other with internal links |
| **Pages losing traffic** | Period comparison: clicks and impressions down more than ~30% on pages with meaningful volume | Check indexing status, recent content changes, position changes and seasonality |
| **New keyword opportunities** | Queries present this period and absent last period, plus queries containing "malaysia", "near me" or Malay/Chinese terms | Feed the content backlog; consider language versions if non-English demand appears |
| **Crawled but not indexed** | Indexing export cross-checked against the Route Indexing Matrix (§3) | Expected for noindex routes (`/q`, `/n`, `/t`, `/u`, `/p`). Unexpected for marketing pages, which means a quality or thin-content problem to fix |
| **Country and device** | Countries and Devices tabs | Confirm Malaysia dominates; prioritise mobile CWV if mobile ≫ desktop |

### Output

Each analysis produces `docs/seo/reports/YYYY-MM.md`: top findings, a prioritised action list, and the hypotheses in §12 marked confirmed or rejected. It contains aggregates only, never raw query exports.

---

## 16. Recommended Implementation Phases

| Phase | Scope | Depends on |
|---|---|---|
| **1: Safety and correctness** (below) | Explore static shell or temporary noindex; test hardening and flag matrix; `X-Robots-Tag` headers; truthful Where to Buy teaser; sitemap `lastmod`; Organization enrichments; stale-doc updates | Nothing; all repo-side and low risk |
| **2: Smart Tag commercial page** | Product photo(s), buy action, deeper content, Product/Offer JSON-LD from a shared module, catalogue price check before release, retire the duplicate AppSettings, decide the design naming (CC2), media `noindex` and caching rules, OG image optimisation | Product decisions: photo, naming, promotions |
| **3: Performance** | Font weights, vector logo, bundle split of signed-in navigation, R2 image variants, feed video posters | Bundle analysis |
| **4: Content cluster** | 5–7 guides from §12, `/guides` hub, BreadcrumbList, contextual links | First 1–2 Search Console exports to rank the hypotheses |
| **5: Community indexing (optional)** | Owner opt-in switch, quality threshold, `searchIndexable` projection, dynamic profile sitemap, owner copy | Product and privacy decision, API change, migration |

<a id="phase-1-recommended-scope"></a>
## Phase 1: Recommended Scope

Only the safest, highest-impact changes. None alters what owners or finders see except the Explore intro and one corrected sentence on the homepage. None needs a database migration.

1. **Fix `/explore` (SEO-H1).** Render a static H1, an intro and links outside the Suspense boundary, with a non-null fallback. If that cannot ship in this phase, make `/explore` `noindex,follow` and remove it from the sitemap instead.
2. **Harden SEO tests (SEO-H2).**
   - Add the route registry and the "every route is classified" test.
   - Extend the sitemap exclusion checks to `/n`, `/u`, `/moments`, `/feed`, `/notifications`, `/search`, `/records`, `/tags`, `/community` and non-sample `/p`.
   - Add a production-flag Vitest run.
   - Make `verify-seo-output.mjs` read its page list and dates from the generated sitemap.
3. **Belt-and-braces noindex (SEO-M1).** Add `X-Robots-Tag` in the finder, owner-profile, moment and social-card edge responses (with tests), and a `public/_headers` file for private static routes.
4. **API noindex header (part of SEO-H6).** Add one ASP.NET middleware that sets `X-Robots-Tag: noindex` on API responses. Do not disallow the API in robots.txt.
5. **Truthful Where to Buy teaser (SEO-M2 / CC3).** Branch the copy on `hasPublicRetailPartners`.
6. **Accurate sitemap `lastmod` (SEO-M3).** Update the dates for pages that changed since 2026-07-18, with one source for the dates.
7. **Organization structured data (SEO-L3).** Add a square logo and a support `contactPoint`, plus `sameAs` only for confirmed official accounts. Set `lang="en-MY"` (SEO-L2).
8. **Stale guidance (CC4, CC6–CC8).** Update `marketing/xiaohongshu/00-product-audit.md` first, because it is actively steering public posts. Then update the ops banners and README.

Deliberately **not** in Phase 1:

- Product/Offer schema: it needs a product photo and the price and naming decisions, otherwise it would publish facts that could drift.
- Media subdomain rules: Cloudflare dashboard changes, best done together with the caching work.
- Any change to Share Profile, Community Profile or Moment indexing.
