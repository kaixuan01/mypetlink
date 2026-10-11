# SEO Phase 1: Implementation Report

**Date:** 2026-10-10
**Based on:** [`seo-audit.md`](seo-audit.md) (Phase 1 scope), plus the Smart Tag availability and "Coming Soon" audit requested the same day.
**State:** implemented and verified **locally**. Nothing was committed, pushed, deployed or published. No production configuration, database, price, catalogue, order flow, QA rule or R2 setting was changed.

## Result

| Area | Result |
|---|---|
| Task 1: Explore initial HTML (SEO-H1) | **PASS** |
| Task 2: SEO regression coverage (SEO-H2) | **PASS** |
| Task 3: Noindex response headers (SEO-M1) | **PASS** |
| Task 4: API indexing policy (SEO-H6) | **PASS** |
| Task 5: Retail partner messaging (SEO-M2) | **PASS** |
| Task 6: Sitemap accuracy (SEO-M3) | **PASS** |
| Task 7: Organization metadata (SEO-L2, SEO-L3) | **PASS** |
| Task 8: Outdated documentation | **PASS** |
| Smart Tag availability / "Coming Soon" audit | **PASS**, with **one item to check in Admin before promoting tags** ([§5.4](#54-needs-your-check-before-promoting-tags)) |
| Web tests (both flag projects) | **PASS**: 4,202 passed, 4 skipped, 0 failed |
| API tests | **PASS**: 2,588 passed, 0 failed |
| Typecheck (app + Functions), ESLint, Functions build | **PASS** |
| Production-equivalent static build + `verify:seo` | **PASS** (1 expected warning, SEO-M4) |
| Pre-sale flag build + `verify:seo` | **PASS** |
| Local Cloudflare runtime header check (`wrangler pages dev`) | **PASS** (44 routes) |

---

## 1. Completed changes

### Task 1: Explore has meaningful static HTML

- New server component `ExploreIntro` renders **outside** the Suspense boundary. It contains:
  - an eyebrow and one H1, "Explore pets and pet families";
  - two short paragraphs;
  - contextual links to `/pet-profile`, `/safety-profile` and `/how-it-works`.
- The Suspense fallback is now `ExploreViewFallback` instead of `null`. It shows the toolbar's footprint and the "Suggested pets" and "Latest Moments" sections with their existing skeletons. The view replaces it, so no heading appears twice.
- `SocialExploreView` no longer renders its own H1 ("Community"). Its header row is now just the toolbar: the species filter and Search side by side. The feed, search dialog, filtering, pagination, skeletons, error/empty states and Follow behaviour are unchanged.
- No pet, household, Moment or media URL appears in static HTML (tested).
- `/explore` stays indexable only while Community is on (`NEXT_PUBLIC_SOCIAL_ENABLED=true`). The project's own verifier now checks it.

### Task 2: SEO regression coverage

- **One route policy.** `src/lib/seoRoutes.ts` classifies every route:
  - `index`, `noindex-follow` or `noindex-nofollow`;
  - whether its headers come from a static asset or a Pages Function;
  - the `lastModified` content date of every indexable page.

  The sitemap, marketing-page robots metadata, `public/_headers` and the verifier all follow it. `seo.ts` keeps its public API (`indexableSitemapEntries`, `createMarketingMetadata`) but derives both from the table.
- **No route can bypass it.** `seoRoutes.test.ts` walks `src/app/**/page.tsx` and fails on any route without a rule, or on a rule for a page that does not exist. It also checks:
  - 33 explicit finder, private and dynamic-route expectations;
  - the sitemap;
  - `_headers`, against each static noindex page;
  - `_routes.json`, so every edge rule is really served by a Function.
- **Both flag configurations are tested.** `vitest.config.ts` now runs two projects:
  - `default-flags`: the whole suite with code defaults, as before;
  - `production-flags`: 34 public, SEO and commerce suites with the production flag values.

  The four tests that failed under production flags in the audit now assert against the active flags rather than hard-coding "Coming Soon".
- **The build verifier is driven by the sitemap.** `scripts/verify-seo-output.mjs` no longer keeps its own page list or dates. For every URL in the generated `sitemap.xml`, it checks:
  - one self-referencing canonical;
  - one `index,follow` robots tag;
  - title and description length;
  - title/description uniqueness;
  - exactly one H1 and at least 500 characters of initial text for static pages;
  - JSON-LD that parses, with no ratings or reviews.

  Beyond the listed pages, it checks that every other exported HTML page is noindex, that `robots.txt` has no `Disallow`, that `_headers` ships, `lang="en-MY"`, the Organization/WebSite data and the 404 page. The sample Share Profile is a page assembled in the browser, so its thin shell is reported as a warning (SEO-M4, pending a product decision), not a failure.

### Task 3: Noindex response headers

- **Static pages:** `public/_headers` sends `X-Robots-Tag` for every statically served noindex route:
  - Owner Portal, Admin Portal, `/login`, `/feed`, `/notifications` and `/community/*`: `noindex, nofollow`;
  - `/search` and `/activate/*`: `noindex, follow`.
- **Pages Functions:** Cloudflare does **not** apply `_headers` to Function responses (confirmed in Cloudflare's documentation; the docs say nothing about `context.next()`, so the local runtime test below covered it). Every Function therefore sets its own header through `edge/robotsHeader.ts`:

  | Routes | `X-Robots-Tag` | Paths covered |
  |---|---|---|
  | `/q`, `/n`, `/t` | `noindex, follow` | Every path, including the `context.next()` fallthrough for a non-HTML asset |
  | `/p` (owner Share Profiles) | `noindex, follow` | Every path, including HEAD, 404, malformed slug and the API-failure fallback |
  | `/p` (approved sample) | none | It stays indexable |
  | `/u` and `/moments` | `noindex, follow` | Every path |
  | `/u/*/followers`, `/following` | `noindex, nofollow` | Every path |
  | `/social/pets/*.jpg` (link-preview images) | `noindex` | Every path |

- `robots.txt` is unchanged (`Allow: /`). No `Disallow` was added; the verifier now forbids it.
- Owner consent, profile visibility and authentication are unchanged.

### Task 4: API indexing policy

- New `SearchIndexingPolicyMiddleware` adds `X-Robots-Tag: noindex` to every API response. It registers with **one line** in `Program.cs`, after `RequestContextMiddleware`.
- The header is added in `Response.OnStarting`, so it survives the error handler's `Response.Clear()` and also covers CORS preflights and 404s.
- Response bodies, status codes, CORS, authentication, authorization and caching are unchanged (tested). Public Explore endpoints stay anonymously readable.

### Task 5: Retail partner messaging

`WhereToBuyTeaser` copy now follows the channels that exist:

| Channels | Teaser copy | Button |
|---|---|---|
| Online ordering only (today) | "Order your Smart Tag online." / "Buy the MyPetLink QR + NFC Smart Tag directly from MyPetLink for RM39.90, one-time." | **See How to Buy** → `/where-to-buy` |
| Online + public partners | "Find MyPetLink near you." / "Order online, or pick one up from an authorised partner." | **Find a Retail Partner** |
| Partners only | "Find MyPetLink near you." / "Pick one up from an authorised partner near you." | **Find a Retail Partner** |
| Neither | (teaser hidden) | — |

The commerce flag behaviour is preserved.

### Task 6: Sitemap accuracy

Dates now come from git history of visible-copy changes and are stored once, in `seoRoutes.ts`. They are never set from the build time.

| URL | Before | After | Evidence |
|---|---|---|---|
| `/` | 2026-07-18 | **2026-10-10** | Teaser copy changed in this release (also 2026-09-22 copy) |
| `/pricing`, `/how-it-works`, `/smart-pet-tags`, `/pet-profile`, `/privacy`, `/terms` | 2026-07-18 | **2026-09-22** | Commits 927616b / 8145e8c changed visible copy |
| `/safety-profile` | 2026-09-17 | **2026-09-22** | Same commits |
| `/sample` | 2026-07-23 | **2026-09-22** | Same commits |
| `/explore` | 2026-09-17 | **2026-10-10** | New static intro in this release |
| `/where-to-buy` | 2026-09-10 | 2026-09-10 | Unchanged |
| `/p/topu-…` | 2026-07-23 | 2026-07-23 | Content comes from the API; no evidence of a change |

> If this release is deployed later than 2026-10-10, set `/` and `/explore` to the deploy date.

### Task 7: Organization metadata

- `<html lang="en-MY">`, matching `og:locale en_MY` and WebSite `inLanguage`. Edge-generated error pages match too.
- **Organization:**
  - `logo` is now the square official brand mark, `/app-icon-512.png` (512×512, the same file as the web manifest icon). It was the 540×140 wordmark.
  - Added `contactPoint` with `support@mypetlink.com.my`. That address is already published in the site footer and the Privacy Notice.
- **Not added:**
  - `sameAs`: no official public social profile URL is confirmed in the repository.
  - Any address, phone, rating, review or Product/Offer.
- JSON-LD validated as parseable, with required fields checked, in a unit test and in `verify:seo` against the built HTML.

### Task 8: Documentation

Current-state banners were added, and the old text is kept and labelled historical:

- Updated to the current state:
  - `docs/operations/order-and-payment-proof-flow.md`
  - `docs/operations/smart-tag-lifecycle.md`
  - `docs/api/api-contract-v1-draft.md`
  - `docs/deployment/production-deployment-plan.md`
  - `docs/deployment/release-checklist.md` (adds the release-flag, `verify:seo` and catalogue checks)
  - `docs/deployment/smoke-test-script.md`
  - `docs/deployment/environment-variables.md` (the four flags are now "Yes (explicit)")
  - `docs/operations/configuration-inventory.md`
  - `docs/deployment/search-indexing.md` (route policy, headers, recommended R2 rules)
  - `apps/web/README.md`
- Marked historical, not rewritten: `docs/launch/SOFT_LAUNCH_SCOPE.md`, `docs/launch/SOFT_LAUNCH_READINESS.md`.
- `marketing/xiaohongshu/00-product-audit.md`: Smart Tag row updated. The buy-call-to-action policy is **flagged as your decision**, not decided here.
- **Left unchanged (reviewed):**
  - `docs/deployment/payment-confirmation-email.md` ("Keep Smart Tag commerce disabled throughout this sequence") is a step in a specific email rollout procedure. Confirm whether it still applies.
  - `docs/testing/phase-1-e2e-test-report.md` is a dated historical report.
- Legacy QR-only logic and terminology were not touched.

---

## 2. Files changed

**New**

| File | Purpose |
|---|---|
| `apps/web/src/lib/seoRoutes.ts` (+ test) | Route SEO policy, sitemap source, content dates |
| `apps/web/src/lib/releaseFlags.ts` (+ test) | Production builds must state the Smart Tag and Community flags |
| `apps/web/src/components/social/ExploreIntro.tsx` (+ test) | Explore static intro and Suspense fallback |
| `apps/web/edge/robotsHeader.ts` (+ test) | `X-Robots-Tag` values and helper for Pages Functions |
| `apps/web/public/_headers` | `X-Robots-Tag` for static noindex routes |
| `apps/web/scripts/verify-smart-tag-catalog.mjs` | Read-only release check: website price/availability vs live catalogue |
| `apps/web/src/components/marketing/WhereToBuyTeaser.test.tsx` | Teaser channel tests |
| `apps/api/MyPetLink.Api/Middleware/SearchIndexingPolicyMiddleware.cs` | API `X-Robots-Tag: noindex` |
| `apps/api/MyPetLink.Api.Tests/SearchIndexingPolicyTests.cs` | 9 HTTP tests (success, error, 401, 404, preflight, Explore endpoints, health) |
| `docs/seo/phase-1-implementation.md` | This report |

**Modified: web**

| Area | Files |
|---|---|
| Commerce rule | `src/lib/features.ts` (`smartTagPurchaseEnabled`), `src/lib/publicCommerceAvailability.ts`, `src/components/marketing/SmartTagShowcase.tsx`, `src/components/auth/OwnerLoginExperience.tsx` |
| SEO | `src/lib/seo.ts`, `src/app/layout.tsx`, `src/app/explore/page.tsx`, `src/app/where-to-buy/page.tsx`, `src/components/social/SocialExploreView.tsx`, `src/components/marketing/WhereToBuyTeaser.tsx` |
| Edge | `edge/publicProfileEdge.ts`, `edge/ownerProfileEdge.ts`, `edge/ownerConnectionsEdge.ts`, `edge/momentEdge.ts` |
| Build and test | `next.config.ts`, `vitest.config.ts`, `package.json` (one script), `scripts/verify-seo-output.mjs` |
| Tests | `seo.test.ts`, `publicCommerceAvailability.test.ts`, `app/page.test.tsx`, `app/pricing/page.test.tsx`, `PublicNav.test.tsx`, `ContextualSocialShell.test.tsx`, `PublicCommunityIntegration.test.tsx`, `PublicCommunityAccess.test.tsx`, `ExploreResponsiveLayout.test.tsx`, `OwnerLoginExperience.test.tsx`, and six Owner Portal tests whose full `@/lib/features` mocks needed the new `smartTagPurchaseEnabled` export |

**Modified: API**

| File | Change |
|---|---|
| `apps/api/MyPetLink.Api/Program.cs` | **One added line** (`app.UseMiddleware<SearchIndexingPolicyMiddleware>();`). This file also carries your existing uncommitted marketing-demo edits; they were not touched, but the diff mixes both |
| `apps/api/MyPetLink.Api.Tests/TagCatalogServiceTests.cs` | New QA stock test |

**Modified: docs and marketing.** See Task 8.

**Not touched:** pricing, catalogue, order flow, QA release rules, database schema/migrations, `.claude/launch.json` (edited temporarily for local verification and restored byte-for-byte, SHA-256 confirmed), R2, and any production setting.

---

## 3. Test results (all run 2026-10-10)

| Check | Command | Result |
|---|---|---|
| Web tests: code-default flags | `npx vitest run` (project `default-flags`) | 3,695 passed, 1 skipped |
| Web tests: production flags | project `production-flags` (34 files) | 507 passed, 3 skipped. The skips are "ordering off" / "Community off" variants, which shows the flags really applied |
| Web tests: total | `npm test` | **4,202 passed, 4 skipped, 0 failed** (360 files) |
| New web tests | `seoRoutes` 42, `releaseFlags` 14, `edge/robotsHeader` 22, `ExploreIntro` 6, `WhereToBuyTeaser` 4 | 88 passed |
| Edge tests | `npx vitest run edge/` | 117 passed |
| API tests | `dotnet test MyPetLink.Api.Tests` | **2,588 passed, 0 failed** |
| Typecheck | `npm run typecheck` (app + `tsconfig.functions.json`) | PASS |
| ESLint | `npm run lint` | PASS, no findings |
| Functions build | `npm run build:functions` | Compiled Worker successfully |
| Production-equivalent build | `next build` with production flag values, API base `https://api.mypetlink.com.my` (no API calls are made at build time) | PASS |
| SEO output | `npm run verify:seo` on that build | PASS: 12 sitemap URLs, 104 unlisted pages confirmed noindex. Warning: the sample Share Profile's thin shell (SEO-M4) |
| Community flag artifact | `node scripts/verify-social-flag.mjs on` | PASS |
| Pre-sale flag build | Smart Tag + Community flags `false`, then `verify:seo` | PASS: 10 sitemap URLs; `/explore` and `/where-to-buy` are `noindex, follow`; Smart Tag shows "Coming Soon" with no buy action |
| Release-flag guard | Production `next build` with the Smart Tag flags unset | Fails as intended, before writing any output |
| Verifier catches regressions | The old live `/explore` HTML put back into a copy of the export; an Owner Portal page set to index | Both fail: "must have exactly one H1 … found 0" / "too thin"; "/dashboard … must be noindex" |
| Runtime headers | `wrangler pages dev out` + Pages Functions, against a local stub API with fake data | 44 routes: status, `X-Robots-Tag` and robots meta as expected (§4) |
| Explore after hydration | Browser at 1280 px and 375 px | One H1, intro and links present, fallback replaced, no repeated headings, no horizontal scroll |
| Live catalogue | `npm run verify:smart-tag-catalog` (read-only GET) | PASS (§5) |

**Intermittent test.** `PetMomentsManager.editor.test.tsx` → "opens Create in context without a second load…" failed once in one full run and passed in every rerun. It is unrelated to this change (no Moments code was touched). Recorded here as a pre-existing intermittent test.

---

## 4. Before and after SEO behaviour

| Surface | Before (production, 2026-10-10) | After (verified locally) |
|---|---|---|
| `/explore` initial HTML | 8 words, no H1, 1 link; indexable and in the sitemap | One H1, intro (>500 characters), 3 contextual links, a skeleton fallback; indexable only while Community is on |
| `/explore` with Community off | `index, follow` (robots ignored the flag); not in the sitemap | `noindex, follow`; not in the sitemap |
| `/where-to-buy` | Indexed while a purchase channel exists | Same, now driven by the route table |
| Homepage teaser | "pick one up from an authorised partner" / "Find a Retail Partner", with no partners | "Order your Smart Tag online." / "See How to Buy" |
| "Available now" / "Get a Smart Tag" | Driven by the ordering flag alone: could say "Available now" while the order pages said "coming soon" | Driven by ordering **and** tag orders (the same rule the order pages use) |
| Build with a missing flag | Silently built a "Coming Soon" site | Build fails with a clear message |
| Sitemap `lastmod` | Mostly 2026-07-18; dates duplicated in the verifier | Content-change dates, one source |
| Static noindex pages | Meta tag only | Meta tag + `X-Robots-Tag` (`_headers`) |
| `/q`, `/n`, `/t`, `/p`, `/u`, `/moments`, social cards | Meta tag only (social cards: nothing) | Meta tag + `X-Robots-Tag` on every response path |
| API responses | No indexing policy | `X-Robots-Tag: noindex` on every response |
| `<html lang>` | `en` | `en-MY` |
| Organization logo | 540×140 wordmark | 512×512 square brand mark, plus the support contact |
| Verifier coverage | 8 hard-coded pages | Every sitemap URL, plus noindex on every other exported page |

Unchanged on purpose: Share Profiles, Community Profiles and Moments stay noindex; the Topu sample stays indexable; no Product/Offer schema.

Local runtime header matrix (`wrangler pages dev`, production-flag export):

| Group | Routes | Status | `X-Robots-Tag` |
|---|---|---|---|
| Marketing | `/`, `/explore`, `/where-to-buy`, `/smart-pet-tags`, `/pricing` | 200 | none (index) |
| Owner/Admin/account | `/dashboard`, `/pets`, `/pets/{id}`, `/login`, `/admin`, `/admin/login`, `/admin/orders`, `/orders`, `/orders/view`, `/tags`, `/tags/order`, `/settings`, `/records`, `/moments`, `/feed`, `/notifications`, `/community/profile` | 200 | `noindex, nofollow` |
| Search and activation | `/search`, `/activate/{code}` | 200 | `noindex, follow` |
| Finder | `/q/{resolving}`, `/q/{unknown}`, `/n/{unknown}`, `/t/{unknown}`, `/t/{legacy code}` | 200 | `noindex, follow` |
| Share Profile | `/p/{owner pet}` | 200 | `noindex, follow` |
| Share Profile | `/p/{sample}` | 200 | none, meta `index,follow` |
| Share Profile | `/p/{missing}`, `/p/bad` | 404 | `noindex, follow` |
| Community | `/u/{h}`, `/moments/{id}` | 200 | `noindex, follow` |
| Community | `/u/{missing}`, `/moments/{missing}` | 404 | `noindex, follow` |
| Connection lists | `/u/{h}/followers`, `/following` | 200 | `noindex, nofollow` |
| Link-preview images | Social card | 200 (image/jpeg) | `noindex` |
| Link-preview images | Missing card | 404 | `noindex` |
| Unknown page | — | 404 | meta `noindex` |

Link previews were unchanged: `og:title`, `og:url` and `og:image` were still page-specific for `/p`, `/q`, `/u` and `/moments`.

---

## 5. Smart Tag availability and "Coming Soon" audit

### 5.1 Stage-by-stage state

| Stage | State | How it was established |
|---|---|---|
| Physical inventory received (900 tags) | **Reported by you; not verifiable from outside** | Admin-only data |
| Physical QA approval | **Not verified.** The QA system is live (released 2026-10-09); per-tag QA status is Admin-only | Code and docs: `docs/operations/smart-tag-physical-qa.md` |
| Inventory released for sale | **Verified (live, read-only):** all 3 offered variants report `inStock: true` | `GET /api/v1/tag-products`. `inStock` = released stock (`QaStatus IS NULL OR Passed`) minus reservations |
| Online ordering enabled | **Website: verified on.** The live pages say "Available now" and link to checkout. **API switch: not externally visible** | Live HTML; check `Features:SmartTagOrderingEnabled` in Admin → Operational Status |
| Designs and variants for sale | Pawsome Lightweight, Pawsome Standard, My Boss Lightweight (**no My Boss Standard**). All QR + NFC, MYR 39.90, no promotion | Live catalogue via `verify:smart-tag-catalog` |

### 5.2 Messaging inventory

| Surface | Wording in production | Source and gate | Verdict |
|---|---|---|---|
| Home, Pricing, Smart Tag page, Where to Buy | "Available now", RM39.90 one-time, "Get a Smart Tag" | `smartTagAddOnsStatus` ← `publicCommerceAvailability` ← **`smartTagPurchaseEnabled`** | Correct; now consistent with the order pages |
| Smart Tag fallbacks: Owner Portal (`SmartTagsComingSoon`, `OrdersList`, `TagManagementPanel`), login benefits, API `feature_disabled` | "Smart Tags coming soon" / "not available yet" | Each gated on the ordering flags (login list now on the purchase rule) | Correct: only shown when ordering is off |
| Order flow (`TagOrderFlow`, `TagProductPickerDialog`) | Only `inStock` variants are selectable; "This product is temporarily unavailable" when none are | Catalogue `inStock` (QA-released, unreserved), re-checked server-side at checkout | Correct, inventory-driven |
| Premium | "Coming Soon" (pricing, terms, plan limits, seeded plan) | Constant / seeded plan | Legitimate, preserved (tested) |
| GPS Safety | "Coming Later" | Constant | Legitimate, preserved (tested) |
| "Reminders coming soon" (Pet Profiles section) | Premium care feature | Constant | Legitimate, preserved |
| "Image coming soon" / "Product image coming soon" | Shown only when a product has no photo | Order flow and picker | Not an availability claim; live products each have a photo |
| Metadata, Open Graph | No availability claim ("…the one-time price, and availability") | Static | Correct |
| JSON-LD | No Product/Offer | — | Correct, deferred by design |
| Email templates | No Smart Tag availability wording (the welcome email does not mention tags) | API renderers | Correct |
| Feature-flag defaults | Default build would say "Coming Soon" | `features.ts` defaults | **Fixed:** production builds must state the flags |
| Marketing doc (Xiaohongshu product audit) | Said "Coming Soon", ordering off, no buy CTA | Doc | **Updated**; CTA policy flagged for your decision |
| Active ops docs | Said ordering is disabled | Docs | **Updated / marked historical** |

### 5.3 Fixes made

1. **One purchase rule.** Public "Available now", "Get a Smart Tag", Where to Buy and the login benefits now use `smartTagPurchaseEnabled` (ordering AND tag orders), the same condition that opens `/tags/order`. Production behaviour is unchanged (all flags are on). The fix removes the mixed state where the site advertised a checkout that answered "coming soon".
2. **No silent fallback to "Coming Soon".** A production build now fails unless all four release flags are stated, and it fails if ordering is on without the order pages.
3. **Availability uses the existing sources of truth.** Nothing was hardcoded because the shipment arrived:
   - the label follows the flags;
   - what can be bought follows the catalogue (`inStock`, QA rule, reservations);
   - `verify:smart-tag-catalog` compares the two before a release. It fails if a variant's price or currency differs from the website, if a non-QR + NFC variant is offered, or if ordering is released with no QR + NFC variant in stock.
4. **Regression tests:**
   - Ordering enabled and disabled: home, pricing, login, purchase rule.
   - The mixed flag state.
   - Teaser channels.
   - Premium and GPS preserved.
   - API: the public catalogue shows `inStock: false` for stock that is Pending, Failed or Needs Review, and `true` once Passed.

<a id="54-needs-your-check-before-promoting-tags"></a>
### 5.4 Needs your check before promoting tags

**Unenrolled stock counts as sellable.** By design (`smart-tag-physical-qa.md`), a tag whose `QaStatus` is NULL (never enrolled from a shipment manifest) is treated as released.

If the 900-tag shipment's codes were generated before physical QA existed and **have not yet been enrolled**, then those tags are NULL. In that case:

- the live catalogue's `inStock: true` may be counting tags that have **not passed QA**;
- checkout would accept orders for them.

I can't see enrollment from outside. Before promoting Smart Tags, check **Admin → Tag Inventory** (QA filter) that:

- the shipment is enrolled (Pending/Passed);
- only Passed or deliberately historical stock remains sellable.

No code or configuration was changed for this; it is a QA process decision.

### 5.5 Product decisions (not made here)

- **Design naming.** `AGENTS.md` says there is no shape/design option (deprecated), but the live catalogue sells two named designs (Pawsome, My Boss). Marketing calls the product "MyPetLink QR + NFC Smart Tag". This blocks the Product/Offer schema (SEO-H4/H5).
- **Missing variant.** My Boss has no Standard variant. Confirm that is intended.
- **Catalogue data.** Product `description` is empty. Variant photos and material, shape and colour fields are empty or "-".
- **Social posts.** Whether Xiaohongshu posts may carry a buy CTA before QA releases the first shipment.

---

## 6. Risks and limitations

1. **Preview builds need the flags too.** The release-flag guard runs for every `next build` (`NODE_ENV=production`), including Cloudflare **Preview** deployments. If a Preview environment does not set all four flags, its build will now fail. See prerequisites.
2. **Product availability is static.** The public "Available now" label is fixed at build time and does not follow live stock. If every variant sells out after a deploy, the pages still say "Available now"; the order flow then shows "temporarily unavailable" and blocks checkout. Making the label follow live stock would need a runtime component and is a product/UX decision. Not done.
3. **Production-flag test scope.** The production-flag project covers the 34 public, SEO and commerce suites. Owner Portal suites still assume the default (pre-launch) flags: run wholesale under production flags, 39 tests in 12 Owner Portal, runtime-fallback and build-config files fail because they assert the default configuration. Converting them is a separate task.
4. **Explore data is client-rendered.** The pet cards and Moments still need JavaScript and a reachable API to render. The static intro guarantees meaningful HTML, but Google's rendered view of the dynamic part still depends on the API being awake.
5. **Social-card header (assumption).** `X-Robots-Tag: noindex` on link-preview images relies on preview crawlers (WhatsApp, Facebook, X) ignoring robots directives for preview fetching. That is documented crawler behaviour but **not verified on the live platforms**. Check one WhatsApp preview after deploy (smoke test).
6. **Local runtime only.** `wrangler pages dev` closely matches Cloudflare Pages but is not production. Header behaviour must be re-checked live after deployment (smoke test).
7. **Pre-existing issues found, not fixed:**
   - **Duplicate `og:title` on `/u` and `/moments`.** The edge only replaces `<title>`, so the static shell's default homepage tags remain after the page-specific ones. Seen live on `/u/mypetlink`. Previews use the first tag, so the impact is low. A focused fix should strip the shell's `og:`/`twitter:` tags as `/p` already does.
   - **HEAD on finder codes.** A HEAD request for a finder code that is not in the static export returns 404 while GET returns 200. Unchanged by this release; noindex either way.
   - **Thin sample Share Profile (SEO-M4).** Still indexable with a thin static shell. Reported as a verifier warning pending your decision.
8. **Program.cs diff.** It mixes your uncommitted marketing-demo edits with the one new line. Stage selectively when committing.

---

## 7. Deployment prerequisites

| # | Prerequisite | Owner |
|---|---|---|
| 1 | Cloudflare Pages **Production** env states `NEXT_PUBLIC_SMART_TAGS_ENABLED`, `NEXT_PUBLIC_TAG_ORDERS_ENABLED`, `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED`, `NEXT_PUBLIC_SOCIAL_ENABLED` as `true`/`false`. The live bundle shows all four `true`, so they appear to be set already; **confirm in the dashboard**. | You |
| 2 | Same four variables set for the Cloudflare Pages **Preview** environment, or Preview builds will fail. | You |
| 3 | Deploy the web app (static export + Functions) **and** the API. They are independent: either can go first. No database migration and no new secrets or settings. | You |
| 4 | Before promoting tags: run `verify:smart-tag-catalog`, and complete the Admin QA enrollment check in §5.4. | You |
| 5 | If deploying after 2026-10-10, update the `/` and `/explore` `lastModified` dates in `seoRoutes.ts` to the deploy date. | You / me |

---

## 8. Production smoke-test checklist (after deploy)

```bash
B=https://mypetlink.com.my
# Indexable pages: 200, index, no X-Robots-Tag
for p in / /explore /where-to-buy /smart-pet-tags /pricing; do curl -s -D - -o /dev/null "$B$p" | grep -iE "^HTTP|^x-robots"; done
# Explore has its H1 in the HTML
curl -s "$B/explore" | grep -o "<h1[^>]*>[^<]*"
# Static private pages: X-Robots-Tag noindex, nofollow
for p in /dashboard /pets /login /admin /admin/login /orders /settings /tags/order; do curl -s -I "$B$p" | grep -i "^x-robots"; done
# Finder and shared pages: X-Robots-Tag noindex, follow (sample /p: none)
for p in /q/sl3j2b2q3e2oqhe4iamqa /n/ZZZZTEST0000 /t/ZZZZTEST0000 /u/mypetlink /p/topu-pnpr4ipnr6ppelnsn; do curl -s -D - -o /dev/null "$B$p" | grep -iE "^HTTP|^x-robots"; done
# Social card image: noindex
curl -s -D - -o /dev/null "$B/social/pets/topu-pnpr4ipnr6ppelnsn.jpg" | grep -iE "^HTTP|^x-robots|^content-type"
# API: noindex, CORS unchanged
curl -s -D - -o /dev/null -H "Origin: https://mypetlink.com.my" https://api.mypetlink.com.my/api/v1/tag-products | grep -iE "^HTTP|^x-robots|^access-control-allow-origin"
# Sitemap: 12 URLs including /explore and /where-to-buy; robots.txt without Disallow
curl -s "$B/sitemap.xml" | grep -c "<loc>"; curl -s "$B/robots.txt"
```

Manual checks:

- [ ] `/explore` on a phone: one heading, the intro, filter + Search, and pets/Moments load.
- [ ] Homepage teaser reads "Order your Smart Tag online." with "See How to Buy".
- [ ] Share a `/p/{pet}` link in WhatsApp: the preview image and title still appear.
- [ ] Search Console: URL Inspection → Test Live URL for `/explore` (indexing allowed, H1 visible in the rendered HTML) and `/dashboard` (excluded by noindex). Resubmit `sitemap.xml`.
- [ ] Admin → Operational Status shows Smart Tag ordering on, matching the website.

---

## 9. Rollback procedure

There are no database or configuration changes, so a rollback is a redeploy:

- **Web.** Revert the Phase 1 web commit and redeploy Pages. Removing `public/_headers` alone removes the static headers. Reverting `next.config.ts`'s `assertProductionReleaseFlags()` line removes the build guard.
- **API.** Remove the `UseMiddleware<SearchIndexingPolicyMiddleware>()` line (or revert the commit) and redeploy. No other API behaviour depends on it.
- **Docs.** Revert as needed. The historical banners are additive.
- **Search engines.** `X-Robots-Tag` additions only reinforce existing noindex tags, so rolling back does not change any page's index status. The only indexing-status change in this release is `/explore` becoming noindex in builds with Community **off** (production has it on).

---

## 10. Verified vs assumed

| Verified | Assumed or not verified |
|---|---|
| Live production pages, sitemap, robots, catalogue (read-only GETs, 2026-10-10) | Enrollment and QA state of the 900-tag shipment (Admin-only) |
| Web flags on in production (live pages: "Available now", Explore and Where to Buy in the sitemap) | API `Features:SmartTagOrderingEnabled` value (not externally visible) |
| All local tests, typecheck, lint, builds, verifier (positive and negative) | Cloudflare **Preview** environment variables |
| Header behaviour on the Cloudflare Pages runtime via `wrangler pages dev` | Identical behaviour on production Cloudflare (smoke test above) |
| Explore single H1 after hydration (browser, desktop and mobile) | Link-preview crawlers ignoring `X-Robots-Tag` on card images (documented behaviour; check one WhatsApp preview) |
| Cloudflare does not apply `_headers` to Function responses (Cloudflare docs) | — |
