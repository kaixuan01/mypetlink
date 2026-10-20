# Production continuation and recovery — approval checkpoint pending

**Subsequent web authorization and completion:** the operator later explicitly requested web deployment. The exact B2B commit was deployed successfully using the existing Cloudflare Production settings, and read-only smoke checks passed. See [deployment report](web-deployment/deployment-report.md). The checklist below records the earlier checkpoint; it is not a current web-deployment hold. Database/backup and authenticated acceptance entries were not silently marked verified.

This is a runbook, not an executed deployment script. Staging planning was stopped at the operator's request. Database migration/API publishing were subsequently reported complete by the operator. Do not repeat migrations or republish without first inspecting the live state.

## Final GO/NO-GO checkpoint

- [x] Exact 66-file cumulative source isolated, committed and pushed: `2ff3b792b2f021168d257511d94ec71cf23e8b09`.
- [x] All four Consignment migrations and byte-identical root EF deployment script included.
- [x] Local API compilation/publish, 83 focused API/real SQL tests, 337 web tests, typecheck, scoped lint, web production build and Functions compilation passed.
- [x] Pages `mypetlink` / `main` / `mypetlink.com.my` independently read through authenticated Wrangler.
- [x] Published API domain and Azure hostname return 200 readiness and 401 anonymous Consignment requests on latest recheck.
- [ ] Actual Azure subscription, resource group, API resource/slot, runtime and SQL server/database independently verified. **Do not invent these values or use a slot by assumption.**
- [ ] Usable backup: confirmed retention, latest restorable point before migration, actual recovery permissions, recovery destination and successful restore verification recorded.
- [ ] Live migration history confirms the four exact IDs, no unexpected pending/failed migration or drift.
- [ ] Matching API artifact provenance/startup settings established; no Marketing Demo code in the published API.
- [ ] Effective Production web/Functions and API configuration checked; especially existing Google auth, CORS, storage, JWT, checkout flags and public origins.
- [ ] Live Team policy and capability access checked by an authenticated authorized administrator without changing policy or business data.
- [x] Hosted CI results inspected: both checkout-profile jobs pass; API tests lack a SQL Server CI service; full web tests fail in Community date-copy and RecordsManager create/edit grouping cases. See the release report and captured failed logs.
- [ ] Hosted CI failures resolved or explicitly accepted with an evidence-based disposition before claiming complete release acceptance.
- [ ] One final release approval with the verified targets and backup/recovery evidence recorded before a new Production deployment action.

Current decision: the source push is complete. Full release acceptance is pending the unchecked evidence; no approval question is presented as though those checks were already complete.

## Exact continuation order

1. Review the committed file manifest/diff, the latest CI result and this checkpoint. Preserve the recorded former API/web artifacts and external evidence. Keep new consignment business use paused while verification is pending.
2. Verify Production backup/recovery. Azure SQL uses service-managed point-in-time recovery; do not substitute a LocalDB backup or unsupported SQL Server `BACKUP DATABASE` command for Azure SQL. Record retention, source database identity, earliest/latest restorable timestamps, migration time, authorized recovery operator and restore verification. Restore to an approved separate recovery database for verification, never over a live database without a separately approved recovery plan. A backup policy alone is not proof of a usable recovery point.
3. **Database first:** inspect live history. If all four migrations are already recorded, do not apply them again unnecessarily. If pending, review the exact history boundary and approve the root idempotent script before execution. Use `sqlcmd -I -b`; filtered indexes need QUOTED_IDENTIFIER. Migration connection must be bound to the verified database, not a guessed target. Keep credentials out of command logs/chat. Respect all fail-closed guards.
4. **API next:** verify that the operator-published API matches this source and is healthy. If a further publish is required, use the isolated artifact and verified host runtime/configuration. Do not publish the mixed original working tree. Confirm readiness, new protected routes and logs before proceeding.
5. **Web last:** use the same exact commit with the existing verified Production configuration, not the verification ZIP with incomplete public auth configuration. Build both static export and Pages Functions. Record resulting deployment ID, source SHA, environment, effective public flags and rollback artifact. The skip prefix intentionally prevented an unattended web-first release; a new deployment requires the final checkpoint.
6. Through existing audited Access Management, review/grant only required Consignment capabilities. Existing installations are not automatically broadened. Separate approval, manifest export, write-off and sensitive policy/self-review grants. Do not use raw SQL to bypass access governance. Capability changes on Production require their explicit operational scope.
7. Read the policy and confirm Team default with no nominated founder on an unused installation. If it is already Solo, stop and inspect its journal; do not overwrite the existing policy to manufacture a default. Super Admin alone must not authorize self-review.
8. Solo remains **disabled unless separately approved**. If later authorized, nominate the actual active founder who has `consignment.self_review` plus action capabilities, record the warning/reason and inspect append-only history. No automatic enablement.
9. Perform authenticated read-only Production smoke checks: Admin sign-in; Merchant Sales listing/detail; Consignment listing and policy/history; authorized versus unauthorized/disabled Admin; restricted manifest access without exposing tag codes; existing owner sign-in, orders/tags and public Safety Profile/Share Profile access. Prefer existing approved test accounts/fixtures; do not create real agreements, reservations or financial records. Authentication challenge checks alone are not a complete capability test.
10. Return/reconciliation/rollback and hardware workflow acceptance remains a separate controlled synthetic/local or explicitly approved test exercise. See checklist below. Never manufacture partner evidence or use real stock as a smoke fixture.

