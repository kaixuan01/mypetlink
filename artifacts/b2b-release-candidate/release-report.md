# Cumulative B2B release candidate — 18 October 2026

**Follow-up:** the operator subsequently approved web deployment. Commit `2ff3b79` was successfully published to Production at 13:50:48 SGT on 18 October 2026, including Pages Functions. Final read-only HTTP smoke checks passed 14/14. See the [web deployment report](web-deployment/deployment-report.md), which supersedes this document's earlier web-hold status. Unverified database/backup/authenticated acceptance and known hosted CI failures remain separately recorded.

## Released source

Committed and pushed to `origin/main` at **2ff3b792b2f021168d257511d94ec71cf23e8b09**, following the operator's explicit instructions to commit to main and push. Parent/base: `d692fe590b60b4c745dbfdd270cba310eeb72b4f`. The remote SHA was checked after pushing.

The candidate contains the cumulative Wholesale correctness changes, Consignment Agreement/custody MVP, H1–H4, M1–M10, N1–N9 and Solo Operator Mode. This is a full HEAD export with the complete 66-file B2B delta, not a scoped remediation patch. Team remains the migration default; no live approval policy was changed by this agent.

The later Production-first instruction superseded the staging plan. No staging resource was provisioned. The operator subsequently confirmed that they had migrated Production and published the API. This report distinguishes that confirmation from independently observed evidence.

## Exact contents and isolation

- [Changed/new file list](release-files.txt): exactly 66 paths, matching the commit.
- [Delta manifest](delta-manifest.json): original and candidate SHA-256 for each path.
- [Full source manifest](source-manifest.json): 2,053 source files, including committed dependencies and deployment configuration.
- [Cumulative review diff](b2b-cumulative.patch): applies to a clean export of the recorded base; see [application check](patch-apply-check.log).
- [Complete source ZIP](b2b-source.zip): frozen full source, without build caches, local dotenv files or credentials.
- [API publish ZIP](api-publish.zip): framework-dependent .NET 8 Release publish from the isolated source. Host runtime/native compatibility must be checked before using it for a future publish.
- [Web verification ZIP](web-verification.zip): static export plus compiled Pages Functions. **Verification artifact only**: the effective Production Google client ID was not obtained. Rebuild with all verified Production settings before publishing this ZIP. Do not upload its `out` directory alone and omit Pages Functions.
- [Excluded working-tree paths](excluded-working-tree-paths.txt).

`Program.cs` was composed from HEAD plus only `ConsignmentService` and `ConsignmentDocumentService` registrations. The required `IAdminAccessResolver` registration was already present in HEAD. Marketing Demo options, seeder, tests, startup/static-file changes and package scripts were excluded. Launch configuration, local development settings, marketing content and the unrelated Community test change were excluded. Already committed baseline marketing files remain part of the full repository; no uncommitted marketing changes were included.

All 2,507 initially recorded original file hashes were unchanged after assembly, verification and commit. No original file was overwritten or discarded. Git index was initially empty; only the 66 reviewed paths were staged. The index was checked against the frozen candidate, including the selectively staged Program.cs. Existing unrelated changes remain uncommitted.

## Local verification

| Check | Result | Evidence |
| --- | --- | --- |
| Locked independent npm install | Pass | `dependency-install.log` |
| API and test project Release compilation | Pass; 0 errors, 2 existing unrelated test warnings | `api-build.log` |
| Isolated API publish | Pass | `api-publish.log` |
| Focused cumulative Consignment, capability and real client/HTTP packaging tests | **83 passed, 0 failed, 0 skipped** | `api-verification.log`, `test-results/rc-verification.trx` |
| Actual SQL Server relational cases | Included in the 83; disposable LocalDB databases | TRX and `verification-summary.json` |
| Merchant Directory real web-client/Kestrel smoke | Pass; prior missing-node_modules packaging problem resolved | TRX |
| Merchant Sales/Consignment/capability web tests | **337 passed**, 21 files | `web-tests.log` |
| App and Pages Functions TypeScript | Pass | `web-typecheck.log` |
| Affected frontend ESLint | Pass | `web-lint.log` |
| Production-profile web build, all four public release flags true | Pass | `web-build.log` |
| Static release markers, Social ON, production SEO | Pass; existing SEO-M4 low-text warning | `web-build.log` |
| Pages Functions compilation | Pass | `web-functions-build.log` |
| EF pending-model check | No pending changes | `ef-consistency.log` |
| Isolated EF idempotent SQL vs root migration.sql | **Byte-identical** | `migration.generated.sql`, `verification-summary.json` |
| Clean-base cumulative patch application | Pass | `patch-apply-check.log` |
| Original work and frozen source hashes | Pass | `verification-summary.json` |

The 83 tests include fresh migration/idempotent replay, legacy migration safety, duplicate reservation migration guard, Solo journal tamper/rollback guards, Team/Solo authorization and evidence, receipt/discrepancy/return safeguards, inventory concurrency and custody exclusions. They are a focused packaging check, not a second independent broad audit. The accepted independent review separately records API 2,837/2,837 and web 4,346 passed/7 skipped; those are prior review results, not newly rerun here.

