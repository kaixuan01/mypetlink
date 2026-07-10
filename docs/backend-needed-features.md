# Backend Needed Features

What the future C# .NET API (`apps/api`) must provide to replace the current frontend-only demo state. **Do not generate backend code until explicitly requested.** See `docs/api/api-contract-draft.md` and `docs/database/database-draft.md` for shape drafts.

## Accounts and auth

- **Owner accounts**: registration/login (Google OAuth and/or email link per the current UI), profile settings (display name, email, phone/WhatsApp in E.164, default area, privacy defaults, notification preferences).
- **Admin accounts, roles, and permissions**: the current `/admin/login` is a local placeholder — the backend must enforce admin authorization on every operations endpoint.
- Session management and route protection for both portals.

## Pets and public surfaces

- **Pet CRUD** with lifecycle (Active / Memorial / Archived, restore with plan-limit checks), Lost Mode flag + details, visibility flags, contact overrides.
- **Public profiles**: resolve `/p/{slug}-{publicCode}` by stable `publicCode`; enforce visibility/privacy server-side (never ship hidden fields to the client).
- **QR Safety Pages**: resolve `/q/{safetyCode}`; respect `qrSafetyEnabled` and lifecycle rules.
- **Moments (memories)** with media storage (real file upload) and per-moment visibility; **care records** with types, due dates, and public visibility levels.
- Plan limits: 3 pets / 10 memories per pet on Free (archived pets excluded), early-access over-limit grandfathering.

## Smart tags and orders

- **Tag registry**: TagCode (`MPL-XXXX-XXXX`) as the single public identifier; batches; QR/NFC type; shape; status transitions with history.
- **Tag activation**: `/t/{tagCode}` scan/tap flow binding an Unassigned retail tag to a selected pet, or activating an assigned portal tag for its order-selected pet.
- **Tag status changes**: lost / disabled / replaced / archived + restore, with owner-safe scan behavior (inactive tags never expose owner contact).
- **Smart tag orders**: creation from the owner portal (tag bound to pet from the start), pricing, delivery details, order numbers, fulfillment states (move fulfillment off the tag record and onto the order — collapse `TagStatus` to the 5 logical states).
- **Payment proof review**: real file upload + storage for receipts, manual confirm/reject with reasons, receipt generation; keep manual review until a payment gateway phase.
- **Tag inventory**: generate batches, printed/sent-to-reseller tracking, CSV export for the manufacturer.

## Operations and governance

- **Admin dashboards**: owner/pet/tag/order counts and activity feeds (server-computed).
- **Admin audit logs**: every operations action (payment confirm/reject, status changes, tag generation) recorded with actor, timestamp, and before/after state.
- **Owner↔pet↔tag↔order linkage by ids** (the demo links pets to owners only by display name — the schema must use foreign keys).
- Scan telemetry (`lastScannedAt`, scan history is a Premium feature later).
- Data deletion and privacy controls (PDPA), account suspension.

## Explicitly out of scope until requested

Payment gateway integration, subscriptions/Premium billing, GPS tracking, NFC writing tooling, family sharing, notifications/reminders.