## Required configuration and commands

Every unknown target below is **REQUIRED / NOT VERIFIED**: `PROD_SUBSCRIPTION_ID`, `PROD_RESOURCE_GROUP`, `PROD_API_APP_RESOURCE_ID`, explicit `PROD_API_SLOT` (`NONE` for a confirmed standalone app), `PROD_SQL_SERVER`, `PROD_SQL_DATABASE`, migration authentication, rollback API artifact and backup recovery reference. Existing configured host names identify intended resources but do not establish database bindings or recovery access.

Read-only history query for an authorized SQL session:

```sql
SET QUOTED_IDENTIFIER ON;
SELECT DB_NAME() AS DatabaseName, @@SERVERNAME AS ServerName;
SELECT MigrationId, ProductVersion
FROM dbo.__EFMigrationsHistory
WHERE MigrationId LIKE '%Consignment%'
ORDER BY MigrationId;
SELECT Mode, SelfReviewerAdminUserId, UpdatedAt
FROM dbo.ConsignmentApprovalPolicies;
```

Use verified schema column names from the shipped migration when running support queries. The policy entity stores its mode as configured by EF; inspect its value, do not update it.

Future commands, only after target verification and release approval:

```powershell
# Azure CLI is not installed/authenticated in this session. No command below was run.
# All PROD_* parameters must come from the verified resource record.
$required = 'PROD_SUBSCRIPTION_ID','PROD_RESOURCE_GROUP','PROD_API_APP','PROD_SQL_SERVER','PROD_SQL_DATABASE'
foreach ($key in $required) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($key))) {
        throw "Required verified target missing: $key"
    }
}
# Inspect history/backup first; use the approved authentication option, not printed passwords.
sqlcmd -S "tcp:$env:PROD_SQL_SERVER,1433" -d $env:PROD_SQL_DATABASE -G -I -b -i .\source\migration.sql
if ($LASTEXITCODE -ne 0) { throw 'Migration failed; stop the release.' }
# Standalone app example. A verified slot requires an explicit --slot argument; never swap by assumption.
az webapp deploy --subscription $env:PROD_SUBSCRIPTION_ID --resource-group $env:PROD_RESOURCE_GROUP --name $env:PROD_API_APP --src-path .\api-publish.zip --type zip
if ($LASTEXITCODE -ne 0) { throw 'API publish failed; stop before the web release.' }
Invoke-RestMethod 'https://api.mypetlink.com.my/health/ready'
```

These commands are not an authorization to rerun the operator's completed deployment. `-G` requires working Microsoft Entra SQL authentication/tools; use only the organization's approved migration principal. Never copy an unverified production connection into a test fixture.

For the web, preserve the existing production values rather than replacing its configuration with defaults. All four release flags are explicitly true: `NEXT_PUBLIC_SMART_TAGS_ENABLED`, `NEXT_PUBLIC_TAG_ORDERS_ENABLED`, `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED`, `NEXT_PUBLIC_SOCIAL_ENABLED`. API `Features__SmartTagOrderingEnabled` must match true. Use `NEXT_PUBLIC_API_BASE_URL=https://api.mypetlink.com.my`, canonical/app origin `https://mypetlink.com.my`, actual existing Google client ID, existing profile feature selections, `NEXT_PUBLIC_DEV_AUTH_ENABLED=false`, `NEXT_PUBLIC_NOINDEX=false`. Pages Functions need the actual effective `PUBLIC_API_BASE_URL`/`NEXT_PUBLIC_API_BASE_URL`. Verify no staging/invalid URLs are built in. Preserve SMTP/R2/JWT/CORS and existing financial/payment configuration; do not dump secrets or enable Marketing Demo.

