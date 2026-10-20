# Merchant Store Location UI — implementation report

Reviewed and validated: 15 October 2026. Scope: UI/UX only.

## A. Implementation summary

Implemented the existing Merchant Partner Directory improvements. Reused the merchant listing panel, logo/media pipeline, public directory service, shared upload control and design components. No new merchant management system or location-management capability was introduced.

## B. Changed files

- [apps/web/src/components/admin/merchantSales/MerchantListingPanel.tsx](C:/Project/MyPetLink/apps/web/src/components/admin/merchantSales/MerchantListingPanel.tsx) — Store Location copy, legacy validation-message presentation, separate status badges, compact logo controls.
- [apps/web/src/components/portal/ImageUploadField.tsx](C:/Project/MyPetLink/apps/web/src/components/portal/ImageUploadField.tsx) — Optional compact layout with an 80 px contained preview; existing default layout retained; accessible helper/error association.
- [apps/web/src/components/marketing/PartnerStoresDirectory.tsx](C:/Project/MyPetLink/apps/web/src/components/marketing/PartnerStoresDirectory.tsx) — Single-store direct details, multi-location grouping, public-only counts and duplicate-name suppression.
- [apps/web/src/components/admin/merchantSales/MerchantListingPanel.test.tsx](C:/Project/MyPetLink/apps/web/src/components/admin/merchantSales/MerchantListingPanel.test.tsx) — Updated labels and added status, empty-state and validation-copy coverage.
- [apps/web/src/components/admin/merchantSales/MerchantLogoEditing.test.tsx](C:/Project/MyPetLink/apps/web/src/components/admin/merchantSales/MerchantLogoEditing.test.tsx) — Updated labels and compact preview/accessibility coverage; upload, removal, retry and concurrency tests retained.
- [apps/web/src/components/admin/merchantSales/merchantsPanel.test.tsx](C:/Project/MyPetLink/apps/web/src/components/admin/merchantSales/merchantsPanel.test.tsx) — Updated Store Location interaction labels; draft protection assertions retained.
- [apps/web/src/components/marketing/PartnerStoresDirectory.test.tsx](C:/Project/MyPetLink/apps/web/src/components/marketing/PartnerStoresDirectory.test.tsx) — Single/multiple/zero eligible locations, internal-count exclusion, duplicate names and navigation coverage.
- [apps/web/scripts/merchant-directory.browser.test.mjs](C:/Project/MyPetLink/apps/web/scripts/merchant-directory.browser.test.mjs) — Responsive public/Admin checks, screenshots and existing navigation/upload regressions.
- [docs/architecture/merchant-partner-directory.md](C:/Project/MyPetLink/docs/architecture/merchant-partner-directory.md) — Documents UI terminology and public layout behavior without changing the domain model.

Additional files under `artifacts/merchant-locations-*` contain this report, validation logs, the temporary build location, the unchanged-export hash and screenshots. All unrelated pre-existing working-tree changes were preserved.

## C. Admin UI improvements

- Uses Store Locations, Add location, Edit location, Store name / Location name, Store address and Show this location on website. Loading, success, permission, withdrawal and confirmation copy uses the same terminology. Legacy server validation text is translated at the UI boundary without changing field keys or response contracts.
- Displays the saved location count and separate Active/Inactive and Published/Hidden badges. Retains the explanation when a parent hides a selected location.
- Logo preview is 80 × 80 px, uses object-fit contain, and keeps upload/replace/remove/save/discard actions together. Actions wrap on narrow screens. Helper text and validation remain accessible.
- Existing permission evidence, publication confirmations, read-only access, drafts, stale-save handling and independent merchant/location/logo saving remain intact.

## D. Public single-store and multi-location behavior

- Exactly one public location: address, hours and available navigation/contact actions appear directly within the merchant card, without a nested location card.
- Case, punctuation and spacing differences alone do not repeat the merchant name as a location heading. A meaningfully different location name remains visible.
- Two or more public locations: Our Locations (n), followed by compact location cards. One merchant logo appears above the group.
- Layout selection uses only the public DTO branches array. No internal location count or hidden location is requested or displayed. A response with no eligible locations renders no merchant card.
- Existing Google Maps, Waze, call and WhatsApp links, search, pagination, loading, retry and background refresh behavior are retained.

## E. Database and API compatibility

No database schema, migrations, entity names, DTO field names, endpoints, API services, authorization rules, cache rules or media relationships were changed by this work. Merchant → Branches and LogoMediaFileId are unchanged. No merchant address or branch logo was added. Publication, permission evidence, withdrawal audit, commercial reactivation privacy, rowversion and sales logic remain on their existing paths.

## F. Test results

