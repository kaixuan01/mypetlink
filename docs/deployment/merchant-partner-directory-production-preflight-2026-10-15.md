# Merchant Partner Directory production preflight — 2026-10-15

Status: **PUSHED TO MAIN; PRODUCTION WEB DEPLOYED AND SMOKE-VERIFIED; ALL CI JOBS PASSED.**

## Follow-up ownership and repository action

The user subsequently took ownership of production API/database deployment and asked this agent to commit/push `main`. Created local commit `d3b11c61de8d342bf3cecda773f22b53ce2c817d` (`feat: release merchant partner directory and verified fixes`), with 67 approved files and tree `44944f48eac1e45e65907366eab8cec6ff8afb84`. Marketing/development work remains uncommitted. `Program.cs` includes only the directory registration in this commit; root package scripts exclude marketing additions.

The exact candidate was exported to `C:\Project\MyPetLink-release-20261015-1005` for isolated checks. API Release build passed (two existing compiler warnings); web/Pages typecheck passed; release-profile tests 15/15 passed; focused API tests 127 passed / 0 failed / 10 skipped, including the real client/Kestrel smoke. The ten relational cases skipped because LocalDB was unavailable to this run; they are not claimed as newly passed. The all-true production-flag build, artifact verification, SEO verification, full lint, Pages Functions compilation and five browser regressions passed. The full web run passed 4,275 tests and skipped seven; its one failure came from exporting without Git metadata, which broke the existing `git check-ignore` test. Initializing Git in that isolated copy fixed the setup and all three tests in that file passed on rerun. No source/test assertion was changed for that correction.

The user then explicitly confirmed: "Both are deployed; proceed with the push." The production directory API returned 200, an empty list and browser/CDN no-store headers before the main push. Commit `d3b11c61de8d342bf3cecda773f22b53ce2c817d` was pushed to `origin/main`; the remote SHA was verified. Database target, backup and API deployment were handled by the user. This agent has not independently inspected the live migration history, captured the API artifact or verified a backup reference; do not describe those as agent-verified. The initial preflight record below describes the state before this follow-up.

### Production web evidence

- Cloudflare Pages production/canonical deployment: `4f81b09a-d102-4820-b8e2-67efa35c37fa`, from exact commit `d3b11c61de8d342bf3cecda773f22b53ce2c817d`, successful at `2026-10-15T02:13:57.528493Z` (10:13:57 Singapore time). Artifact URL: <https://4f81b09a.mypetlink.pages.dev>.
- Live <https://mypetlink.com.my/where-to-buy> returns 200 and the new title `Partner Stores & Smart Tags | MyPetLink Malaysia`. Its canonical points to the production URL and robots remains index/follow.
- Real production browser loads the directory to `No partner stores are listed yet. Please check back soon.` with no browser errors observed. The commerce CTA uses `/tags/order`.
- All four served `mypetlink-release-*` metadata markers are true, matching all four unchanged Cloudflare production settings enumerated below.
- Anonymous public directory page 1 and searched page 2 return zero records and total zero. An unavailable 32-character store code returns safe `partner_store_not_found` 404. All have browser, CDN and Cloudflare-CDN no-store headers. No merchants or branches were published by this agent.
- Public Smart Tag catalogue verification passed: three offered QR+NFC variants, each MYR39.90 and in stock; no QR-only offering. Readiness is 200. Existing non-destructive order/tag/invalid-code scan checks are recorded in the baseline evidence.
- GitHub CI: <https://github.com/kaixuan01/mypetlink/actions/runs/38669782846>. Completed successfully; all four jobs passed: API, all-off (including the complete web suite), retail-checkout and community-checkout. Verified at 10:17:51 Singapore time on 2026-10-15. This is exact-release-commit hosted CI, superseding the isolated export's Git-metadata setup issue.
- Evidence files in `artifacts/production-preflight-2026-10-15/`: `cloudflare-release.json`, `api-after-user-deployment.json`, earlier baseline/platform files and release manifest. Local isolated check logs remain in the C: release-check folder.

### Current rollback boundary

For this web release, the previous Pages deployment is `b496156a-de5c-459d-aedb-e9eb89e8dc97` / web commit `b4de33736e2c068bc28a035a0e51b33086b4fe1c`. Use the existing Pages rollback procedure to restore that known-good web artifact if required. Keep the additive directory schema and audit/consent history. API rollback and any database restore are owned by the user and require their recorded prior artifact/backup; no backup identifier is available in this agent's evidence. Do not run the directory Down migration as routine rollback.

## Initial preflight

The user explicitly authorized production deployment and waived manual/staging QA. That authorization remains valid. This stop is required by the user's separate requirement to verify the actual production database, migration boundary and restorable backup before changing production.

## Blocking access

