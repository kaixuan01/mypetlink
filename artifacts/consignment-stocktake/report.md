# Phase 1B — Consignment stocktake, period close and carry forward

Date: 19 October 2026 · Design: `artifacts/consignment-stocktake-audit/mvp-design-final.md` (§2, §3.5–3.8, §6–8, §10) · Foundation: the accepted Phase 1A SKU ledger.

**Local only.** Nothing was staged, committed, pushed or deployed, and no Production system was accessed. SQL work used only disposable LocalDB databases, which were dropped afterwards. No settlement, commission, invoice, e-Invoice, Phase 2 disposition, Partner Portal, Marketing Demo, Community or configuration work was touched.

## 1. What was built

**Workflow:** sales reports → monthly stocktake → reconciliation → approve the closing balance → carry forward.

1. **Record stocktake** (Stocktake & reconciliation → Record stocktake).
   - Choose the partner branch and a count date: the 15th or the last day of the month. Its cutoff, the next midnight in Malaysia time, is always a sales period boundary.
   - The server shows what the verified books expect per SKU.
   - Enter counted sellable (sealed) and unsellable (opened or damaged) packages, who counted, and the evidence.
   - A live preview shows exactly what closing will record.
   - Shop staff never scan Tag Codes, open packages or return stock.
2. **Close month** (`consignment.periods.close`), with Team or Solo review. One transaction does all of this:
   - freezes every line with the books at the cutoff;
   - posts each finding to the existing ledger exactly once;
   - opens discrepancies, and settles surplus notes the count no longer finds;
   - marks Summary-evidence report lines in the month as corroborated where the SKU matched.

   The closing position is next month's opening. Nothing is re-dispatched, reserved or rescanned, and no `ConsignmentUnit` changes.
3. **Resolve discrepancies** (`consignment.discrepancies.resolve`): outcome-specific, evidence and reason required, partial quantities allowed, full history kept.
4. **Late corrections** never touch a closed month. Any ledger posting dated before the branch's last close (a late report, receipt, return or handover) is dated now and flagged `IsPriorPeriodCorrection`.
   - **Late report:** settled against what the count found. Its sales first explain open shortages; restocks or reduced sales first settle open surplus notes.
   - This appears at verification as a warning that must be acknowledged.

**Approval algorithm, per SKU** (design §6.2):

| Count finds | Ledger posting (keyed to the stocktake line, once) | Discrepancy opened |
|---|---|---|
| Damaged/opened packages beyond the books | Sellable → Unsellable | UnsellableFound |
| Fewer unsellable than the books | Unsellable → Investigation | UnsellableShortage |
| Fewer sellable than books + open surplus | first uses up earlier surplus notes, then Sellable → Investigation | Shortage |
| More than the books | **none** (no stock invented, no new Tag Code) | Surplus (note) |

Gates before a month can close. It is refused unless:
- the count day has ended;
- every SKU with book stock or a surplus note is counted;
- there is no draft or recorded (unverified) sales report in the month;
- no report straddles the cutoff;
- all received units are tracked;
- the custody tie-out balances;
- there is no other open count for the branch.

All postings are checked together, and a negative final balance refuses the whole close.

**Resolution outcomes.** Each is bounded by the open quantity and its source bucket:
- **Shortage:** found, found damaged, or approved loss. A loss is allowed only once a later approved count confirms the stock is still missing.
- **Unsellable missing:** found, found sellable, or approved loss.
- **Damaged found:** confirmed damaged, recount sellable, or collected and returned.
- **Surplus:** recount error; an earlier shortage found (settles both, posting once); or an earlier approved loss found.

Nothing is ever classified as sold, returned or written off automatically. **Invariant:** the Investigation balance always equals the open shortage quantities.

**Independence.** Whoever counted, edited or recorded a stocktake is its contributor, using the Phase 1A contributor table.
- **Team Mode:** contributors can't close the count or resolve what it found.
- **Solo Mode:** only the named founder may, with the count's own evidence.
- Review subjects, actors and timestamps go to `ConsignmentReviewEvents` and the audit log.

## 2. Database changes (additive)

Migration `20261019025050_AddConsignmentStocktakeAndCarryForward`. Nothing is seeded or backfilled, and no earlier migration was changed.

