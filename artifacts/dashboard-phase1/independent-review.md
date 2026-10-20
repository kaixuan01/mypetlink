# Phase 1 Dashboard — Independent Implementation Review

**Date:** 20 October 2026, Malaysia time  
**Repository:** `C:\Project\MyPetLink`  
**Baseline:** `main` at `808296d83dd21574528b164a49d5be5ffa26e1b3`, including existing uncommitted work  
**Recommendation:** **NO-GO for Production in its current form.**

## 1. Executive Verdict

The Dashboard is a substantial visual and structural improvement. Pet identity is prominent, the cream/white/blue treatment is consistent, redundant counters and navigation tiles are removed, and care/Moments failures are separated. The new care query correctly removes the historical-first-page dependency.

**Three independently reproduced P1 defects prevent approval:**

1. A failed save can be reported as completed merely because its target disappeared from pending care. No completing record is required, and the owner's draft is cleared.
2. Real network failures become `ApiClientError` status **0**, but the new uncertainty classifier excludes status 0 and skips reconciliation.
3. Same-total row changes between care pages can yield `complete: true` and “Nothing due through …” while an overdue item is missing.

The reported passing tests do not disprove these defects: one test encodes the unsafe recovery assumption, and another mocks an error shape different from the real client. The pre-existing Community plan test is a separate, historically evidenced optimizer-sensitive assertion, not the reason for this NO-GO.

**Independent checks:** 58 API tests passed using existing compiled assemblies and EF InMemory fixtures; 159 web tests passed under the default test configuration; another 70 executions of the Dashboard/completion/share suites passed with production feature values enabled. Type checking passed without emitting files. Detailed results and limitations are in section 9.

### Evidence boundaries

Read all three requested reports, current diffs/new files, project instructions, care controller/service/DTOs, frontend loading/recovery code, relevant existing services and test fixtures. Inspected all **16** supplied rendered screenshots. Executed additional probes by bundling the actual TypeScript modules **in memory**, with controlled HTTP responses and no real server writes. Recovery probes executed the current function body with captured state callbacks; they were not new persistent test files or a full browser integration test.

No production account/data was accessed. No SQL database was created, changed, restarted or deleted. The relational fixtures create/drop databases, so they were reviewed rather than rerun under this request's restrictions. No application code, migration, dependency, configuration or existing report was changed. No build, commit, push or deployment was performed. Only this report was created.

## 2. P1-A to P1-D Verification Matrix

| Gate | Result | Verified evidence and remaining gap |
| --- | --- | --- |
| **P1-A: Trustworthy care coverage** | **FAIL as an end-to-end guarantee; query design passes** | SQL filters pending rows before paging and includes ownership/lifecycle. Static histories and exhausted/failed paging are handled. Same-total changing pages can still be falsely declared complete: F3. Metadata validation is incomplete: F4. |
| **P1-B: Authorized Log as Done** | **FAIL on recovery; normal flow passes** | Authenticated target read, pet check, Malaysia date, Private default, no copied provider/notes/documents, optional blank next date, and cancel-before-save work. Unknown save recovery is unsafe: F1/F2. |
| **P1-C: Compact pet-first Dashboard** | **PASS for inspected layouts, with stated visual limits** | Current screenshots show prominent pets, restrained cards and useful actions at labelled 320/390/768/1280 widths. Lost Mode/memorial behavior is source/component-test verified, not independently browser-rendered here. |
| **P1-D: Honest Recent Moments** | **PASS on scope, privacy and wording; minor ordering issue** | No weekly totals/recap claims. Existing owner reads, real media references, text-only tiles and explicit errors are reused. Equal-date cross-pet order uses pet enumeration rather than creation time: F6. |

## 3. Critical / P1 / P2 Findings

No new P0/Critical cross-owner disclosure or destructive schema issue was found. **P1 means fix before Production approval; P2 means a concrete medium-priority correction or explicit bounded limitation.** These findings do not authorize implementation.

### F1 — P1 — Disappearance is treated as confirmed completion

**Status:** Verified by source and executable recovery probe.  
**Files:** `apps/web/src/components/portal/RecordsManager.tsx:577`, `:591`, `:607`; initial-open inference at `:327`.

After a 408/5xx/unknown save, the code reads pending items. If the target is absent and `pending.complete` is true, it clears the draft, closes the editor and says the item “is now logged as done”. Refreshing the historical list does not verify a fulfiller; even a failed refresh is ignored.

**Reproduction:** reject create with `ApiClientError(503)`, return a successful empty pending response after the target was archived or its due date cleared, and return an empty historical list. Executing the current recovery body still emitted success and closed/cleared the editor. No completion record existed in this fixture. Pet lifecycle changes and another tab's actions are additional reasons pending membership can disappear.

