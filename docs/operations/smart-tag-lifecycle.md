# Smart Tag Lifecycle

This document defines Phase 1 smart tag lifecycle rules for backend planning.

## Core Rules

- One physical tag has one public `tagCode`.
- `tagCode` is printed on the tag, encoded in the QR URL, encoded in the NFC URL if present, shown in owner/admin UI, and used for support lookup.
- `tagCode` must be secure random and unique.
- Do not expose internal tag ids in public routes.
- `/t/:tagCode` is the physical tag scan route.
- Active physical tags open the same safety content as the pet-level `/q/:safetyCode`.
- QR + NFC is not GPS tracking.
- Lost physical tag is not pet Lost Mode.
- Physical tag status must not disable the pet-level `/q/:safetyCode`.

## Public Identifiers

### `tagCode`

Used for:

- physical tag print
- QR URL
- NFC URL
- owner display
- admin search
- manufacturer CSV
- customer support lookup

Format:

- `MPL-XXXX-XXXX`
- character set should avoid confusing characters such as `O`, `0`, `I`, `1`
- generated with secure randomness

### `safetyCode`

Used for:

- pet-level QR Safety Page `/q/:safetyCode`

Rules:

- generated with secure randomness
- belongs to the pet, not a physical tag
- works without physical tag purchase when enabled and pet lifecycle allows it

### `publicCode`

Used for:

- Public Share Profile `/p/:slug-publicCode`

Rules:

- generated with secure randomness
- stable even when slug changes
- lookup by `publicCode`, not slug

## Lifecycle Statuses

Backend V1 statuses:

- `Unclaimed`
- `Pending`
- `Preparing`
- `Delivered`
- `Active`
- `Lost`
- `Disabled`
- `Replaced`
- `Archived`

Phase 1 keeps pending-family tag statuses because the completed frontend/Admin MVP already reflects fulfillment state on tags. A later backend can move fulfillment-only state entirely to orders after compatibility planning.

## Portal-Purchased Tag Flow

1. Owner selects an active pet in the portal order flow.
2. Owner creates an order.
3. Backend creates:
   - order `PendingPayment`
   - tag `Pending`
   - tag linked to `OwnerUserId`, `PetId`, and `OrderId`
4. Owner submits payment proof.
5. Admin confirms payment.
6. Admin marks order preparing.
7. Linked tag becomes `Preparing`.
8. Admin marks order shipped.
9. Admin marks order delivered.
10. Linked tag becomes `Delivered`.
11. Owner activates delivered tag.
12. Tag becomes `Active`.
13. `/t/:tagCode` opens the pet's QR Safety content.

Rules:

- Portal-purchased tags must have `PetId` from the order flow.
- Portal-purchased tags are never unclaimed retail stock.
- Memorial and archived pets cannot receive new portal tag orders.

## Retail / Pet-Shop Tag Flow

1. Admin generates tag batch.
2. Backend creates `Unclaimed` tags with:
   - `tagCode`
   - no `OwnerUserId`
   - no `PetId`
   - optional `BatchId`
3. Admin exports CSV for manufacturer.
4. Customer buys physical tag from retail/pet shop.
5. Customer scans or taps tag.
6. `/t/:tagCode` returns activation prompt.
7. Customer signs in/registers.
8. Customer selects or creates an active pet.
9. Backend activates tag.
10. Tag becomes `Active`.

Rules:

- Retail unclaimed tags may not have owner or pet until activation.
- Activation must validate the tag is claimable.
- Activation must validate the selected pet belongs to the authenticated owner and is Active.
- Active retail tags behave the same as active portal tags.

## Scan Behavior By State

### Tag not found

`/t/:tagCode` behavior:

- show branded not-found page
- do not reveal similar codes
- log limited scan/lookup event if useful for abuse prevention
- rate-limit abusive lookup patterns

### `Unclaimed`

Behavior:

- show activation prompt
- no owner contact
- no pet details

### `Pending` or `Preparing`

Behavior:

- show pending/preparation state
- no owner contact
- no pet safety content
- owner/admin can view order status from protected portals

### `Delivered`

Behavior:

- owner can activate from `/activate/:tagCode`
- public scan can show activation-ready or pending-safe state
- no owner contact until activated

### `Active`

Behavior:

