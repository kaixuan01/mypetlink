# Phase 1B Final Gate Remediation — R1 and R2

19 October 2026 · uncommitted working tree on `main` (HEAD 2ff3b79) · local only

**Recommendation: READY FOR THE TARGETED INDEPENDENT RELEASE-GATE REVIEW.** Both blockers are fixed with
focused regressions that failed on the unfixed code and pass now. One complete full API run passed
2,942/2,942 with nothing skipped, the full web suite passes, and both Codex reproductions behave as
intended. No migration was needed. This is not a release or deployment approval.

Scope: R1 and R2 from `artifacts/consignment-phase1b-final-gate/report.md` only. Phase 1A (F1–F9, N1–N4)
and the B1–B8 remediation are preserved. No settlement, invoices, commission, payments or Phase 2; no
Production; nothing staged, committed, pushed or deployed; unrelated work (Marketing Demo, `Program.cs`,
settings, marketing content, Community tests) untouched. `.claude/launch.json` was extended for QA and
restored byte-for-byte (sha256 prefix `cb74ac9a7853df4f`).

## 1. Matrix

| Finding | Result | Evidence |
|---|---|---|
| **R1 — P1** historical close erased surplus reopened after its cutoff | **PASS** | Codex FG11 now reports the 15 Oct books and notes on one basis (8 / 0 / 8, not 8 / 1 / 9). The close is refused with 409 `historical_count_incompatible`; balances, history, CountedAt and cutoff are unchanged; the reopened extra stays open; a later count closes cleanly. 6 focused tests (4 failed before the fix) |
| **R2 — P2** UI blocked the only route to a valid allocation | **PASS** | Codex FG10 real response: Verify opens the linking review; no link, a short link or a count-sheet link is refused while the dialog keeps its entries; the full link verifies to 0 / 0 / 10, balanced. Structural blockers still disable Verify. 3 API + 5 UI tests (the 3 FG10 UI tests failed before the fix); Codex's own UI probe, fed the fixed server's response, now fails at "Verify is disabled" |

## 2. Root causes and exact changes

### R1

**Cause.** `PlanStocktake` compared books **before the cutoff** with surplus notes **as they are today**, and the
close then settled those current notes as *NoLongerPresent*. A note reopened (or settled) after the count was
therefore treated as if it had existed (or not) when the shelf was counted.

**Fix (fail-closed, no new accounting engine)** — `apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs`:
- `SurplusAtCutoffAsync`: open surplus **as it stood at the count's cutoff**. This is the current open quantity,
  plus quantities settled at or after the cutoff, minus quantities reopened at or after it. It also returns every
  such change. "Not found" settlements are made by earlier counts (closes run in cutoff order), so they are
  never treated as later changes; an earlier count closed late doesn't block the next one.
- `HistoricalNoteIssuesAsync`: if any surplus note at the branch was settled, linked or reopened at or after
  the cutoff, the count can't be reconciled confidently. The message names the SKU and the date of the change,
  and tells the operator to discard the count and count again on the next count date.
- Previews and approval use the same rules. The expectation and stocktake detail use the at-cutoff notes and
  list the issue (Close month is disabled). Approval checks it first and refuses with
  **409 `historical_count_incompatible`** before any posting, review event or resolution. A change made after
  the reviewer's preview is caught at approval the same way.
- The plan uses the at-cutoff notes. When approval proceeds, those equal the open notes, so the existing
  oldest-first "not found" settlement only touches notes that were open at the cutoff and still are.
- Shortages need no guard: a close never settles a shortage, and books at the cutoff exclude later postings
  (tested).

### R2

**Cause.** The UI disabled Verify whenever the pre-allocation assessment had any issue, but the link controls
live inside the Verify dialog. A sold-out report whose only issue a link fixes could never be linked.

