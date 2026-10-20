# Final independent verification: consignment remediation (H1–H4, M1–M10)

Date: 17 October 2026 · Scope: uncommitted working tree at `C:\Project\MyPetLink` · Read-only review and testing

## Method and constraints

- No application source was modified, and nothing was staged, committed, pushed or deployed. Production was not accessed.
- Every database used was disposable: fixture-created `MyPetLinkTest_*` databases plus `MyPetLinkQA_Final_E2E`, which was dropped afterwards.
- `.claude/launch.json` was temporarily extended for the end-to-end run, then restored byte-for-byte (SHA-256 `cb74ac9a…`).
- Local dev tokens were deleted after use. All agreements, merchants, branches, tags and references were synthetic.
- No real Tag Codes appear in this report. Synthetic codes are redacted in the logs.
- Codex's test results were **not** reused as evidence. Every count below comes from runs made during this verification.

**Evidence in this folder:**
- `api-full-suite.trx/.log`
- `api-failed-rerun.trx/.log`
- `consignment-related-serial.trx/.log`
- `final-probes.log`, plus the probe source `FinalVerificationProbes.cs`
- `web-full-suite.log`, `web-typecheck.log`, `web-lint.log`
- `e2e-db-migration*.log`
- `mobile-375.jpg`
- The Physical QA HTTP driver `qa-inspect.mjs` and the synthetic seed `e2e-seed-v2.sql`

## 1. Verification matrix

