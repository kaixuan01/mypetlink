# Phase 1A final remediation (N1–N4)

Date: 19 October 2026 · Review: `phase1a-final-independent-rereview.md` (Codex outputs, 2026-10-18) · Earlier remediation: `../remediation/report.md`

**Local only.** Nothing was staged, committed, pushed or deployed, and no Production system was accessed. SQL work used only disposable LocalDB databases, all of which were dropped. No Phase 1B, settlement or unrelated work was touched.

## 1. Remediation matrix

| Finding | Result | Proven by (failed before the fix → passes after) |
|---|---|---|
| **N1 (P1)** price editor bypasses Team approval | **PASS** | `N1TheReviewedDelimiterCollisionIsStillAnEditAndBlocksTeamApproval`: the exact review payload, RM39.90 → RM1.00. Also `N1AReportEditHiddenInDelimitedTextIsStillAnEdit` (the same weakness in report comparison and retries). |
| **N2** contributor history editable by raw SQL | **PASS** | `N2ContributorHistoryRefusesRawSqlEditsOnTheMigratedSchema` |
| **N3** unknown historical editors treated as independent | **PASS** | `N3UnknownEditorsFromTheOriginalPhase1ASchemaAreNotTreatedAsIndependent` (upgrade from the original Phase 1A schema) |
| **N4** renewal doesn't split an open-ended predecessor's period | **PASS** | `N4ARenewalSplitsReportsAtTheSuccessorsStart` ×2 (open-ended and early-revised fixed end); `N4ARevisionCantStartInsideAPeriodAlreadyReportedUnderTheEarlierVersion` |

Pre-fix evidence: `logs/pre-fix-regression.log`. The filter selected 22 tests and all **7** targeted tests failed:
- N1 collision: no contributor row.
- N1 report: the edit was silently dropped.
- N2: no SQL error on UPDATE.
- N3: approval went through as independent.
- N4: the v1 period ended 16 Aug instead of 10 Aug (both cases), and the conflicting revision was approved.

The 15 that passed are no-op/edge-case guards plus older tests matched by the name filter.

## 2. Root cause and solution

**N1.** Whether a save changed anything was decided by comparing the fields joined with `|`. Text in the name or evidence can shift the joined boundaries, so a different price compared equal. The editor was then never recorded and could approve their own RM1.00 price as Independent (Team). The same joined-text comparison guarded sales-report edits and retry matching (F8), with the same weakness: there, a changed submission could be skipped as a no-op or matched as a replay.

*Solution:* both comparisons now use **typed values, field by field, on what is stored**.
- **Price terms:** a record of variant, kind, name, amount (decimal equality, so 39.9 equals 39.90), validity dates (instant equality, whatever the offset), and acceptance evidence (exact string, with null and empty treated as the same stored value).
- **Reports:** typed header and line records, normalised the way they are stored, with the lines put in a total order and compared element by element.

No escaping is involved. The contributor row and the change are written in the same transaction.

**N2.** Contributor rows were immutable only through EF.
*Solution:* a SQL trigger `TR_ConsignmentRecordContributors_AppendOnly` (AFTER UPDATE, DELETE; THROW 51046), the same pattern as the ledger (51043) and the review journal. Inserts are unaffected; the EF guard stays.

**N3.** The earlier backfill recorded known creators and recorders, but approval and verification read "nobody else is listed" as "nobody else edited it".
*Solution:* an explicit **`ContributorHistoryComplete`** flag on price terms and reports, following the agreement pattern (`DraftContributorHistoryComplete`).
- **Marking.** The new column defaults to 0, so every record that already exists when the migration runs is marked unknown. The application writes 1 for every record it creates, so clean installs and Solo-schema upgrades (no Phase 1A records) get no restriction.
- **Price approval.** Unknown history is never independence. In Team Mode it is refused for everyone with `403 contributor_history_incomplete` and a recovery message. In Solo Mode it is a self-review, allowed only for the named founder with the record's own evidence.
- **Report verification.** The same rule applies across a report's version chain: any unknown version in it fails closed, so an ordinary correction of an unknown report can't launder it.
- **Recovery, history preserved.**
  - *Price:* withdraw the draft and add the price again. Whoever adds it is its known maker, and someone else approves.
  - *Report:* dispute it if it's only recorded, then **Re-enter from evidence** (`POST /sales-reports/{id}/re-enter`, verify capability, reason of 10+ characters, audited on both versions). This creates a new, **empty** version that starts its contributor history afresh (`StartsFreshContributorHistory`). Earlier versions' unknown editors no longer bear on it because its figures are entered anew from the partner's evidence.
  - The re-enterer and recorder are its makers, and someone else verifies it. Verification still reverses the replaced verified version exactly once. Nothing historical is deleted, rewritten or invented.

