$s=Get-Content -LiteralPath "$PSScriptRoot/state.json" -Raw | ConvertFrom-Json
if($s.database -notmatch '^MyPetLinkTest_SoloOperator_[a-f0-9]{32}$'){throw 'Disposable database guard failed'}
$headers=@{Authorization='Bearer '+$s.sessions[0].accessToken}
$terms=@{merchantId=$s.merchantId;reference='SYN-SOLO-AGREEMENT';partnerCommissionPercentage=35;effectiveFrom=[DateTimeOffset]::UtcNow.AddDays(-1).ToString('O');durationTerms='Synthetic one-year agreement';settlementFrequency='Synthetic monthly settlement';paymentDeadlineDays=14;discountTerms='Synthetic partner discount schedule';returnTerms='Synthetic actual returns only';lossTerms='Synthetic shortage investigation';signedAgreementReference='SYN-PARTNER-SIGNED-SOLO-AGREEMENT';externalTrackerReference='SYN-SOLO-TRACKER'}
$a=Invoke-RestMethod -Uri 'http://localhost:5198/api/v1/admin/merchant-sales/consignment/agreements' -Method Post -Headers $headers -ContentType application/json -Body ($terms|ConvertTo-Json)
if($a.data.status -ne 'Draft'){throw 'Draft setup failed'}
'Draft created with complete synthetic partner terms; no approval or physical dispatch.' | Set-Content -LiteralPath "$PSScriptRoot/../e2e-results.log"
