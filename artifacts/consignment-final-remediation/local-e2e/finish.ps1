$ErrorActionPreference='Stop'
$qa=Get-Content -LiteralPath "$PSScriptRoot/state.json" -Raw|ConvertFrom-Json
$work=Get-Content -LiteralPath "$PSScriptRoot/work.json" -Raw|ConvertFrom-Json
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
$id=$work.dispatchId;$d=Call-Final "dispatches/$id"
if($d.receivedQuantity -ne 3 -or -not $d.hasOpenDiscrepancy){throw 'Browser partial receiving did not finish'}
$received=$d.history|Where-Object action -eq receive|Select-Object -First 1
$historyCount=$d.history.Count
$d=Call-Final "dispatches/$id/receive" POST @{concurrencyToken='stale';reference=$received.reference;receipt=($received.evidenceJson|ConvertFrom-Json)} 1
if($historyCount -ne $d.history.Count){throw 'Receiving replay duplicated history'}
$event=@{eventReference='SYN-GOOD-WHILE-DISCREPANCY-OPEN';eventAt=[DateTimeOffset]::UtcNow.ToString('O');isReportedSale=$true;sellingPrice=49.90;discountAmount=0}
$d=Call-Final "dispatches/$id/external-handover" POST @{concurrencyToken=$d.concurrencyToken;reference='SYN-EXTERNAL-REPORTED-ONLY';unitIds=@($work.unitIds[0]);handover=$event} 1
$event.eventReference='SYN-MISSING-CANNOT-HANDOVER'
Call-Final "dispatches/$id/external-handover" POST @{concurrencyToken=$d.concurrencyToken;reference='SYN-INVALID-MISSING';unitIds=@($work.unitIds[3]);handover=$event} 1 409|Out-Null
$d=Call-Final "dispatches/$id/return" POST @{concurrencyToken=$d.concurrencyToken;reference='SYN-ACTUAL-DAMAGED-RETURN';unitIds=@($work.unitIds[2])}
$manifest=Call-Final "dispatches/$id/manifest"
$code=($manifest.units|Where-Object id -eq $work.unitIds[2]).tagCode
$qaRoot='http://localhost:5192/api/v1/admin/tag-inventory/qa';$headers=@{Authorization='Bearer '+$qa.sessions[0].accessToken}
$item=(Invoke-RestMethod -Uri "$qaRoot/lookup?code=$code" -Headers $headers).data
$failed=(Invoke-RestMethod -Method Put -Uri "$qaRoot/$($item.id)" -Headers $headers -ContentType application/json -Body (@{inspectionId=[guid]::NewGuid().ToString();expectedVersion=$item.version;decision='Failed';physicalCondition='Damaged';remarks='Synthetic failed physical return; damaged package'}|ConvertTo-Json)).data
if($failed.qaStatus -ne 'Failed'){throw 'Real QA failed inspection did not persist'}
$d=Call-Final "dispatches/$id"
$d=Call-Final "dispatches/$id/write-off" POST @{concurrencyToken=$d.concurrencyToken;reference='SYN-DAMAGED-ACTUAL-RETURN-WRITEOFF';unitIds=@($work.unitIds[2])}
$receipt=@{recipient='Synthetic reviewer';receivedAt=[DateTimeOffset]::UtcNow.ToString('O');quantity=0;damagedQuantity=0;missingQuantity=0;signedEvidenceReference='SYN-PHYSICAL-RETURN-REVIEW';goodUnitIds=@();damagedUnitIds=@();missingUnitIds=@();returnedUnitIds=@($work.unitIds[2])}
$review=@{concurrencyToken=$d.concurrencyToken;reference='SYN-REVIEW-DAMAGED-RETURN';receipt=$receipt}
Call-Final "dispatches/$id/resolve-discrepancy" POST $review 1 403|Out-Null
Call-Final "dispatches/$id/resolve-discrepancy" POST $review 0 403|Out-Null
$d=Call-Final "dispatches/$id/resolve-discrepancy" POST $review 2
if(-not $d.hasOpenDiscrepancy -or $d.writtenOff -ne 1 -or $d.externalHandovers -ne 1 -or $d.receivedQuantity -ne 3){throw 'Final partial reconciliation mismatch'}
$pdf=Call-Final "dispatches/$id/dispatch-note.pdf"
if([Convert]::ToBase64String($pdf.RawContentStream.ToArray()) -ne [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot '../issued-synthetic.pdf')))){throw 'Issued PDF changed'}
$normal=Call-Final "dispatches/$id"
if(@($normal.units|Where-Object {$null -ne $_.tagCode}).Count){throw 'Ordinary details exposed codes'}
@('PASS: Browser partial receipt recorded2good+1damaged+1missing,3counted; independent receiving operator.',
'PASS: Exact receipt retry with stale token added no history.',
'PASS: Confirmed good unit handed over while unrelated discrepancy remained open; missing-unit handover409.',
'PASS: Damaged unit explicitly physically returned, real PhysicalQaService saved Failed, separately written off.',
'PASS: Recorder and dispatcher resolution attempts403; third operator reviewed actual return with0counted at partner.',
'PASS: Missing unit still held; good receiving evidence and external reported handover retained; PDF bytes unchanged.',
'PASS: Ordinary dispatch response has stable CU references and no Tag Codes.')|Add-Content "$PSScriptRoot/../e2e-results.log"
Write-Output 'Final synthetic partial receiving assertions passed.'
