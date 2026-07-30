# Shipping and fulfilment settings

## Scope and ownership

Shipping and fulfilment settings are runtime business configuration owned by
MyPetLink administrators (configuration category D). They are stored in typed
tables and managed at `/admin/shipping-fulfilment`.

They do not own or affect:

- customer delivery fees;
- delivery zones or state overrides;
- free-delivery thresholds;
- checkout totals;
- courier credentials, labels, bookings, webhooks or rate APIs.

Those concerns remain separate. No secrets or courier API credentials belong in
these tables.

## Stored configuration

`ShippingFulfilmentSettings` is the single operational-settings row. The
migration seeds the suggested parcel defaults (0.5 kg, 18 × 12 × 3 cm),
Malaysia as the country, blank sender details and customer tracking links off.
Administrators must complete the sender address before it is considered
configured.

`ShippingCourierProviders` uses an immutable, unique courier code and editable
display data. The migration seeds the four choices that were previously
hardcoded in the shipment form:

- J&T Express (initial default);
- Pos Laju;
- DHL eCommerce;
- Ninja Van.

They have no tracking URL templates. `Other` remains a manual, unconfigured
shipment choice.

Orders store both the optional configured courier code and the customer-facing
courier display snapshot. Renaming or deactivating a courier therefore never
rewrites historical orders.

## Tracking links

A customer Track Parcel link is generated only when all conditions are true:

1. the order is Shipped or Delivered;
2. a tracking number exists;
3. the order has a configured courier code;
4. the courier remains active;
5. the courier has a valid HTTPS template with exactly one
   `{trackingNumber}` placeholder;
6. customer tracking links are enabled.

The tracking number is URL-encoded before substitution. Invalid templates fail
closed: the tracking number and copy action remain available, but no link is
returned. Owner APIs never return sender details, courier notes, courier ids,
templates, internal cost, internal shipping notes, RowVersion or audit data.

## Deployment and rollback

Migration: `20260730131244_AddShippingFulfilmentSettings`.

Deploy the migration before the API and Web build. Then configure sender
details and reviewed tracking templates through Admin Portal. Customer tracking
links remain off until explicitly enabled.

The migration is additive. Code rollback is safe while the tables and nullable
`TagOrders.CourierProviderCode` column remain in place.

Database rollback drops both configuration tables and the optional courier-code
column. This loses Admin-entered sender, parcel and courier configuration and
configured-code associations. Historical courier display names and tracking
numbers remain in `TagOrders`, so existing manual shipments remain readable.
Take a database backup before a schema rollback.
