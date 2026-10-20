# Phase 1B final independent GO / NO-GO verification

19 October 2026 · C:\Project\MyPetLink · uncommitted working tree, HEAD 2ff3b79

**GO — Phase 1B accepted; Production Release Preparation may begin.**

R1 and R2 pass independent intended-behavior verification. No remaining P1/P2 blocker was reproduced. This accepts Phase 1B; the production release package and deployment have not been performed or approved by this review.

The scope is the user's final targeted R1/R2 request, with critical regression checks. The accepted Phase 1A gate and previously accepted Phase 1B findings were preserved. No application source or migration was edited. Only review evidence was written under this artifact directory. No staging, commit, push, deployment, Production access, real inventory changes, financial settlement or Phase 2 work occurred.

## Decision matrix

| Area | Result | Independent evidence |
|---|---|---|
| R1 historical surplus and retrospective close | PASS | Exact FG11 chronology, cutoff reconstruction, 409 refusal with full stored-state equality, subsequent valid count; SQL-backed FG11 and independently rerun six R1 regressions |
| R2 sold-out late-report verification | PASS | Actual fresh server assessments; bad links refused without mutation; full allocation succeeds; three independent UI cases use those responses |
| Ledger, custody, obligations, correction chains | PASS | 15 independent SQL-backed intended-behavior probes and 187 existing focused API/capability tests |
| Team/Solo and capability separation | PASS | Focused HTTP/relational regressions plus independent contributor/evidence probes |
| SQL/model/migration integrity | PASS | No pending model changes; unchanged root script/migrations; regenerated script parity; independent SQL guards/concurrency/Down regressions |
| Critical web regression | PASS | 100 tests across six existing focused files, plus three new independent UI cases; app and functions typechecks pass |
| Release isolation | NEEDS ATTENTION at packaging | Matching Phase 1A/1B API, web and all five migrations must form the release; unrelated uncommitted work remains excluded |

## Findings and exact source references

| Prior severity / finding | Final status | Relevant implementation |
|---|---|---|
| P1 R1: an older count silently erased surplus reopened later | Resolved | [cutoff reconstruction](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:293), [shared preview issue](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:311), [approval refusal before review/posting](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs:490) |
| P2 R2: Verify was disabled before a reviewer could enter the required links | Resolved | [server classification](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Sales.cs:675), [response classification](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.Sales.cs:762), [structural issue filtering](C:/Project/MyPetLink/apps/web/src/components/admin/merchantSales/consignment/SalesReportsView.tsx:223), [Verify gating](C:/Project/MyPetLink/apps/web/src/components/admin/merchantSales/consignment/SalesReportsView.tsx:373) |
| R2: preserve reviewer inputs on refusal | Resolved | [minimum quantity](C:/Project/MyPetLink/apps/web/src/components/admin/merchantSales/consignment/model.ts:668), [Verify opts into retention](C:/Project/MyPetLink/apps/web/src/components/admin/merchantSales/consignment/SalesReportsView.tsx:257), [close only after success](C:/Project/MyPetLink/apps/web/src/components/admin/merchantSales/consignment/useConsignmentActions.tsx:93) |

**Open P1/P2 findings: none.** No new independently reproduced business-integrity or security defect remains from this targeted review.

## R1: exact FG11 chronology

The independent scratch probe recreates the chronology through real services on a disposable database built with the migrations and enabled triggers:

1. Receive 10, verify 3 sales: verified Sellable 7, Sold 3. The 31 August physical count of 9 records two unresolved extras.
2. A late sealed refund explains one extra. The 15 and 30 September counts of 8 close. Current Sellable is 8, Sold 2, open surplus zero.
3. On 20 October correct the refund to a refund with no physical restock. Current Sellable returns to 7, Sold 3; one extra reopens.
4. On 21 October enter the actual 15 October physical count of 8. The expectation correctly reconstructs **8 verified at that cutoff + 0 extras then open = 8**, rather than mixing historical books with today's reopened extra.
5. Preview and recorded detail both identify the later change. Approval returns **409 `historical_count_incompatible`**.
6. The refusal changes no stored column in the Consignment, SmartTag, Inventory or AuditLog tables captured by the probe, including rowversions. Reports, discrepancies, resolutions, review events, ledger, CountedAt, cutoff and custody remain unchanged. The recorded count remains Recorded.
7. Discard it, then count 8 on 31 October and close on 1 November: **7 verified + 1 unresolved extra = expected 8**. No new surplus, no disappearance settlement, and the one outstanding extra is carried once. All previously frozen lines retain their values.

Evidence: [refused historical close](C:/Project/MyPetLink/artifacts/consignment-phase1b-go-no-go/historical-close-refused.json), [next valid close](C:/Project/MyPetLink/artifacts/consignment-phase1b-go-no-go/historical-next-valid-count.json).