Toolchain: Node 22.13.1, npm 11.12.1, .NET SDK 9.0.313 targeting net8.0, EF tool 8.0.26, Next.js 16.2.9, Wrangler 4.110.0, SQL Server 2019 LocalDB. Frozen source files were checked again after build tools ran.

## Migrations

All migration classes and matching Designer files, the final model snapshot, and the current root script are included:

1. `20261017082802_AddConsignmentAgreementAndCustody`
2. `20261017103941_HardenConsignmentOperationalControls`
3. `20261017160448_CompleteConsignmentReceivingAndApproval`
4. `20261018035952_AddConsignmentSoloOperatorPolicy`

Root `migration.sql` SHA-256: `c7c45d2912dd6f3bb29e28041a300af75e69c39c840315dab4cd45a6bc487ec1`.

The authoritative deployable script is the root script. `database/migration.sql` is stale. These are SQL Server EF migrations; no MySQL script was added. Guards reject conflicting reservation fingerprints, protect recorded historical custody and prevent destructive Down migration after business or review history exists. Solo journal update/delete is protected by SQL trigger 51042; Down guards use 51040.

## Production targets and observed state

| Target | Evidence and current verification |
| --- | --- |
| Repository | `https://github.com/kaixuan01/mypetlink`, branch `main`; pushed SHA verified |
| Cloudflare Pages | Authenticated Wrangler confirms project `mypetlink`, domain `mypetlink.com.my`, Production branch `main` |
| Previous successful Pages deployment | `5c0db214-4e3b-430b-a98c-c900cf2c8926`, source `d692fe5`, observed before push |
| This Pages source record | `11b836fd-11b8-4e39-bd90-989552e160e9`, source `2ff3b79`, listed Idle after push; no successful web release claimed |
| API app from existing publish profiles | `mypetlink-api-prod` |
| API public domain | `https://api.mypetlink.com.my` |
| Azure hostname from those profiles | `https://mypetlink-api-prod-hug7becrejguf6d4.southeastasia-01.azurewebsites.net` |
| Azure subscription/resource group/resource ID | **Not independently verified**; Azure browser requires sign-in, CLI unavailable |
| Production SQL server/database and four history entries | **User reports migration completed; not independently inspected** |
| Restorable Production backup and recovery reference | **Not verified or created by this agent** |

The commit uses `[CF-Pages-Skip]` to hold automatic Pages deployment while release gates are unresolved. GitHub CI ran: [run 39101294533](https://github.com/kaixuan01/mypetlink/actions/runs/39101294533). **Hosted CI completed with failures**, independently of the successful local checks:

- Both `community-checkout` and `retail-checkout` jobs passed, including their builds, browser regressions, release selections and Functions compilation.
- API Release compilation passed; its test job reported 2,297 passed, 56 failed and 359 skipped. The Consignment relational failures explicitly report that SQL Server is unavailable on the current Ubuntu runner. The workflow provides no SQL Server service or test connection. Local actual SQL verification passed; making hosted verification green requires a disposable SQL Server CI target, not suppressing or skipping the release-gate tests.
- The `all-off` web job passed lint/typecheck, but its full suite failed in two untouched areas: the expired fixed-date expectation in `communityModeration.test.ts`, and the create/edit grouping test in `RecordsManager.list.test.tsx`. No assertion or unrelated source was changed for this release. The Community test's uncommitted local date fix was deliberately preserved and excluded from the B2B commit.

See `ci-status.json`, `github-checks.json` and `ci-failed.log`. These failures need explicit resolution/disposition before claiming a green complete release gate; do not interpret local focused tests as green hosted CI.

Initial public observations showed existing API readiness 200 with new routes 404; a subsequent check observed temporary 500/timeouts during the operator-managed publish. **The latest requested recheck supersedes those observations:** both hostnames return liveness/readiness **200**, and Consignment approval-policy and agreements return **401** for anonymous requests. The new endpoints are now reachable and require authentication. Evidence: [latest recheck](production/api-recheck-latest.json).

These GET-only probes do not prove the four migration history entries, actual approval mode, effective capabilities, all runtime flags, artifact provenance, backup restorability or a logged-in Admin workflow. No Production data, roles, Solo nomination, agreements, reservations, receipts, inventory or financial records were created or changed by this agent.

## Release decision

- **Local/source and Git delivery: PASS.** Complete cumulative implementation is committed and pushed, isolated from unrelated work.
- **API public liveness/routes: PASS on latest recheck.** Operator reports SQL migration/API publishing complete.
- **Full Production release acceptance: NOT ESTABLISHED.** Backup/history/effective configuration and authenticated Admin checks remain unverified, hosted CI has the failures above, and web publication has been held. See [Production continuation plan](production-continuation.md).
- **First 100 physical tags: NO-GO.** Actual partner agreement, evidence retention/reconciliation decisions, explicit founder permissions/nomination if Solo is selected, real hardware QA and partner-countersigned count remain business gates. No real stock should move based on this source push.

No further feature work was performed. Automated Document Pack, financial settlement automation and Partner Portal remain outside this release.
