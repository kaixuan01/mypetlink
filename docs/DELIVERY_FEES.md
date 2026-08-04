# Malaysia delivery fees

MyPetLink physical-tag orders support delivery within Malaysia. The API owns the canonical state list, zone mapping, rate resolution, and final order total.

## Canonical zones

- Peninsular Malaysia (West Malaysia) (`PEN`): Johor, Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang, Perak, Perlis, Pulau Pinang, Selangor, Terengganu, Kuala Lumpur, and Putrajaya
- Sabah (`SBH`)
- Sarawak (`SWK`)
- Labuan (`LBN`)

## Naming

Zone codes (`PEN`, `SBH`, `SWK`, `LBN`) are stable identifiers and never change.
Only the wording differs by audience, and both come from one place —
`DeliveryLabels` in the API, mirrored by `lib/deliveryLabels.ts` in the web app:

- Customers see `Standard Delivery — West Malaysia`, and `West Malaysia` for the
  region on its own. "Peninsular" is accurate but unfamiliar to most customers.
- The Admin Portal keeps `Peninsular Malaysia (West Malaysia)` so the zone stays
  recognisable to whoever configures it.

An order stores the delivery method and fee it was quoted at. Those snapshots are
never rewritten: a label MyPetLink itself shipped (for example
`Peninsular Standard Delivery`) is re-worded on its way to the screen, while a
name an administrator typed is shown exactly as entered.

The Owner Portal loads the canonical state options from `GET /api/v1/delivery/states`. Exact legacy aliases are limited to KL/Kuala Lumpur W.P., Penang/Pulau Pinang, and Malacca/Melaka. New orders send a state code, not a free-text state.

## Rate and total rules

Each zone can have one delivery rate. A rate must be active before checkout is available for its zone. An active RM 0 rate is an explicit free-delivery configuration; an inactive or missing rate blocks checkout.

The API calculates one delivery fee for the complete order:

`merchandise subtotal - discount total + one delivery fee = order total`

The merchandise subtotal is the sum of every snapshotted unit price multiplied by its quantity. If a delivery rate has a free-delivery threshold, the threshold is evaluated against merchandise after product discounts; the delivery fee itself is excluded. Quantity never multiplies the delivery fee. Delivery quotes never expose the internal delivery-rate identifier.

Resolution precedence remains: enabled state override, then active zone default, otherwise delivery unavailable. A state override cannot make checkout available while its parent zone is inactive. Product weight is snapshotted and exposed as an internal estimated shipment weight, but it does not alter customer delivery pricing.

## Historical orders

New orders snapshot the state code and display name, country, zone, delivery method, delivery fee, free-delivery reason, and final total. Order summaries and receipts use those snapshots and do not query current rates. Orders created before this feature retain their stored delivery address and RM 0 delivery behavior.

The PDF renderer embeds its production transparent logo from `apps/api/MyPetLink.Api/Assets/Brand/mypetlink-logo-horizontal.png`. That file is a copied API-owned artifact whose approved Web source is `apps/web/public/logo-horizontal.png`; the API does not read the Web public directory at runtime.

## Administration

Active administrators manage rates at `/admin/delivery-rates` or through `/api/v1/admin/delivery-rates`. Changes use row-version concurrency and are audited. The four canonical rows are created inactive by the migration so an administrator must explicitly set and activate each intended fee.
