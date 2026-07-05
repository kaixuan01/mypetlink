# MyPetLink Phase 1 E2E Test Report

Run of [`phase-1-e2e-test-script.md`](phase-1-e2e-test-script.md).

## 1. Date / time

- 2026-07-05, ~03:16 (UTC+8, MYT).

## 2. Branch and commit tested

- Branch: `feature/connect-admin-apis`
- Commit: `a28873f` (`fix: support tag reassignment and replacement`)

## 3. Environment

- Backend: .NET SDK 9.0.313 building `net8.0`, running at `http://localhost:5281`.
- Frontend: Next.js 16 (Node v22.13.1) dev server at `http://localhost:3000`.
- Database: local `MyPetLinkDev` (LocalDB), migrations already applied.
- Auth: Google login plus a **Development-only test login** (`POST /api/v1/dev/test-login`, added after the initial run) that mints owner/admin sessions without the Google popup. Disabled (`404`) outside Development.

## 4. Checks run

| Check | Result |
| --- | --- |
| `dotnet build apps/api/MyPetLink.Api/MyPetLink.Api.csproj` | PASS — 0 warnings, 0 errors |
| `dotnet ef database update` | PASS — database already up to date (no pending migrations) |
| `npm run lint:web` | PASS — clean |
| `npm run build:web` | PASS — static export succeeded |
| Backend `GET /api/v1/health` | PASS — `{ status: ok, service: MyPetLink.Api }` |
| Backend `GET /api/v1/health/ready` | PASS — `{ status: ready, database: up }` |
| Swagger `/swagger/index.html` (dev) | PASS — `200` |
| Frontend root `/` | PASS — `200` |

## 5. Summary count

101 scripted cases (A–N).

- **Passed (executed live): 12**
- **Passed (code review): 15**
- **Failed: 0**
- **Blocked: 0**
- **Not tested (needs interactive Google login / browser): 74**

> Environmental limit: there is no non-interactive way to obtain owner/admin JWTs (Google login only), and the browser session/OAuth-bound port could not be driven headlessly. Token-gated UI flows are therefore **Not tested** here and are covered by the manual script; the security-critical gates around them were verified live (401/403/ownership) or by code review.

### Executed live (PASS)

- **Access control**: `GET /auth/me`, `/admin/auth/check`, `/admin/orders`, `/admin/pets`, `/orders`, `/pets` all return `401` without a token (A6). Owner PDF endpoints `summary.pdf` / `receipt.pdf` return `401` without a token (L auth gate).
- **Public resolution**: unknown `/t` code → `200` with `state: notFound` and no profile/contact (I8); unknown `/q` and `/p` → `404`.
- **Production copy**: `"Developer hint"` is absent from the production `.js` chunks and the exported `out/` (N3); no `Uses /t` / `View /t` route wording found in the exported output (N7 build scan).
- **Build/health/swagger**: all green (section 4).

### Verified by code review (PASS(CR))

- **G2 — order does not auto-generate a tag code**: `OrderService.CreateAsync` creates only the `TagOrder` and returns `CreateTagOrderResponse(order, null)`; no `SmartTag` is created at order time.
- **H3–H8 — change/replace**: `AdminService.ChangeAssignedTagAsync` returns the old (never-shipped) tag to `Unclaimed` and links the new one; `ReplaceTagAsync` marks the old tag `Replaced`, links a new `Preparing` tag with `ReplacementForTagId`, and re-enters preparation. Change is limited to `PaymentConfirmed`/`PreparingTag`; replace requires shipped/delivered/active.
- **I2/I6/I7 — `/t` contact protection**: `TagScanService.IsInactiveTagStatus` covers `Lost`/`Disabled`/`Replaced`/`Archived`; `Pending`/`Preparing`/`Delivered` resolve to `Pending`; a non-active safety pet (Memorial/Archived) resolves to `Inactive` — none expose contact.
- **J1/J2 — no owner self-activation**: `TagAction` has no `activate-tag`; `/tags` shows "Scan or open the physical tag link to activate…" wording instead.
- **L6 — receipt gating**: `OrderDocumentService` throws `422 receipt_not_available` unless `PaymentConfirmedAt` is set.
- **A8/L7 — cross-owner scoping**: owner order/document loads filter by the authenticated `userId` and throw `not_found` otherwise.
- **A5 — admin policy**: `/admin/*` requires the `Admin` authorization policy backed by an active `AdminUsers` record (a role claim alone is insufficient).

