# Smart Tag scan sources

This document is the source of truth for physical Smart Tag entry routes and
scan-source attribution.

## Routes

| Entry | Public route | Stored source | Before activation | After activation |
| --- | --- | --- | --- | --- |
| Printed QR | `/q/{tagCode}` | `Qr` | Owner sign-in and activation flow | Safety Profile |
| NFC chip | `/n/{tagCode}` | `Nfc` | “Scan the QR code to activate” only | Safety Profile |
| Existing physical content | `/t/{tagCode}` | `Legacy` | Compatible activation flow | Safety Profile |

`/q/{safetyCode}` is also the established pet-level Safety Profile route. The
web resolver checks for a valid pet Safety Profile first. Only when no Safety
Profile matches does it resolve the same code as a physical-tag QR. This keeps
all existing pet-level links valid.

The API uses separate trusted routes:

- `GET /api/v1/public/tags/{tagCode}/qr`
- `GET /api/v1/public/tags/{tagCode}/nfc`
- `GET /api/v1/public/tags/{tagCode}` (legacy)

The controller passes `Qr`, `Nfc`, or `Legacy` to the shared resolver. Query
parameters, request bodies, and headers cannot select or override the stored
source. Source attribution describes the URL used; it is not proof that a
person physically scanned or tapped the tag and must never grant authorization.

## Activation and privacy

- NFC never offers activation before the first QR activation. It exposes no
  owner, pet, order, payment, or inventory detail.
- QR and legacy activation still require the authenticated owner and the
  existing order, allocation, pet ownership, and lifecycle checks.
- Active QR, NFC, and legacy entries use the same privacy-filtered Safety
  Profile projection.
- Lost, disabled, replaced, and archived physical tags expose no finder contact.
- Public tag routes are direct-access pages and remain `noindex`.

## Persistence and reporting

`TagScans.Source` stores `Qr`, `Nfc`, `Legacy`, or `Unknown`. Migration
`20260723064015_AddTagScanSource` adds the non-null column and classifies every
pre-existing row as `Legacy`, because all previously recorded public physical
tag resolutions used `/t`. It also adds
`IX_TagScans_SmartTagId_Source_ScanTime` for owner/admin history filters.

Owner history returns source-attributed entries plus server-calculated total,
QR, NFC, and legacy/unknown counts. Admin history supports the same allow-listed
source filter and CSV/XLSX export. Network identifiers are not returned.

## Manufacturer payloads

New production exports compute URLs from the configured `PublicSite:BaseUrl`:

- QR-only SKU: QR Content is `/q/{tagCode}`; NFC Content is empty.
- QR + NFC SKU: QR Content is `/q/{tagCode}`; NFC Content is `/n/{tagCode}`.

NFC capability comes only from the stored product variant capability. These
URLs are generated during export rather than persisted on the inventory row.
Existing printed `/t/{tagCode}` content is never rewritten and remains valid.

## Rollout

1. Deploy the API endpoints, migration, `/q` resolver, and `/n` route together.
2. Keep `/t` indefinitely while legacy physical tags exist.
3. Generate all new manufacturer exports with `/q` and `/n`.
4. Monitor `Legacy` usage before considering any later deprecation. Do not
   remove or redirect `/t` while real legacy tags may still be in circulation.