- load linked pet
- if pet is Active and QR Safety is allowed, show same safety content as `/q/:safetyCode`
- apply pet safety/contact visibility settings
- record `LastScannedAt`
- record `TagScans` analytics

### `Lost`

Behavior:

- show inactive tag page
- do not expose owner contact
- do not enable pet Lost Mode
- `/q/:safetyCode` for the pet remains governed by pet settings

### `Disabled`

Behavior:

- show inactive tag page
- do not expose owner contact
- owner/admin can archive or replace later

### `Replaced`

Behavior:

- show inactive tag page
- do not expose owner contact
- replacement tag may become active independently

### `Archived`

Behavior:

- show inactive tag page
- do not expose owner contact
- keep history for owner/admin support

## Linked Pet Lifecycle Effects

### Active pet

- Active tag scans show QR Safety content.
- Lost Mode banner/details appear if `LostModeEnabled`.
- Contact buttons appear only if owner visibility settings allow them.

### Memorial pet

- Pet is not active.
- Linked tags scan as inactive memorial tag pages.
- Emergency finder contact actions are hidden.
- Owner memories/timeline may remain visible on share profile according to memorial settings.

### Archived pet

- Pet is not active.
- Linked tags scan as inactive archived tag pages.
- Emergency finder contact actions are hidden.
- Owner/admin history remains.

## Tag Status Transitions

Valid transitions:

- `Unclaimed` -> `Active`
- `Pending` -> `Preparing`
- `Preparing` -> `Delivered`
- `Delivered` -> `Active`
- `Active` -> `Lost`
- `Active` -> `Disabled`
- `Active` -> `Replaced`
- `Lost` -> `Replaced`
- `Disabled` -> `Replaced`
- non-active operational states -> `Archived`
- `Archived` -> previous safe display state through restore rules

Invalid transitions:

- `Unclaimed` -> `Preparing`
- `Unclaimed` -> `Delivered`
- `Unclaimed` -> `Active` without owner/pet binding
- `Lost` -> `Active` without admin-supported recovery process
- `Disabled` -> `Active` without admin-supported recovery process
- `Replaced` -> `Active`
- `Archived` -> `Active` without explicit restore validation
- any inactive state exposing owner contact

## Owner Actions

Owner can:

- view tag list
- view tag scan page/status
- activate unclaimed or delivered tag
- mark active tag lost
- disable active tag
- request replacement
- archive inactive tag from main list
- restore archived tag to list

Rules:

- Owner actions require JWT.
- Owner must own linked tag or linked pet.
- Marking tag lost affects only physical tag status.
- Marking tag lost does not enable pet Lost Mode.

## Admin Actions

Admin can:

- list/search/filter tags
- generate unclaimed retail tags
- export tag codes
- disable tag
- mark tag lost
- mark tag replaced
- archive/restore tag
- inspect linked owner/pet/order

Rules:

- Admin actions require active admin role.
- Every admin mutation writes audit log.
- Printed/reseller actions are planned but can remain disabled until implemented.

## Manufacturer CSV

CSV fields:

- `tag_code`
- `url`
- `shape`
- `batch_no`
- `has_nfc`

Example URL:

```txt
https://mypetlink.com.my/t/MPL-26A7-K9Q2
```

Rules:

- QR URL and NFC URL are the same.
- Manufacturer must not generate tag codes.
- Manufacturer must print the exact provided `tag_code`.

## Tag Scan Analytics

Record fields:

- `ScanTime`
- `Latitude`
- `Longitude`
- `Country`
- `City`
- `IpAddress`
- `Browser`
- `OperatingSystem`
- `DeviceType`
- `Referer`

Privacy rule:

- Precise `Latitude` and `Longitude` must only be collected with explicit finder consent.
- If finder consent is not granted, do not store precise coordinates.
- Without consent, store only non-precise IP-based `Country` and `City` when available.
- Do not market or describe this as GPS tracking.

Future uses:

- scan history
- suspicious scan investigation
- batch performance
- heat maps based on consented or non-precise data
- Premium scan analytics later

## Audit Logging

Write audit logs for:

- tag generated
- tag exported
- tag activated
- tag marked lost
- tag disabled
- tag replaced
- tag archived
- tag restored
- tag linked to pet

Audit fields:

- `ActorId`
- `ActorType`
- `Action`
- `Entity`
- `EntityId`
- `OldValue`
- `NewValue`
- `IpAddress`
- `UserAgent`
- `CreatedAt`