The initial prefill also equates an absent target with “already logged” after a separate authorized record read. Moreover, **any** `details.fulfillsCareRecordId` error is called `alreadyClaimed` (`:568`), including unavailable-target, wrong-type and no-due-date validation errors. That can produce an incorrect “already logged” explanation and automatically remove the fulfilment link from a preserved draft.

**Impact:** false confirmation of care, lost input, and potential confusion between a retry and saving a separate unlinked record. This directly violates the requested recovery rule.

**Resolution:** absence from pending means only “not currently pending”. Confirm an actual active completing record before reporting completion; distinguish its canonical details from this particular attempted save. If confirmation is unavailable, keep the draft and use neutral changed/unconfirmed copy. Do not automatically turn a conflicting completion into a separate record without a deliberate owner choice. This can be corrected conservatively without introducing the Phase 2 command or Undo. Amend the test at `RecordsManager.logAsDone.test.tsx:305`, which currently supplies a successful scenario but never requires the implementation to inspect the returned completing record.

### F2 — P1 — Actual network errors bypass reconciliation

**Status:** Verified through the actual API client and uncertainty function.  
**Files:** `apps/web/src/components/portal/RecordsManager.tsx:1179`; `apps/web/src/services/apiClient.ts:417`; test mismatch at `RecordsManager.logAsDone.test.tsx:306`.

`fetchWithDatabaseWakeRetry()` wraps a dropped connection as `ApiClientError(0, "service_unavailable", …)`. `isUncertainSaveError()` accepts non-client errors, 408 and >=500, but returns false for this status-0 client error.

**Probe result:** a simulated failed POST through `apiRequest()` produced status 0; uncertainty classification was false; recovery showed the ordinary save error and made **zero** pending-check calls. The existing test supplies raw `TypeError`, which bypasses that production normalization and therefore passes.

**Impact:** a POST that committed before the response connection failed can be presented as an ordinary failure. Retrying may hit the unique claim conflict; the feature's promised reconciliation does not occur for a common failure mode.

**Resolution:** classify the client's normalized transport failures as unknown outcomes, retain the draft, and use the corrected F1 confirmation rules. Test the real client-shaped error for a committed, uncommitted and still-in-flight POST. A pending read immediately after an error is not proof that the original POST will never commit; avoid definite “couldn't save” language until that ambiguity is resolved.

### F3 — P1 — Same-total changing pages can produce a false all-clear

**Status:** Reproduced against actual `getAllUpcomingCare()` and `deriveDashboardCareView()` with controlled responses.  
**Files:** `apps/web/src/services/recordService.ts:165`, `:178`, `:189`; `apps/web/src/lib/dashboardHome.ts:65`; `apps/web/src/components/portal/dashboard/DashboardCareSection.tsx:159`.

Completeness is inferred from a stable total and the number of unique IDs assembled. Those conditions do not establish that the pages describe one consistent dataset.

**Minimal valid paging example, pageSize=1:**

| Step | Pending dataset / response |
| --- | --- |
| Page 1 | Dataset `[A future, B future]`; returns A, total 2 |
| Concurrent change | A removed from pending; C overdue added. Dataset now `[C overdue, B future]`; total remains 2 |
| Page 2 | Returns B, total 2 |
| Client result | `[A future, B future]`, two unique IDs, `complete: true`; C is missing |

The actual derived view reported `dueWithinHorizon: 0`, horizon `19 Nov`, and `complete: true`. The rendered branch consequently says **“Nothing due through 19 Nov.”** The same race scales to default 100-row pages. Updating a row's date/status after its page was read can similarly leave stale values without changing cardinality.

**Impact:** precisely the misleading reassurance P1-A was intended to prevent. API ordering is deterministic for a fixed dataset; it does not make independently requested offset pages a snapshot.

**Resolution:** derive all-clear/count claims from a consistent server-side owner/scope summary, or establish a real snapshot/revision contract and reject changed reads. A conservative Phase 1 alternative is to withhold all-clear/exact completeness claims for stitched multi-page reads until consistency can be established. Comparing total twice, sorting by ID, or adding an arbitrary maximum timestamp does not prove unchanged membership/content. No new table or migration is inherently required for a conservative solution.

### F4 — P2 — Incomplete response metadata is accepted as complete

**Status:** Reproduced.  
**Files:** `apps/web/src/services/recordService.ts:140`, `:169`; `apps/web/src/lib/dashboardHome.ts:73`; `DashboardCareSection.tsx:164`.

The adapter checks only that `items` is an array. Completeness checks do not validate `meta.page`, `meta.pageSize` or the calendar value in `asOfDate`. A response claiming page 9/pageSize 0 was accepted as complete when its item count matched total. Missing page/pageSize was also accepted. Missing `asOfDate` yielded an empty horizon label while retaining `complete: true`, permitting “Nothing due through .”