| Check | Result |
| --- | --- |
| Full web suite, default and production flag projects | **4,306 passed; 7 existing conditional skips; 0 failures.** [Log](C:/Project/MyPetLink/artifacts/merchant-locations-web-tests.log) |
| Focused API regression, including SQL Server relational cases | **251 passed; 0 skipped; 0 failures.** [Log](C:/Project/MyPetLink/artifacts/merchant-locations-api-tests.log) |
| Edge browser against isolated static export | **8 passed; 0 skipped; 0 failures.** [Log](C:/Project/MyPetLink/artifacts/merchant-locations-browser-tests.log) |
| Web and Pages Functions typecheck | **Passed.** [Log](C:/Project/MyPetLink/artifacts/merchant-locations-typecheck.log) |
| Web lint | **Passed.** [Log](C:/Project/MyPetLink/artifacts/merchant-locations-lint.log) |
| Isolated Next.js 16.2.9 production build | **Passed**, including release flag and SEO output checks. [Log](C:/Project/MyPetLink/artifacts/merchant-locations-build.log) |
| Focused whitespace check | Passed. |

The seven standalone web skips are three server-dependent HTTP smoke tests and four flag-dependent test cases. The API run invoked and passed those three HTTP smoke tests against disposable loopback Kestrel records. No test was newly skipped or weakened.

API coverage included directory visibility/search/direct reads/cache headers, consent and withdrawal, capability authorization, logo ownership/storage, SQL defaults/migration replay/rowversion, merchant sales, allocation and fulfilment. SQL checks used disposable test databases, not production data. Browser coverage includes native Back/Forward, reload/router navigation, explicit draft discard and actual logo file selection/upload/replacement/removal with fixture HTTP responses.

Responsive assertions passed at **375, 768 and 1440 px**: no document horizontal overflow, contained logos, wrapped long names/addresses, one public logo per merchant, expected single/multi card structure and navigation links at least 44 px high. Admin viewing and editing both passed. Screenshots were inspected visually.

Build validation used a separate temporary copy, loopback API configuration and four explicit OFF flags. Production release flags and the existing workspace export were not changed. The original `apps/web/out/index.html` SHA-256 remained `34A3D59C258B3E5BCAFBD57932B3C379082386162D7A1FBA0E7A815297FDE907`.

Existing non-failing warnings: jsdom navigation/scroll limitations, Node module/type-stripping notices, and the already-documented thin initial HTML warning for the sample Share Profile (SEO-M4). No directory SEO check failed.

## G. Screenshots

Captured from the actual exported UI using synthetic HTTP/image fixtures, including intentionally long addresses and names. No real merchant records were used.

| Width | Single store | Multiple locations | Admin locations | Admin editor |
| --- | --- | --- | --- | --- |
| 375 px | [View](C:/Project/MyPetLink/artifacts/merchant-locations-screenshots/public-single-375.png) | [View](C:/Project/MyPetLink/artifacts/merchant-locations-screenshots/public-multiple-375.png) | [View](C:/Project/MyPetLink/artifacts/merchant-locations-screenshots/admin-locations-375.png) | [View](C:/Project/MyPetLink/artifacts/merchant-locations-screenshots/admin-location-editor-375.png) |
| 768 px | [View](C:/Project/MyPetLink/artifacts/merchant-locations-screenshots/public-single-768.png) | [View](C:/Project/MyPetLink/artifacts/merchant-locations-screenshots/public-multiple-768.png) | [View](C:/Project/MyPetLink/artifacts/merchant-locations-screenshots/admin-locations-768.png) | [View](C:/Project/MyPetLink/artifacts/merchant-locations-screenshots/admin-location-editor-768.png) |
| 1440 px | [View](C:/Project/MyPetLink/artifacts/merchant-locations-screenshots/public-single-1440.png) | [View](C:/Project/MyPetLink/artifacts/merchant-locations-screenshots/public-multiple-1440.png) | [View](C:/Project/MyPetLink/artifacts/merchant-locations-screenshots/admin-locations-1440.png) | [View](C:/Project/MyPetLink/artifacts/merchant-locations-screenshots/admin-location-editor-1440.png) |

## H. Remaining risks and manual QA

No blocking issue was found in the changes or executed checks. Automated browser checks used Edge and synthetic responses; they do not prove installed-app handoff on real iOS/Android devices or production CDN/storage connectivity.

Before release, manually check:

- One published location among several internal locations uses the single-store layout; two or more use the grouped layout.
- Hide a location and then the merchant; refresh an existing public tab and verify withdrawn content disappears through the unchanged public refresh rules.
- Publish and reactivate with fresh permission evidence; confirm the saved parent/child visibility dependency and private audit entry.
- Upload/replace/remove a real merchant logo in Staging, including invalid files and concurrent edits.
- Open Google Maps/Waze, call and WhatsApp on iOS/Android, including when the navigation app is not installed.
- Confirm native browser tab-close warnings and read-only Admin behavior.

## I. Production deployment requirements

1. Review and release only the scoped changes; unrelated working-tree work remains separate.
2. Rebuild the web application with the environment’s existing approved release flags and real public API/site settings. **Do not deploy the temporary QA export:** it contains loopback API settings and an isolated OFF profile.
3. Complete Staging QA and obtain approval before production deployment. No new API deployment or database migration is required for this UI update, assuming the existing directory/logo implementation is present.
4. Use the normal web asset/cache rollout procedure. Rollback is the previous compatible web artifact; no schema rollback is required.

No commit, push, deployment, production migration or production data change was performed.
