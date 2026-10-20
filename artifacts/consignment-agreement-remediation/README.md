# Consignment Agreement remediation — R1 / R2

Date: 20 October 2026. Local only: nothing staged, committed, pushed or deployed; no Production access.
Input: independent review `C:\Users\User\AppData\Local\Temp\mpl-consignment-independent-20261019\review.md`
(NEEDS FIXES, two P2 blockers). Only R1 and R2 were changed; accepted features were not redesigned.

## R1 — historical reference case-sensitivity

**Root cause.** `ForeignReferenceStemsAsync` filtered in SQL with `Reference.Contains("-CONS-")`, which the
default case-insensitive collation also matches for `legacy-cons-2025-001`, then sliced in C# with
`IndexOf("-CONS-", StringComparison.Ordinal)`. The case-sensitive search returned -1 and the slice threw
`ArgumentOutOfRangeException`, breaking prefix lookup and first-draft creation for *other* merchants.
The existing-number check (`Reference == reference`) also relied on the collation being case-insensitive.

**Fix.**
- `ConsignmentPrefixRules.Delimiter` and `ConsignmentPrefixRules.ReferenceStem(reference)`: finds the
  delimiter with `OrdinalIgnoreCase`, returns the stem normalised to uppercase letters and digits, and
  returns `null` (claims nothing) when there is no delimiter, no stem, or nothing left after normalising.
  It never throws.
- The SQL filter is now `Reference.ToUpper().Contains("-CONS-")`, so matching no longer depends on the
  column collation and agrees with the C# parse.
- The existing-number check compares `Reference.ToUpper() == reference`, so a hand-typed
  `ankpets-cons-2026-001` holds number 001 for `ANKPETS`.
- Historical rows are only read; their text is never rewritten. Prefix uniqueness, the per-prefix Malaysia-year
  counter, the creation key (idempotent retry) and the transaction/application lock are unchanged.

## R2 — signed-copy content validation

**Root cause.** `DetectSignedFileType` compared only the first 5 (PDF), 8 (PNG) or 3 (JPEG) bytes. Nothing
opened the file, so `%PDF-this is not a readable PDF document` was stored as signed evidence matching the
issued terms (which also locked commercial edits).

**Fix.** New `SignedAgreementFileValidator`, called in `UploadSignedAgreementAsync` after the existing
size, type and extension checks and **before** any database work:
- **PDF** (PdfPig 0.1.9, the library the test project already used): requires `%%EOF` within the last
  1 KB (truncation), parses the whole document, rejects encrypted/password-protected files, requires
  1–500 pages and reads every page (positive size). No text is required, so image-only scans pass.
  Parsing runs under a 15-second limit on top of the 8 MB upload cap.
- **PNG/JPEG** (SkiaSharp, as merchant logos already do): decoded format must match the declared type,
  at most 12,000 px per side and 40 megapixels, and every pixel must decode (`SKCodecResult.Success`),
  which rejects truncated or corrupt images behind a valid header.
- Failures return `400 signed_copy_unreadable` with a plain-language reason. No row is written, the
  status and "matches current terms" do not change, terms are not locked, issued PDFs are untouched,
  and no "signed copy uploaded" audit event is recorded.

Unchanged: size, extension and type checks; permissions; agreement/issue pairing; terms-fingerprint
check; append-only signed copies; the review and approval lifecycle. No OCR, signature verification or
e-signing was added.

## Changed files

| File | Change |
| --- | --- |
| `apps/api/MyPetLink.Api/Common/ConsignmentPrefixRules.cs` | `Delimiter`, `ReferenceStem` |
| `apps/api/MyPetLink.Api/Services/ConsignmentService.References.cs` | Collation-independent filter, safe parse, uppercase number check |
| `apps/api/MyPetLink.Api/Services/SignedAgreementFileValidator.cs` | New: PDF parse / image decode with limits |
| `apps/api/MyPetLink.Api/Services/ConsignmentService.AgreementDocuments.cs` | Calls the validator before persisting; comment |
| `apps/api/MyPetLink.Api/MyPetLink.Api.csproj` | `PdfPig` 0.1.9 (already used by the tests) |
| `apps/api/MyPetLink.Api.Tests/Relational/SignedCopyFixtures.cs` | New: genuine text PDF, image-only PDF, PNG, JPEG |
| `apps/api/MyPetLink.Api.Tests/Relational/ConsignmentAgreementRemediationRelationalTests.cs` | New R1/R2 regression tests |
| `apps/api/MyPetLink.Api.Tests/Relational/ConsignmentAgreementDocumentRelationalTests.cs` | Unparseable stub replaced by a genuine PDF |
| `docs/architecture/consignment-mvp.md` | Two sentences describing the rules |

No schema change, no migration, no web change. Other number series, order references, Smart Tag codes,
invoice/receipt/dispatch numbering, merchant identity, default terms and sales-reporting/stocktake rules
are untouched.

