# Merchant main logo — implementation and release notes

Implemented and validated locally in `C:\Project\MyPetLink` on 2026-10-15. The user subsequently authorized committing and pushing this feature to main. Main automatically publishes the web app; this authorization does not establish that the new logo migration/API is deployed. Existing marketing/development changes are preserved. Production settings and feature flags were not changed.

## 1. Existing infrastructure reused

- `MediaService` and its existing initialize → signed R2 PUT → complete workflow, `MediaFile`/`MediaFileLink` records, metadata checks and deletion helpers.
- The existing private/public R2 buckets, `IObjectStorageService`, canonical `MediaUrlBuilder` and credentials/CORS configuration. No storage provider, bucket, upload framework or package was added.
- Existing SkiaSharp raster support and image orientation transforms. Logos preserve transparency and use a fresh PNG encoding rather than publishing the supplied file bytes.
- Existing `ImageUploadField`, API client, merchant listing panel, error handling, dirty-navigation guard, audit service and current database-backed `sales.manage` capability.

## 2. Implementation

Each merchant has one optional `LogoMediaFileId`; branches have no image field. Logo changes are independent of commercial status, consent, branch publication, orders and inventory. Existing merchants start with a null logo reference and continue rendering normally.

The generic upload request adds optional `merchantId` and category `MerchantLogo`. Existing categories and enum values keep their previous behavior. This category first writes privately under `merchant-logos/pending/`. Completion verifies metadata, declared format against the decoded format, non-animated content and full raster decoding within bounded dimensions. It then applies orientation and creates a fresh PNG, at most 512 pixels on its longest edge, under a new public `merchant-logos/` key. Camera/EXIF metadata is not retained. The original signed PUT cannot overwrite this public copy.

Completion prepares media only. The separate merchant logo save associates it using the merchant's current rowversion, and returns the normal listing envelope. The previous logo is retired in the same database save as the new reference and audit entry. A no-op save is idempotent.

## 3. Changed files

All paths below are relative to `C:\Project\MyPetLink`.

API/domain:

```text
apps/api/MyPetLink.Api/Common/MerchantLogoImage.cs
apps/api/MyPetLink.Api/Controllers/Admin/AdminMerchantListingController.cs
apps/api/MyPetLink.Api/DTOs/MediaDtos.cs
apps/api/MyPetLink.Api/DTOs/MerchantDirectoryDtos.cs
apps/api/MyPetLink.Api/Data/MyPetLinkDbContext.cs
apps/api/MyPetLink.Api/Entities/Enums.cs
apps/api/MyPetLink.Api/Entities/MerchantSalesEntities.cs
apps/api/MyPetLink.Api/Services/ImageDerivativeGenerator.cs
apps/api/MyPetLink.Api/Services/MediaService.cs
apps/api/MyPetLink.Api/Services/MerchantDirectoryService.cs
apps/api/MyPetLink.Api/Migrations/20261015032111_AddMerchantMainLogo.cs
apps/api/MyPetLink.Api/Migrations/20261015032111_AddMerchantMainLogo.Designer.cs
apps/api/MyPetLink.Api/Migrations/MyPetLinkDbContextModelSnapshot.cs
migration.sql
```

Web/Admin:

```text
apps/web/src/components/admin/merchantSales/MerchantListingPanel.tsx
apps/web/src/components/admin/merchantSales/MerchantsPanel.tsx
apps/web/src/components/marketing/PartnerStoresDirectory.tsx
apps/web/src/components/portal/ImageUploadField.tsx
apps/web/src/components/ui/MerchantLogo.tsx
apps/web/src/lib/imageUpload.ts
apps/web/src/services/apiDtos.ts
apps/web/src/services/mediaService.ts
apps/web/src/services/merchantDirectoryService.ts
```

Tests and documentation:

```text
apps/api/MyPetLink.Api.Tests/MerchantLogoTests.cs
apps/web/scripts/merchant-directory.browser.test.mjs
apps/web/src/components/admin/merchantSales/MerchantLogoEditing.test.tsx
apps/web/src/components/marketing/PartnerStoresDirectory.test.tsx
apps/web/src/components/ui/MerchantLogo.test.tsx
apps/web/src/services/merchantDirectoryService.test.ts
docs/architecture/merchant-partner-directory.md
docs/cloudflare-r2-media-setup.md
docs/deployment/merchant-logo-implementation-2026-10-15.md
```

No new changes were made to `Program.cs`, local launch/development settings, marketing files, dependencies or feature flag definitions. Their pre-existing working-tree edits remain outside this feature.

## 4. Database migration

`20261015032111_AddMerchantMainLogo` adds only:

- Nullable `Merchants.LogoMediaFileId` (`uniqueidentifier`).
- An index on that reference.
- A restrictive foreign key to `MediaFiles` (`ON DELETE NO ACTION`).

There is no backfill, new table, branch field, data deletion or publication change. Root `migration.sql` is regenerated idempotently and appends this migration. `database/migration.sql` remains untouched. EF reports no pending model changes. SQL Server tests apply/replay the root script and exercise the actual new projection/rowversion behavior on disposable databases.

## 5. Admin behavior and API

