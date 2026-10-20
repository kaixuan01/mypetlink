# Solo Operator Mode verification

Run from `C:\Project\MyPetLink` with SQL Server LocalDB available. All required SQL cases assert availability, rather than silently skipping. Counts overlap.

```powershell
$filter=(Get-Content artifacts/solo-operator-mode/api-filter.txt -Raw).Trim()
dotnet test apps/api/MyPetLink.Api.Tests/MyPetLink.Api.Tests.csproj `
  --settings artifacts/consignment-final-remediation/serial.runsettings `
  --filter $filter --logger 'trx;LogFileName=api-regression.trx' `
  --results-directory artifacts/solo-operator-mode --verbosity minimal

# Isolated output avoids Windows locks from a simultaneous normal-output testhost.
dotnet test apps/api/MyPetLink.Api.Tests/MyPetLink.Api.Tests.csproj `
  --artifacts-path C:/Project/MyPetLink/artifacts/solo-operator-mode/isolated-build `
  --settings artifacts/consignment-final-remediation/serial.runsettings `
  --filter 'FullyQualifiedName~AdminCapabilityCoverageTests|FullyQualifiedName~Solo' `
  --logger 'trx;LogFileName=api-final-gates.trx' `
  --results-directory artifacts/solo-operator-mode --verbosity minimal

$env:ConnectionStrings__MyPetLinkDb='Server=(localdb)\MSSQLLocalDB;Database=MyPetLinkTest_DesignOnly_NoConnection;Trusted_Connection=True;TrustServerCertificate=True;'
dotnet ef migrations has-pending-model-changes --no-build --project apps/api/MyPetLink.Api
dotnet ef migrations script --no-build --idempotent --project apps/api/MyPetLink.Api `
  --output artifacts/solo-operator-mode/migration.verify.sql
# Compare to root migration.sql; no database update command is used here.
```

From `apps/web`, with local dev servers stopped before the production build:

```powershell
npx vitest run --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=../../artifacts/solo-operator-mode/web-full.json
npx vitest run src/components/admin/merchantSales/ConsignmentPanel.test.tsx src/components/admin/merchantSales/ConsignmentApprovalPolicy.test.tsx --maxWorkers=2
npm run typecheck
npx eslint src/components/admin/merchantSales/ConsignmentPanel.tsx src/components/admin/merchantSales/ConsignmentPanel.test.tsx src/components/admin/merchantSales/ConsignmentApprovalPolicy.tsx src/components/admin/merchantSales/ConsignmentApprovalPolicy.test.tsx src/services/adminConsignmentService.ts src/lib/adminCapabilities.ts
$env:NEXT_PUBLIC_SMART_TAGS_ENABLED='true'
$env:NEXT_PUBLIC_TAG_ORDERS_ENABLED='true'
$env:NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED='true'
$env:NEXT_PUBLIC_SOCIAL_ENABLED='false'
$env:NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED='true'
npm run build
```

The full frontend run precedes the final dialog reset refactor; final focused tests, lint, typecheck and build cover that final source. The existing seven skips are listed in `frontend-skips.json`. The broader API run preceded the coverage-test explanation of the conditional self-review capability; the final gates run covers that correction, added fresh-script assertions and reconciliation export assertions.

The `local-e2e` helper is loopback-only synthetic evidence: `MyPetLinkTest_SoloOperator_<32hex>`, API5198/web5197, Marketing Demo and email disabled. Initial fixture identity normalization and its synthetic signing-key mismatch were corrected before the successful walkthrough. Browser session logged out, servers stopped, exact owned database deleted and JWT state removed. No pre-existing local or production database is a test target. Re-running creates new IDs and requires a new browser walkthrough; never point it at external data.
