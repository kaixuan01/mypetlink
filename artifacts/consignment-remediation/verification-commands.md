# Local verification commands

PowerShell, repository root unless stated otherwise. Run SQL tests serially against disposable LocalDB fixtures. These commands do not authorize a deployment or production database update.

```powershell
dotnet build apps/api/MyPetLink.Api.Tests/MyPetLink.Api.Tests.csproj

dotnet test apps/api/MyPetLink.Api.Tests/MyPetLink.Api.Tests.csproj `
  --settings artifacts/consignment-remediation/serial.runsettings `
  --filter 'FullyQualifiedName~Consignment|FullyQualifiedName~MerchantFulfilment|FullyQualifiedName~MerchantAllocation|FullyQualifiedName~MerchantShipped' `
  --logger 'trx;LogFileName=api-final-custody.trx' `
  --results-directory artifacts/consignment-remediation --verbosity minimal

dotnet test apps/api/MyPetLink.Api.Tests/MyPetLink.Api.Tests.csproj --no-build `
  --settings artifacts/consignment-remediation/serial.runsettings `
  --filter 'FullyQualifiedName~Consignment|FullyQualifiedName~MerchantDirectoryRelational' `
  --logger 'trx;LogFileName=api-corrected-regression.trx' `
  --results-directory artifacts/consignment-remediation --verbosity minimal

$env:ConnectionStrings__MyPetLinkDb='Server=(localdb)\MSSQLLocalDB;Database=MyPetLinkTest_DesignOnly_NoConnection;Trusted_Connection=True;TrustServerCertificate=True;'
dotnet ef migrations has-pending-model-changes --no-build --project apps/api/MyPetLink.Api
```

Frontend, from `apps/web`:

```powershell
npm test
npx vitest run src/components/admin/merchantSales/ConsignmentPanel.test.tsx src/components/admin/AdminPhysicalQaPanel.test.tsx src/lib/communityModeration.test.ts --maxWorkers=2
npm run typecheck
npx eslint src/components/admin/merchantSales/ConsignmentPanel.tsx src/components/admin/merchantSales/ConsignmentPanel.test.tsx src/services/adminConsignmentService.ts src/lib/adminCapabilities.ts src/lib/communityModeration.test.ts

# Stop Next dev before building against its generated type files.
$env:NEXT_PUBLIC_SMART_TAGS_ENABLED='true'
$env:NEXT_PUBLIC_TAG_ORDERS_ENABLED='true'
$env:NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED='true'
$env:NEXT_PUBLIC_SOCIAL_ENABLED='false'
npm run build
```

The original full frontend run passed `--maxWorkers` through npm incorrectly; npm warned and Vitest used its default worker selection. The log is retained and this is not claimed as a limited-worker run. The final focused run invokes Vitest directly with the intended option.

The890-case API selection is preserved as individual executed test definitions/results in `api-remediation-regression.trx`; the148-case final command above is the final verification for changed custody, fulfillment and shipment code. Counts across these overlapping runs are not additive.

## Disposable live harness

`local-e2e/LocalE2E.csproj` and `Program.cs` create a uniquely named, guarded `MyPetLinkTest_Remediation_<32hex>` LocalDB database, apply current migrations and seed only synthetic records. They write local session state; do not copy that file into a release. `serve-api.ps1` requires that guarded state, uses localhost, disables Marketing Demo and email, and never accepts an arbitrary database name. `reconcile.ps1` contains live structured receipt/discrepancy/handover/export assertions and expects the browser dispatch described in the report.

The completed run's state/JWT file was deleted after exact-name database cleanup. Re-seeding produces new IDs and needs a new browser walkthrough; the scripts are evidence helpers, not an unattended production workflow. The final report states which actions used the browser, real HTTP, real SQL and synthetic reader inputs.

```powershell
dotnet run --project artifacts/consignment-remediation/local-e2e/LocalE2E.csproj
# Run the local API/web and browser walkthrough using the generated synthetic IDs.
# Stop both servers before cleanup.
dotnet run --no-build --project artifacts/consignment-remediation/local-e2e/LocalE2E.csproj -- cleanup
```

Review `docs/deployment/consignment-mvp-rollout.md` for actual release prerequisites. No deployment commands were executed.