**N4.** A report period was cut only at the agreement version's own signed `EffectiveTo`. Approving a successor closed the old version but didn't end its reporting.
*Solution:* `ReportingEndAsync` derives the end from the approved version chain: the version's own end, or the earliest later approved version's `EffectiveFrom` (same merchant and reference), whichever comes first. Report creation and assessment both use it, so v1 and v2 reports meet exactly at the successor's start. Signed terms are not rewritten.

If a revision would start inside a period already reported under an earlier version (any non-voided, non-superseded report), approval is refused with a clear 409. The message gives the first date it may start, or says to correct those reports first, rather than shortening history. The wizard's period label uses the same rule (`reportingWindow`).

## 3. Files and migrations changed (this round)

API
- `apps/api/MyPetLink.Api/Services/ConsignmentService.Sales.cs`:
  - typed comparison (N1);
  - unknown-history gate, contributor segment and re-entry (N3);
  - reporting end (N4).
- `apps/api/MyPetLink.Api/Services/ConsignmentService.cs`: a revision can't start inside already-reported dates (N4).
- `apps/api/MyPetLink.Api/Entities/ConsignmentSalesEntities.cs`: `ContributorHistoryComplete`, `StartsFreshContributorHistory`.
- `apps/api/MyPetLink.Api/DTOs/ConsignmentSalesDtos.cs`: history flags on the price and report responses.
- `apps/api/MyPetLink.Api/Controllers/Admin/AdminConsignmentController.cs`: `POST sales-reports/{id}/re-enter` (verify capability).
- **New migration** `apps/api/MyPetLink.Api/Migrations/20261019010452_ProtectConsignmentContributorHistory.cs` (+ `.Designer.cs`), additive. The earlier migrations were not rewritten.
- `apps/api/MyPetLink.Api/Migrations/MyPetLinkDbContextModelSnapshot.cs`.
- `migration.sql` (root, regenerated: 57 lines added, 0 removed, BOM kept).

Tests
- **New** `apps/api/MyPetLink.Api.Tests/Relational/ConsignmentSalesFinalRemediationRelationalTests.cs`.
- `…/Relational/ConsignmentSalesMigrationRelationalTests.cs`: the rollback test now expects the newest guard (51047) first.
- `…/Relational/ConsignmentRelationalTests.cs`: fixture seeding extracted into `SeedConsignment`, so it can seed any migration target.
- Web: `ConsignmentSalesReports.test.tsx`, `consignment/model.test.ts`.

Web
- `apps/web/src/services/adminConsignmentService.ts`
- `consignment/model.ts`: `reportingWindow`.
- `consignment/SalesReportWizard.tsx`: renewal-aware period; empty re-entry.
- `consignment/SalesReportsView.tsx`: notice and "Re-enter from evidence".
- `consignment/PriceTermsCard.tsx`: unknown-history note.

Docs
- `docs/architecture/consignment-mvp.md`, `docs/deployment/consignment-mvp-rollout.md`.

Artifacts
- `artifacts/consignment-sales-reporting/final-remediation/`: this report, `e2e-final.mjs`, `screenshots/`, `logs/`.

## 4. New tests

`ConsignmentSalesFinalRemediationRelationalTests.cs`: 14 methods, 23 cases, on SQL Server.

| Area | Tests |
|---|---|
| N1 | the exact collision (editor recorded; editor and creator 403; an outsider approves as Independent) |
| | 9 field-by-field cases: `|` shifting, U+001E, U+0000 and U+001F, null vs empty evidence, trimmed text, 39.9 vs 39.90, a real 1-cent change, a real date change, the same instant in another offset |
| | three editors all excluded, then Solo: no evidence and wrong evidence refused, correct evidence gives Self-reviewed (Solo) |
| | report delimiter collision: the edit is saved and recorded, and a retry of the original is refused `submission_changed` |
| N2 | migrated schema: raw UPDATE and DELETE give 51046; the row is kept; EF delete is refused; the editor gets 403 and an outsider approves |
| | rollback guard 51047 with history |
| N3 | upgrade from the original Phase 1A schema with an unknown RM1.00 editor: everyone gets 403, verification gets 403, nothing is rewritten |
| | Solo-schema upgrade with no records: unrestricted |
| | new records are complete |
| | price recovery |
| | Solo under unknown history (price and report) |
| | report recovery: an ordinary correction is still refused; re-entry needs a reason; the makers get 403 and an outsider verifies; one reversal; both old versions Superseded; a complete-history report can't be re-entered |
| N4 | open-ended v1 and early-revised fixed-end v1, each superseded by v2 on 10 Aug |
| | reports meet at 10 Aug with no 409 |
| | a v1 report after the boundary is flagged |
| | refund of the v1 sale under v2 at v1's price |
| | balances (6/0/4/10) |
| | history keeps each version and price |
| | a revision inside reported dates gets 409 naming 16 Aug; nothing changes; starting on 16 Aug works |

Web: 2 UI tests (re-entry with reason opening an empty draft, with no Correct button; the unknown-history price note) and 2 `reportingWindow` unit tests.

