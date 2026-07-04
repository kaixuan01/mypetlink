# MyPetLink Phase 1 End-to-End Test Script

Manual + API regression script for the Phase 1 backend (`apps/api`) + frontend (`apps/web`). Run top to bottom against a local environment; stop and investigate on the first hard failure.

## How to use this script

- **Environment**: backend on `http://localhost:5281`, frontend on `http://localhost:3000`, local `MyPetLinkDev` (LocalDB). Do not commit the local DB or `.env.local`.
- **Roles**: `Owner` (a signed-in owner), `Owner2` (a second owner for cross-owner checks), `Admin` (an owner promoted via `sql/first-admin-template.sql`), `Public` (anonymous).
- **Tokens**: owner/admin bearer tokens come from completing the Google login in the browser and reading the stored session. There is **no** dev token-minting endpoint, so token-gated cases must be run through the browser (or with a captured bearer token via curl/Swagger).
- Each case has: **ID · Role · Preconditions · Steps · Expected · Actual · Status · Notes**. Record `Actual`/`Status` when you run it. Status legend: `PASS` (executed, passed), `FAIL`, `BLOCKED`, `PASS(CR)` (verified by code review because a live token/browser was unavailable), `NT` (not tested).
- The companion run results live in [`phase-1-e2e-test-report.md`](phase-1-e2e-test-report.md).

## Test data setup

1. Apply migrations: `dotnet ef database update` (from `apps/api/MyPetLink.Api`).
2. First admin: run `docs/deployment/sql/first-admin-template.sql` against `MyPetLinkDev` after the admin owner has logged in once (promotes an existing user to an active `AdminUsers` row). No secrets in the repo.
3. Seed via the UI so data uses real server-generated codes:
   - Owner: create **3 active pets** (also exercises the Free plan limit), then take one pet through **Memorial** and another through **Archived**.
   - Admin: generate **unclaimed inventory** (a few QR and a few QR + NFC tags).
   - Owner: place **one tag order** to drive the payment → reject → resubmit → confirm → assign → change → replace → activate flow.
   - Owner2: create at least one pet + one order for cross-owner checks.

---

## A. Login / Auth / Access control

Preconditions: Google OAuth configured; Owner, Owner2, Admin accounts exist.

| ID | Role | Steps | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Owner | Open `/login`, complete Google popup | Lands on `/dashboard`; `GET /api/v1/auth/me` returns the user | | | |
| A2 | Owner | Let the access token expire, trigger a request | Session refreshes via `/auth/refresh`; no forced logout | | | |
| A3 | Owner | Click Logout | Session cleared; visiting `/pets` redirects to `/login` | | | |
| A4 | Admin | Log in with the admin account, open `/admin` | Admin portal loads; `GET /api/v1/admin/auth/check` → `200`, `admin.isActive = true` | | | |
| A5 | Owner | Non-admin owner opens `/admin` / calls `GET /api/v1/admin/auth/check` | API `403`; UI shows access-denied, not the admin portal | | | |
| A6 | Public | Anonymous `GET /api/v1/auth/me` and `/api/v1/admin/*` | `401` on every protected endpoint | | | |
| A7 | Public | Anonymous opens a protected page (`/pets`, `/admin`) | Redirected to login / access screen, no data leak | | | |
| A8 | Owner2 | Owner2 requests Owner's order/pet by id (`GET /api/v1/orders/{ownerOrder}`) | `404` (not owned); never another owner's data | | | |

---

## B. Owner pet flow

Preconditions: Owner logged in.

| ID | Role | Steps | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Owner | Create a pet at `/pets/new` | Saved; server generates public slug + safety code | | | |
| B2 | Owner | Edit pet fields, save, reload | Changes persist | | | |
| B3 | Owner | Open the pet's `/p/{slug}` | Public profile renders, no owner email/address/internal ids | | | |
| B4 | Owner | Open `/q/{safetyCode}` | Finder-first safety page renders | | | |
| B5 | Owner | Mark pet Memorial | Lifecycle = Memorial; finder contact hidden | | | |
| B6 | Owner | Restore Memorial pet to Active | Lifecycle = Active; contact actions available again | | | |
| B7 | Owner | Archive a pet | Lifecycle = Archived; history retained; contact hidden | | | |
| B8 | Owner | Try to keep 4 active pets on Free plan | Blocked at 3 active with a clear plan-limit message | | | |

---

## C. Public profile / QR safety

Preconditions: one active, one memorial, one archived pet.