Future local build commands from the isolated full source root, after those exact Production environment values are set:

```powershell
npm ci --no-audit --no-fund
npm run build --workspace apps/web
if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
npm run build:functions --workspace apps/web
if ($LASTEXITCODE -ne 0) { throw 'Pages Functions build failed.' }
# After the final checkpoint, run from apps/web so its functions/ and edge/ are present:
# npx wrangler pages deploy out --project-name mypetlink --branch main --commit-hash 2ff3b792b2f021168d257511d94ec71cf23e8b09
```

Do not deploy only a static folder from a different directory and omit dynamic Safety/Profile/Community routes. Prefer the existing verified Git-connected production build when its release control is approved; record exactly which source/environment produced the new artifact.

## Return, reconciliation and physical QR/NFC acceptance

- [ ] Synthetic data is clearly labelled; only disposable/local stock fixtures or separately approved test hardware are used.
- [ ] Agreement cannot approve with missing terms/actual acceptance; Team maker/checker remains enforced. Solo exception requires nomination, capability, confirmation, reason and retained real external evidence.
- [ ] Partial receiving: 100 dispatched, 98 good + 1 damaged present + 1 missing = 99 physically counted. Damaged/missing units stay held; confirmed good units may proceed. Use actual event dates. UI receipt minute precision requires a time after dispatch, not the same minute.
- [ ] New evidence resolves only selected located/returned units; unresolved shortage remains held. Perform receiving review before write-off. An allowed write-off before review does not itself close the receiving issue or release stock.
- [ ] Physical return recorded separately, fresh QA with correct actual tag identity, then explicit release/write-off authorization. Failed returns never become available stock.
- [ ] Original issued PDF bytes/hash/number unchanged; review history and reconciliation exports distinguish Self-reviewed (Solo), Independent (Team/Solo) and historical unknown. Tag Code manifests remain restricted.
- [ ] Custody/reconciliation causes no invoice, receipt, payment, sale, commission or automatic settlement. Existing B2C commitments and Wholesale allocations remain protected.
- [ ] Intended Android hardware: real camera scans QR; actual Web NFC read/write/read-back where supported; verify chip UID and code match that same physical unit. A simulated reader test is not hardware UAT.
- [ ] Test Lightweight and Standard QR+NFC variants. Do not generate or offer new QR-only SKUs.
- [ ] QR/NFC/Safety entry paths show the same privacy rules; activation starts by QR, NFC unactivated flow requests QR. Disabled/replaced/held tags cannot disclose inappropriate owner details or bypass custody.
- [ ] Verify return hardware mismatch, damaged/unreadable chip and duplicate/wrong tag outcomes keep quarantine. No Production tag ownership, contact details or real stock movement is changed for testing.
- [ ] Recovery rehearsal respects SQL 51040/51042 protections, retains immutable evidence, and never deletes review history or edits migration history to bypass guards.

## Recovery

If health fails, stop the release before web publication and inspect startup/deployment/configuration logs through authorized Azure access. A missing route indicates a version/target mismatch until demonstrated otherwise. Keep additive schema and evidence by default. Once custody exists, never restore an older API that ignores consignment holds.

Recovery options require a separately reviewed plan: correct the matching hold-aware API/configuration; return to the prior matching web artifact; or restore a verified database recovery point to a separate approved database and reconcile every write/evidence item since that point before switching traffic. Do not restore a database independently while writers continue. Keep externally retained partner documents, PDFs, manifests and audit history aligned with the restored state. A raw schema Down, deleted history or direct stock reset is prohibited.

The operator owns Production backup/API publishing in this session; this agent has neither verified a usable recovery reference nor changed Production configuration/data. Further deployment remains dependent on the explicit final checkpoint rather than an assumed green status.

References: [Azure SQL backups](https://learn.microsoft.com/en-us/azure/azure-sql/database/automated-backups-overview?view=azuresql), [Azure publish command](https://learn.microsoft.com/en-us/cli/azure/webapp?view=azure-cli-latest#az-webapp-deploy), [Pages Git skip control](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/).