Missing total is correctly partial; negative/fractional totals did not pass the final size comparison in the probes. The specific current API normally supplies valid metadata, so these are defensive-contract gaps, not evidence it emits malformed responses today.

**Resolution:** validate expected page/pageSize, nonnegative integral totals, date/status fields and essential collections; refuse or mark malformed/inconsistent responses partial. Do not synthesize reassuring defaults for absent metadata. These checks supplement F3; they do not solve its concurrency race.

### F5 — P2 — Empty copy overstates what the pending query proves

**Status:** Verified source behavior.  
**Files:** `apps/web/src/lib/dashboardHome.ts:57`; `DashboardCareSection.tsx:139`; `apps/api/MyPetLink.Api/Services/CareRecordService.cs:130`.

If all due items are fulfilled, the API returns zero pending rows, while the original records still retain their due dates. The UI says **“No next care dates saved.”** It knows only that no next dates remain pending, not that none were saved.

**Resolution:** use “No pending care dates” or equivalent copy covering completed dates. “No care records yet” is valid only for the selected active-pet scope represented by `petIdsWithCareRecords`; avoid implying the account has no archived/history records. The future-only banner's 30-day horizon is otherwise aligned with the query's derived statuses when the data is valid and consistent.

### F6 — P2 — Equal-date Recent Moments favor earlier pets

**Status:** Verified sorter and in-memory tie probe.  
**Files:** `apps/web/src/lib/dashboardHome.ts:109`, `:123`; existing mapping `apps/web/src/services/momentService.ts:664`.

The API orders each pet's list by MomentDate then CreatedAt. The Dashboard merges by date and original concatenation index. For the same event date, an earlier pet's older-created entry precedes a later pet's newly created entry; several entries can consume all four visible slots. The current frontend Moment mapping does not retain CreatedAt, so the global tie-break cannot reproduce the API order.

**Impact:** relevant recent activity may be hidden by a tie across pets; there is no privacy or weekly-total error.

**Resolution:** explicitly define the tie-break. If newest creation within the event date is intended, retain the existing timestamp in the owner mapping/type and sort by it with a stable ID tie-break, maintaining fallback parity. Do not sort by publication time or convert this section into a weekly aggregate.

## 4. Care API Review

### Verified behavior

`CareRecordsController` retains `[Authorize]` and passes only the current JWT subject to the service (`Controllers/CareRecordsController.cs:10`, `:74`). The optional pet filter is validated through an owner-scoped lookup. Another owner's pet produces 404. The existing GUID-constrained get route remains distinct from `upcoming`.

`CareRecordService.ListUpcomingAsync()` (`:101–174`) applies:

- OwnerUserId predicate, non-deleted/non-archived pet and Active lifecycle.
- Non-deleted/non-archived care rows and a non-null due date.
- `NOT EXISTS` semantics for an active fulfiller across the full care table, independent of historical paging.
- Pet filter before distinct/count/page operations.
- DueDate, CreatedAt, Id ordering and projection before materialization.

The returned fields exclude provider, notes and documents. `meta.total` counts **all pending dates**, not just overdue/next-30-day items. Status and `asOfDate` use Malaysia's day; the existing no-date/overdue/30-day status rules remain equivalent after the helper extraction. The endpoint has no date-horizon filter: “upcoming” includes overdue and distant future dates.

Existing per-pet list/create/get/update/archive routes and response shapes remain compatible. No migration/model/index change was found. `(PetId, DueDate)`, owner/lifecycle and fulfilment indexes already exist.

### Requested scenario results

| Scenario | Independent evidence/result |
| --- | --- |
| >100 historical records / old pending outside history page | Existing new service tests passed; service predicate is independent of history order |
| Fulfiller outside original page | New service test passed; anti-join reads full table |
| Fulfilment chains | New service test passed: fulfilled ancestors excluded, unfulfilled head retained |
| Archived/deleted targets and fulfilers | Service tests passed for inclusion/exclusion rules; archive removes live claim in existing write path |
| Multiple owners/pets, foreign pet filter | Service and HTTP tests passed; owner scope is explicit |
| Exactly 500 pending | Actual client probe: five calls, 500 rows, complete true for a fixed fixture |
| 501 / 600 pending | Actual client probes: five calls, 500 rows, complete false; no all-clear branch |
| Changed total | Client probe: partial |
| Same total, changed rows | **Fails: F3** |
| Later page failure / fresh retry | Partial on failure; complete on a fresh stable retry fixture |
| Missing total | Partial |
| Missing/wrong page metadata or date | **Fails defensive handling: F4** |

The server runs three SELECT operations per page: pets-with-records, count and projected rows, with an additional ownership lookup when filtered. Five default pages can mean 15 SELECTs, plus pet and Moment requests. Appropriate indexes and bounded output support the design, but there is **no independent large-history execution-plan/latency measurement** here. The relational test covers SQL translation on a small seeded history, not production-scale performance. Do not describe this as profiled.