The independently rerun R1 tests also cover partial settlement before/after cutoff, an earlier count approved late, correction of a correction, post-preview reopening and shortage-only behavior. Independent FG13 races correction against approval with separate contexts: no reopened surplus is consumed; a refused attempt cannot later bypass the guard. Both operations share the [transaction lock](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Services/ConsignmentService.cs:369).

The exclusion of NoLongerPresent settlements is consistent with approval's strictly increasing cutoff order: these settlements arise from an earlier count, even when that count is approved administratively late. Other later surplus settlements, links and withdrawals block the retrospective close. Shortages are not silently settled by a subsequent count.

## R2: exact FG10 API and UI

The fresh SQL-backed reproduction reaches Sellable 0 / Investigation 7 / Sold 3 after the count of zero. Its late report of seven sales returns one issue, explicitly marked link-resolvable, with RequiredLinks 7 and an eligible shortage of 7.

Independent API assertions reject missing links, quantity 6, quantity 8, an unknown discrepancy, duplicate discrepancy links and reuse of the count's own evidence. Each refusal preserves the captured stored state. A full allocation of seven with separate dated-sale evidence verifies to:

**Sellable 0 / Unsellable 0 / Investigation 0 / Sold 10 / Lost 0 / custody 10; tie-out balanced.**

The shortage resolves, individual units remain unchanged, no financial records are created, and retried verification conflicts without another posting.

The independent UI tests consume the freshly generated [actual assessment](C:/Project/MyPetLink/artifacts/consignment-phase1b-go-no-go/sold-out-report.json), [actual refusal](C:/Project/MyPetLink/artifacts/consignment-phase1b-go-no-go/invalid-link-error.json) and [actual verified response](C:/Project/MyPetLink/artifacts/consignment-phase1b-go-no-go/sold-out-verified.json). They establish that:

- Verify opens, showing seven eligible missing units and the required seven links.
- No link and a six-unit link fail locally without sending verification; quantity, evidence and explanation remain entered.
- The actual server refusal for count-sheet evidence leaves the dialog and all three inputs intact.
- Correcting the evidence submits the full allocation and shows Verified after success.
- Actual server responses combining a linkable shortage with an unapproved price, and a sale of eight against only seven eligible missing units, keep Verify disabled. The server independently refuses both even with a seven-unit allocation.

These UI checks exercise production components with mocked transport carrying real service responses; they are not a newly executed end-to-end browser walkthrough.

## Critical regressions and invariant assessment

The independent existing-suite run completed **187/187, no failures or skips**, including the six R1 and three R2 regressions, Phase 1A protections and Phase 1B remediation cases. The additional scratch run completed **15/15 intended-behavior cases**.

Preserved protections include F1 source/reversal and handover identity; F2/F7 original-period refund capacity; F3/N1 substantive contributor history and independent price/report review; F4 exclusive Malaysia boundary; F5 grouped posting and refusal atomicity; F6/N4 renewal splits and original prices; F8 changed retries; N2 append-only contributor history and SQL guards; N3 unknown-history fail-closed behavior. F9 loading/error-versus-empty behavior is covered by the independent focused web run. B1–B8 remain green, including correction compensation, eligible-count attribution, forbidden bookkeeping returns, related-origin contributors, count-time evidence, closed-line immutability and fresh resolution evidence.

Across independent probe checkpoints: all five buckets remain nonnegative; Investigation equals outstanding Shortage plus UnsellableShortage obligations; custody equals the five buckets. Surplus remains outside verified Sellable. The example of seven book units and nine counted packages is **seven sale-capacity units plus two unresolved notes**, not nine verified units. No tags are invented or selected by aggregate reconciliation, and carry forward creates no reservation or custody release. Earlier frozen counts are not rewritten by late corrections.

The three capabilities remain separate at [the controller](C:/Project/MyPetLink/apps/api/MyPetLink.Api/Controllers/Admin/AdminConsignmentController.cs:217). Team review excludes substantive contributors; Solo continues to require the nominated founder, live capability, confirmation, reason and evidence. Independent FG06/FG07 also recheck both-origin contributors, exact review subjects, case/space evidence reuse and refusal of ReturnedToMyPetLink as an aggregate resolution. Actual returns continue through per-unit custody actions.

No critical R1/R2 test gap remains for acceptance. The independent full stored-state and mixed-response probes are retained in this artifact directory; they supplement the permanent project regressions.

## SQL and schema

No migration was needed for R1/R2. Independently checked:

- EF reports no pending model changes.
- Root migration.sql is byte-unchanged from the previous independent gate: SHA256 `43F2392BFCB8E1D9181AA04FCE113B9063A39ECE4C6691A9D4B152C55E7DFF4E`.
- A fresh idempotent regeneration matches root after BOM/newline normalization.
- All five Phase 1A/1B migration/designer pairs, and earlier custody/Solo migration files, are unchanged from the previously reviewed tree. Older isolated-copy newline differences normalize identically; no migration logic changed.
- The independently rerun focused suite exercises real SQL rowversions, source/reversal uniqueness, append-only history, recorded/closed-line protections, conflicting writes and guarded rollback.