| Object | Purpose |
|---|---|
| `ConsignmentStocktakes` | A count per branch; `RowVersion`. Unique indexes: one open count per branch (`UX_…_Open`), one approved close per cutoff (`UX_…_Cutoff`), and the submission key |
| `ConsignmentStocktakeLines` | Counted figures; book, findings and closing figures frozen at approval (`FrozenAt`); unique per stocktake and SKU |
| `ConsignmentStockDiscrepancies` | Kind, quantity, open quantity, status; `RowVersion`; check constraint keeps the open quantity and status consistent |
| `ConsignmentDiscrepancyResolutions` | Append-only outcome history, linked to its review event, late report or related shortage |
| `ConsignmentSalesReportLines.CorroboratedByStocktakeId` | Nullable; set at close for matching Summary-evidence lines |
| Contributor subject check | Now also allows `ConsignmentStocktake` |
| Triggers | `TR_ConsignmentStocktakes_Closed` (51050), `TR_ConsignmentStocktakeLines_Frozen` (51049), `TR_ConsignmentDiscrepancyResolutions_AppendOnly` (51048), declared to EF with `HasTrigger` |
| Down guard | THROW 51051 once any stocktake, discrepancy, resolution or stocktake contributor exists |

New ledger entry types (no new bucket, no second ledger): `StocktakeUnsellableFound`, `StocktakeUnsellableShortage`, `StocktakeShortage`, `DiscrepancyResolution`, `LateReportExplainsShortage`.

New capabilities: `consignment.stocktake.record`, `consignment.periods.close`, `consignment.discrepancies.resolve`.
- They are defined in the constants, the catalogue and the web mirror.
- No ordinary built-in role template gets them.
- Super Admin resolves them like every catalogue capability.

## 3. Worked example (the browser rehearsal, synthetic data)

100 tags received on 1 Sep (40 / 30 / 30). Sales were verified for 1–15 Sep (5 / 2 / 4) and 16–30 Sep (3 / 3 / 3).

| SKU | Books at 30 Sep | Counted (sellable / unsellable) | Close records | Opens October with |
|---|---|---|---|---|
| Pawsome LW | 32 sellable | 32 / 0 | Matches; Summary report lines corroborated | 32 |
| Pawsome SD | 25 | 24 / 0 | 1 Sellable → Investigation; Shortage 1 opened | 24 sellable, 1 investigating |
| My Boss LW | 23 | 22 / 1 | 1 Sellable → Unsellable; UnsellableFound 1 opened | 22 sellable, 1 unsellable |

Then two resolutions, each with evidence and Solo self-review:
- **Pawsome SD:** *found at the shop*, Investigation → Sellable 1, so 25.
- **My Boss LW:** *confirmed damaged*, no posting; it stays 1 unsellable.

Final position: 32 / 25 / 22 (+1 unsellable). The tie-out balances for all three SKUs, and every Tag Code's custody record is unchanged.

More examples from the relational tests:
- **Surplus:** count 9 with 7 in the books. A surplus note of 2 is opened and the books stay at 7. Next month the books expect 9, so the same surplus isn't raised twice. A count of 8 then shows "1 earlier extra not found", and the rest is closed as a recount error.
- **Late sale:** two unreported sales show up as a shortage of 2. The late 16–31 Aug report is then verified: the shelf stays at 5, the 2 leave Investigation as sold, and the shortage resolves as *Explained by a late report*. Both postings are dated now and flagged as prior-period corrections, and the frozen August lines are unchanged.
- **Late sealed refund:** a surplus of 1 is settled by the late restock, and the next count matches exactly.

## 4. Changed files

API
- New:
  - `Entities/ConsignmentStocktakeEntities.cs`
  - `Data/MyPetLinkDbContext.ConsignmentStocktake.cs`
  - `DTOs/ConsignmentStocktakeDtos.cs`
  - `Services/ConsignmentService.Stocktake.cs`
  - `Migrations/20261019025050_AddConsignmentStocktakeAndCarryForward.cs` (+ `.Designer.cs`)
- Modified:
  - `Services/ConsignmentService.Ledger.cs`: entry types, the closed-month rule and `LastClosedCutoffAsync`.
  - `Services/ConsignmentService.Sales.cs`: late-report settlement and warning; position adds open surplus, open discrepancies, last closed count date and count in progress.
  - `Entities/ConsignmentSalesEntities.cs`, `Data/MyPetLinkDbContext.ConsignmentSales.cs`, `Data/MyPetLinkDbContext.Consignment.cs`, `DTOs/ConsignmentSalesDtos.cs`.
  - `Controllers/Admin/AdminConsignmentController.cs`: `stocktakes`, `stocktakes/expected`, `stocktakes/{id}` (+ `record`, `void`, `approve`), `stocktakes.csv`, `discrepancies`, `discrepancies/{id}/resolve`.
  - `Auth/AdminCapabilities.cs`, `Auth/AdminCapabilityCatalog.cs`.
  - `Migrations/MyPetLinkDbContextModelSnapshot.cs`.
  - root `migration.sql`: 431 lines added, 0 removed.