**Fix:**
- **Server** (`ConsignmentService.Sales.cs`, `ConsignmentService.Stocktake.cs`, DTOs):
  - The assessment now classifies an issue as **link-resolvable** only when it is the shelf shortfall of a
    late report whose closing count's open shortage fully covers it: shortfall ≤ min(capacity, open quantity).
  - The response gains `LinkResolvableIssues` and, per late SKU, `RequiredLinks`.
  - Every other issue (price, refund capacity, periods, unsellable, sold, a shortfall the count can't cover)
    stays structural.
  - The message now says "link at least N". A shortfall no link can cover says "check the delivery … or
    dispute". One B7 test assertion was updated to that honest wording.
  - Verification itself is unchanged and authoritative.
- **Web:**
  - `SalesReportsView.tsx`: Verify is disabled only by structural issues. Link-resolvable ones show as
    "Needs a link before it can be verified".
  - `LateReportLinks.tsx`: "Link at least N".
  - `model.ts` `lateLinkProblem`: refuses fewer than the required units in the dialog.
  - `useConsignmentActions.tsx`: `keepOpenOnError` keeps the dialog open with the entries and the server's
    reason when verification is refused.
  - `adminConsignmentService.ts`: types.
  - Team/Solo controls, warning acknowledgement and evidence rules are unchanged.

### Changed files (this round)

API:
- `apps/api/MyPetLink.Api/Services/ConsignmentService.Stocktake.cs`
- `apps/api/MyPetLink.Api/Services/ConsignmentService.Sales.cs`
- `apps/api/MyPetLink.Api/DTOs/ConsignmentStocktakeDtos.cs`
- `apps/api/MyPetLink.Api/DTOs/ConsignmentSalesDtos.cs`

Tests:
- New: `Relational/ConsignmentStocktakeFinalGateRelationalTests.cs` (6 R1 tests)
- New: `Relational/ConsignmentLateReportLinkingRelationalTests.cs` (3 R2 tests)
- `Relational/ConsignmentStocktakeRemediationRelationalTests.cs` (B7 wording)

Web:
- `apps/web/src/services/adminConsignmentService.ts`
- `.../consignment/SalesReportsView.tsx`, `LateReportLinks.tsx`, `useConsignmentActions.tsx`, `model.ts`
- New: `.../merchantSales/ConsignmentSoldOutLateReport.test.tsx` (5 tests)
- New: `.../merchantSales/__fixtures__/sold-out-late-report.json` — the fixed server's actual FG10 response,
  generated through the real service on a disposable database

Artifacts: this folder (`report.md`, `e2e-final-fixes.mjs`, `screenshots/`, `logs/`, `codex-rerun/`).

## 3. FG10 and FG11 before / after

| | Before (unfixed code) | After |
|---|---|---|
| FG11 (Codex probe) | Close settles the reopened extra: open surplus 1 → 0; frozen line 8 / 1 / 9, NoLongerPresent 1 (Codex evidence) | Probe stops at its first defect assertion: the 15 Oct expectation is 8 / 0 / 8. My equivalent regression: close refused 409, open surplus stays 1, ledger 7/0/0/3/0/10 balanced, history/frozen lines/units unchanged; 31 Oct count closes 7 verified + 1 extra = 8 |
| FG11-shaped regressions (`prefix-r1`) | 4 of 6 fail (the 2 that pass are non-overreach guards: earlier count closed late, shortage path) | 6 / 6 pass |
| FG10 API (Codex probe, wording assertion adapted from "link them" to "to that shortage") | Valid with link (Codex evidence) | Passes end to end: link 7 → Sellable 0 / Investigation 0 / Sold 10, balanced |
| FG10 UI (Codex probe on the new real response) | Verify disabled, no dialog (Codex evidence) | Probe fails at `button.disabled === true`: Verify is now enabled |
| FG10 UI regression (`prefix-r2-ui`) | 3 of 5 fail on the unfixed UI files (temporarily reverted, then restored with hashes verified) | 5 / 5 pass |
| Other Codex FG probes (FG01–FG09, twelfth case) | — | All pass on the fixed code |

## 4. Temporal stocktake safety

- A close compares the books at its cutoff with the notes as they stood at that same cutoff.
- It refuses (409) whenever a surplus obligation changed after the cutoff in a way that can't be placed in
  time: a settlement, link or reopening.
- It never settles, reduces or removes an obligation created or reopened after its count, and never touches
  shortages.
- The actual CountedAt and cutoff are kept; nothing is backdated.
- Frozen history is unchanged (SQL/EF immutability from B6). No Tag Code, Sellable stock or custody movement
  is created.
- Previews and approval share the rules. Stale fingerprints still give 409 `review_outdated`; a later
  obligation change gives 409 `historical_count_incompatible`.
- Ordinary closes stay closable, including:
  - partial resolutions before the next cutoff;
  - an earlier count closed late;
  - surplus links and withdrawals followed by a genuinely later count (FG03).
- **Cost of failing closed:** a count recorded before such a change has to be discarded and taken again on the
  next count date. This includes a surplus note resolved between the count day and the close.
- Custody tie-out is still checked, but it is never treated as proof of temporal correctness.

## 5. Ledger and discrepancy invariants

Every R1/R2 test asserts the nonnegative five-bucket ledger, custody = all five buckets, and Investigation =
open shortage obligations after each step. Where history must not change, they also compare ledger and
resolution counts, frozen lines and per-unit custody snapshots. Refused verifications and closes leave the
ledger entry count and report/stocktake status unchanged. Surplus stays outside verified Sellable.

## 6. Regression results

All database work used a **dedicated disposable LocalDB instance, `MyPetLinkGate`**, created for this round
and deleted afterwards. Relational fixtures used `MYPETLINK_TEST_SQLSERVER`; web-host tests used a disposable
`MyPetLinkGateApp` database migrated from the root script, via `ConnectionStrings__MyPetLinkDb`.
- Why: `MSSQLLocalDB` was again reported stopped while an orphaned instance process (started 3:41 PM, not
  mine) held it. Codex processes were active on this machine, so I left it alone.
- The first pre-fix R1 attempt ran against that stopped instance and failed 6/6 with "SQL Server must run"
  (environment). Its log was overwritten by the valid pre-fix run on `MyPetLinkGate`.

| Run | Result |
|---|---|
| Pre-fix R1 (`prefix-r1`) | 4 failed / 2 passed (intended) |
| Pre-fix R2 UI (`prefix-r2-ui.txt`) | 3 failed / 2 passed (intended) |
| Post-fix focused R1 + R2 + B7, first run (`postfix-focused-1`) | 9 / 10: `R2_StructuralIssues…` failed on test setup (a second report for an already-reported period, correctly refused by the service) |
| Rerun after splitting that case into its own test (`postfix-r2-structural-rerun`) | 0 / 1: a recorded report can't be discarded (test setup again) |
| `postfix-r2-rerun` (separate database per case) | 3 / 3 |
| Sold-out UI tests, first run | 4 / 5: my test built `ApiClientError` with the wrong argument order; fixed → 5 / 5 |
| **Full API suite, one complete run** (`full-api-run1`) | **2,942 passed, 0 failed, 0 skipped** (20 m 44 s). Within it: Consignment + capability coverage 187/187 (R1 6, R2 3, B1–B8 13, F1–F8, N1–N4, Phase 1B, migrated-schema/rollback, concurrency, HTTP capability tests) |
| Codex FG probes on fixed code (`postfix-codex-fg-probes`) | 10 pass; FG11 and FG10 stop at their defect/wording assertions as described above |
| Web full suite (`web-full.txt`) | 4,423 passed, 7 skipped (pre-existing), 0 failed |
| Web typecheck (app + functions), lint | Pass / pass |
| Production build (four release flags on) | Pass |
| Browser walkthrough (`e2e-final-fixes.mjs`, headless Edge, production build, real API, disposable DB; history by a fixed-clock service harness, nothing backdated by SQL, no trigger disabled) | 2 / 2 first run, no page errors: FG10 reachable → short/invalid links refused with entries kept → full link verifies to 0 / 0 / 10; a 15 Oct count with a surplus settled on 17 Oct shows the reason, Close month disabled, API approval 409, extra still open (screenshots 01–04) |

Earlier results for concurrency/atomicity (simultaneous close vs verification, duplicate links/resolutions,
refused-write atomicity) are part of the 187 consignment tests in the same full run.

## 7. SQL migration status

No migration: R1 and R2 are service/UI-only. `has-pending-model-changes`: none. Root `migration.sql` is
byte-identical to the previous gate (sha256 `43f2392b…`) and to a fresh idempotent regeneration. The five
consignment migrations are unchanged. The previous gate's fresh/upgrade/replay/rollback verification stands.

## 8. Remaining operational limitations

- **Fail-closed close.** A surplus note settled, linked or reopened after a count's cutoff blocks that count.
  The operator discards it and counts again on the next count date. This is deliberate: there is no
  movement-adjusted historical reconciliation.
- **Unreported activity.** Unreported sales between a count and a next-morning count are still covered only
  by the documented confirmation (as in the previous gate).
- **Server refusals in other dialogs.** Only the Verify dialog keeps its entries open on a server refusal;
  other shared confirmation dialogs still close and show the error.
- **Evidence references** are judged by people. String inequality isn't proof of authenticity.
- **Release.** Ship the matching API, DTOs, web and all five consignment migrations together, excluding the
  unrelated uncommitted work. Downgrades stay per migration and non-atomic.

## 9. Recommendation

Ready for the targeted independent release-gate verification of R1 and R2. Stopped here.
