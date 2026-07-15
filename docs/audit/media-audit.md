Audit status: PARTIAL
Architecture verified by CODE-TRACED inspection plus the media-URL-builder AUTOMATED-TESTs. Upload/replace/delete/orphan behaviour is NOT-TESTED at runtime here. "✅" means CODE-TRACED unless it names a test.

# Media Audit (images / video / documents)

## Architecture observed through code inspection
- **`MediaFiles`** is the canonical media record (`BucketName`, `ObjectKey`, `IsPublic`, `Category`, `UploadStatus`, `MediaType`, size, content-type, `OwnerUserId`, `PetId`).
- **Direct FKs** for profile/cover: `Pets.ProfileMediaFileId`, `Pets.CoverMediaFileId`.
- **`MediaFileLinks`** for ordered multi-file content: moments/memories, care attachments, order/payment proof. Keep — do not remove.
- **Buckets:** public (`mypetlink-public-media`) for `PetProfilePhoto`/`PetCoverPhoto`/`MomentImage`/`MomentVideo`; private (`mypetlink-private-files`) for documents/receipts. Category→bucket mapping verified (`MediaService.IsPublicCategory`).
- **Public URL:** centralized `MediaUrlBuilder.BuildPublicUrl(PublicBaseUrl, ObjectKey)` — absolute, bucket name never in the path; refuses to emit a relative/misassembled URL; escapes segments. Validator requires `PublicBaseUrl` to be an absolute https URL and public≠private bucket. (CODE-TRACED; the URL builder also has AUTOMATED-TESTs.)
- **Upload flow (code intent):** init (`POST /media/uploads`) → presigned PUT to R2 → complete (`/complete`) validates object exists + size + content-type before marking `Ready`. On replacing profile/cover, the code **attempts** to mark the old media record as deleted and to request deletion of the old R2 object. Runtime success, failure handling, DB/R2 consistency, and public cache invalidation remain **unverified** (NOT-TESTED).

## Frontend rendering
- All pet-photo consumers resolve through the shared `resolveMediaUrl()` guard (absolute/`data:`/`blob:` pass through; never emits a route-relative src). `next/image` is `unoptimized` (static export), plain `<img>` used. (CODE-TRACED.)

## Must LIVE-TEST
1. Upload profile/cover/moment (single + multiple), video (+ thumbnail/duration if supported), care attachment, document.
2. Replace image → new public URL renders, **old R2 object no longer publicly reachable**, CDN cache busts.
3. Delete image/video → `MediaFiles` marked deleted, object removed, not publicly reachable.
4. Failed/large/unsupported/duplicate uploads handled with friendly errors; upload progress; mobile/camera upload.
5. Integrity sweep: every `Ready` public `MediaFiles` row has a live object; no object without a row; no orphaned `MediaFileLinks`; media records are ownership-validated (can't attach another owner's media).
6. Private documents are never reachable via the public domain (presigned download only).

## Gaps / notes
- Video moment **duration display** and first-frame poster are listed in the request; confirm they exist end-to-end or list under enhancements.
- **Owner profile image: not implemented.** Source inspection found no owner-image upload feature, no `OwnerProfilePhoto` media category, and no owner-image DTO/entity/column — the owner avatar is a generated initial letter. There is **no** owner-image upload path to live-test. (Consistent with `field-mapping-matrix.md`, where it is field-type `Not implemented`, status `Optional enhancement`.)
