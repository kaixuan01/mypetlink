# Production release — Consignment Agreement (commit 808296d)

20 October 2026. Authorised by the user. Independent final review: GO
(`C:\Users\User\AppData\Local\Temp\mpl-consignment-final-20261020\final-review.md`).

| Item | Result |
| --- | --- |
| Commit | `808296d83dd21574528b164a49d5be5ffa26e1b3` — `feat(consignment): add agreement PDF, auto references and default terms` (no skip marker) |
| Branch / push | `main`, fast-forward `49bef2e..808296d` to `origin/main`; no force push |
| Files | 56 committed (`release-files.txt`); unrelated work excluded and byte-identical (96 files hashed before/after) |
| Production DB migrations | Applied by the user (`20261019110531_AddConsignmentAgreementDocuments`, `20261019124347_AddConsignmentReferencesAndDefaultTerms`). Not independently inspected here: no Production DB access. |
| Production API | Published by the user. Read-only: `/health/live` and `/health/ready` 200; new routes (`default-terms`, `agreement-prefix`, agreement `document`, `preview.pdf`) 401 anonymously; unknown route 404 — the new build is live. First probes during the user's restart returned 5xx/timeouts, then recovered. |
| Cloudflare Pages | Project `mypetlink`, deployment `569e2402-6b90-4e51-bf90-a2de1282aef6`, https://569e2402.mypetlink.pages.dev, triggered automatically by the push; "Deploy successful" |
| Live proof | Apex `/admin/merchant-sales` loads 32 chunks; the Consignment chunk with `default-terms`, `agreement-prefix`, `signed-copies`, "Default agreement terms" and "Agreement reference will be generated" is byte-identical to the deployment URL and targets `https://api.mypetlink.com.my` (`live-asset-proof.json`) |
| Release flags (live meta) | smart-tags, tag-orders, ordering, community: all `true` — unchanged |
| HTTP smoke (GET) | `/`, `/admin`, `/admin/login`, `/admin/merchant-sales`, consignment tab, `/dashboard`, `/pets`, `/tags`, `/orders`, `/where-to-buy`, `/q/…`, `/n/…`, `/t/…`, a sample `/p/…`, `/robots.txt`: all 200 (`live-http-smoke.json`) |
| Browser (signed out) | Admin Consignment redirects to Admin login, no console errors; `/q/` renders the Safety Profile finder page |
| Local pre-push checks | Exact staged tree: API build + 51 agreement/reference/authorization tests passed; web typecheck + 438 merchant-sales tests passed; Production-profile web build (Community on) + Pages Functions build passed. Earlier full suites: API 2,982/2,982 (one run), web 4,447 passed / 7 skipped. |
| Hosted CI (GitHub) | Cloudflare Pages, Web retail/community: success. Web (all-off) and API job failed — the same jobs failed on `49bef2e`: hosted runners have no SQL Server, so SQL-mandatory tests fail by design (158 → 196, the increase being the new SQL-only tests), and the existing `communityModeration.test.ts` failure. Not caused by this release. |

Not verified by this agent: authenticated Admin pages (Agreement Document actions, Default Agreement Terms,
reference preview) — they need an administrator sign-in. No agreement was created, no PDF issued, no file
uploaded and Default Agreement Terms were not activated or changed. They remain seeded **inactive** until an
administrator reviews and confirms them. Business Identity must have a registered address before agreements
can be generated (the migration-seeded identity has none; Production may already be filled).