- Merchant Management shows a current preview or upload placeholder. Authorized admins choose, replace or remove an image, then explicitly **Save logo**. Selecting/removing locally does not immediately change the stored logo.
- PNG, JPG/JPEG and WebP are supported, up to 2 MB and 4096 × 4096 source pixels. SVG, MIME/extension mismatches, invalid/animated/truncated images, oversized files and excessive dimensions are refused. The browser preserves transparency in its local preview.
- Busy controls and the existing navigation guard cover image reading and saving. Upload/storage/concurrency/validation errors retain the selected file. A rejected association cleans up the newly uploaded, unattached media.
- Merchant description/permission and branch drafts survive logo saves. Logo drafts survive other edits; only safe own saves advance their token. An external refresh does not silently overwrite a local choice or adopt another administrator's logo version. Reload/discard remains explicit.
- Read-only admins can view the logo but have no upload/save controls.
- `PUT /api/v1/admin/merchant-sales/merchants/{merchantId}/logo`, body `{ mediaId: <guid-or-null>, concurrencyToken: <base64> }`, returns the existing listing response envelope. Null removes the logo. This endpoint requires `sales.manage`; errors retain the project's 400/403/404/409 patterns.
- `AdminMerchantListingResponse` adds `logoMediaFileId` and `logoUrl`. Public stores add only nullable `logoUrl`; public branches do not change.

## 6. Public card design

The merchant header uses a logo on the left and name/description on the right. Branches stay below the complete header; the logo appears once per merchant. The rounded square reserves 56 × 56 px on phones and 72 × 72 px at larger widths. `object-fit: contain` preserves the whole logo without cropping or distortion. Long uninterrupted names/descriptions wrap without widening the page. A missing or failed image becomes a merchant-initial placeholder without changing the reserved space. Images have merchant-specific alt text, explicit dimensions, lazy loading and asynchronous decoding.

## 7. Security, privacy and cleanup

- Current `sales.manage` is checked for logo initialization, completion, deletion and association. The actor always comes from authentication. Revoking capability blocks subsequent requests, including completing an already-started upload.
- Attachment requires a ready, non-deleted, public image of category `MerchantLogo`, the configured public bucket/key namespace, and an active server-created media link to the same merchant. Arbitrary URLs, unrelated pet/product/payment media and another merchant's media cannot be substituted.
- Generic media deletion refuses an attached logo, so it cannot bypass merchant concurrency or clear a reference behind another editor.
- Public directory selection still requires the existing active/published merchant and active/published branch rules. Projection checks the logo category/state/bucket/merchant scope as well. Hidden/inactive merchants remain excluded; no internal media ID, original filename, bucket, storage-key field or consent evidence is added to the public DTO.
- Normal completion deletes the private original; replacement/removal retires the old record atomically and attempts object deletion after the save. Failures are logged and do not falsely undo a successful merchant save. Retired logo IDs can be safely retried through the authorized deletion path. The existing pending-upload cleanup helper remains available; no new scheduler or R2 lifecycle policy is installed.
- As with other public media, previously delivered/CDN-cached asset URLs may remain available until their cache lifetime expires. Directory responses retain their existing no-store behavior. No merchant is published by uploading a logo.

## 8. Verification

| Check | Result |
| --- | --- |
| Relevant API suites: logos, media, directory HTTP/SQL, merchant sales/shipped activation, capability coverage (Release build) | 193 passed; 0 failed; 0 skipped |
| Relevant web suites: merchant management, directory, logo component/client, existing pet photo/create and product image management | 421 passed across 25 suites; 0 failed |
| Real headless browser against isolated production export | 7 passed; includes upload/replacement/removal, retained description/branch drafts, existing Back/Forward guards, missing-image fallback and 375/768/1280 px layouts |
| App and Pages Functions typecheck | Passed |
| Full web lint | Passed without new warnings |
| Isolated explicit-flag production export | Passed, including all four flag markers, rendered feature gates and SEO checks (12 sitemap URLs; 104 unlisted pages noindex) |
| EF model/script and whitespace checks | Passed |

The first browser run caught a real long-name overflow; the card's min-width/wrapping was corrected and the rebuilt export passed. New backend test fixtures were corrected to register new branch rows explicitly; the passing run above includes real SQL Server tests. No test assertions or production consent checks were weakened.

Only relevant suites were run for this feature, not the full repository suite. Existing compiler warnings CS1998/EF1002 and the static sample-profile short-text/Node module warnings remain unrelated. Hosted CI was not triggered because no commit/push was authorized.

Local evidence: `artifacts/merchant-logo-api-tests.log`, `artifacts/merchant-logo-web-tests.log`, `artifacts/merchant-logo-changed-files.txt`. Build/browser evidence is under `C:\Project\MyPetLink-logo-check-20261015` (`merchant-logo-build.log`, `merchant-logo-browser.log`). That copy excludes unrelated marketing/development changes; it is a validation export with a placeholder OAuth client and a loopback API origin, not an artifact to deploy.

## 9. Deployment requirements — not executed

After approval, prepare only these feature changes for review/CI. Confirm a restorable backup and the actual production schema, apply the reviewed authoritative root `migration.sql` with the existing session-settings procedure, then deploy API before web. Retain current production feature flag values exactly; no new deployment variables, credentials, buckets or dependencies are required. Existing R2 permissions must continue allowing server read/write/delete on both buckets, and browser PUT CORS must remain configured for the private bucket as for other private uploads.

Automated release checks should confirm: existing merchants remain logo-null/compatible; unauthorized media/association requests are refused; the anonymous directory remains empty until consented listings exist; eligible logos use the canonical media domain; hidden/inactive merchants remain excluded; API no-store and SEO remain correct; existing Smart Tag/merchant workflows work. Do not create public test merchants or publish branches for QA without recorded merchant consent.

Application rollback can retain this additive schema. Restore the previous API/web artifacts while keeping logo/media/audit records; do not run Down as routine rollback because it removes associations. No production migration, upload, configuration change or deployment occurred during implementation, and nothing was staged/committed/pushed.