## 5. SQL migration validation (disposable LocalDB)

| Check | Result |
|---|---|
| Model and snapshot parity | no pending model changes |
| Fresh install, then replay | exit 0 / exit 0; 78 migrations; trigger present |
| Upgrade from the committed head (Solo, 75 migrations), then replay | exit 0 / exit 0; 78 migrations |
| Upgrade from the **original Phase 1A** root script, then replay | exit 0 / exit 0; 78 migrations |
| Upgrade from the **first remediation** root script, then replay | exit 0 / exit 0; 78 migrations |
| `Msg` errors across all runs | 0 |
| Contributor append-only (raw SQL) | UPDATE and DELETE give 51046 |
| Existing records after upgrade | marked unknown; nothing deleted or invented (N3 upgrade test) |
| Rollback | empty Down and Up round-trip passes (existing test); with history, **51047**, and further back is still blocked |
| Ledger trigger, unique sources and reversals, rowversion, long references | unchanged and passing (migrated-schema tests) |

Logs: `logs/sqlcmd-rehearsal.log`, `logs/post-fix-run1.log`.

## 6. Full test results

Initial runs are reported as they came out. The one supplementary rerun is labelled as such.

| Run | Result |
|---|---|
| N1–N4 and migration tests after the fix | **28 / 28** passed, first run |
| All Consignment relational, HTTP and capability-coverage tests (F1–F9, N1–N4, migrated schema, authorization) | **125 / 125** passed, first run |
| **Full API suite, initial run** | **2,900 passed, 1 failed** (`SmartTagRateLimitingTests.PublicTagRoute_AboveLimitReturnsStandard429WithRetryAfter`: expected 429, got 200, after 9 s) |
| Supplementary rerun of that one class, not counted as a pass of the initial run | 8 / 8 in 4 s |
| Full web suite | **4,401 passed**, 7 skipped, 0 failed |
| ESLint, TypeScript, production build (all four release flags) | clean / clean / succeeds |
| Browser, production static export + real API + disposable database: earlier rehearsal rerun as regression (F4, F8, F9, items 1 and 3, mobile) | 7 / 7, no page errors |
| Browser: N3 recovery (notice, re-entry with reason, empty draft, four lines, Solo self-review, original Superseded, stock 33/28/26 balanced) | 3 / 3, no page errors |

**The full-suite failure is the rate-limit test diagnosed earlier.** The test factory uses a 5-second fixed window on the real clock, and on a cold, loaded host the three requests can straddle a window boundary. This round it hit a different test in the same class than last time. It does not touch Consignment code: the factory runs on InMemory against the public tag route. It is not fixed here; that is outside Phase 1A.

Re-checked behaviour that must stay unchanged, all covered by the 125 consignment tests and passing:
- ledger balances and tie-out;
- refund capacity by branch, SKU, price and origin period;
- handover identity through correction, tracking start and reversal;
- deferred posting atomicity;
- retry behaviour;
- permissions, including revocation.

## 7. Remaining limitations

- **Fail-closed marking is broad.** Every price term and report that exists when the migration runs is marked unknown, including any created after the first remediation in a local or staging database, where history was in fact tracked. That restricts more than strictly necessary, but never less. Production has no Phase 1A records (never deployed), so it is unaffected.
- **Re-entry starts from Verified or Disputed only.** A merely Recorded report with unknown history must be disputed first.
- **Wizard title.** A re-entered report opens in the wizard titled "Correct … (version N)", reusing the correction wording.
- **Approval-conflict scope.** The revision check counts any non-voided, non-superseded earlier-version report, including drafts and recorded ones; those must be corrected, discarded or disputed and replaced first. A revision with no effective start isn't checked, but such a version can't verify reports anyway.
- **The UI's period label** reads successor versions from the loaded summary page (latest 100 agreements); the server rule is authoritative.
- **Append-only limits.** It blocks UPDATE and DELETE. A database owner could still disable the trigger or drop the table, the same boundary as the ledger and journal. Production permissions were not inspected.
- **Rate-limit test.** The timing-sensitive test remains unstable (see §6).
- **Cross-branch refunds** remain unsupported, as decided.

## 8. Release isolation

The release must still ship the original Phase 1A migration, the first corrective migration (`20261018164233_…`) and this one (`20261019010452_…`) together with their API, web and DTO changes. The web now uses the re-enter endpoint and the history flags. Unrelated work in the tree (Marketing Demo, `Program.cs`, development configuration, Community test edit, marketing documents) was not touched.

## 9. Recommendation

**Ready for the final independent review.** N1–N4 are fixed at the cause, each proven by tests that failed against the vulnerable code, with no regression in F1–F9. One honest caveat: the initial full API run had a single unrelated rate-limit timing failure. Deployment still needs a Phase 1A-only release diff and a separately authorised staging rehearsal.
