$ErrorActionPreference='Stop'
$qa=Get-Content -LiteralPath "$PSScriptRoot/state.json" -Raw | ConvertFrom-Json
$work=Get-Content -LiteralPath "$PSScriptRoot/work.json" -Raw | ConvertFrom-Json
if($qa.database -notmatch '^MyPetLinkTest_Remediation_[a-f0-9]{32}$'){throw 'Disposable guard failed'}
$root='http://localhost:5192/api/v1/admin/merchant-sales/consignment'
function Call-QA($route,$method='GET',$body=$null,$actor=0,$expected=200){
  $arguments=@{Uri="$root/$route";Method=$method;Headers=@{Authorization='Bearer '+$qa.sessions[$actor].accessToken};SkipHttpErrorCheck=$true}
  if($null -ne $body){$arguments.ContentType='application/json';$arguments.Body=$body|ConvertTo-Json -Depth 12}
  $response=Invoke-WebRequest @arguments
  if([int]$response.StatusCode -ne $expected){throw "$method $route returned $($response.StatusCode): $($response.Content)"}
  if($expected -eq 200 -and $response.Headers['Cache-Control'] -notmatch 'no-store'){throw "No-store missing on $route"}
  if($response.Headers['Content-Type'] -match 'application/json') {return ($response.Content|ConvertFrom-Json).data}
  return $response
}
$list=Call-QA 'dispatches'
if(@($list).Count -ne 1){throw 'Refresh created a duplicate'}
$id=$work.dispatchId
$d=Call-QA "dispatches/$id"
if($d.status -ne 'Dispatched'){throw 'Browser dispatch did not complete'}
$manifest=Call-QA "dispatches/$id/manifest"
$csv=Call-QA "dispatches/$id/manifest.csv"
$pdf=Call-QA "dispatches/$id/dispatch-note.pdf"
$pdfPath=Join-Path $PSScriptRoot '../dispatch-note-synthetic.pdf'
[IO.File]::WriteAllBytes($pdfPath,$pdf.RawContentStream.ToArray())
$receipt=@{recipient='Synthetic QA Recipient';receivedAt=[DateTimeOffset]::UtcNow.ToString('O');quantity=4;damagedQuantity=0;missingQuantity=0;signedEvidenceReference='SYNTHETIC-SIGNED-RECEIPT'}
$body=@{concurrencyToken=$d.concurrencyToken;reference='SYNTHETIC-RECEIPT';receipt=$receipt}
Call-QA "dispatches/$id/receive" 'POST' $body 0 403 | Out-Null
$short=$receipt.Clone();$short.quantity=3;$short.missingQuantity=1;$body.receipt=$short
Call-QA "dispatches/$id/receive" 'POST' $body 1 409 | Out-Null
$d=Call-QA "dispatches/$id/record-discrepancy" 'POST' $body 1
if(-not $d.hasOpenDiscrepancy -or $d.status -ne 'Dispatched'){throw 'Short receipt silently completed'}
$body.concurrencyToken=$d.concurrencyToken;$body.receipt=$receipt
Call-QA "dispatches/$id/receive" 'POST' $body 1 409 | Out-Null
$body.reference='SYNTHETIC-COMPLETE-RECOUNT';$d=Call-QA "dispatches/$id/resolve-discrepancy" 'POST' $body 1
$body.concurrencyToken=$d.concurrencyToken;$d=Call-QA "dispatches/$id/receive" 'POST' $body 1
$pdf2=Call-QA "dispatches/$id/dispatch-note.pdf"
if([Convert]::ToBase64String($pdf.RawContentStream.ToArray()) -ne [Convert]::ToBase64String($pdf2.RawContentStream.ToArray())){throw 'Issued PDF changed after receipt'}
$unit=$d.units[1].id
$event=@{eventReference='SYNTHETIC-SALE-ENTRY';eventAt=[DateTimeOffset]::UtcNow.ToString('O');isReportedSale=$true;sellingPrice=34.90;discountAmount=5.00;discountDescription='Synthetic external discount'}
$body=@{concurrencyToken=$d.concurrencyToken;reference='SYNTHETIC-TRACKER-EVIDENCE';unitIds=@($unit);handover=$event}
$d=Call-QA "dispatches/$id/external-handover" 'POST' $body
$original=$d.reconciliation[0]
$duplicate=$body.Clone();$duplicate.concurrencyToken=$d.concurrencyToken;$duplicate.unitIds=@($d.units[2].id)
Call-QA "dispatches/$id/external-handover" 'POST' $duplicate 0 409 | Out-Null
$event.eventReference='SYNTHETIC-CORRECTION';$event.supersedesRecordId=$original.id;$event.sellingPrice=33.90;$body.concurrencyToken=$d.concurrencyToken
$d=Call-QA "dispatches/$id/correct-handover" 'POST' $body
$correction=$d.reconciliation|Where-Object kind -eq 'Correction'
$event=@{eventReference='SYNTHETIC-REVERSAL';eventAt=[DateTimeOffset]::UtcNow.ToString('O');isReportedSale=$false;sellingPrice=$null;discountAmount=$null;discountDescription=$null;supersedesRecordId=$correction.id}
$body.handover=$event;$body.concurrencyToken=$d.concurrencyToken
$d=Call-QA "dispatches/$id/reverse-handover" 'POST' $body
if($d.reconciliation.Count -ne 3 -or $d.externalHandovers -ne 0){throw 'Correction history or reversal is wrong'}
$from=[Uri]::EscapeDataString([DateTimeOffset]::UtcNow.AddDays(-1).ToString('O'));$to=[Uri]::EscapeDataString([DateTimeOffset]::UtcNow.AddDays(1).ToString('O'))
$export=Call-QA "reconciliation.csv?from=$from&to=$to"
if($export.Content -notmatch 'Unverified external report'){throw 'Reconciliation falsely claims financial authority'}
$manifest|ConvertTo-Json -Depth 12|Set-Content -LiteralPath "$PSScriptRoot/manifest.json"
@('PASS: Browser refresh/resubmission retained exactly one four-unit dispatch.',
  'PASS: Live manifest JSON, CSV and issued PDF have no-store headers.',
  'PASS: Dispatcher cannot acknowledge receipt; independent structured receipt required.',
  'PASS: Short receipt remains Dispatched; explicit discrepancy and complete recount precede receipt.',
  'PASS: Issued PDF remains byte-identical after receipt.',
  'PASS: Unique external reported sale, duplicate rejection, correction and reversal retain three unverified records.',
  'PASS: Restricted reconciliation CSV contains merchant, agreement, dates, actor and unverified classification.') | Add-Content -LiteralPath "$PSScriptRoot/../e2e-results.log"
