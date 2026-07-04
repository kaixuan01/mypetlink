# MyPetLink Smoke Test Script

Step-by-step manual smoke test for a MyPetLink deployment (local or production). Run top to bottom; stop and investigate on the first failure. This is a helper script, not automation.

Set two shell variables first:

```txt
API  = base URL of the API   (local: http://localhost:5281,   prod: https://api.mypetlink.com.my)
WEB  = base URL of the frontend (local: http://localhost:3000, prod: https://mypetlink.com.my)
```

You will need three sessions to cover auth: **anonymous** (no token), a **non-admin owner**, and an **admin** (an owner promoted via `sql/first-admin-template.sql`). Bearer tokens come from logging in through the frontend and reading the stored session, or from the local session-minting helper used during development.

## 1. Backend health & auth policy (curl)

| Check | Request | Expected |
| --- | --- | --- |
| Health | `GET {API}/api/v1/health` | `200` `{ "status": "ok", "service": "MyPetLink.Api" }` |
| Swagger (dev only) | open `{API}/swagger` | UI loads (disabled in Production) |
| Auth required | `GET {API}/api/v1/auth/me` (no token) | `401` |
| Admin anonymous | `GET {API}/api/v1/admin/auth/check` (no token) | `401` |
| Admin non-admin | `GET {API}/api/v1/admin/auth/check` (owner token) | `403` |
| Admin admin | `GET {API}/api/v1/admin/auth/check` (admin token) | `200`, `admin.isActive = true` |

Example:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/v1/auth/me"                       # 401
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $OWNER" "$API/api/v1/admin/auth/check"  # 403
curl -s -H "Authorization: Bearer $ADMIN" "$API/api/v1/admin/auth/check"             # 200
```

## 2. Owner flow (frontend)

1. **Google login** — open `{WEB}/login`, click the Google button, complete the popup, land on `/dashboard`.
2. **Dashboard** — loads owner data (active pet count, plan).
3. **Create pet** — `/pets/new`, save; confirm a backend-generated public slug + safety code (visible on the pet page / DB).
4. **Public share `/p`** — open the pet's `/p/:publicSlug`; renders friendly profile with no owner email/address/internal ids.
5. **QR Safety `/q`** — open `/q/:safetyCode`; renders finder-first content.
6. **Care record** — create one on the pet; edit it; reload and confirm it persists.
7. **Memory (public + private)** — create a Public memory and a Private memory; confirm the public one appears on `/p/`, the private one does not.
8. **Smart tag order** — order a tag; confirm the price is set server-side (owner does not send it).
9. **Payment proof** — submit a proof; confirm it records metadata only (file name/reference, no file bytes).
10. **Order Summary PDF** — before payment is confirmed, download the Order Summary PDF; confirm it opens, is titled "Order Summary", and does not show "Official Receipt" or "Paid". Confirm no `.txt` download remains.
11. **Logout** — session clears; a protected page (`/pets`) redirects to `/login`.

## 3. Admin flow (frontend, admin account)

1. **Dashboard** — `/admin` loads real counts.
2. **Orders** — `/admin/orders` lists real orders with filters.
3. **Confirm payment** — on the submitted-proof order, click Confirm Payment; owner order reflects Payment Confirmed. Owner can now download the **Receipt PDF** (shows "PAID" + confirmed date); admin can download the same Order Summary / Receipt PDFs from `/admin/orders`.
4. **Preparing** — Mark Preparing; linked tag goes to Preparing.
5. **Shipped** — Mark Shipped (optionally with tracking number).
6. **Delivered** — Mark Delivered; linked tag goes to Delivered (awaiting owner activation).
7. **Tag active `/t`** — activate the delivered tag (owner action), then scan `/t/:tagCode` → shows safety content.
8. **Mark lost** — admin marks the tag lost; `/t/:tagCode` now shows no owner contact.
9. **Unclaimed tag generation** — `/admin/tag-inventory`, generate a small batch; confirm unclaimed `MPL-XXXX-XXXX` codes appear.
10. **CSV export** — export the inventory CSV; file downloads with tag_code / type / batch / status / created_at.
11. **Audit** — confirm `AuditLogs` rows were written for the admin actions above.

## 4. Public tag / lifecycle states (curl or browser)

| Scenario | `/t/:tagCode` state | Owner contact exposed? |
| --- | --- | --- |
| Active tag, active pet | `active` | Yes (per pet visibility) |
| Pending / preparing / delivered tag | `pending` | No |
| Unclaimed retail tag | `unclaimed` (activation prompt) | No |
| Lost / disabled / replaced / archived tag | `inactive` | No |
| Active tag, but pet is Memorial or Archived | `inactive` | No |
| Unknown code | `notFound` | No |

Also confirm on the pet-level pages:

- `/p/:publicSlug` and `/q/:safetyCode` for an **active** pet render normally.
- After moving a pet to **Memorial** or **Archived**, `/q` shows the safe no-contact/unavailable state and `/p` uses memorial-safe wording (or is unavailable when archived).

## 5. Post-checks

- No browser console errors on key pages (dashboard, pet, `/p`, `/q`, `/t`, admin).
- Mobile viewport: owner and public pages usable, no horizontal overflow.
- API logs: no unexpected errors during the run.
