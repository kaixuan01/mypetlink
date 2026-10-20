# Independent QA review: Stage 1 B2B fixes and Stage 2 Consignment MVP

Date: 17 October 2026 · Reviewer: independent QA, architecture and security review · Scope: uncommitted local working tree at `C:\Project\MyPetLink`

No application source was modified. Nothing was staged, committed, pushed or deployed. All database work used disposable LocalDB databases (`MyPetLinkTest_*` from the fixtures, plus `MyPetLinkQA_Consignment_E2E`, which was dropped afterwards). Production was not touched. All agreements, merchants, stock and references in this review are synthetic and labelled as such. No real Tag Codes appear in this report.

Evidence lives in this folder:
- `api-full-suite.trx/.log` and `api-failed-rerun-serial.trx/.log`
- `consignment-serial.trx/.log`
- `independent-probes.log`
- `web-full-suite.log`, `web-typecheck.log`, `web-lint.log`
- `e2e-db-migration*.log`
- `screenshots/`

---

## 1. Independent QA summary

The core custody engine is well built. Every reservation, dispatch and return runs in a retryable transaction that holds a global consignment lock plus SKU-level locks. Optimistic concurrency uses row versions on agreements, dispatches, units and SmartTags. Filtered unique indexes back up the command checks.

I reproduced the following independently, on real SQL Server and in the real browser:
- Exclusive 100-tag reservation.
- Concurrent same-key and competing-key reservations.
- Correct 403 enforcement at the API.
- Removal of all consignment capabilities from every installed role except Super Admin.
- CSV formula sanitising.
- Complete absence of financial records across the full lifecycle.

The remaining problems are mostly about **business controls, reconciliation data and operational edges**, not crashes. Four of them should be resolved, or explicitly accepted by the business, before real stock moves:

1. **Retail starvation of inspected stock (High).** A consignment reservation can take every *Passed* unit and still pass the retail-reservation check. That check counts *uninspected* (Pending) stock, so paid B2C orders are left waiting on uninspected units (probe P01).
2. **No segregation of duties (High).** One administrator can draft and approve terms, reserve, dispatch, acknowledge partner receipt with any text (for example "x"), record handovers, accept returns, release stock and export manifests.
3. **Reconciliation data gaps (High for settlement).** Units carry no handover timestamp. External sale references are neither structured nor de-duplicated. A handover cannot be reversed. The CSV has no dates. Activity history doesn't name the unit or the actor. A return that fails inspection has no way out.
4. **Silent destructive rollback (High for production).** The EF Down migration drops all custody tables even while units are held (P13). The runbook is the only guard.

Packaging is a release blocker in its own right. The consignment work is uncommitted, and `Program.cs` mixes its two service registrations with uncommitted Marketing Demo seeder changes.

## 2. Test results (exact counts)

| Run | Total | Passed | Failed | Skipped | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| API full suite, default parallelism (`api-full-suite.trx`) | 2,787 | 2,769 | 18 | **0** | 17 failures were `SqlException: Execution Timeout Expired`, mostly in throwaway-database cleanup (`DROP DATABASE`) under LocalDB load from parallel runs. 1 was a timing-sensitive rate-limit test (`SmartTagRateLimitingTests`). |
| Re-run of those 18 methods, serial (`api-failed-rerun-serial.trx`) | 36 cases | 36 | 0 | 0 | Every earlier failure passes. The failures were environmental, not regressions. |
| All `*Consignment*` tests, serial (`consignment-serial.trx`) | 27 | 27 | 0 | 0 | Includes 10 real SQL Server relational tests. None were skipped. |
| Independent probes, separate scratch project against disposable SQL databases (`independent-probes.log`) | 13 | 13 reproduced | – | 0 | Each probe asserts the behaviour actually observed. See section 3. |
| Web full Vitest suite (`web-full-suite.log`) | 4,335 | 4,325 | 3 | 7 | 374 files: 371 passed, 2 failed, 1 skipped. Failures were in Community files untouched by this work. Two `SocialLayoutVisitorShell` tests timed out under load and pass in isolation. `communityModeration.test.ts` is a **date bomb**: it hardcodes a restriction ending 15 Oct 2026 and now fails every time. It is pre-existing and unrelated. |
| `npm run typecheck` | – | pass | – | – | App and functions projects. |
| ESLint on changed web files | – | pass | – | – | |
| Not re-run by me | – | – | – | – | Production web build and EF model-drift check (Codex logs only). |

