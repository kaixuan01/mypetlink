$taskState=Get-Content -LiteralPath "$PSScriptRoot/state.json" -Raw | ConvertFrom-Json
if($taskState.database -notmatch '^MyPetLinkTest_Remediation_[a-f0-9]{32}$'){throw 'Disposable database guard failed'}
$env:ASPNETCORE_ENVIRONMENT='Development'
$env:ConnectionStrings__MyPetLinkDb=$taskState.connection
$env:DevAuth__Enabled='true'
$env:DevAuth__AdminEmail='consignment-e2e-1@mypetlink.local'
$env:DevAuth__DisplayName='Synthetic Operator 1'
$env:MarketingDemo__Enabled='false'
$env:Email__Enabled='false'
$env:OrderReservation__ExpiryEnabled='false'
$env:Jwt__SigningKey='LOCAL-SYNTHETIC-CONSIGNMENT-E2E-KEY-NEVER-USE-IN-PRODUCTION'
$env:Jwt__Issuer='MyPetLink.Api'
$env:Jwt__Audience='MyPetLink.Local'
$env:PublicSite__BaseUrl='http://localhost:5191'
$env:Cors__AllowedOrigins__0='http://localhost:5191'
$env:Storage__Provider='Local'
$env:Logging__LogLevel__Default='Warning'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
Set-Location (Join-Path $projectRoot 'apps/api/MyPetLink.Api')
dotnet (Join-Path $projectRoot 'apps/api/MyPetLink.Api/bin/Debug/net8.0/MyPetLink.Api.dll') --urls http://localhost:5192