The five-page cap is safe when it remains visibly partial. Repeated Try again cannot overcome a stable >500-item cap, and selection of a lightly populated pet currently filters an owner-wide capped result client-side rather than issuing a narrower read. Consider scoped server reads or a clear route to further results later; do not mislabel the cap as a transient connectivity problem. View all still opens the existing historical manager, whose first-100 limit remains; it is not a new complete owner-wide planner.

## 5. Log as Done Review

### What passes

`ownerRoutes.petRecords()` encodes an opaque `complete` parameter (`apps/web/src/lib/routes.ts:95`). `RecordsManager.startCompletion()` calls the authenticated record read and owner-scoped pending read, checks pet ID/archive/due date, and consumes the query once (`RecordsManager.tsx:295`, `:377`). No title/provider/note is placed in the URL.

The normal form copies only type, title, care name and fulfilment target. Malaysia today is editable; the new audience is Private; provider, notes, documents and next due date start empty. An out-of-history target is added to the eligibility context. Optional next dates retain existing validation. “Log as done” opens “Log completed care”; completion success waits for the create response. Cancelling **before submission** sends no create and no analytics. It does not promise to roll back a POST already submitted.

Normal successful save inserts the returned record into the manager's current collection, so its target's effective Completed label can update there. The supplied confirmed screenshot supports that local-data happy path. Dashboard data reloads on mounting; no cross-component mutation/focus subscription was added. The exact browser-Back/cache round-trip against the real API was not independently exercised and remains a smoke check, not a proven immediate refresh guarantee.

### What does not pass

F1/F2 defeat the recovery contract. 408 and 5xx reach reconciliation, but its evidence is insufficient; normalized network failures skip it. Already-completed/archived/edited targets cannot all be distinguished by pending absence. The existing index prevents two simultaneous **active claims of the same target**; it does not establish which request saved, make create idempotent, or ensure unchanged target state.

`CareRecordService.ValidateFulfillmentAsync()` (`:566`) still validates then saves without a shared target edit/archive lock or RowVersion. Completion versus target type/due-date/archive edits can race. Archive clears claims (`:343–358`), so a later replay can again create a claim; this is an existing limitation, not a newly implemented Phase 2 guarantee. Do not claim universal duplicate-proof or concurrency-safe completion on the strength of the unique index alone.

For this Phase 1, prioritize neutral uncertain-state handling, draft preservation and positive confirmation. Do not add the Phase 2 endpoint or Undo as a review fix. Relational race cases should be tested in a separately authorized validation run before any stronger completion guarantees are advertised.

## 6. Dashboard UX/UI Review

**Visual assessment: good enough to keep, subject to the functional blockers. No wholesale redesign is warranted.** All 16 existing screenshots were actually opened, including the prefilled form and confirmed result.

| Layout / case | Visual evidence and assessment |
| --- | --- |
| 320px | `04`, `05`: recognizable pet photos, separated Share/View, readable wrapped care title and compact action. `14` shows constrained long names and a missing-photo fallback. No obvious horizontal overflow in these captures. |
| 390px | `01–03`, `12–13`, `16`: clear pet-first hierarchy, one-pet filter omitted, restrained cards, real entry media/text-only tile, independent care error and bottom-bar clearance. Two-pet content requires scrolling but no longer spends a screen on counters. |
| 768px | `06–07`: two pet cards across, care actions aligned to the right, four Moments across; comfortable spacing. |
| Labelled 1280px | `08–11`: sidebar, two pet cards, readable full-width care panel, recent-Moments row and an appropriate modal. Stacking care/Moments below the 2xl breakpoint is reasonable given the expanded sidebar. |

The screenshot files are mixed scale: some 390 captures are 780 pixels wide, and labelled 1280 captures are downscaled to 800 pixels. `15-320-long-care-titles.jpg` is only 192 pixels wide. These are rendered evidence, not an independently controlled browser viewport session. They do not prove 200% zoom, focus visibility, screen-reader behavior or keyboard interactions. No fresh local browser session was needed to assess the main composition; those missing interactions remain explicit verification limits.

Current code gives 64px avatars, soft local shadows, unchanged brand tokens, minimum-height buttons and reduced-motion classes. Share still opens `ShareCenter`; no competing global share row or Add tiles were introduced. The conditional occasion-card path was retained, not a new sharing architecture. Images come from each Moment's media reference; the supplied local-data screenshots use prepared fixture illustrations, not proof about real production owner photos. No hardcoded stock replacement was introduced in the Dashboard implementation.

Lost Mode precedes greeting/filter/content (`DashboardClient.tsx:303`); filtering does not hide it. Source and passing component checks cover Lost Mode and memorial-only households. Memorial-only rendering has quiet links and omits care/celebrations/add-another-pet nudges. No separate rendered Lost Mode, memorial or many-pet screenshot was supplied, so those visual states are not claimed as independently inspected.