API tests
- New: `Relational/ConsignmentStocktakeRelationalTests.cs`.
- Modified:
  - `ConsignmentSalesHttpTests.cs`: a new authorization test.
  - `Relational/MerchantDirectoryRelationalTests.cs`: drops and restores the two new foreign keys to `MerchantBranches`.
  - `Relational/ConsignmentSalesMigrationRelationalTests.cs` and `Relational/ConsignmentSalesFinalRemediationRelationalTests.cs`: rollback expectations now reflect non-atomic downgrades.
  - The same final-remediation file: in the N3 upgrade test, stock is received after upgrading, because today's ledger reads the stocktake table.

Web
- `src/lib/adminCapabilities.ts`, `src/services/adminConsignmentService.ts`.
- `ConsignmentPanel.tsx`: permissions, tab badge, `stocktake` link.
- `consignment/context.ts`, `useConsignmentLocation.ts`.
- `model.ts`: count dates, closing preview, labels, retry matching.
- `ReconciliationView.tsx`: renamed **Stocktake & reconciliation**; stock summary, stocktake section, stocktake CSV.
- `ConsignmentOverview.tsx`: two attention items.
- New: `StocktakeDialog.tsx`, `StocktakeView.tsx`.
- Tests: new `ConsignmentStocktake.test.tsx`; `ConsignmentPanel.test.tsx` and `ConsignmentSalesReports.test.tsx` updated for the renamed tab and new mocks; `consignment/model.test.ts`.

Docs
- `docs/architecture/consignment-mvp.md` (Phase 1B section), `docs/deployment/consignment-mvp-rollout.md` (migration, capabilities, monthly routine).

Artifacts
- `artifacts/consignment-stocktake/`: this report, `e2e-stocktake.mjs`, `screenshots/01…07`, `logs/`.

## 5. Tests

**New SQL Server relational tests** (`ConsignmentStocktakeRelationalTests.cs`, 14):
- matching count closes, freezes and carries forward (no posting, no unit or dispatch change, corroboration, review event);
- gates (count date, unverified report, one open count, day not ended);
- shortage with partial resolution and a loss only after a confirming count;
- surplus as a note that carries forward without double counting;
- damaged and missing unsellable stock;
- an earlier shortage found through a surplus;
- **duplicate and concurrent closes** (two contexts in parallel: one 200, one 409; one posting, one discrepancy, one review);
- replayed and changed submissions;
- **negative balance:** stock returned after the count date makes the close refuse, with everything unchanged;
- **late report** explains a shortage (prior-period flag, frozen month unchanged);
- **late sealed refund** settles a surplus;
- **agreement renewal** carries stock forward with no posting;
- **Team and Solo independence;**
- **migrated schema:**
  - raw UPDATE of a frozen line gives 51049, and DELETE is refused (547/51049);
  - approved stocktake UPDATE gives 51050;
  - resolution UPDATE and DELETE give 51048;
  - ledger DELETE gives 51043;
  - a duplicate approved cutoff gives 2601;
  - a stale token gives 409;
  - EF edits of a closed month are refused;
- **rollback:** empty Down/Up round-trip; 51051 with history.

**Authorization:**
- New HTTP test:
  - a viewer can read but gets 403 on every write and the CSV export;
  - `stocktake.record` alone can't close or resolve;
  - `periods.close` allows closing only;
  - `discrepancies.resolve` allows resolving;
  - revocation takes effect on the next request.
- `AdminCapabilityCoverageTests` pass with the new endpoints.

**Web (Vitest):** 6 new UI tests.
- Count entry against the books, with live preview, validation and a submission key.
- Close with acknowledged findings and next month's opening.
- Close refused while issues remain, or without permission.
- Closed month shown as frozen.
- Resolve with outcome, evidence and reason.
- No resolve or record actions without permission.

Plus model tests for count dates (including leap February) and the closing preview, which mirrors the server rule.

## 6. Migration validation (disposable LocalDB, `sqlcmd -I -b`, session settings)

| Path | Result |
|---|---|
| Fresh install, then replay | exit 0 / exit 0; 79 migrations; 3 stocktake triggers |
| Upgrade from the committed head (Solo, 75), then replay | exit 0 / exit 0; 79 |
| Upgrade from the final Phase 1A script (78), then replay | exit 0 / exit 0; 79 |
| `Msg` errors | 0 |
| EF model parity | no pending model changes |