| ID | Verdict | Independent evidence |
| --- | --- | --- |
| **H1** Retail starvation | **PASS for the original scenario. It introduced regression N1.** | Probe V01 re-ran the original P01 (4 Passed + 2 Pending stock, a paid retail order for 2). Reserving all 4 now returns `409 inspected_inventory_reserved`. Reserving 2 succeeds and leaves 2 Passed units for the paid order. Concurrent checkout, wholesale and consignment claims stay exclusive (Codex's triple-race test, which I ran serially, passed). |
| **H2** Separation of duties and evidence | **PASS, with weakness N3** | V04 and the browser run: maker self-approval returns `403 independent_approval_required` in both the API and the UI. The dispatcher's own receipt returns 403 in both. Receipt with no evidence, an evidence reference of "x", or counts that don't add up each returns 400; complete evidence from a second operator returns 200. **N3:** the rule only compares against the *last* editor, so the original maker can approve after a checker saves without changing anything. |
| **H3** Reconciliation records | **PASS** | V06 and the end-to-end run cover the following. A duplicate reference returns 409, including the case and space variant ` sale-0001 `. Multiple units per reference returns 400. A sale without a price, or with a 3-decimal price, returns 400. A correction must use a new reference, and correcting the original a second time is refused, so lineage cannot fork. A reversal keeps all 4 records. The bounded reconciliation CSV has dates, actor, merchant, agreement and lineage, and refuses periods over 366 days. V11 confirms a write-off of a really-failed return disables the tag and keeps the hold. History shows the unit and actor. Finance rows stayed at 0. Small gaps: N7 and N8. |
| **H4** Destructive rollback | **PASS** | V12 on real SQL Server: the Down migration is blocked when **only a Draft agreement** exists (THROW 51040); data and migration history are kept. An empty schema downgrades, and Up re-applies with 0 pending. The original P13 (active custody) is covered by Codex's `P13…(true)` test, which passed in my serial run. |
| **M1** Revision strands reservations | **PASS** | V07: approving v2 with an open v1 reservation returns 409. After v1 dispatches, v2 approval succeeds and the v1 custody can still be received. |
| **M2** Close with stock held | **PASS** | V07 and the browser: closing with partner-held stock returns 409 with a clear message. |
| **M3** Refresh duplicates | **PASS, with finding N5** | V08 plus the browser: reloading and resubmitting returns the same dispatch (sessionStorage key plus server fingerprint), so there is no duplicate. **N5:** "Start separate reservation" followed by an identical submission shows "Changes recorded." but silently returns the existing reservation. |
| **M4** Tag Codes in errors | **PASS** | V09: dispatch with a failed unit and early release both give a generic message, checked against every Tag Code in the database. The end-to-end run saw no codes outside the manifest and CSVs. |
| **M5** Caching | **PASS** | Real HTTP: agreement JSON, manifest JSON, manifest CSV, reconciliation CSV and the PDF all return `Cache-Control: no-store,no-cache` with `Pragma: no-cache`. |
| **M6** Mutable PDF | **PASS** | V09 and the end-to-end run: the PDF returns 409 before dispatch. SHA-256 is identical at dispatch and after receipt, handover, return and release (V09 `C39E5AD8…`; end-to-end `b70e601a…`), and the stored hash matches. A view-only role can download it; manifests still need export rights. |
| **M7** Wholesale Delivery Order reissue | **PASS (automated)** | Codex's unchanged-allocation and changed-allocation DO tests passed in my serial run of 232 related tests. The void reason now appears on the order timeline (`MerchantSalesService.cs:965`). I didn't exercise this in the browser. |
| **M8** Short/damaged receipt | **PARTIAL: FAIL for the damaged-return path (N2)** | V05: a short receipt returns 409 and the dispatch stays Dispatched. Recording the discrepancy works. However, the open discrepancy blocks handovers for **every** unit in the dispatch. And once a damaged unit is physically returned, neither resolving nor receiving accepts the truthful count of 3, so the dispatch is stuck permanently. |
| **M9** Destination | **PASS** | V10: a foreign-merchant branch returns 400, no branch returns 400, an edited address returns 409, and dispatch after the branch is deactivated returns 409. The browser branch selector produced the canonical address. |
| **M10** Real return QA | **PASS (software); hardware NOT TESTED** | V11 and the end-to-end run use the real `PhysicalQaService`. In the end-to-end run, HTTP `qa/capture` (QR and NFC) followed by `PUT qa/{id}` returned Passed, then the UI release succeeded. V11 saved a Failed result, release returned 409, and write-off succeeded. The reader inputs were simulated. Android camera and Web NFC hardware, and re-reading the same chip, remain untested. |

## 2. Remaining defects

**N1 (HIGH, regression to existing wholesale): the dispatch-time retail check blocks shipments for an unrelated retail inspection backlog.**
- **Where:**
  - `InventoryCustodyRules.cs:47-57`
  - Wholesale Ready-to-Ship: `MerchantFulfilmentService.cs:526`
  - Wholesale Ship: `MerchantFulfilmentService.cs:638`
  - Consignment dispatch: `ConsignmentService.cs:236`
- **Repro V03:**
  1. A paid wholesale order has all 4 units allocated, so they are already off the shelf.
  2. A paid retail order for 2 arrives later. Checkout correctly accepts it against 1 Passed and 3 Pending units.
  3. Wholesale **Mark Ready to Ship** now returns `409 inspected_inventory_reserved`.
- **Repro V02:** the same thing happens to an already-reserved consignment dispatch.
- **Why it's wrong:** the held units are not on the shelf, so shipping them can't change the Passed shelf count. The check protects nothing and blocks a paid B2B shipment until unrelated retail stock is inspected. Under the "order first, inspect later" model this will happen routinely.
- **Proposed fix (not implemented):** keep the H1 check at allocation and reservation time only, where it actually moves stock. At dispatch, check only the held units themselves (`RequireInspectedCommercial`).

**N2 (HIGH for first-100 operations): discrepancy handling dead-ends.**
- **Where:** `ConsignmentService.Evidence.cs:34` (count must equal *all* dispatch units, including ones already returned), `:57` (resolution must claim full undamaged quantity) and `:66` (discrepancy blocks handovers dispatch-wide).
- **Repro V05:**
  - One missing unit blocks recording sales for the 3 that arrived.
  - After a damaged unit is physically returned, "resolve" and "receive" both reject the truthful count of 3. The only way out is to enter a false recount of 4.
- **Proposed fix:** count against units still partner-side, not every unit ever dispatched. Allow handovers for units that were received. Add an approved investigation outcome for a permanent shortage.

**N3 (MEDIUM): maker/checker compares against the last editor only.**
- **Where:** `ConsignmentService.cs:94`. Approval also overwrites `UpdatedByAdminUserId` (`:127`).
- **Repro V04:** the maker drafts the terms, the checker saves without changing anything, and the maker then approves their own terms successfully.
- **Proposed fix:** require the approver to differ from the creator and from every editor, using the audit trail or a creator column.

**N4 (MEDIUM): the same operator can record and resolve a discrepancy.**
- **Where:** `Evidence.cs:45-60`. Only "different from the dispatcher" is enforced.
- **Repro:** V05 ("Same recorder resolves own discrepancy… OK").

**N5 (LOW–MEDIUM): the "Start separate reservation" action is misleading.**
- **Where:** `ConsignmentService.cs:175-176` returns any Reserved dispatch with the same fingerprint. `ConsignmentPanel.tsx:182` offers a separate reservation that can't happen while the first is Reserved, and still shows "Changes recorded." (V08 and browser).

**N6 (LOW, performance): every dispatch query loads the archived PDF bytes.**
- **Where:** `ConsignmentService.cs:357-359`. `Graph()` loads full `ConsignmentDispatch` rows, so list and detail responses pull roughly 130 KB of PDF per dispatch (up to 20 per page) without using it. There is no table splitting or projection.

**N7 (LOW): no sanity bound on reported sale amounts.**
- **Where:** `Evidence.cs:82-85`. V06 accepted RM 1,000,000,000,000,000.00.

**N8 (LOW, cosmetic):** the receipt history line runs two fields together ("QA receiptSYN recipient: 4 counted…").

**N9 (LOW):** "Unit N" labels are derived from sort order, so they aren't stable identifiers. Exports correctly use unit GUIDs.

**Untested:** Up-migration guard THROW 51041 against existing duplicate fingerprints. No pre-existing duplicate data could exist, and none was fabricated.

## 3. Test results (exact counts)

| Run | Total | Passed | Failed | Skipped | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| API full suite, parallel | 2,803 | 2,801 | 2 | **0** | `SmartTagRateLimitingTests` (timing) and `SocialQueryPlanRelationalTests.TheFeed…` (query text under load). |
| The 2 failures re-run serially | 2 | 2 | 0 | 0 | Both environmental. Neither touches consignment. |
| Serial: Consignment + PhysicalQa + MerchantFulfilment + MerchantAllocation | 232 | 232 | 0 | 0 | Real SQL Server LocalDB, including races and migrations. |
| Independent probes V01–V13 (scratch project, disposable SQL Server) | 13 | 13 executed | – | 0 | Each probe asserts the observed behaviour. Findings N1–N5 and N7 come from these. |
| Web full Vitest suite | 4,341 | 4,334 | 0 | 7 | 373 files passed, 1 skipped (existing skips). The earlier Community date-bomb test is fixed. |
| Typecheck (app + functions) | – | pass | – | – | |
| ESLint (changed consignment files) | – | pass | – | – | |
| Not re-run by me | – | – | – | – | Production web build and EF model-drift check. Codex logs only. |

The original P01–P13 probes were re-expressed against the new API (which now requires a branch, a second approver and receipt evidence) as V01–V13: P01→V01, P02/P03→V07, P04→V06, P06→V04, P07→V08, P10→V11, P13→V12.

## 4. Browser and API end-to-end (executed)

**Setup:** disposable database from the root `migration.sql` (applied, then replayed; both exit 0). Two distinct dev-login operators: A (`qa.op-a@…local`) and B (`qa.op-b@…local`). Real API on :5281, Next dev server on :3000.

**What ran:**
- **Permissions over HTTP:**
  - The migrated Administrator role gets 403 for view and approve.
  - A view-only role gets 403 on every write endpoint, plus manifest, manifest CSV and reconciliation CSV.
  - A view-only role is allowed the PDF route (404 for an unknown id).
  - Deactivating B gives 403 on the next request with the same token.
- **Browser, as A:**
  - Drafted an agreement with every term completed through the form, including the date field.
  - Self-approval was refused with 403 and a clear message. B then approved over HTTP.
  - Reserved 4 units using the branch selector.
  - After a reload, the resubmission returned the same dispatch. The separate-reservation path was misleading (N5).
  - Dispatched. The dispatcher's own receipt was refused with 403.
  - B recorded receipt with full evidence.
  - B recorded a handover with a reported sale of RM34.90 and RM5.00 discount; A's attempt to reuse that reference got 409.
  - A returned one unit. The real Physical QA HTTP capture and save passed it, and A released it in the UI.
  - History shows unit and actor on each line.
  - Closure with stock held got 409.
  - The deep link survives a reload.
  - At 375px there is no page-level horizontal overflow (`mobile-375.jpg`).
- **Documents:** PDF bytes identical before and after receipt, handover and return. `no-store` on every sensitive response.
- **Final SQL state:** 1 ExternalHandover + 2 Received + 1 Released units. Finance tables total 0 (invoices, payments, receipts, commissions, payouts, TagOrders, MerchantOrders). 22 consignment audit rows.

**Not executed:**
- Android camera / Web NFC hardware.
- Real customer QR activation of a partner-held unit through the public site.
- Staging.
- The wholesale Delivery Order flow in the browser.
- Concurrent operators in two live browsers. Concurrency was tested at the SQL level instead: V13 receive vs discrepancy, where one wins; and Codex's races.

## 5. Migration and rollback assessment

- **Additive and idempotent.** The two migrations add nullable columns, `ConsignmentHandoverRecords`, a filtered unique fingerprint index, and a restrictive branch foreign key. Merchant branches are never hard-deleted (no delete path exists), so that key is safe. The root script applies to an empty database and replays cleanly. `database/migration.sql` remains non-authoritative.
- **Existing business data:** production has no consignment tables yet, so there is no legacy custody data. Legacy-row handling (approval metadata, archived PDF, branch) fails closed, as documented.
- **Rollback:** the Down guards hold `TABLOCKX` and throw on any history, including a Draft-only agreement. An empty schema can downgrade. After business use the runbook correctly forbids reverting to hold-unaware API code. The guard doesn't cover direct DBA DROP/DELETE or old generated scripts, and the runbook says so.
- `sqlcmd -I` is documented and required.

## 6. Release isolation (Marketing Demo)

- **Where the Demo work touches the tree:**
  - Tracked files: `Program.cs` (22 demo lines), `launchSettings.json`, `appsettings.Development.json`, root `package.json` (`marketing:*` scripts) and `.gitignore`.
  - Untracked files: `MarketingDemoOptions.cs`, `MarketingDemoSeeder.cs`, `MarketingDemoSeederTests.cs`.
  - `migration.sql` has no demo content.
- **Isolation build: PASS.** I exported committed HEAD into scratch and overlaid only the B2B/consignment files. `Program.cs` was HEAD plus the two consignment registrations. The API and test projects built with 0 errors.
- **The risk is procedural, not technical.** Nothing is staged, and `Program.cs` needs a partial (hunk-level) commit. Deploying from the current working tree would ship the Demo seeder, protected only by its startup validation.

## 7. Readiness verdicts

| Stage | Verdict | Basis |
| --- | --- | --- |
| Local remediation (H1–H4, M1–M10) | **CONDITIONAL GO** | 12 of 14 items pass. M8 fails on the damaged-return path, and H1's fix introduced N1. |
| Staging | **CONDITIONAL GO** | Only from an isolated B2B commit (proven buildable), with N1 fixed or explicitly accepted. Otherwise staging will reproduce blocked wholesale shipments. Run the hardware and two-operator checks there. |
| Production deployment | **NO-GO** | N1 is a regression to existing paid wholesale shipping. The change is not committed or isolated, and there is no staging evidence. |
| First 100-tag dispatch | **NO-GO** | N2 makes the first short or damaged delivery unresolvable without a false recount. Signed commercial terms, named separate operators (N3/N4), the Finance tracker owner, hardware QA and a physical second count are all still outstanding. |

**Final verdict: CONDITIONAL GO for local code and staging validation only. NO-GO for production and for the first 100 physical tags.** No fixes were implemented.