**Only concrete refinements recommended:**

- Correct F5 copy. Keep the concise loading/error/empty structure otherwise.
- At 320px, long names lose substantial identity space to the generic Public badge (`DashboardClient.tsx:627`). If testing finds identification difficult, let the name wrap to two lines or move the secondary badge below it; keep the 64px photo and actions. This is a usability refinement, not a blocker on the supplied two-pet examples.
- For large households, all filter chips wrap (`dashboard/DashboardPetFilter.tsx:45`). At high pet counts they can push care several rows down. Reuse a compact existing chooser above a sensible threshold if needed; the current four-card cap already bounds the pet section. This is a source-inferred risk, not a measured many-pet visual failure.
- Obtain original-resolution long-title/desktop evidence and check 200% zoom plus keyboard/focus behavior before final sign-off. Do not change typography or add decorative UI merely to produce a different design.

## 7. Recent Moments Review

The Dashboard requests the existing per-pet owner endpoint (`apps/web/src/services/momentService.ts:99`). The service filters current pet ownership, deleted rows and archive state, and sorts by MomentDate/CreatedAt (`apps/api/MyPetLink.Api/Services/MemoryService.cs:25–67`). Private Moments are valid content on this authenticated surface. No anonymous projection or public Moment-detail route is introduced for these tiles.

For distinct event dates, merging the newest 100 per pet is sufficient to obtain the newest three/four from that same primary-pet scope. It does not need to page through an entire history to find those top items. It is **not** a complete-week query, nor a list of recently created posts irrespective of backdating. Existing nullable legacy dates and future-dated Moments retain the existing endpoint's semantics. Equal-date cross-pet tie behavior is F6.

Association remains **primary pet**, matching the existing owner Moments manager. This feature does not newly include additional-subject or collaborator appearances from Community. All-pets view combines successful owned-pet reads; selecting a pet narrows those reads' contents. No cross-owner data path was found. The UI relies on server ownership enforcement rather than claiming its client filter is authorization.

`DashboardRecentMoments` distinguishes no content from failed loading (`:126–155`); if some loads fail and others succeed, successful tiles remain with an explicit partial warning. The per-section retry starts a fresh read. Text-only tiles render a category rather than a fabricated photograph. Image/video references are taken from the actual Moment media; there is no autoplay video or invented fallback photo. Links go to `ownerRoutes.petMoments()` and contextual Add Moment uses the existing create/chooser routes.

No “This week” totals, ready-recap message or new weekly feature exists in the implementation. The private-limit note only uses a fully loaded count (`apps/web/src/lib/dashboardHome.ts:166`) and does not change the plan, audience or public/private boundary.

## 8. Security and Privacy Review

**Verified:** the new endpoint requires authentication, takes the actor from the session, and projects only the caller's active pets/records. A client pet ID narrows rather than overrides actor identity. The target-record read independently enforces ownership. Wrong-pet prefill is rejected before opening the editor. No notes/provider/document metadata is exposed in the overview. Form defaults are private and existing public care visibility rules remain authoritative on save.

The `complete` query carries an opaque record ID only; URL encoding and the authenticated server read prevent treating it as permission. Query consumption minimizes repeated opening but is not a security boundary. Existing API errors remain in the project envelope; user-facing copy avoids implementation details. No new secret/config dump, upload category, public export or analytics parameter was introduced.

**Bounded conclusions:** API HTTP tests here use a test authentication handler, so they verify protected routing and identity-scoped behavior, not a fresh real-JWT login/expiry smoke test. Current JWT validation/active-account infrastructure is unchanged. That integration still belongs in deployment smoke validation.

The Only Me public-object storage issue, GA4 adapter issue and private-Moment limit policy identified in the earlier audit remain separate workstreams. Showing an existing private Moment image on its owner's Dashboard uses the current media posture; it does not repair or redefine that posture. No remediation, quota change, Premium checkout or privacy-default change was attempted here. No new critical cross-owner leak was identified.

### Regression boundaries inspected

| Surface | Review result |
| --- | --- |
| Pet management | Existing routes/card targets preserved; four-card cap and Manage/View all links remain |
| Care create/edit/archive | Old API contracts retained; 40 existing service tests and existing manager/service web suites passed; new recovery is the problem, not a schema replacement |
| Moments management | Existing service/editor routes reused; no source changes to Moment storage/visibility service |
| Share Center | Component unchanged; current Dashboard/share tests pass, including its four choices and new-tab public preview |
| Share/Safety Profiles | No projection, finder bridge or public-card service changes found in the Phase 1 diff |
| Smart Tag scan/activation | No scan/activation service or public route changes; route helper regression suite passed. No fresh end-to-end physical scan test was performed |
| Free/Premium | Plan fields/default limits/enforcement unchanged; no subscription flow |
| Community independence | No new Community gate on Share Profile/care/Moments. Production-value frontend executions passed; a live Community-off deployment smoke test was not run |
| Local fallback | New pending adapter applies owned active-pet and fulfilment selection in the fallback path; its existing tests passed. Fallback is a local preview, not production authentication |