| ID | Role | Steps | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Public | Open active pet `/p` | Friendly shareable profile | | | |
| C2 | Public | Open active pet `/q` | Finder safety content with allowed contact actions | | | |
| C3 | Public | Toggle Lost Mode on, reload `/q` | Urgent lost messaging shows; toggle off returns to normal | | | |
| C4 | Public | Open Memorial pet `/q` | Safe memorial state, **no** finder contact | | | |
| C5 | Public | Open Archived pet `/q` and `/p` | Safe inactive/unavailable state, no contact | | | |
| C6 | Public | View a pet with one Public and one Private memory | Public memory shows on `/p`; private does not | | | |
| C7 | Owner→Public | Change contact privacy (hide phone), reload `/q` | Hidden contact method is not shown to finders | | | |

---

## D. Care records

Preconditions: Owner has an active pet, a memorial pet, an archived pet.

| ID | Role | Steps | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Owner | Create a care record | Saved and listed | | | |
| D2 | Owner | Edit the record | Changes persist | | | |
| D3 | Owner | Archive/delete the record | Removed from active list | | | |
| D4 | Owner | Open a memorial pet's records | Historical records readable | | | |
| D5 | Owner | Try to create a record on an archived pet | Blocked or clear message (document exact behavior) | | | |
| D6 | Owner2 | Access Owner's record by id | `404`/blocked | | | |

---

## E. Memories / moments

Preconditions: Owner has an active pet.

| ID | Role | Steps | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | Owner | Create a public memory | Saved; appears on `/p` | | | |
| E2 | Owner | Create a private memory | Saved; not shown on `/p` | | | |
| E3 | Owner | Change a memory's visibility | Public/private state updates on `/p` | | | |
| E4 | Owner | Archive a memory | Removed from active list/`/p` | | | |
| E5 | Owner | Add an 11th memory to one pet on Free plan | Blocked at 10 with clear message | | | |
| E6 | Owner2 | Access Owner's memory by id | `404`/blocked | | | |

---

## F. Smart tag inventory

Preconditions: Admin logged in.

| ID | Role | Steps | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Admin | Generate a QR inventory batch | Unclaimed `MPL-XXXX-XXXX` codes created | | | |
| F2 | Admin | Generate a QR + NFC inventory batch | Unclaimed QR + NFC codes created | | | |
| F3 | Admin | Export inventory CSV | CSV downloads (tag_code/type/batch/status/created_at) | | | |
| F4 | Public | Scan an unclaimed `/t/{tagCode}` | Activation-prompt (unclaimed) state, no contact | | | |
| F5 | Admin | Disable/archive a defective unclaimed tag (if supported) | Tag no longer offered as available stock | | | |
| F6 | Admin | Attempt duplicate tag code | Generation stays unique; duplicates prevented | | | |

---

## G. Owner order + admin payment flow

Preconditions: Owner has an active pet; Admin available.

| ID | Role | Steps | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | Owner | Create a tag order | Order `Pending Payment`; price set server-side | | | |
| G2 | Owner | Inspect the new order | **No** tag code auto-generated at creation | | | |
| G3 | Owner | Upload payment proof (metadata) | Records file name/reference only, no file bytes | | | |
| G4 | Admin | Reject the proof with a reason | Order back to Pending Payment; payment status Rejected | | | |
| G5 | Owner | View order detail | Rejection reason + resubmission prompt shown | | | |
| G6 | Owner | Resubmit proof | New proof submitted; old rejected kept as history | | | |
| G7 | Owner | Review the timeline | Shows submitted → rejected (reason) → resubmitted, with date+time | | | |
| G8 | Admin | Confirm payment | Order `Payment Confirmed`; payment status Confirmed; `PaymentConfirmedAt` set | | | |

---

## H. Tag assignment / change / replace

Preconditions: payment-confirmed order; ≥3 matching unclaimed tags (A, B, C).

| ID | Role | Steps | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | Admin | Assign Tag A after confirmation | Tag A → Preparing, linked to owner/pet/order; order shows assigned tag | | | |
| H2 | Admin | Confirm stock accounting | Stock consumed at assignment, not at order creation | | | |
| H3 | Admin | Before shipping, Change Assigned Tag A → B | Tag B linked and Preparing | | | |
| H4 | Admin | Check Tag A after change | Tag A returns to Unclaimed/available inventory | | | |
| H5 | Admin | Mark Preparing → Shipped, then try Change Assigned Tag | Direct change no longer offered; only Replace Tag | | | |
| H6 | Admin | Replace Tag B → C with reason "Damaged" | Tag B → Replaced; Tag C linked, order re-enters preparation | | | |
| H7 | Public | Scan `/t/{TagB}` after replacement | Inactive/no-contact page | | | |
| H8 | Owner/Public | New replacement tag C state | Waiting-activation until owner activates | | | |

---

## I. Physical tag `/t` scan page

Preconditions: mix of tag states available.

