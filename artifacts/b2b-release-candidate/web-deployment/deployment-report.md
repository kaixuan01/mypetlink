# Production web deployment — 18 October 2026

**Result: deployed successfully to https://mypetlink.com.my.**

The operator explicitly requested proceeding with web deployment after confirming they had completed the Production database migration and API publish. This authorization supersedes the earlier web deployment hold. This agent changed only the Pages deployment; it did not migrate, republish or change the API, database, permissions or approval policy.

## Exact release

| Item | Verified value |
| --- | --- |
| Source | `2ff3b792b2f021168d257511d94ec71cf23e8b09`, `main` |
| Cloudflare account | `8ff46718bf3f48a2724f2b108a2db2a9` |
| Pages project/environment | `mypetlink` / Production |
| New deployment | `d12a3aae-5007-46b6-8bab-9313b1d4ce06` |
| Deployment URL | https://d12a3aae.mypetlink.pages.dev |
| Canonical domain | https://mypetlink.com.my |
| Completed | **18 October 2026, 13:50:48 SGT** (`2026-10-18T05:50:48.091854Z`) |
| Pages Functions | Included; platform reports `uses_functions: true` |
| Previous successful deployment | `5c0db214-4e3b-430b-a98c-c900cf2c8926`, source `d692fe590b60b4c745dbfdd270cba310eeb72b4f` |

The existing skipped source record `11b836fd-11b8-4e39-bd90-989552e160e9` was explicitly retried through Cloudflare's scoped deployment API. The returned new deployment references the exact B2B commit, not the mixed local checkout. Its final deployment stage is successful and the project canonical deployment now points to this new deployment and matching source SHA.

## Configuration and build

Production configuration was retrieved and validated before release without changing it. The existing Git-connected Cloudflare build ran `npm run build` from `apps/web`, exported `out`, and compiled/uploaded the existing Pages Functions and routing file. The locally generated verification ZIP was not uploaded.

- API URL: `https://api.mypetlink.com.my`.
- App/canonical site: `https://mypetlink.com.my`.
- All four public release flags remain **true**: Smart Tags, Tag Orders, Smart Tag Ordering and Community.
- Existing Production Google public client ID is present; the actual Google sign-in button loaded in a browser on the canonical domain.
- Existing public/Safety profile selections retained; no development sign-in control was exposed.
- Build release markers, Social ON and production SEO checks passed. The known SEO-M4 low-text warning remains nonblocking.
- Cloudflare compiled the Worker, uploaded `_routes.json` and published 1,571 assets (1,403 new uploads, 168 reused).
- No Marketing Demo files, local environment files or unrelated working-tree changes were uploaded. Cloudflare built the already-isolated committed source.

The existing hosted CI failures were not represented as passed: missing SQL Server in the API runner and two unrelated full-web-suite failures remain recorded in the parent release report. The Production-profile Cloudflare build and the post-deployment checks below passed. No tests, source or assertions were changed to suppress those failures.

## Read-only verification

**Final smoke run: 14/14 HTTP checks passed**, all four served release markers matched, all referenced Merchant Sales JavaScript files returned 200, and the deployed browser bundle contains:

- `Consignment approval policy`;
- `Self-reviewed (Solo)`;
- the matching `/api/v1/admin/merchant-sales/consignment` endpoint prefix.

| Check | Result |
| --- | --- |
| Home, Where to Buy, Admin Login, Merchant Sales, owner Login and Smart Tag order entry | 200; branded pages |
| API `/health/live`, `/health/ready` | 200 |
| Anonymous Consignment approval policy and agreement endpoints | 401, authentication required |
| Anonymous existing Merchant Sales, owner Orders and Tags endpoints | 401, authentication required |
| Public Smart Tag catalogue | 200 |
| Home release metadata, canonical and index/follow policy | Correct |
| Merchant Sales in an unauthenticated browser | Redirected to Admin Login with the intended return destination |
| Production owner sign-in browser screen | Google sign-in control loaded; no sign-in submitted |

One initial liveness request did not complete; the repeat run passed all 14 checks. This was retained as an observation rather than reported as an application failure. Latest successful results are in `smoke-results.json`.

No real sign-in, partner agreement, reservation, dispatch, stock movement or financial record was created. Authenticated per-user Admin capabilities, the actual Team/Solo policy, SQL migration history and restorable backup were not independently verified. This web deployment did not enable Solo. Team remains the code/migration default; the live policy was not changed.

## Recovery and remaining acceptance

If a web-specific fault is found, the previously successful Pages deployment above is the recorded web recovery target. A reviewed Pages rollback can restore that artifact without destructive SQL operations. Do not roll back the API to code that ignores Consignment holds, delete evidence, or run schema Down migrations.

The operator-reported database migration/API publishing and backup responsibilities remain separate from this verified web deployment. Full authenticated workflow acceptance, hosted CI disposition, hardware QA, partner evidence and the First-100 business gates remain outstanding. No production-stock readiness claim is made.

Evidence: `cloudflare-predeploy.json`, `api-predeploy.json`, `deployment-start.json`, `deployment-status.json`, `canonical-after.json`, `build-log.json`, `smoke-results.json`, and `evidence-sha256.txt`. Existing source, cumulative patch and migration manifests remain in the parent release-candidate directory.