Do not turn “unchanged by this diff” into “all production regression scenarios were independently rerun”. The latter would overstate this review.

## 9. Test Results and Flaky Test Assessment

### 9.1 Independently executed checks

| Check | Result / scope |
| --- | --- |
| New non-relational API service + HTTP classes | **18 passed**, zero failed/skipped, using the existing built assembly |
| Existing CareRecordService / CareRecordIdentityAndFulfillment classes | **40 passed**, zero failed/skipped, EF InMemory/model checks |
| Focused web service/helper/Dashboard/completion/share suites | **8 files, 122 passed** |
| Additional existing record-list/identity/document/public-care/terminology/route suites | **6 files, 37 passed** |
| Dashboard, Log as done, Share Card availability with six production feature values true | **3 files, 70 passed**; these overlap default tests and are not 70 additional distinct tests |
| Web TypeScript + edge/functions TypeScript | **Passed**, `--noEmit --incremental false` |
| Web lint | **Passed**, no fixes or cache requested |
| New relational care test | Source reviewed; **not rerun** because its fixture creates/drops a SQL database |
| Full API / full web suite / production build | Author-reported results reviewed; **not independently rerun** in this read-only pass |

Web runners used the existing configuration with cache disabled and the runner config loader, without writing new test files/reports. API checks used `dotnet vstest` on the existing assembly, whose timestamp is newer than the inspected care service/test sources, and selected only the two new InMemory classes plus the two existing InMemory care classes. No relational fixture was selected. Existing report evidence was not overwritten.

The independent behavioral probes additionally established:

- 500 pending succeeds; 501 and 600 are partial after five pages.
- Changed total and later-page failure remain partial; a stable fresh retry recovers.
- Same-total replaced membership is incorrectly complete and can derive an all-clear.
- Wrong/missing page metadata is accepted; absent as-of date can generate an empty horizon label.
- The actual client's normalized network error is status 0 and is not classified uncertain.
- A 503 plus no pending target can produce completion success without any completing record.

These probes use controlled in-memory fixtures. They demonstrate current code branches without altering a live database, but do not measure production latency or replace a real API/browser round-trip.

### 9.2 Coverage gaps that explain the false confidence

`recordService.upcoming.test.ts:125` checks **changed totals**, not same-total membership/content changes. Its budget test validates partial behavior, but not a consistent point-in-time view. The missing-total test does not cover wrong page/pageSize/as-of metadata.

`RecordsManager.logAsDone.test.tsx:305` assumes pending absence corresponds to its supplied `saved()` record, yet the implementation never inspects that record to establish the relationship. The dropped-connection tests mock `TypeError` directly; the real API client exposes status 0. No test covers target archive/date clear/pet lifecycle change being mistaken for completion. The concurrency test supplies a prebuilt validation response rather than exercising concurrent SQL transactions.

Add meaningful regression cases for F1–F3 and malformed responses when fixes are separately authorized. For an ambiguous save, test the returned canonical fulfiller and the owner's draft, not only a success sentence. Test another tab with different completion data and a POST still finishing after the recovery read. For paging, hold the total constant while replacing/reordering/updating rows.

### 9.3 `TheFeed_IsOneQueryThatJoinsTheFollowGraphInSql`

**Independent finding:** the failure pattern predates Phase 1 and is supported by saved raw test results, not merely Claude's three isolated reruns.

| Existing artifact | Actual saved outcome/evidence |
| --- | --- |
| `artifacts/consignment-final-verification/api-full-suite.trx` | **Failed on 17 October**, missing `IX_OwnerBlocks_BlockerUserId_BlockedUserId`; output still reports nine round trips and a plan using `PK_OwnerBlocks` |
| `artifacts/consignment-final-verification/api-failed-rerun.trx` | **Passed on 17 October**, nine round trips; plan uses the named OwnerBlocks index |
| `artifacts/consignment-release-gate/api-full-suite.trx` | **Passed on 18 October**, same expected index in the plan summary |
| `artifacts/consignment-phase1b-final-fixes/logs/full-api-run1.trx` | **Passed on 19 October**, same expected index in the plan summary |

The current test requires an **exact physical index name** (`apps/api/MyPetLink.Api.Tests/Relational/SocialQueryPlanRelationalTests.cs:188–193`). Its fixture seeds random owner/pet IDs and current publication times, but no OwnerBlocks population in `SeedAsync()` (`:576`). It updates statistics on Pets, social profiles, follows and Moments (`:646`), not a representative large block table. A clustered access path over an empty/tiny block table can be a legitimate optimizer choice; the named-index assertion is more specific than the essential privacy/query contract.