| ID | Role | Steps | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| I1 | Public | Scan unclaimed retail tag | Unclaimed activation prompt, no contact | | | |
| I2 | Public | Scan portal-assigned, not-yet-active tag | Pending/preparing state, no contact | | | |
| I3 | Owner | Activate the assigned tag from `/t` as the matching owner | Tag becomes Active; no pet-selection prompt (order pet is authoritative) | | | |
| I4 | Owner2 | Try to activate Owner's assigned tag | Blocked (wrong owner) | | | |
| I5 | Public | Scan the now-active tag | Finder safety content shows (per pet visibility) | | | |
| I6 | Public | Scan Lost/Disabled/Replaced/Archived tags | Inactive, no contact | | | |
| I7 | Public | Scan an active tag whose pet is Memorial/Archived | Inactive/no-contact | | | |
| I8 | Public | Scan an unknown code | `notFound` state, no contact | | | |

---

## J. Owner smart tags UI

Preconditions: Owner has assigned/active/replaced tags.

| ID | Role | Steps | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| J1 | Owner | Open `/tags` for a delivered-not-active tag | **No** direct "Activate Tag" button | | | |
| J2 | Owner | Read the delivered tag wording | "Waiting for owner activation"-style copy | | | |
| J3 | Owner | Use View Tag Scan Page | Opens `/t/{tagCode}` in a new tab | | | |
| J4 | Owner | View an active tag | Shows active status + scan link/QR | | | |
| J5 | Owner | View a replaced/inactive tag | Appears under inactive/history, marked clearly | | | |

---

## K. Admin portal

Preconditions: Admin logged in with seeded data.

| ID | Role | Steps | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| K1 | Admin | Open `/admin` dashboard | Real counts load | | | |
| K2 | Admin | Filter orders by status | Filters work | | | |
| K3 | Admin | Approve/reject a payment proof | Order + proof status update; owner reflects it | | | |
| K4 | Admin | Filter smart tags | Filters (active/pending/unclaimed/lost-disabled/replaced/archived) work | | | |
| K5 | Admin | Open Tag Inventory | Stock/batch list + CSV export | | | |
| K6 | Admin | Open Owners | Owner counts (pets/orders) from real relationships | | | |
| K7 | Admin | Open Pets | Lifecycle / Lost Mode / QR safety status shown | | | |
| K8 | Admin | Open Settings | Read-only pricing / feature flags | | | |
| K9 | Admin | After mutations, check audit logs | `AuditLogs` rows written for each admin mutation | | | |

---

## L. PDF / receipt

Preconditions: one order per payment state.

| ID | Role | Steps | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| L1 | Owner | Pending payment → download document | Order Summary PDF only (no "Official Receipt"/"Paid") | | | |
| L2 | Owner | Proof submitted → download | Order Summary PDF only | | | |
| L3 | Owner | Rejected → download | Order Summary PDF only | | | |
| L4 | Owner | Payment confirmed → download | Official Receipt PDF available | | | |
| L5 | Owner | Inspect the receipt | Shows PAID + payment confirmed date + receipt no. | | | |
| L6 | Owner | Call `receipt.pdf` on an unconfirmed order | `422 receipt_not_available` | | | |
| L7 | Owner2 | Call Owner's `summary.pdf`/`receipt.pdf` | `404`/blocked (cross-owner) | | | |
| L8 | Admin | Download any order's summary/receipt | Allowed (receipt still requires confirmed payment) | | | |

---

## M. QR code display

Preconditions: Owner active pet with an assigned physical tag.

| ID | Role | Steps | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | Owner | Share Profile QR | Encodes `/p/{petSlug}` | | | |
| M2 | Owner | QR Safety Page QR | Encodes `/q/{safetyCode}` | | | |
| M3 | Owner/Admin | Physical Tag QR | Encodes `/t/{tagCode}` (never `/q`) | | | |
| M4 | Owner | Default view | Large QR not shown by default; a compact action opens it | | | |
| M5 | Owner | Open QR modal | Modal shows QR + copy/view/download | | | |
| M6 | Owner | Show/download QR repeatedly | No new tag code generated; same target | | | |
| M7 | Admin | Inventory tag QR | Uses `/t`, never prints `/q` | | | |

---

## N. Error / connection / production copy

Preconditions: ability to stop backend/DB locally.

| ID | Role | Steps | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| N1 | Owner | Stop the backend, load a protected page | Friendly connection-issue message | | | |
| N2 | Owner | Stop the DB, hit `/api/v1/health/ready` | Friendly `503` "trouble connecting" message | | | |
| N3 | Any | Inspect connection-issue UI in a production build | Developer hint hidden (only shown in development) | | | |
| N4 | Owner | Trigger a `401` | Redirects to login | | | |
| N5 | Owner | Trigger a `403` | Access-denied, not a crash | | | |
| N6 | Public | Open a dynamic route that resolves to not-found | Not-found state, **no** infinite refresh loop | | | |
| N7 | Any | Scan user/admin-facing copy | No `backend`/`API`/`route`/`/t`/`/q`/internal wording in UI copy | | | |