Logs: `logs/sqlcmd-rehearsal.log`.

## 7. Regression results (reported as they ran)

| Run | Result |
|---|---|
| Phase 1B relational, first run | 12 / 15 passed |
| | **Two failures:** EF Core needs `HasTrigger` declared on tables with triggers it updates. Fixed in the model and migration. |
| | **One failure:** a test dated a follow-up count before the resolution it relied on. Fixed in the test. |
| Phase 1B relational, second run | 14 / 15 |
| | **One failure:** a frozen-line DELETE is blocked by its foreign key (547) before the trigger. The assertion now accepts either refusal. |
| | That test was then rerun on its own and passed. All 15 passed in the full consignment and full API runs below. |
| Full consignment set (F1–F9, N1–N4, migrated schema, 1B, HTTP), initial run | **137 / 140** |
| | **Rollback tests (2):** they expected a refused downgrade to leave the newest migration applied. It isn't atomic: the empty Phase 1B migration rolls back before 51047 refuses. The tests now assert that, and that re-applying restores the head. |
| | **N3 upgrade test (1):** it ran today's ledger against the original Phase 1A schema; reordered. |
| | Those 3 then passed 3/3. |
| **Full API suite, run 1** | **2,915 passed, 1 failed** — `MerchantDirectoryRelationalTests` fixture: it must drop and restore the two new foreign keys to `MerchantBranches`. Fixed; that class then passed 4/4. |
| **Full API suite, run 2** (after the fixture fix) | **2,916 / 2,916 passed** |
| Full web suite | **4,409 passed**, 7 skipped, 0 failed |
| ESLint, TypeScript, production build (all four release flags) | clean / clean / succeeds |
| Browser rehearsal (production static export, real API, disposable database, headless Edge) | **6 / 6, no page errors** (`logs/e2e-stocktake.log`) |
| | The first attempt stopped on test data: the seeded delivery was dated today, after the September sales and count. The fixed seed dates it 1 Sep. |
| | The second attempt stopped on a script selector ("Evidence" also matched a checkbox label); fixed in the script. |
| | The third attempt passed. |

**Known unrelated failure:** the timing-sensitive Smart Tag rate-limit test passed in both full runs this time. It remains unstable: a 5-second real-clock window that can be straddled on a slow host. A separate stabilisation task has been proposed. Neither full run is claimed as all-green beyond what it actually returned.

## 8. Outstanding risks and limits

- **Late reports are settled automatically.** A late report's effect is allocated against the oldest open discrepancies first; the design suggested a per-line choice. It is shown as a warning that must be acknowledged before verification, and each settlement is recorded as an *Explained by a late report* resolution linked to the report.
- **Count dates.** Only the 15th or the last day of a month is allowed. ~~A shop that counts on the morning of the 1st should record it as the previous month end.~~ **Withdrawn (B5, 19 Oct 2026):** this backdated the physical count. The actual count time is now recorded separately; a next-morning count needs a documented confirmation that nothing moved and no recorded movement in between, otherwise count again. See `artifacts/consignment-phase1b-remediation/report.md`.
- **"Collected and returned"** relies on the existing per-unit return having been made. It doesn't check that the return was taken from unsellable stock.
- **Corroboration** is stored on report lines but isn't yet shown in the sales report UI.
- **List limits.** The stocktake list shows the latest 20 and discrepancies up to 500. Older history is in the stocktake CSV.
- **Non-atomic downgrades** across migrations, as noted in the Phase 1A gate. Each guard protects its own history: check `__EFMigrationsHistory` after a refused downgrade and re-apply Up. This is documented in the rollout guide.
- **QA setup.** The rehearsal needed a September delivery, which the API can't create retroactively. On the disposable database only, the delivery dates were backdated with the ledger trigger briefly disabled. This is not a product path.
- **Not done (out of scope):** settlement, commission, invoices, final disposition, Partner Portal, evidence attachments.

## 9. Release notes

- **Ship together:** the three Phase 1A migrations, this Phase 1B migration, and the matching API and web.
  - The stock position and sales-report verification now read stocktake tables.
  - An API without this migration cannot run against it.
- **Unrelated work:** Marketing Demo, `Program.cs`, development configuration and Community edits in the working tree were not touched and must stay out of the release diff.
- **Readiness:** stop here for the independent Phase 1B review. No deployment or settlement work was started.