That explanation is consistent with SQL Server's cost-based selection of access methods using statistics; it is an inference about this failure, supported by the two saved plan summaries, not a newly captured SQL execution. [Microsoft query processing architecture guide](https://learn.microsoft.com/en-us/sql/relational-databases/query-processing-architecture-guide?view=sql-server-ver17).

Source inspection confirms that the feed still has an explicit block predicate (`apps/api/MyPetLink.Api/Services/SocialFeedService.cs:60–77`). The saved failure is an index-name assertion failure, not a missing SQL predicate, unexpected row, or extra round trip. No Phase 1 diff changes the feed service, visibility rules, DbContext indexes, migrations or this test. The care endpoint's independent query does not change the feed's SQL shape.

**Assessment:** strong evidence for a pre-existing optimizer-plan-sensitive test, with no demonstrated Phase 1 cause. This does **not** establish good feed performance for a realistically populated OwnerBlocks table or prove that all full-suite failures can be ignored. A better separate test should verify filtering/results, stable round-trip bounds, and table-specific access/reads on representative data rather than demand a particular index string from one small-data plan. Do not force an index in production just to satisfy the assertion.

**Reproducibility statement:** the pattern is independently confirmed in historical raw results. It was **not freshly rerun** here: `RelationalDatabase.CreateAsync()` creates a database and `DisposeAsync()` performs single-user rollback/drop (`RelationalDatabaseFixture.cs:43`, `:129`). This request forbids database changes/deletion. No LocalDB restart, cleanup, cache flush, statistics update or database deletion was performed. The current report's exact 3,000/1 full run and 3/3 isolated reruns were not accompanied by raw Phase 1 run files in its artifact folder, so they remain reported results.

**Release implication:** this test alone is not evidence of a Dashboard regression and is not the functional release blocker identified here. The full suite should not be represented as wholly green; record the known failure with its evidence and obtain the normal release gate's explicit treatment. F1–F3 independently require NO-GO regardless of how that test is handled.

### 9.4 Final two UI fixes and rerun scope

The implementation report does not identify those two edits with separate diffs/check hashes, so their exact sequence cannot be independently reconstructed. The **current** Dashboard/helper/share/record suites passed, including 70 executions with production feature values enabled. Supplied screenshots show the current small-screen counts and wrapped titles. The existing exported Dashboard chunk also contains the mobile-only additional-count branch now present in source.

Pure presentation fixes do not by themselves justify rerunning thousands of unrelated SQL tests. Current component tests, production-value tests, typecheck/lint and visual inspection are proportionate. A final production build still needs to be performed on the exact approved release candidate; this review did not overwrite `out` or rebuild it. After F1–F3 changes, rerun the affected service/client/manager/Dashboard suites and real end-to-end recovery scenarios; those are behavioral fixes, not two CSS-only edits.

## 10. Production Readiness

### Deployment and compatibility

**Deploy API before Web**, or as a coordinated compatible rollout. The old Web can operate with the additive new API. The new Web against an old API should enter the explicit care error state when `upcoming` is missing; it must not silently fall back to incomplete historical data. This behavior is source-reviewed, not an independently deployed compatibility smoke test.

No EF migration, root `migration.sql` regeneration, new App Setting or Dashboard feature flag is required by these changes. Existing plan, lifecycle and fulfilment fields support the new query. Existing shared availability flags still influence familiar public/share surfaces; the Dashboard itself has no unexpected new flag prerequisite.

Care-read responses retain the existing envelope, typed collection and pagination metadata. Existing CRUD routes are not renamed. The shared status helper preserves prior behavior, supported by the 40 existing API checks. DTO additions are additive. Default client fallbacks for malformed new responses need F4 rather than a different API envelope.

Runtime business/config ownership does not change. The currently modified `Program.cs` contains unrelated marketing-development work; Phase 1's service is already registered and the added method does not require those edits. Release packaging must isolate the intended candidate without discarding any of that existing work. Do not deploy the entire dirty working tree simply because Dashboard checks passed.

### Operational and rollback requirements

- Resolve F1–F3 and validate any response-contract refinements in F4; record P2 decisions explicitly.
- Produce the production build from the exact reviewed candidate with the existing approved API URL/release feature values. No build was produced by this review.
- Measure upcoming-care requests on a realistic owner history and modest multi-pet load. Watch the three-query-per-page shape, repeated history scans for metadata and capped-read behavior. No index addition is justified solely by this report.
- Preserve normal request IDs and error envelopes. Log actionable server failures without record notes, contact details or request bodies. The frontend currently catches section-load errors generically for display; use request/network evidence in smoke tests to distinguish auth, 404 endpoint mismatch and transient failures.
- Roll Web back first if the feature must be withdrawn; the additive API can remain. If subsequently rolling API back, ensure no new Web still depends on it. No database rollback is needed.
- Use existing recovery/rollback mechanisms, not a newly invented flag or migration. Do not alter Consignment, Merchant, physical-tag routing or unrelated marketing configuration to release this feature.

