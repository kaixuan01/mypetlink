# Smart Tag Catalog Architecture

## Responsibility boundaries

- `TagProduct` is the customer-facing product family and publication record.
- `TagProductVariant` is the exact sellable and manufacturable SKU. SKU values are trimmed and normalized to uppercase.
- `Promotion` changes the effective price temporarily without changing the SKU base price.
- `SmartTagBatch` and `SmartTag` are physical inventory. New records reference the exact product variant that defined their production specification.
- `SmartTag` lifecycle remains responsible for claiming, activation, owner/pet binding, scans, replacement, and fulfilment.
- `TagOrderItem` is an immutable commercial snapshot of the SKU, product/variant names, price, promotion, quantity, and final amount at purchase time.

## SKU and production safety

New inventory generation starts from a SKU. QR/NFC support, tag variant, physical specifications, packaging, print template, and production notes come from that SKU; they are not independently selected during generation.

SKU values are globally unique. Once a SKU has an inventory or order-item dependency, its SKU, capabilities, physical specification, packaging, and print template are locked. A physical change requires a new versioned SKU. Base price and customer-facing naming can still change because orders preserve snapshots.

The migration deliberately leaves `ProductVariantId` nullable on existing batches and tags. No legacy row is guessed or backfilled. Existing Tag Codes and Physical Tag Scan Page links are unchanged. Legacy inventory remains readable, but manufacturer export blocks a row without a verified SKU mapping.

## Promotion rule

Only automatic, enabled promotions within their UTC start/end interval are eligible. One promotion applies per SKU:

1. highest priority wins;
2. at equal priority, the greatest customer discount wins;
3. a stable ID tie-breaker makes evaluation deterministic;
4. discounts never stack and the final price cannot be negative.

The backend returns the base price, discount, final price, display label, and end date. Clients display that result and do not reimplement promotion selection.

## Purchase and allocation

An owner submits the stable public variant key, quantity `1`, the selected pet, and delivery details. The backend verifies ownership, product publication, SKU availability, current stock, and current pricing before creating an order and its snapshot.

Order creation does not expose or reserve a Tag Code. After payment approval, an Admin assigns an eligible unclaimed tag with the exact `ProductVariantId`. Assign, change, and replacement operations use row-version concurrency so the same inventory row cannot be silently allocated by competing Admin actions.

## Availability and routes

- Public catalog: `GET /api/v1/tag-products` and `GET /api/v1/tag-products/{slug}`.
- Admin catalog: `/api/v1/admin/tag-products` and `/api/v1/admin/promotions`.
- Admin product-image uploads reuse the existing media upload pipeline with the Admin-only `TagProductImage` category.
- Owner catalog and ordering remain behind the centralized Smart Tag and ordering flags, which are off by default.
- Existing `/t/{tagCode}`, `/q/{safetyCode}`, and `/p/{petSlug}` behavior is unchanged.