Real SQL Server execution is confirmed: `RelationalDatabase.IsAvailable` asserts instead of skipping, and both runs report 0 skipped.

## 3. Defects with evidence

Severity is judged by real-world impact on the first partner rollout. Each item includes reproduction evidence. "Pn" refers to `independent-probes.log`.

### HIGH

**H1. Consignment (and wholesale) can take all inspected stock that paid retail orders need.**
- **Where:** `apps/api/MyPetLink.Api/Services/InventoryCustodyRules.cs:13-23` compares the selection against `TagOrderInventoryAvailabilityService`, which counts `OrderableUnit` (QA Pending *or* Passed). Consignment selects only Passed units (`ConsignmentService.cs:165`).
- **Repro (P01):** 4 Passed and 2 Pending units, with a paid retail order reserving 2. Retail availability is 4, so consignment reserves all 4 Passed units. Passed units left for the paid order: 0. When the 2 Pending units then fail QA, the paid order has nothing to assign and is oversold by 2.
- **Impact:** with real stock, dispatching 100 can leave paid B2C customers waiting on uninspected cartons.
- **Proposed fix:** require Passed on-shelf units after the selection to be at least the outstanding paid-and-unassigned retail quantity. Otherwise, gate dispatch on an operator stock check.

**H2. No segregation of duties on financial-adjacent custody.**
- **Where:**
  - A single capability, `consignment.agreements.manage`, covers both saving and approving terms (`AdminConsignmentController.cs:22-37`).
  - The Administrator template gets every consignment capability (`AdminRoleTemplates.cs:83-93`).
  - Receipt evidence is free text with no second actor (`ConsignmentService.cs:230-236`).
- **Repro (P06):** the same actor who dispatched acknowledged receipt with the reference "x", and all units moved to Received.
- **Proposed fix:**
  - Add a separate approve capability, or a maker-checker rule (approver ≠ last editor).
  - Require receipt to be acknowledged by a different actor than the dispatcher.
  - Require a structured evidence reference (received count, received-by, date) or an attachment.

**H3. Reconciliation data is not settlement-grade.** Settlement disputes are likely.
- **Where:** `Entities/ConsignmentEntities.cs:56-75` has no handover date or price fields.
- **Repro:**
  - **P04:** the same external sale reference was accepted for two different, never-activated units in separate requests. Returning a wrongly handed-over unit fails with 409, and no reversal action exists.
  - **P05:** CSV header is `Dispatch, Agreement, Version, Unit Reference, Tag Code, SKU, Batch, Custody, Inspection, Activated, External Reference, Tracker`. It has no dates and no merchant.
  - **E2E:** the activity history shows the action and reference but not which unit or who.
  - **P10:** a returned unit that fails inspection cannot be released, returned, handed over or cancelled, and stays in "Return inspection" forever.
  - Code review: units have no Lost/Damaged state.
- **Proposed fix:** add per-unit handover timestamp and actor. Include movement dates, merchant and agreement in the CSV. Show the unit and actor in the history. Add a duplicate-reference warning, an audited handover reversal, and a write-off/scrap state.

**H4. Down migration silently destroys custody records.**
- **Repro (P13):**
  1. Migrated, reserved and dispatched 2 units on SQL Server.
  2. Ran `IMigrator.MigrateAsync("20261015032111_AddMerchantMainLogo")`.
  3. The migration succeeded and all 4 consignment tables were gone, leaving 2 tags marked `SentToReseller` with no custody record.
- **Impact:** units that were only *reserved* (FulfilmentStatus Printed) would go straight back into sellable stock. The runbook is the only guard.
- **Proposed fix:** make the Down method throw while any `ConsignmentUnits` row exists, or remove the Down method for this migration.

### MEDIUM

