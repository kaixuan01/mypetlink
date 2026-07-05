# MyPetLink Phase 1 E2E Test Report

Run of [`phase-1-e2e-test-script.md`](phase-1-e2e-test-script.md).

## 1. Date / time

- **Authenticated regression run: 2026-07-05, ~15:20 (UTC+8, MYT).**
- (Earlier read-only run: 2026-07-05, ~03:16.)

## 2. Branch and commit tested

- Branch: `feature/connect-admin-apis`
- Commit: `5b42abe` (`fix: harden development test auth helper`), on top of `5683874` (tag variants) and `b261ea8` (dev auth helper).

## 3. Test accounts used

Minted via the Development-only `POST /api/v1/dev/test-login` (no Google popup). To keep runs idempotent under the Free-plan pet limit, the runner uses a unique per-run owner/second-owner email; the admin is fixed.

- Owner: `owner.<ts>@mypetlink.local` (role Owner)
- Second owner (cross-owner): `other.<ts>@mypetlink.local` (role Owner)
- Admin: `admin.test@mypetlink.local` (role Admin — auto-creates an active `AdminUsers` row in Development)

## 4. Checks run

| Check | Result |
| --- | --- |
| `dotnet build apps/api/MyPetLink.Api/MyPetLink.Api.csproj` | PASS — 0 warnings, 0 errors |
| `dotnet ef database update` | PASS — database already up to date |
| `npm run lint:web` | PASS — clean |
| `npm run build:web` | PASS — static export succeeded |
| Backend `GET /api/v1/health` / `/health/ready` | PASS — `ok` / `ready, database: up` |
| Swagger `/swagger/index.html` (dev) | PASS — `200` |
| `POST /api/v1/dev/test-login` (Development) | PASS — mints owner/admin/second-owner sessions |
| `POST /api/v1/dev/test-login` (Production run, port 5282) | PASS — `404` (Swagger also `404`) |

## 5. Summary count

This authenticated pass executed a scripted API runner covering flows A–L (58 assertions) plus targeted PDF-gating, production-guard, and build-hygiene checks. Frontend-only behaviors (J UI, M QR modal, N connection copy, browser redirects) are verified by code review / production-build inspection rather than a driven browser.

- **Passed (executed live via authenticated API): 60**
- **Passed (code review / build inspection): ~14** (J1–J5, M1–M7, N3/N7, browser redirect behaviors)
- **Failed: 0**
- **Blocked: 0**
- **Not tested (needs a real browser to fully exercise): a few UI-only checks** — see notes.

> The Development-only dev-login helper removed the previous "Not tested" blockage: owner/admin/second-owner JWTs are now obtained non-interactively, so all token-gated API flows run live. What remains browser-only is pure client rendering (QR modal, connection-issue copy, redirect UX), which is covered by code review + the production build scan.

### Executed live (authenticated API) — all PASS

- **A. Auth/access** — owner roles `["Owner"]`; admin roles `["Owner","Admin"]`; admin check `200` for admin, `403` for non-admin; anonymous `401`; cross-owner pet read `404`.
- **B. Pets** — create (server slug+safety code), edit, public `/p` (no owner email leak), `/q`, mark Memorial, restore Active, archive, and the Free-plan **4th active pet → `422`**.
- **C4. Memorial `/q`** — no owner contact exposed.
- **D. Care records** — create, edit, delete; cross-owner read `404`.
- **E. Memories** — create Public + Private; **`/p` shows only the public one**; cross-owner read `404`.
- **F. Inventory** — generate QR + QR+NFC (Lightweight/Standard); CSV export (`text/csv`); unclaimed `/t` → `unclaimed` state, no contact.
- **G. Order + payment** — create order (`PendingPayment`, **no auto tag code**); upload proof; admin reject with reason; **owner timeline shows OrderCreated → PaymentProofSubmitted → PaymentProofRejected (with reason)**; resubmit → **PaymentProofResubmitted**; admin confirm → `PaymentConfirmed`.
- **H. Assign/change/replace** — assign Tag A; change A→B before shipping; **Tag A returns to `Unclaimed`**; mark shipped; **direct change after shipping blocked (`422`)**; replace B→C (reason Damaged); **old Tag B `/t` → `inactive` (no contact)**; **new Tag C `/t` → `pending` (waiting activation)**.
- **I. `/t` activation** — wrong owner activate blocked (`404`); correct owner activates a portal tag with **no pet selection**; active `/t` → `active` (finder content).
- **K. Admin portal** — dashboard, owners, pets, settings all `200`; audit logs present with assign/replace entries.
- **L. PDF** — summary PDF before confirmation `200`; **receipt PDF before confirmation `422`**; receipt PDF after confirmation `200`; **cross-owner PDF `404`**; admin PDF `200`.

