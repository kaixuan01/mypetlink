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

Unknown or future strings already stored in either `Source` or
`ResolvedState` are read as `Unknown`. Current values continue to be written
with their canonical enum names. Numeric and unsupported source filters are
rejected; reading a future value does not rewrite it. This allows an older
application version to remain readable after a roll-forward introduced a newer
value, without adding a restrictive database check constraint.

## Scan counting

One scan means one physical-tag resolution initiated by one user-visible page
navigation:

- an initial open records one scan;
- a manual refresh records one additional scan;
- a new tab records one additional scan;
- component refetches and React Strict Mode do not record extra scans;
- activation reuses the top-level resolution and activation response, so it
  does not add another physical scan.

Static metadata and HTML generation never call the scan-writing resolver.
Runtime resolution happens once in the top-level route resolver and its result
is passed to finder and activation children. Concurrent identical browser
requests are single-flight only while the first request is in progress; there
is no tag/IP/time-window database deduplication that could suppress genuine
visits.

Malformed, disabled, and unknown physical-tag requests continue creating
`NotFound` or inactive telemetry according to the existing resolver behavior.
The public scan limiter protects these requests too.

## Rate limiting

The API uses ASP.NET Core's built-in fixed-window limiter:

| Policy | Endpoints | Default | Partition |
| --- | --- | --- | --- |
| `public-tag-scan` | QR, NFC, and legacy resolution | 60 requests per 60 seconds | resolved client IP |
| `tag-activation` | Smart Tag activation | 10 requests per 60 seconds | authenticated user ID, otherwise resolved client IP |

Both queues are disabled. Rejected requests return `429`, the standard API
envelope with code `rate_limit_exceeded`, the message “Too many requests.
Please wait a moment and try again.”, and `Retry-After` when available.

Client IP attribution depends on trusted forwarded-header configuration.
MyPetLink does not trust arbitrary `X-Forwarded-For` input. Production must
configure the immediate Azure/Cloudflare proxy addresses or CIDR ranges through
`ForwardedHeaders:KnownProxies` / `KnownNetworks` and retain a bounded
`ForwardLimit`. Confirm the actual Cloudflare-to-Azure hop during deployment;
otherwise traffic may share the last proxy address and one quota.

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