- **M1. Approving a revision strands the prior version's reservations** (`ConsignmentService.cs:95-110`, `RequireEffective:326-331`). In P02, dispatching a v1 reservation after v2 approval returns 409 ("Approve the agreement…"). The only remedy is to cancel and re-reserve 100 units. Expiry behaves the same way (P11), though returns and handovers still work afterwards, which is correct.
- **M2. An agreement can be closed while the partner still holds stock** (`ConsignmentService.cs:113`). P03 closed an agreement with 4 partner-held units, with no warning or gate.
- **M3. Browser refresh can create a duplicate reservation.** The idempotency key lives only in component memory (`ConsignmentPanel.tsx:122-127`). P07 showed an identical payload with a new key creating 2 dispatches holding 8 units. The server has no natural-key duplicate warning.
- **M4. Tag Codes leak through error messages to users without manifest export.** In the E2E, an early release returned "Tag ‹code› has not passed physical inspection…" to the UI. The message comes from `SellableInventoryRules.RequireSellableForNewCommitment`, which consignment reuses at `ConsignmentService.cs:220,269`. Any holder of dispatch or release sees codes that are otherwise restricted to `consignment.manifest.export`.
- **M5. Manifest JSON, CSV and PDF responses have no `Cache-Control: no-store`.** The E2E response headers showed none. Other sensitive admin controllers set it, for example `AdminOwnersController.cs:122`.
- **M6. The dispatch note is not a frozen document** (`ConsignmentDocumentService.cs:29-57`). It is re-rendered from current status on every download: the E2E copy said "Received" and the earlier one "Reserved / Not dispatched". It can be printed before dispatch, and it prints both a "Received by" block and "does not require a signature". It also needs `manifest.export` even though it contains no codes (`AdminConsignmentController.cs:75-80`).
- **M7. Merchant Delivery Order is always replaced at shipment** (Stage 1 #4 side effect).
  - `MerchantFulfilmentService.cs:656-666` voids the Ready-to-Ship DO and issues a new number at shipment. The paper DO packed into the parcel is now VOID and carries a different number from the one emailed.
  - `MerchantSalesService.cs:964-967` maps the new `merchant-delivery-order.voided` audit action to an empty string, so the void never appears on the order timeline.
- **M8. Receipt is all-or-nothing.** There is no way to record a short or damaged delivery at receipt (P06).
- **M9. The destination is free text,** not tied to `MerchantBranches`, so units could be recorded against an unverifiable address.
- **M10. Test gap: returned-unit re-inspection never runs through the real `PhysicalQaService`.** The relational test (`ConsignmentRelationalTests.cs:113-115`), my probes and the E2E all set QA Passed directly in the database. Code reading suggests `CanInspect` allows it (`PhysicalQaService.cs:547`), but chip re-binding and evidence capture on a returned unit are unverified.

### LOW

- `ConsignmentPanel.tsx:113`: clearing the commission field sends 0 (`Number("")`). The MyPetLink share is computed with float arithmetic (`100 - x`), so a rate such as 35.15 can display 64.85000000000001.
- `ConsignmentService.cs:48-49`: the draft form lets you edit the agreement reference, but the server rejects the change with the misleading message "Approved terms cannot be edited".
- The agreement Close action sends a hardcoded reason (`ConsignmentPanel.tsx:105`).
- The action reference field shows the placeholder "Pending confirmation".
- An open dispatch can't be deep-linked or refreshed into view.
- Free-text references may capture customer personal data. The UI doesn't warn against it.
- Downloads use raw `fetch` without token refresh (`adminConsignmentService.ts:67-82`).
- Running manual SQL against these tables needs `SET QUOTED_IDENTIFIER ON` because of the filtered indexes. Plain `sqlcmd` without `-I` fails with Msg 1934, which matters for any support or hotfix script.

## 4. Stage 1 verification (five original defects)

| # | Defect | Verdict | Evidence / residual risk |
| --- | --- | --- | --- |
| 1 | Wholesale/consignment consuming B2C reservations | **Fixed for quantity; residual H1** | `MerchantFulfilmentService.cs:266,337`, `ConsignmentService.cs:173`, bulk outbound `AdminTagInventoryService.cs:461-476`. The triple-race relational test passes. The protection counts Pending stock, so inspected stock can still be drained (H1). |
| 2 | Quotation precision | **Fixed** | `MerchantSalesService.cs:1162-1163,1213-1214,1258-1262`, plus `[Range]` on DTOs. Four precision cases pass. No other money entry path for quotation lines was found. |
| 3 | Cancelled invoice looks payable | **Fixed (PDF)** | `MerchantDocumentService.cs:170-174,208,224-231`. Payment rows are cleared, the document says "Cancelled — do not pay", and the replacement gets a new number. Email resends of a cancelled invoice were not exercised. |
| 4 | Stale Delivery Order | **Fixed; process side effect M7** | Voided on allocation release (`:419`) and at shipment (`:656-666`). A voided PDF says VOID and has no receiving block. Shipping now runs in a retryable transaction. |
| 5 | Conflicting lifecycle/ownership | **Fixed** | Guards in `AdminSmartTagService.cs:171,256,414`, `AdminService.cs:1988` and bulk fulfilment. The SmartTag `RowVersion` is a concurrency token, so the explicit `AssignmentVersion++` forces a conflicting update. Public activation of Reserved or quarantined units is refused (`tag_not_ready`, P09). Physical QA may still fail a reserved unit; this is intended and blocks dispatch. |

**Bypass search:** I listed every SmartTag mutation site (status, ownership, fulfilment, QA, purpose). The paths that bypass the custody guard only touch tags that are already linked to an order, an owner or a pet. Consigned units can't be linked to any of those while held.

## 5. Security and financial integrity

**Verified by E2E over HTTP:**
- An installed Administrator role (as left by migrations) gets **403**.
- A view-only role gets 200 on lists and **403** on create, reserve, approve, dispatch, receive, cancel, return, release, handover, manifest, CSV and PDF.
- No token gets **401**.
- Downgrading a role takes effect on the next request with the same token (403).
- Deactivating the admin takes effect on the next request (403).
- A unit ID from outside the dispatch gets **400**.
- An unknown dispatch gets **404**.
- A stale concurrency token gets **409**.

**Other security checks:**
- No role-name checks were found. The actor always comes from the JWT.
- The CSV neutralised `=HYPERLINK(...)` by prefixing an apostrophe.
- Projections carry no owner, pet or finder data.
- Each download writes an audit row (`consignment.document-downloaded`).
- The audit append happens inside the same transaction as the change.

**Financial boundary** (verified in the full UI lifecycle on the E2E database): after reserve, dispatch, receive, 2 handovers, return and release, the following tables still had 0 rows: MerchantInvoices, MerchantPayments, MerchantReceipts, SalesCommissions, TagOrders, MerchantOrders, CommissionPayouts. Dispatch and the PDF carry no prices or commission amounts. The UI copy states that custody is not a sale.

### Manual settlement example (calculated outside the app; nothing recorded)

10 × RM34.90 = RM349.00. Partner 35% = RM122.15. MyPetLink 65% = RM226.85.

Rounding must be agreed in writing:
- Per unit, 34.90 × 0.35 = 12.215, which rounds to RM12.22. Ten units then give the partner **RM122.20**, five sen more than the aggregate method.
- If the MyPetLink share is also rounded per unit (22.685 → 22.69, half-up), the two shares total **RM349.10**, not RM349.00.

The agreement doesn't record:
- the commission base (list price RM39.90 or the actual price RM34.90);
- the rounding method;
- tax treatment.

**References available for manual reconciliation:**

| Reference | Available? |
| --- | --- |
| Merchant | Yes, as a dispatch snapshot (but not in the CSV) |
| Agreement reference and version | Yes |
| Rate snapshot | Yes |
| Dispatch number (MPL-CS-yymmdd-nnnn) | Yes |
| Unit ID | Yes |
| Tag Code | Yes, in the controlled manifest |
| Batch | Yes |
| Shipment and receipt references | Yes |
| Per-unit external reference | Yes |
| Movement history with timestamps | Yes, in the database |
| Audit log | Yes |
| Handover date per unit | **No** |
| Sale price / promo flag | **No** |
| Unique sale reference | **No** |
| Refund / return-after-sale path | **No** |
| Lost/damaged state | **No** |
| Period cut-off export | **No** |

These gaps are exactly where missing, duplicate or disputed partner sales would come from.

## 6. Migration and rollback

- **Additive and idempotent: verified.**
  - Full root `migration.sql` applied to an empty database via `sqlcmd -I` with exit 0, then replayed with exit 0.
  - P12 migrated to `AddMerchantMainLogo` (production's presumed current state), ran the script twice, ended with 0 pending migrations, and all 4 tables exist.
  - Filtered indexes are present: `IX_ConsignmentUnits_SmartTagId WHERE ReleasedAt IS NULL` and `IX_ConsignmentAgreements_MerchantId_Reference WHERE Status='Active'`.
- **Roles are not auto-broadened: verified.** After migration, no role except super-admin has any `consignment.*` capability. Grants are a real deployment step.
- **Rollback:**
  - Safe before any reservation: revert code and leave the tables in place.
  - Unsafe afterwards: H4 shows the Down migration destroys records, and old API code ignores the holds, so reserved units would be resold.
  - The runbook's "never drop / never deploy old inventory logic" rule is correct, but nothing enforces it technically.
- **Deadlock/retry:** the lock order is consistent: global consignment lock, then sorted SKU locks. Retail checkout and wholesale take SKU locks only, so there is no inversion. Retries re-run the whole unit of work after `ChangeTracker.Clear()`, and audit rows live in the same context. Lock timeout is 15 s.
- **Packaging:**
  - The work is uncommitted. `Program.cs` mixes it with uncommitted MarketingDemo code (`MarketingDemoOptions.ValidateForStartup`, seeder, static files). `appsettings.Development.json` and `launchSettings.json` also carry demo changes.
  - A production build from this tree would ship unrelated code. Isolate the change in a reviewed commit first.

## 7. Browser and API E2E

| Area | Executed? | Result |
| --- | --- | --- |
| Disposable DB built from root `migration.sql`, API (`dotnet run`, DevAuth) and Next dev server with real API (no mock) | Yes | – |
| Empty states (agreements, dispatches) | Yes, browser | Pass |
| Draft with pending terms; Approve disabled; API approve with pending terms returns 409 | Yes, browser + API | Pass |
| Stale token returns 409; 3-decimal percentage returns 400 | Yes, API | Pass |
| Complete terms in UI → Approve via confirm dialog → Active; editing approved terms returns 409 | Yes | Pass |
| Reserve 105 when 104 are eligible gives a clear conflict message; reserve exactly 100 gives 100 distinct Passed units | Yes, browser + SQL | Pass |
| Normal detail hides Tag Codes ("Unit N") | Yes, browser | Pass |
| Confirm dispatch (custody-only dialog copy) | Yes, browser | Pass |
| Lost-response replay of dispatch/receive returns 200 with no duplication | Yes, API | Pass |
| Stale screen after another actor acknowledged receipt shows a conflict message; "Refresh records" recovers | Yes, browser | Pass |
| Browser reload keeps state | Yes | Pass (open dispatch not restored, Low) |
| External handover (2 units), return (1), early release refused, release after inspection | Yes, browser | Pass. Inspection was **simulated in the DB**; the real Physical QA screen was not exercised (M10). Early-release error showed a Tag Code (M4). |
| Manifest JSON, CSV, PDF downloads; audit rows; CSV sanitising | Yes, via HTTP (curl), not browser file save | Pass. No no-store header (M5). PDF reflects current status (M6). |
| Permission-denied matrix, role downgrade, deactivation, IDOR | Yes, API | Pass |
| Mobile 375 px | Yes, browser (`screenshots/mobile-375-dispatch.jpg`) | No page-level horizontal scroll. The unit table scrolls inside its own box. |
| Customer QR activation of a partner-held unit through the public UI | **No** | Covered by relational tests and P09 only |
| Real Physical QA re-inspection of a returned unit | **No** | Gap M10 |
| NFC tap; staging environment; static export (`out`) build | **No** | No staging environment was available |
| Concurrent operators in two browsers | **No** | Covered at SQL level only (P08, relational races) |

## 8. UAT checklist (staging, synthetic first, then the real partner)

**Access**
1. Confirm an installed Administrator has no consignment access after deploy.
2. Grant least-privilege custom roles: approver ≠ editor; dispatcher ≠ receipt acknowledger; releaser ≠ returner where staffing allows.
3. Verify each role's buttons, and verify the API returns 403 for each denied action using a second browser profile.

**Agreement**
4. Create a draft with blank terms and confirm every pending term is listed and approval is blocked.
5. Enter the *signed* values only. Confirm 35%/65% displays correctly.
6. Approve, then confirm the terms can no longer be edited.
7. Create v2 on a test merchant and confirm v1 closes. Note that any v1 reservation must then be cancelled (M1).

**Stock**
8. Count Passed / Pending / reserved-retail / wholesale-held units for the SKU **before** reserving.
9. Confirm paid retail orders awaiting assignment still have Passed units afterwards (H1).
10. Reserve exactly 100. A second operator independently counts and matches the manifest to the carton.
11. Confirm there are no duplicate codes in the manifest.
12. Confirm the catalogue's in-stock state and quantities are correct.
13. Try reserving again from a refreshed tab, and confirm the operator is warned or that it is visibly a second dispatch (M3).

**Dispatch**
14. Print the dispatch note *after* dispatch and archive that PDF (M6).
15. Confirm dispatch with the courier or hand-delivery reference.
16. Confirm no invoice, receipt, payment, order or commission exists for the merchant.

**Receipt**
17. Obtain the partner's signed note with the counted quantity.
18. Record its document reference, entered by someone other than the dispatcher.
19. Decide in advance what to do for shortages (M8).

**Partner sale**
20. Customer activates a unit at the shop. Confirm the "activated without reference" warning appears.
21. Record the external tracker entry (unique sale ID, date, actual price, discount) and attach it to that unit.
22. Confirm the external tracker entry and the unit's external reference match.

**Returns**
23. Receive an unsold unit and confirm it is unavailable.
24. Re-inspect it through the **real Physical QA screen** (QR + NFC + condition), then release it and confirm it is back in stock.
25. Fail one unit's inspection and agree what happens to it (P10).
26. Confirm an activated (customer-owned) unit is refused for return.

**Documents and security**
27. Confirm CSV and PDF downloads need export permission and are audited.
28. Open the CSV in Excel and confirm formula-like references stay inert.
29. Confirm no Tag Codes appear in error messages for non-export roles (M4).

**Period reconciliation**
30. Produce a list of handovers for a date range, then compute 35% using the agreed rounding.
31. Reconcile against the partner's statement and Finance's bank receipt.
32. Record a mismatch and its resolution path.

**Rollback drill**
33. Restore a staging copy that has active holds, deploy the previous API, and confirm the runbook freeze procedure catches the risk. Never run the Down migration.

## 9. Production and first-100 dispatch blockers

1. Commercial terms unsigned: duration, settlement frequency, deadline, discounts, returns, loss liability, customer invoice/e-Invoice responsibility, commission base and rounding.
2. Change not isolated or committed; `Program.cs` mixed with Marketing Demo work. No staging deployment or staging evidence.
3. H1: retail starvation check, or a documented operator stock gate.
4. H2: segregation of duties, or named-operator separation enforced by the role grants.
5. H3: reconciliation process that compensates for the missing handover dates and duplicate-reference controls, owned by Finance.
6. H4: technical or procedural guarantee that the Down migration is never run once holds exist.
7. Physical: exactly 100 received, QA Passed units confirmed by a second count; real Physical QA re-inspection of a returned unit proven on staging.
8. Least-privilege capability grants done through Access Management, and audited.

## 10. Verdicts

| Stage | Verdict | Basis |
| --- | --- | --- |
| Local Code Quality | **CONDITIONAL GO** | Sound transactional design and no confirmed data-corruption bug in normal paths. H1, M3 and M4 are small code changes that should land before staging. |
| Local Automated Test Readiness | **GO** | 0 skipped. All failures were environmental (LocalDB contention or timing) or a pre-existing date bomb, and every one passes when re-run serially. The consignment suite is 27/27 on real SQL Server. The probes add regressions worth adopting. |
| Staging Readiness | **CONDITIONAL GO** | Only after the change is isolated in a clean commit and deployed in order (migration → API → web), with reviewed capability grants. Use the UAT list above with synthetic data. |
| Production Deployment Readiness | **NO-GO** | Uncommitted mixed tree, no staging evidence, H1–H4 open, rollback guard missing. |
| First 100 Physical Tags Dispatch | **NO-GO** | Business terms unsigned, reconciliation process (H3) not designed, segregation (H2) unresolved, no physical second count, and no staging or production deployment. |

No fixes were implemented. The proposed fixes above are for your review.