- GitHub and Cloudflare authentication work. Azure CLI is unavailable and no Azure CLI configuration directory exists. The available in-app browser reaches the Microsoft Azure sign-in form; there is no authenticated Azure portal session available there.
- Existing Visual Studio production publish profiles identify the App Service but do not establish database-management/backup access. Their protected credentials were not exported or decrypted. API publishing access has not been validated.
- Local application configuration identifies only `(localdb)\MSSQLLocalDB` / `MyPetLinkDev`, not the production database. No production SQL connection has been established.
- Consequently, the SQL server/database identity, live `__EFMigrationsHistory`, pending migration set, backup retention/restorability, pre-release recovery timestamp and API rollback artifact remain unverified.
- **Backup reference: NONE VERIFIED OR CREATED.** No SQL has been applied. Never substitute a LocalDB backup for the production rollback point.

Next required action: sign in to Azure in the open browser tab and make the production App Service and SQL database accessible. Keep passwords/codes/connection strings out of chat. No manual QA or renewed deployment approval is requested. If platform authentication or permissions still prevent backup verification, retain this stop.

## Actual production web target and preserved flags

Read directly from the authenticated Cloudflare Pages project configuration, rather than inferred from QA builds or local dotenv files:

| Setting | Current production value |
| --- | --- |
| Project | `mypetlink` |
| Repository | `kaixuan01/mypetlink` |
| Production branch | `main` |
| Custom domain | `mypetlink.com.my` |
| Build | root `apps/web`; command `npm run build`; output `out` |
| Automatic production deployments | Enabled for `main` |
| `NEXT_PUBLIC_SMART_TAGS_ENABLED` | `true` |
| `NEXT_PUBLIC_TAG_ORDERS_ENABLED` | `true` |
| `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED` | `true` |
| `NEXT_PUBLIC_SOCIAL_ENABLED` | `true` |

All four are already true in the platform's production configuration. Preserve these exact values. No flag, build setting or unrelated configuration was changed. The API's effective `Features__SmartTagOrderingEnabled` still needs host-side verification.

Current canonical Pages deployment: `b496156a-de5c-459d-aedb-e9eb89e8dc97`, successful, created `2026-10-12T06:19:25.672181Z`, from commit `b4de33736e2c068bc28a035a0e51b33086b4fe1c`. Deployment URL: <https://b496156a.mypetlink.pages.dev>. This is the existing release, not a new deployment from this task.

The production Visual Studio profiles name `mypetlink-api-prod` at `https://mypetlink-api-prod-hug7becrejguf6d4.southeastasia-01.azurewebsites.net`. Production API domain: <https://api.mypetlink.com.my>. The hosting resource's active deployment identity, settings and database binding still need authenticated verification.

## Repository and release isolation

- Working root is `C:\Project\MyPetLink`. Local `main` and remote `main` both resolve to `b4de33736e2c068bc28a035a0e51b33086b4fe1c` at inspection.
- Directory/follow-up fixes are uncommitted. They coexist with unrelated marketing work. No files were staged, committed or pushed by this task.
- `Program.cs` mixes the required `MerchantDirectoryService` registration with marketing seeder/options/static-files changes. A release must retain only the directory registration hunk and exclude the marketing implementation/files.
- Root `package.json` mixes the release build script/minimum-Node change with `marketing:*` scripts. Exclude the marketing script hunks. `package-lock.json` contains the matching Node minimum change.
- Exclude `.claude/launch.json`, API `Properties/launchSettings.json`, `appsettings.Development.json`, `.env.local`, publish-profile credentials, `MarketingDemoOptions.cs`, `MarketingDemoSeeder.cs`, `MarketingDemoSeederTests.cs`, marketing content/assets, `TagOrder`, and `physical-qa-release.patch`. Review `.gitignore` hunks separately.
- Never publish the current mixed working tree. Prepare a clean release source under an appropriate C: location after the access blocker is resolved; preserve the original worktree.
- `.github/workflows/ci.yml` validates web/API; it does not deploy the API. Current `main` has a successful API CI check and Cloudflare deployment, but its historical web CI check failed. Exact release-commit CI has not run because no release commit exists yet. Do not describe the supplied local QA as green CI on a new commit.

The independent follow-up report in `merchant-partner-directory-qa-2026-10-15.md` and the referenced conversation attachment record: full web 4,276 passed / 0 failed / 7 skipped twice; focused API 266/266 three times; full API's four LocalDB creation-contention errors passed serially (45/45); four isolated release builds verified. These are supplied prior QA results, not tests re-executed during this preflight.

## Schema review and impact

Authoritative script: root `migration.sql`, SHA-256 `F9C98D23DB8F5B595CA2FA0D6A827D6BEDB4973292FB1D516822923E2DF3A061` at inspection. **Do not use `database/migration.sql`.**