The previous gate's independent fresh installation, Phase 1A-to-current upgrade, Phase 1B-to-current upgrade and root-script replay checks remain applicable because the schema/script is unchanged. Those manual script paths were not repeated in this targeted round. Current migrated-schema probes do apply the actual migration chain to disposable databases. No trigger was disabled and no ledger timestamp was backdated through SQL in these probes. Fixtures create/drop uniquely named local MyPetLinkTest databases; Production was not accessed.

Evidence: [schema integrity](C:/Project/MyPetLink/artifacts/consignment-phase1b-go-no-go/schema-integrity.json), [prior independent gate](C:/Project/MyPetLink/artifacts/consignment-phase1b-final-gate/report.md).

## Test evidence and provenance

| Evidence | Result | Provenance |
|---|---|---|
| Focused API/SQL/capability run | 187 passed, 0 failed, 0 skipped; 16m10s | Independently executed this round; focused-api.trx |
| Independent SQL-backed FG01–FG13, with theory cases | 15 passed, 0 failed, 0 skipped | Independently executed; independent-probes.trx |
| Existing focused web, six files | 100 passed | Independently executed this round |
| Fresh-response UI probes | 3 passed | Independently executed; independent-ui.json |
| App/functions typechecks | Pass | Independently executed this round |
| Full API suite | 2,942 passed, 0 failed, 0 skipped | Supplied TRX independently parsed: exactly 2,942 result records, all Passed, including 187 focused cases; one run, 16:22–16:42 Malaysia time |
| Full web | 4,423 passed, 7 skipped | Inspected supplied log; not independently repeated in full |
| Browser workflows | Two PASS workflows; no page errors | Inspected supplied script/log; not independently rerun in a browser |

The supplied browser script covers reachable linking, refused evidence with entries kept, successful full allocation and historical-close refusal. Its history is built by a fixed-clock service harness. Our independent temporal tests likewise use services and controlled clocks with enabled migration triggers; they do not depend on the earlier SQL date-setup workaround.

Old diagnostic assertions stopping on fixed behavior are **not** counted as positive verification. The independent FG10/FG11 here assert the intended final behavior end to end. The initial independent UI run passed the linking workflow but its two separate-response cases used the wrong report ID in the URL; correcting only that scratch setup produced one complete 3/3 run. Both initial and final UI result files are retained. No application change was needed.

## Accepted operational limits and release preparation

- A later surplus settlement/link/reopening blocks a historical close. Discard that count and perform a genuine new count on the next permitted date. This conservative rule can delay closing; it preserves obligations instead of guessing historical attribution.
- Count after final shop activity. A next-morning exception requires actual CountedAt and a truthful no-movement confirmation. Unreported movement cannot be disproved by aggregate reporting; later discoveries need genuine-period reporting and evidenced reconciliation, never fabricated count times.
- Evidence references require human judgment; a different string does not establish authenticity. Only Verify opts into preserving the shared dialog after a server refusal; other dialogs retain their accepted behavior. Earlier history pagination/mobile horizontal-scroll limitations remain as previously accepted.
- Package matching API/services, entities/DTOs, data model/snapshot, web service/types/components and the five migrations together: `20261018125029_AddConsignmentSalesReportingLedger`, `20261018164233_HardenConsignmentSalesReporting`, `20261019010452_ProtectConsignmentContributorHistory`, `20261019025050_AddConsignmentStocktakeAndCarryForward`, `20261019060824_HardenConsignmentStocktakeReconciliation`. Retain earlier custody/Solo base migrations and the root script.
- Use the previous gate's release-dependency manifest as the packaging starting point, including this round's changed services/DTOs/web. Exclude unrelated Marketing Demo, Community tests, marketing content, development settings, launch configuration and unrelated Program.cs changes. The combined uncommitted tree is not the release package. Validate the isolated package during release preparation.
- Additive schema success does not establish application rollback safety. Retain history when rolling back business operation; do not run the older pre-hardening API against active Phase 1B workflows. Down guards operate per migration and are not an atomic rollback of the chain.

The source-preservation hash check found **zero changes among 1,775 checked project files**. Changes since the previous gate are the ten declared R1/R2 implementation/test edits and four new regression/fixture files; unrelated reviewed source remains unchanged. See [source preservation](C:/Project/MyPetLink/artifacts/consignment-phase1b-go-no-go/source-preservation.json) and [test summary](C:/Project/MyPetLink/artifacts/consignment-phase1b-go-no-go/independent-test-summary.json).

**Final decision: GO — Phase 1B accepted; Production Release Preparation may begin.** No further broad feature audit is requested. Stop here; deployment, settlement and Phase 2 remain outside this review.
