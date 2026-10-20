# Local verification

PowerShell from repository root, with SQL Server LocalDB available. The fixtures create and drop uniquely named disposable databases. Required consignment SQL scenarios use Fact/Theory plus an availability assertion; no skip fallback.

```powershell
$filter=Get-Content artifacts/consignment-final-remediation/api-filter.txt -Raw
dotnet test apps/api/MyPetLink.Api.Tests/MyPetLink.Api.Tests.csproj `
  --settings artifacts/consignment-final-remediation/serial.runsettings `
  --filter $filter --logger 'trx;LogFileName=api-regression.trx' `
  --results-directory artifacts/consignment-final-remediation --verbosity minimal

dotnet test apps/api/MyPetLink.Api.Tests/MyPetLink.Api.Tests.csproj `
  --settings artifacts/consignment-final-remediation/serial.runsettings `
  --filter 'FullyQualifiedName~Consignment|FullyQualifiedName~MerchantShippedTagActivation|FullyQualifiedName~TagOrderCatalogIntegration|FullyQualifiedName~PhysicalQaReleaseGate' --logger 'trx;LogFileName=api-final-consignment.trx' `
  --results-directory artifacts/consignment-final-remediation --verbosity minimal

# Follow-ups after the expanded run (overlapping cases):
dotnet test apps/api/MyPetLink.Api.Tests/MyPetLink.Api.Tests.csproj `
  --settings artifacts/consignment-final-remediation/serial.runsettings `
  --filter 'FullyQualifiedName~N2PassedDamagedReturn|FullyQualifiedName~ReturnsStayQuarantined|FullyQualifiedName~P10RealFailedInspection|FullyQualifiedName~N2ActualHundred|FullyQualifiedName~N2LocatedMissing' `
  --logger 'trx;LogFileName=api-release-guard.trx' `
  --results-directory artifacts/consignment-final-remediation --verbosity minimal

dotnet test apps/api/MyPetLink.Api.Tests/MyPetLink.Api.Tests.csproj `
  --settings artifacts/consignment-final-remediation/serial.runsettings `
  --filter 'FullyQualifiedName~N2|FullyQualifiedName~P06Receipt|FullyQualifiedName~ReturnsStayQuarantined|FullyQualifiedName~P10RealFailedInspection' `
  --logger 'trx;LogFileName=api-final-receiving-audit.trx' `
  --results-directory artifacts/consignment-final-remediation --verbosity minimal

$env:ConnectionStrings__MyPetLinkDb='Server=(localdb)\MSSQLLocalDB;Database=MyPetLinkTest_DesignOnly_NoConnection;Trusted_Connection=True;TrustServerCertificate=True;'
dotnet ef migrations has-pending-model-changes --project apps/api/MyPetLink.Api
# Script generation only, not database update:
dotnet ef migrations script --idempotent --project apps/api/MyPetLink.Api --output migration.sql
```

Frontend from `apps/web`:

```powershell
npx vitest run --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=../../artifacts/consignment-final-remediation/web-full.json
npx vitest run src/components/admin/merchantSales/ConsignmentPanel.test.tsx --maxWorkers=2
npm run typecheck
npx eslint src/components/admin/merchantSales/ConsignmentPanel.tsx src/components/admin/merchantSales/ConsignmentPanel.test.tsx src/services/adminConsignmentService.ts

# Stop Next dev before this build; do not hand-edit generated files.
$env:NEXT_PUBLIC_SMART_TAGS_ENABLED='true'
$env:NEXT_PUBLIC_TAG_ORDERS_ENABLED='true'
$env:NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED='true'
$env:NEXT_PUBLIC_SOCIAL_ENABLED='false'
npm run build
```

The wider API filter reuses the relevant48class selection from the preceding remediation: B2C reservation/payment/order/assignment, merchant sales/billing/documents/allocation/fulfillment, Physical QA, inventory, authorization and consignment. It is not the repository's entire API suite. Overlapping runs must not be added into a unique-test total.

The full frontend run precedes the final receiving-summary copy/separator adjustment; the final panel tests, lint, typecheck and production build cover the final UI. Seven conditional skips are individually listed in `frontend-skips.json`.

The `local-e2e` harness and setup/finish scripts are synthetic evidence helpers. They create a guarded `MyPetLinkTest_FinalRemediation_<32hex>` database, three synthetic operators and six tags, with Marketing Demo/email disabled and loopback URLs. The browser submits the partial receipt between setup and finish. The completed run's session state was removed after exact-name cleanup; reseeding creates new IDs and requires a new browser walkthrough. Never point this harness at an external or production database. No deployment commands were run.