## Regression tests added (SQL Server, disposable databases)

R1:
- `R1_AHistoricalReferenceInAnyCaseReservesItsPrefixWithoutBreakingOthers` ×3 — `legacy-cons-…`,
  `Legacy-Cons-…`, `LEGACY-CONS-…` for another merchant: prefix lookup works, `LEGACY` is reserved
  (suggestion `LEGACY2`, manual `LEGACY` refused 409), creation succeeds as `LEGACY2-CONS-2026-001`,
  historical reference retained ordinal-equal with its 31% commission.
- `R1_MalformedHistoricalReferencesNeverFailAndStillClaimWhatTheyCan` — `-CONS-2025-001`,
  `NODELIMITER-2025-001`, `--cons--x`, `ank pets-cons-2024-9`, `cons-only`, `-cons-`: no failure;
  `ank pets` still reserves `ANKPETS`; all six rows kept.
- `R1_OwnHistoricalNumbersInAnyCaseAreSkippedEvenUnderConcurrencyAndRetries` — own
  `happypaws-cons-2026-001` and `HappyPaws-Cons-2026-003`; four parallel creates get 002/004/005/006, a retry
  returns its original draft, no case-insensitive duplicates.

R2:
- `R2_UnreadableFilesAreRefusedAndLeaveNoEvidence` ×10 — header-only PDF (the reviewer's exact bytes),
  truncated PDF, truncated PDF with a forged `%%EOF`, zero-page PDF, corrupt PNG, truncated PNG,
  truncated JPEG, PNG over the size limit, JPEG declared as PNG, PDF named as JPEG. Each: 400, no signed
  row, status stays "Issued for Signature", no match, no upload audit, issued PDF hash unchanged, and the
  terms remain editable.
- `R2_GenuinePdfsScansAndImagesAreAcceptedAndKeptExactly` — text PDF, image-only scanned PDF, PNG, JPEG
  and the real generated agreement PDF all accepted; each stored byte-for-byte; issued PDF unchanged.
- Existing signed-copy, permission and IDOR tests now run with a genuine PDF and still pass
  (`SignedCopyIsLinkedToItsIssueAndValidatedByContent`, `SignedTermsCanOnlyChangeThroughANewVersion`,
  `DocumentFilesNeedAgreementPermissionAndCannotBeReachedThroughAnotherAgreement`, the HTTP 403/404 test,
  `GeneratedReferencesFlowIntoIssuedAndSignedDocuments`, migrated-schema trigger tests).

## Results (each is one run against the final code)

| Run | Result | Log |
| --- | --- | --- |
| R1/R2 + agreement document/reference/default-terms relational tests | 51 passed, 0 failed, 0 skipped | (console) |
| Focused API: `Consignment` \| `AdminCapabilityCoverage` \| `BusinessIdentity` | **241 passed, 0 failed, 0 skipped** (18 m 46 s) | `focused-api.log`, `focused-api.trx` |
| **Full API suite, single clean run** | **2,982 passed, 0 failed, 0 skipped** (22 m 16 s) | `full-api.log`, `full-api.trx` |
| Full web suite | 4,447 passed, 7 skipped (381 files passed, 1 skipped) | `web-tests.log` |
| Web typecheck / lint | Pass / Pass | `typecheck.log`, `lint.log` |
| Production web build (Smart Tags, tag orders, ordering on; Community off) | Pass; release and SEO checks verified | `web-build.log` |

The focused and full API suites ran back-to-back with nothing else running; web checks ran afterwards, so
no SQL Server contention. The full-suite total (2,982) is the previous 2,966 plus the 16 new cases.

## SQL / migration consistency

- `dotnet ef migrations has-pending-model-changes`: "No changes have been made to the model since the last migration."
- A fresh `dotnet ef migrations script --idempotent` is byte-identical to the root `migration.sql`:
  SHA-256 `d69a940091afa2b4638cb365eb9e4467bfec7a936d1f9368465dd35af29ba899` — the same hash the
  independent review recorded. This remediation adds no migration.

## Remaining risks

- **Encrypted PDFs are rejected but not covered by an automated test** (no encryption tool in the test
  stack). Some scanners produce owner-password PDFs with no user password; those are now refused with a
  message asking for an unprotected copy or a scan image.
- **PDF parsing time limit**: a parse that exceeds 15 s is refused, but PdfPig can't be cancelled, so the
  background parse finishes on its own thread. The 8 MB cap bounds the work.
- **Lenient PDF parsing** is PdfPig's default; a damaged but recoverable PDF whose every page still opens
  is accepted. That is a deliberate choice for real-world scans.
- **Image memory**: a 40-megapixel image decodes to about 160 MB for the duration of the check.
- **Collation**: matching is now collation-independent in code; the database's unique `(Reference, Version)`
  index and the 51056 duplicate preflight still follow the column collation (case-insensitive by default),
  which is consistent with these rules.