The appended migration is `20261013081130_AddMerchantPartnerDirectory`. Its Up path adds nullable merchant description/public code, `Merchants.ShowOnWebsite` default false, a new `MerchantBranches` table with its own publication default false, rowversion, restricted merchant foreign key, coordinate constraint and lookup indexes. It contains no merchant auto-publication, invented branches, billing-address conversion or consent seeding. The previous API can ignore these additions. Its Down path drops directory data and is not a routine rollback.

This source review establishes that the new migration is additive; it does **not** prove the complete root script is safe against an unknown live migration history. Older root-script migrations contain data work/guards. Compare live history and schema before running the entire idempotent script. Do not bypass any fail-closed SQL guard.

Affected surfaces: `/where-to-buy`, public navigation/SEO/release metadata, Admin merchant listing/branches/draft navigation, merchant activation privacy, shared directory DTO/client, `Merchants`, `MerchantBranches`, EF migration history and audit records. Admin listing reads require `sales.view`; changes require `sales.manage`. Accompanying verified fixes affect Smart Tag physical-spec placeholders, the Moments editor race and test synchronization. No new merchant may become public without recorded consent covering the selected branches.

## Read-only production baseline

These checks precede release and are not post-release acceptance. Captured response details are in `artifacts/production-preflight-2026-10-15/production-baseline.json`; safe platform evidence is in `cloudflare-production.json` alongside it.

| Probe | Observed |
| --- | --- |
| API `/health/ready` | 200, `ready` |
| Anonymous `/api/v1/public/partner-stores` | 404 with empty body; new directory API not available |
| Public `/where-to-buy` | 200; old title `Where to Buy \| MyPetLink Smart Tags Malaysia`; production canonical; indexable |
| `/where-to-buy` cache | `public, must-revalidate, max-age=0`; Cloudflare `DYNAMIC` |
| Public `/api/v1/tag-products` | 200, two products in envelope |
| Anonymous `/api/v1/orders` and `/api/v1/tags` | 401 with safe `unauthorized` envelope |
| Invalid-code public QR API | 200, `state: notFound`, `profile: null`; no owner contact |
| Invalid-code `/q/...` web entry | 200 branded Safety Profile HTML; `no-store`; noindex |
| `/tags`, `/tags/order`, `/orders` web entries | 200 with expected existing page titles |
| Swagger | 404 |
| GET dev-auth login path | 404; POST behavior not tested in this pass |
| Existing homepage release metadata | New four-marker metadata absent, as expected for the old release; actual flag values verified from platform configuration |

An exploratory `/smart-tags` probe returned 404; it is not a configured product route (`/smart-pet-tags` is canonical), so it is not a release failure. The raw evidence retains that probe.

No authenticated Admin smoke ran: no authorized production test account/session was established. No orders, tags, merchant branches, consent, publication or configuration were modified. Production database evidence and Azure application logs are unavailable until authentication. Hidden-merchant exclusion, directory no-store/CDN behavior, new production assets and new-page SEO cannot be accepted while the new API/web are absent.

## Resume sequence and rollback

1. Authenticate to Azure; verify subscription/resource, API's actual production DB binding, effective ordering flag, live migration history, current API build/deployment and log access. Obtain and verify a restorable backup/safe recovery point; record its identifier and UTC time without secrets. Capture the prior API artifact for rollback.
2. Extract only approved changes into clean C: release source. Review the complete diff and run required checks/CI on the exact candidate commit. A main push automatically releases web, so do not push/promote main before schema and API are ready.
3. After backup and compatibility checks, apply root `migration.sql` with `migration-session-settings.sql` in the same `sqlcmd` process using the documented authentication, `-I -b -V 11` and checked exit code. Verify migration history, existing merchants hidden and no branches invented. Preserve every SQL guard.
4. Publish the reviewed API through the established production profile, then verify readiness and anonymous directory responses before web release. Keep all merchant publication controls unchanged/hidden.
5. Release web via the existing Pages/main procedure with all four current production flags unchanged. Verify built and served metadata/rendered gates, production API paths and SEO, directory API browser/CDN no-store behavior, hidden-data exclusion, Smart Tag read-only routes, application logs and error rates. Use authenticated Admin reads only with an authorized safe account.
6. Record exact release commit, API artifact hash/deployment identity, Pages deployment ID, backup reference/time, SQL log/history and automated check outcomes. Only then mark deployed.

No rollback is currently necessary: this task made no production release changes. The existing Pages deployment above is a web rollback candidate; revalidate its availability before release. For an application rollback after this additive migration, restore the previous known-good web/API artifacts while retaining the new schema, branch rows, consent and audit history. Never run this migration's Down path as routine rollback. A database restore requires the verified backup/recovery point and a separate decision accounting for writes since that point. No such point is currently verified.
