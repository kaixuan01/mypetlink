$ErrorActionPreference='Stop'
$qa=Get-Content -LiteralPath "$PSScriptRoot/state.json" -Raw|ConvertFrom-Json
if($qa.database -notmatch '^MyPetLinkTest_FinalRemediation_[a-f0-9]{32}$'){throw 'Disposable database guard'}
$root='http://localhost:5192/api/v1/admin/merchant-sales/consignment'
function Call-Final($route,$method='GET',$body=$null,$actor=0,$expected=200) {
  $args=@{Uri="$root/$route";Method=$method;Headers=@{Authorization='Bearer '+$qa.sessions[$actor].accessToken};SkipHttpErrorCheck=$true}
  if($null -ne $body){$args.ContentType='application/json';$args.Body=$body|ConvertTo-Json -Depth 16}
  $response=Invoke-WebRequest @args
  if([int]$response.StatusCode -ne $expected){throw "$method $route expected$expected got$($response.StatusCode): $($response.Content)"}
  if($response.Headers['Content-Type'] -match 'application/json'){return ($response.Content|ConvertFrom-Json).data}
  return $response
}
$terms=@{merchantId=$qa.merchantId;reference='SYN-FINAL-QA';partnerCommissionPercentage=35;effectiveFrom=[DateTimeOffset]::UtcNow.AddDays(-1).ToString('O');durationTerms='Synthetic only duration';settlementFrequency='Synthetic external tracker';paymentDeadlineDays=14;discountTerms='Synthetic approved discounts';returnTerms='Synthetic actual returns';lossTerms='Synthetic investigation hold';signedAgreementReference='SYNTHETIC-SIGNED-TERMS';externalTrackerReference='SYNTHETIC-FINAL-TRACKER'}
$a=Call-Final 'agreements' POST $terms 0 201
$a=Call-Final "agreements/$($a.id)?concurrencyToken=$([Uri]::EscapeDataString($a.concurrencyToken))" PUT $terms 1
Call-Final "agreements/$($a.id)/approve" POST @{concurrencyToken=$a.concurrencyToken;reference='SYN-MAKER-BYPASS'} 0 403|Out-Null
$a=Call-Final "agreements/$($a.id)/approve" POST @{concurrencyToken=$a.concurrencyToken;reference='SYN-INDEPENDENT-APPROVAL'} 1
$reserve=@{agreementId=$a.id;merchantBranchId=$qa.branchId;destination=$qa.destination;externalTrackerReference='SYNTHETIC-FINAL-TRACKER';idempotencyKey='SYN-FINAL-FIRST';lines=@(@{productVariantId=$qa.variantId;quantity=4})}
$d=Call-Final 'dispatches' POST $reserve 0 201
if($d.reservationReused){throw 'New reservation marked reused'}
$reserve.idempotencyKey='SYN-FINAL-RETRY-NEW-KEY'
$retry=Call-Final 'dispatches' POST $reserve 0 200
if(-not $retry.reservationReused -or $retry.id -ne $d.id){throw 'Reused result is wrong'}
$d=Call-Final "dispatches/$($d.id)/dispatch" POST @{concurrencyToken=$d.concurrencyToken;reference='SYN-FINAL-PHYSICAL-DISPATCH'}
$pdf=Call-Final "dispatches/$($d.id)/dispatch-note.pdf"
[IO.File]::WriteAllBytes((Join-Path $PSScriptRoot '../issued-synthetic.pdf'),$pdf.RawContentStream.ToArray())
@{dispatchId=$d.id;unitIds=@($d.units|ForEach-Object id);unitReferences=@($d.units|ForEach-Object unitReference);agreementId=$a.id}|ConvertTo-Json -Depth 8|Set-Content "$PSScriptRoot/work.json"
@('PASS: Actual HTTP maker approval blocked after another operator no-op save.',
 'PASS: Independent checker approval succeeds.',
 'PASS: First reservation201/reused equivalent reservation200 with explicit reservationReused=true; one dispatch.',
 'PASS: Actual dispatch issued archived PDF; ready for browser partial receiving.')|Set-Content "$PSScriptRoot/../e2e-results.log"
Write-Output "Synthetic dispatch ready: $($d.id)"