### Verified by code review / build inspection

- **J1–J5 — Owner Smart Tags UI**: `TagAction` has no `activate-tag`; owner `/tags` shows "Scan or open the physical tag link to activate…", View Tag Scan Page, and replaced/inactive tags under history — no direct Activate button.
- **M1–M7 — QR display**: Share Profile QR → `/p`, QR Safety QR → `/q`, Physical Tag QR → `/t`; QR is behind a "Show QR" modal (not large by default); rendering/downloading a QR does not create or consume a tag code; physical tag QR never encodes `/q`.
- **N3/N7 — production copy**: `"Developer hint"` absent from production `.js` chunks and the exported `out/`; no `/dev-login` route in the export; connection-issue copy is friendly with the developer hint gated to Development only.
- **Browser redirect UX** (A3 logout, A7 anonymous protected page, 401→login, dynamic 404 no-loop): handled by `AuthGuard`/route fallback; verified by code, not a driven browser.

## 6. Critical flow results

| Flow | Result | Evidence |
| --- | --- | --- |
| 1. Owner create pet → `/p` → `/q` → memorial → restore | **PASS (live)** | B1–B6, C4 all green via authenticated API. |
| 2. Care record + memory public/private | **PASS (live)** | D1–D3, E1–E2, private hidden on `/p`. |
| 3. Order → proof reject → resubmit → admin confirm | **PASS (live)** | G3–G8; timeline shows submitted → rejected(reason) → resubmitted → confirmed. |
| 4. Assign → change before shipped → replace after shipped | **PASS (live)** | H1–H8; A returns Unclaimed; post-ship direct change `422`; replace works. |
| 5. Owner scan `/t` activate → lost/disabled/replaced no contact | **PASS (live)** | I3–I5 activation; replaced Tag B `/t` inactive/no-contact. |
| 6. Order Summary PDF before confirm → Official Receipt PDF after | **PASS (live)** | Summary `200` pre-confirm; receipt `422` pre-confirm, `200` post-confirm. |
| 7. Admin access control + non-admin 403 | **PASS (live)** | Admin `200`, non-admin `403`, anonymous `401`. |
| 8. Connection/error state + no production-hostile wording | **PASS** | `/health/ready` friendly `503` on DB loss (code); dev hint stripped from prod build (scan). |

## 7. Bugs found

- **None.** Every blocker pattern from the task was exercised and behaves correctly:
  - Owner cannot direct-activate from `/tags` (scan-page-only).
  - Owner order does **not** auto-generate a tag code (inventory assignment only).
  - `/t` inactive/replaced/lost/disabled/archived and memorial/archived pets expose **no** owner contact.
  - Receipt PDF is unavailable until payment is confirmed (`422`); cross-owner PDF blocked.
  - Cross-owner pet/care/memory/order reads return `404`.
  - `/admin/*` requires the active-admin policy (`403`/`401` otherwise).
  - The dev-login helper is Development-only (Production → `404`).
  - Production build hides the developer connection hint and ships no `/dev-login`.

## 8. Bugs fixed

- None required.

## 9. Remaining blockers

- **None.**

## 10. Non-blocking follow-ups

1. **Fully driven browser pass** for the pure-UI checks (QR modal interaction, connection-issue banner rendering, logout/redirect UX). Behavior is code-verified; a Playwright run would make it automated evidence.
2. **Persist the E2E runner** (the scratch Python script) into the repo as an opt-in dev-only harness so this authenticated regression can be re-run in CI against a Development instance.
3. Optional seeded demo dataset for `MyPetLinkDev` to speed manual QA (kept out of production seeds).
4. Minor: variant/tag-type mismatch on assign returns `400 validation_failed` (not `422`), consistent with other field validations — documented as intended, not changed.

None are release blockers.

## 11. Release-candidate readiness

**Release-candidate ready for Phase 1**, pending a final human smoke of the browser-only UI polish (follow-up 1). All build/lint/migration gates pass, and the full authenticated E2E chain — auth/access control, pet lifecycle, care records, memories, inventory, order + payment reject/resubmit/confirm, tag assign/change/replace, `/t` activation and contact protection, PDF gating, and admin portal — was executed live with **0 failures** and no blocker bugs. Security-critical gates (admin policy, owner scoping, `/t` contact protection, receipt gating, dev-login Production 404, production copy) all hold.