### Required smoke tests on the eventual release candidate

1. Real owner authentication, expired-token refresh and a second owner's rejected pet filter; ensure no cross-owner titles/counts.
2. An authorized test pet with >100 historical records, a distant pending item, an out-of-page fulfiller, and a fulfilment chain.
3. Five-page cap, partial failure/retry, changed total, **same-total row replacement/reorder**, and malformed metadata; no false empty/all-clear.
4. Prefill, cancel-before-save, confirmed save, optional next due, dashboard return, already-completed/archived/edited target, and two-tab saves with different details.
5. Dropped POST response/status 0, 408, 5xx and a slow still-running POST; preserve draft until actual state is established. A target disappearing without a fulfiller must never become successful completion.
6. Actual API-connected 320/390/768/1280 rendering, long names/titles, no photos, no Moments, Lost Mode and memorial-only household; keyboard, zoom and bottom-bar clearance.
7. Existing pet management, care edits/archive, owner Moment creation, Share Center, Share Profile with Community off, and representative Safety/Smart Tag scan and activation compatibility.

These are release-candidate requirements, **not authorization to change production records during this review**. Use authorized disposable test data and existing operational procedures when that validation is approved.

## 11. Remaining Risks

| Risk / uncertainty | Classification and disposition |
| --- | --- |
| Unknown-save false success / dropped draft | **Verified P1, F1; blocks release** |
| Normalized network failure skips reconciliation | **Verified P1, F2; blocks release** |
| Same-total paging false completeness | **Verified P1, F3; blocks release** |
| Response metadata/date validation | **Verified P2, F4; correct or explicitly bound before approval** |
| Pending-empty wording and equal-date Moment ordering | **Verified P2, F5/F6; small targeted corrections** |
| Target edit/archive races in existing create model | **Source-confirmed existing limitation; concurrent interleavings not freshly executed**. Keep Phase 1 guarantees narrow; do not add Undo/Phase 2 here |
| Stable >500 pending cap / View all historical limit | **Verified bounded limitation**, not a false all-clear when partial. Avoid implying Retry or the current historical list can retrieve everything |
| Long-lived Dashboard after another-tab edit or Malaysia midnight | **Source-inferred freshness risk**: loading is mount/retry based; no focus/mutation/midnight refresh is registered (`DashboardClient.tsx:103–184`). Validate return/navigation behavior; do not promise live updates |
| Real API browser round-trip / large-history performance | **Not independently exercised/profiled**; requires eventual smoke/capacity verification |
| Lost Mode/memorial/many-pet visual and accessibility states | **Source/component checked; fresh rendered interaction not checked** |
| Historic Community plan-test variation | **Raw prior-run evidence confirmed; fresh SQL rerun intentionally not performed**. Treat as separate known test-gate issue |
| Private-media storage, GA4, Free private limit | **Previously identified separate workstreams**, unchanged; not silently repaired or used as a reason to implement unrelated work |

## 12. GO / CONDITIONAL GO / NO-GO Recommendation

| Area | Decision |
| --- | --- |
| New API's owner scoping, pending filters and static pagination | **GO in principle**, with snapshot/summary and malformed-contract issues addressed in the consuming flow |
| Normal authorized prefill and confirmed Save | **GO in principle** |
| Uncertain/failed Save recovery | **NO-GO — F1 and F2** |
| Dashboard completeness/all-clear guarantee | **NO-GO — F3** |
| Visual direction and inspected main layouts | **GO to retain**, with the limited checks/refinements in section 6 |
| Recent Moments | **CONDITIONAL GO**, resolve or document F6's tie-break; no weekly scope expansion |
| Full Phase 1 Production deployment | **NO-GO now** |

Approval can be reconsidered after F1–F3 are fixed and demonstrated with the actual client error shapes and changing-data fixtures, P2 dispositions are recorded, the exact release candidate is built, and the relevant API-connected smoke checks pass. No Phase 2 completion endpoint, Undo, migration, analytics rewrite, media remediation or plan change is required merely to make the conservative Phase 1 recovery truthful.

**Is MyPetLink Phase 1 Dashboard Enhancement safe, visually polished, and ready for Production deployment?**

**Not yet. The inspected Dashboard is visually coherent and substantially polished, but its completion-recovery and pagination guarantees are not safe enough for Production approval. The three verified P1 defects must be resolved first.**

Review stopped here. Only this review report was created; existing uncommitted work was preserved.
