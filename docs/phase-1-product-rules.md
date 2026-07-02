# MyPetLink Phase 1 Product Rules

The non-negotiable product rules for the current phase. Frontend copy, Admin Portal behavior, and future backend design must all follow these.

## Plans and pricing

1. **Free Profile is RM0 and available now** — up to 3 pets and up to 10 memories per pet (archived pets don't count toward the limit). Early-access users above the limit keep their existing profiles.
2. Every pet gets a **Public Share Profile** (`/p/`) and a **pet-level QR Safety Page** (`/q/`) without buying a physical tag.
3. **Smart Tags are optional one-time add-ons**, not subscriptions:
   - MyPetLink QR Pet Tag — **RM19.90**, one-time
   - MyPetLink QR + NFC Smart Tag — **RM39.90**, one-time
4. **Premium is Coming Soon only.** No subscription, upgrade, or checkout flow may be presented as live.
5. **GPS Safety is Coming Later.** It is not part of the current smart tag add-ons.
6. Never imply finder contact costs money — it's free on the Free plan.

## Payments (Phase 1 = manual)

- Owners pay via merchant QR (DuitNow QR / TNG Merchant QR) and upload a receipt/screenshot with an optional transaction ID.
- Payment confirmation is always **manual** (admin review). Orders are never auto-confirmed.
- Rejecting a payment proof returns the order to Pending Payment with a friendly reason; it never deletes the order.
- Delivery fee: Free. Receipts become available after payment is confirmed.

## Identity and routing rules

- One public identifier per physical tag: the **TagCode** (`MPL-XXXX-XXXX`). Same code on the printed tag, QR URL, NFC URL, owner display, and admin search. Never introduce a second token; never expose internal database ids.
- `/q/{safetyCode}` = pet-level QR Safety Page (emergency-focused). `/t/{tagCode}` = physical tag scan link (active tags open the same safety content). `/p/{slug}-{publicCode}` = friendly share profile. Never mix the share profile and the safety page.
- Lost/disabled/replaced/archived tags never expose owner contact.
- **Lost tag ≠ Lost Mode.** A lost *tag* is an inactive physical tag; *Lost Mode* is a pet-level flag (`lostModeEnabled`) that changes the public pages.
- **Memorial ≠ Active.** Memorial and archived pets are not active; their linked tags are treated as inactive safety tags even if the tag record says Active.

## Tag lifecycle rules

- Retail/pet-shop tags start **Unassigned** (tagCode, no pet, no owner). A customer scans, activates, and links the tag to a pet — then it becomes Active.
- Owner-portal purchased tags are bound to the selected pet from the start (status Pending → Preparing → Delivered → activated to Active). Portal tags are never treated as unclaimed stock.
- Order fulfillment states (Pending/Preparing/Delivered) live on the tag only in this frontend phase; a real backend should keep fulfillment on the order.

## Wording rules (user-facing UI, including Admin)

Allowed: "early launch", "coming soon", "coming later", "manual payment proof review", "optional smart tag add-on".

Never show in user-facing UI: "mock", "demo", "payload", "backend", "API error", "frontend-only", "test mode", or service-method names. Internal docs and code comments may reference the demo/local state; polished UI copy may not.

## Scope guards (this phase)

- No backend, no database, no real auth, no payment gateway, no real file storage, no NFC writing, no GPS, no CSV/reporting beyond simple frontend-only exports.
- Admin Portal operates on the same local/demo state as the Owner Portal — it must read and write the shared collections, never parallel data.
- The future backend must enforce admin roles and permissions; the current admin login is a local placeholder for operations preview.