## 6. Critical flow results

| Flow | Result | Evidence |
| --- | --- | --- |
| 1. Owner create pet → `/p` → `/q` → memorial → restore | NT (browser) | Requires Google login. Implemented in prior committed work. |
| 2. Care record + memory public/private | NT (browser) | Requires Google login. |
| 3. Order → proof reject → resubmit → confirm | NT (browser) | Backend transitions verified by code; UI needs login. |
| 4. Assign → change before shipped → replace after shipped | PASS(CR) | `AssignInventoryTagAsync` / `ChangeAssignedTagAsync` / `ReplaceTagAsync` reviewed; validators + audit logs present. |
| 5. Owner scan `/t` activate → lost/disabled/replaced no contact | PARTIAL | Inactive/no-contact resolution verified live (unknown) + code (inactive states); owner activation needs a browser login. |
| 6. Order Summary PDF before confirm → Official Receipt PDF after | PASS(CR) | Summary allowed any state; receipt gated by `PaymentConfirmedAt` (422 otherwise). PDF endpoints require auth (verified live `401`). |
| 7. Admin access control + non-admin 403 | PASS (live, partial) | Anonymous `/admin/*` → `401` live; non-admin `403` is enforced by the `Admin` policy (code) but not exercised with a live owner token. |
| 8. Connection/error state + no production-hostile wording | PASS | Friendly `503` on `/health/ready` when DB down (code); dev hint stripped from production build (live build scan). |

## 7. Bugs found

- None. No blocker bugs were found. The blocker patterns called out in the task were checked and are already handled on this branch:
  - Owner cannot activate a tag from `/tags` (no `activate-tag` action; scan-page-only).
  - Owner order creation does **not** auto-generate a tag code (uses inventory assignment).
  - `/t` inactive/replaced/lost/disabled/archived tags do not expose owner contact.
  - Receipt PDF is unavailable until payment is confirmed (`422`).
  - Owner endpoints scope by the authenticated user (cross-owner reads → not found).
  - `/admin/*` requires the active-admin policy (anonymous → `401`).
  - Production build hides the developer connection hint.

## 8. Bugs fixed

- None required.

## 9. Remaining blockers

- None identified. The only gap is **test coverage**, not product behavior: authenticated UI flows (owner/admin) were not executed here because Google login cannot be automated in this environment.

## 10. Non-blocking follow-ups

1. ~~Add a dev-only token/login helper~~ — **Done** (commit after this report). `POST /api/v1/dev/test-login` (Development-only) mints owner/admin sessions; verified live: owner token → owner APIs `200`; admin token → `/admin/*` `200`; non-admin token → `403`; invalid role → `400`; and in a true Production run the endpoint (and Swagger) return `404`. Token-gated cases can now be scripted via curl. See `phase-1-e2e-test-script.md`.
2. **Optional Playwright/API harness** to execute flows 1–8 end to end against a seeded DB, now unblocked by the dev login helper.
3. Consider a seeded demo dataset for `MyPetLinkDev` (active/memorial/archived pets, inventory, one live order) to speed manual runs; keep it out of production seeds.

None of these are release blockers.

## 11. Release-candidate readiness

**Conditional release candidate.** Static quality gates (build, lint, web build, migrations) pass; health/readiness are green; the security-critical gates (auth `401`, admin policy, owner scoping, `/t` contact protection, receipt gating, production copy) are verified live or by code review with no failures. Before tagging a release, complete a **manual browser pass of the token-gated cases** (owner + admin flows in sections A–M) using this script, since those could not be automated in this environment.
