# Release-gate verification: Wholesale / Consignment (N1–N9)

Date: 18 October 2026 · Scope: final uncommitted source at `C:\Project\MyPetLink` · Read-only review and testing

## Method and constraints

- No source was modified, and nothing was staged, committed, pushed or deployed. Production and real inventory were not touched.
- Every SQL run used disposable LocalDB `MyPetLinkTest_*` databases created and dropped by the fixtures. No required relational test was skipped.
- Codex's reported counts were not reused. Every number below comes from runs made during this review, on the final source.

**Evidence in this folder:**
- `api-full-suite.trx/.log`
- `release-gate-probes.log`, plus the probe source `ReleaseGateProbes.cs`
- `isolated-b2b-tests.trx/.log`
- `ef-script.log`
- `web-full-suite.log`, `web-typecheck.log`, `web-lint.log`

## 1. N1–N9 matrix

| ID | Result | Independent evidence (probe → observed) |
| --- | --- | --- |
| **N1** | **PASS** | G01 re-ran V02/V03. A held consignment reservation **dispatches**, and a fully allocated wholesale order is **marked Ready to Ship and Shipped**, even after later retail orders against Pending stock. The H1 guard still blocks *new* claims (`409 inspected_inventory_reserved`). A held unit whose QA fails after reservation is still blocked at dispatch. `RequireInspectedRetailReserveAsync` has no remaining call sites. |
| **N2** | **PASS** | G02 is the exact scenario: 100 dispatched, 98 good, 1 damaged, 1 missing. The untruthful "100 counted + 1 missing" is refused (400). The truthful "99 counted (98 good + 1 damaged) + 1 missing" is accepted, giving 98 Received, 1 Damaged and 1 Missing; the dispatch stays Dispatched. An exact replay adds no movement. A good unit can be handed over while the other issues stay open; the missing and damaged units are refused (409). Customer activation of the missing unit's tag returns `tag_not_ready`. After the damaged unit is physically returned, a third operator records the return review (quantity 0), and the original partner receipt (99, recipient) is kept. "Still missing" can't be passed off as a resolution (409), and closing the agreement is refused while the shortage is open. Locating the missing unit later moves the dispatch to Receiving complete. Finance rows stay at 0. |
| **N3** | **PASS** | G03: the creator can't approve after someone else's no-op save (35 vs 35.00 is correctly treated as a no-op). An editor who changes 35→30→35 is a contributor even after reverting, and both creator and editor get 403. A never-involved operator can approve. An operator whose only save was a no-op can approve, which is correct. 2 contributors were recorded. |
| **N4** | **PASS** | G02: the issue recorder gets `403 independent_discrepancy_review_required` and the dispatcher gets 403. A third operator succeeds. A returned unit can't be released before the independent review, even with QA Passed (409). |
| **N5** | **PASS** | G04: an identical payload with a new key returns `reservationReused=true`, the same dispatch, and still 4 held units and 1 dispatch. Different content creates a new dispatch (`reused=false`), raising holds from 4 to 6. The controller maps the flag to 200 for reused and 201 for new (`AdminConsignmentController.cs:50`). |
| **N6** | **PASS** | G05: a SQL command interceptor captured all 9 list/detail statements, and none selects `IssuedDocumentContent`. The archived PDF still downloads byte-identical after receipt. |
| **N7** | **PASS** | G06: 1e15, 1,000,000, −1, a negative discount and 3 decimals each return 400. 999,999.99 and 49.90 are accepted. |
| **N8** | **PASS (API + component)** | G07: the history entry carries actor, unit (or "whole delivery"), reference and structured evidence as separate fields. UI separators are covered by `ConsignmentPanel.test.tsx` (in the 4,338 passing web tests). I didn't take a fresh browser screenshot in this round. |
| **N9** | **PASS** | G07: `UnitReference` is `CU-` plus the full immutable unit GUID, derived only from the unit id, never the Tag Code or sort position. It is identical across reloads, and no Tag Code appears in it. The UI pagination and sort exercise is covered by component tests only. |

## 2. Remaining release-blocking defects

**None confirmed.** One observation is non-blocking and needs no code change for staging:

- **`ReceivedQuantity` is "latest physical receipt event", not a cumulative count.** After the located missing unit was confirmed in G02, the dispatch-level `ReceivedQuantity` changed from 99 to 1. This is documented behaviour; current good stock is shown separately. Make sure UAT testers and Finance read it that way, or show the counting history alongside it.

## 3. Test results (final source)

| Run | Total | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| API, full suite (whole repository, real SQL Server) | 2,822 | 2,822 | 0 | 0 |
| Release-gate probes G01–G08 (disposable SQL Server) | 8 | 8 | 0 | 0 |
| B2B regression in the **isolated B2B-only tree** (consignment, merchant, fulfilment, allocation, Physical QA, assignment, orders; serial) | 635 | 634 | 1* | 0 |
| Web, full Vitest suite | 4,345 | 4,338 | 0 | 7 |
| Typecheck (app + functions) | – | pass | – | – |
| ESLint (merchant sales, consignment service, capability and navigation files) | – | pass | – | – |

- The full API run covers B2C checkout, reservation and assignment; QR activation and ownership; wholesale quotation, invoice, receipt and shipment; consignment; Physical QA; concurrency races; maker/checker; exports; PDFs; and the migration-safety tests.
- The 7 web skips are the existing flag-conditional cases in `page.test.tsx` (2), `OwnerLoginExperience`, `ContextualSocialShell` and `merchantDirectoryService.routing`. None are consignment or B2B tests.
- \* The one failure in the isolated tree, `MerchantDirectoryHttpTests.BrowserServiceSmoke…`, happens because that test looks for the repository-root `package.json` and the web app. My scratch export contained only `apps/api`, `docs` and `migration.sql`. The same test passes in the full repository run (2,822/2,822). It is a packaging-environment artifact, not a B2B defect.
- Not re-run by me: the production web build (Codex's log only).

## 4. B2B-only release isolation verdict: **PASS (technically separable)**

1. I exported committed HEAD (`apps/api`, `docs`, `migration.sql`) into scratch, not a worktree or clone. I overlaid every modified and untracked B2B/consignment file **except** `Program.cs`, `launchSettings.json`, `appsettings.Development.json`, `MarketingDemoOptions.cs`, `MarketingDemoSeeder.cs` and `MarketingDemoSeederTests.cs`. `Program.cs` = HEAD plus only the two consignment registrations.
2. All three consignment migrations are present: `20261017082802`, `20261017103941` and `20261017160448`.
3. The API and test projects build with 0 errors and no `MarketingDemo` references.
4. `dotnet ef migrations script --idempotent`, generated from the isolated migration assembly, is **identical** to the root `migration.sql` (SHA-256 prefix `a3861bbb…`, after line-ending/BOM normalisation).
5. The B2B regression subset passes inside the isolated tree (section 3).
6. The web B2B files have no Marketing Demo coupling. The root `package.json` `marketing:*` scripts and the `.gitignore` entries are Demo-only, so leave them out.
7. **The scoped patches are not release packages.** Neither `consignment-remediation/remediation.patch` nor `consignment-final-remediation/remediation.patch` applies to clean HEAD (`git apply --check` fails); each is an incremental review diff. The release must be packaged from the full working-tree file set, with a partial (hunk-level) commit for `Program.cs`.

## 5. Staging UAT readiness: **CONDITIONAL GO for controlled Staging UAT**

The software as built passes its gates. **Business clarification (18 Oct 2026):** MyPetLink is run by a single founder, so the current independence rules can't be satisfied by real, distinct people. See section 8.

**What staging UAT can do now:**
- Run the full workflow end-to-end using clearly labelled **staging-only synthetic operator accounts**.
- This validates the software, migrations, permissions and rollback guards.

**What it must not do:** be treated as rehearsing the live operating procedure. Real-world use needs Solo Operator Mode (section 8), or real additional personnel.

**Conditions:**
- Package and review the isolated B2B commit as described above.
- Back up the staging database, apply `migration.sql` with `sqlcmd -I`, then deploy the API and the matching web build together.
- Grant reviewed capabilities to the synthetic staging operators.
- Use test stock only.

## 6. Production and first-100 dispatch blockers

| Area | Technical status | Business status |
| --- | --- | --- |
| **Founder can operate alone** | **Blocked by design.** Approval, receipt and discrepancy review each require a different person, with no Super Admin bypass. | **Open: requires Solo Operator Mode (section 8).** Creating extra admin accounts for one person is *not* an acceptable workaround: it would falsify the audit trail's independence. |
| Signed 35% partner agreement (dates, duration, return/loss/damage liability) | Fields and approval gate ready | **Open: not signed** |
| Settlement frequency, payment deadline, discount policy, commission base, rounding, tax/e-Invoice responsibility | Captured as typed terms; reported sales are unverified and create no finance records | **Open** |
| Financial reconciliation owner and external tracker | Reconciliation CSV ready | **Open:** the founder owns it, plus a periodic external (accountant) review |
| Missing/damaged tag investigation and permanent-shortage policy | Holds enforced; no loss allocation | **Open: approve the policy** |
| Real QR camera / Web NFC hardware, same-chip re-inspection | Software path verified with simulated reader input | **Not tested: staging gate** |
| Physical 100-tag count and manifest match | Controlled manifest and immutable PDF ready | **Open.** Solo version: a partner-countersigned count at handover replaces the internal second-person count |
| Staging evidence, rollback rehearsal, production approval | Down guards verified in automated tests | **Open** |

## 7. Recommendation

- **Software release gate: PASS.** N1–N9 are fixed and no release-blocking defect remains. Stop the local remediation cycle. No further broad audit is warranted.
- **Staging UAT: proceed (controlled), as in section 5.** In parallel, implement Solo Operator Mode as a scoped follow-up (section 8) and include it in the same staging UAT before any production decision.
- **Production deployment: NO-GO.** Solo Operator Mode (or real additional staff), accepted staging evidence and release approval are all required first.
- **First 100 physical tags: NO-GO** until the business items in section 6 are closed.

## 8. Follow-up recommendation: Solo Operator Mode (not implemented)

### 8.1 Technical defects vs. requirements being reconsidered

| Item | Classification |
| --- | --- |
| N1–N9, inventory protection, PDF immutability, rollback guards, Tag Code privacy, finance boundary | Verified working. **Keep unchanged in both modes.** |
| Maker/checker on agreement approval (H2/N3) | **Not a defect.** Works as specified. The requirement is being *reconsidered* for a one-person business. |
| Dispatcher ≠ receipt recorder (H2) | **Not a defect.** Requirement reconsidered. |
| Issue recorder and dispatcher ≠ discrepancy reviewer (N4) | **Not a defect.** Requirement reconsidered. |

**What stays the same in both modes.** The independence rules exist to stop one internal person from concealing a stock or commission discrepancy. In Solo Mode that control moves from *internal* to *external* and *evidentiary*. The following never change:
- partner signature and acceptance evidence;
- the physical counts and per-unit receiving findings;
- the physical-return and fresh Physical QA requirements;
- inventory holds and locks;
- unique external references;
- the immutable PDF;
- the zero-finance boundary.

### 8.2 Recommended design: two-level control, Team mode by default

1. **Organisation setting `Consignment review mode = Team | Solo`.**
   - Typed, DB-backed, Admin-editable, with `RowVersion`, UTC timestamps, an audited reason and a purpose-built UI (configuration-governance rules 5 and 12).
   - Seeded **Team** (fail closed).
   - Switching to Solo needs Super Admin plus a written reason. Switching back to Team is always allowed.
2. **New catalogued capability `consignment.self_review` (Sensitive).**
   - Grant it to no role template by default. Grant it explicitly to the founder through Access Management.
   - **Self-review is allowed only when BOTH the Solo setting and this capability are in effect** (rule 9: two-level controls are AND). Super Admin's grant-all must not be enough without the setting.
   - Mirror the capability in `AdminCapabilityCatalog.cs` and `apps/web/src/lib/adminCapabilities.ts`.
3. **Apply it at the three independence checks only:**
   - agreement approval (contributor exclusion);
   - `RequireIndependentReceipt` (dispatcher ≠ receiver);
   - discrepancy review (recorder/dispatcher ≠ reviewer).
   - When the same actor is involved, the request must carry a **self-review attestation**: explicit confirmation, a reason, and an external evidence reference (e.g. the partner-countersigned agreement or delivery note, or a photo/scan file reference). Without it the API returns 400; without mode plus capability it still returns 403.
4. **Make Solo approvals visible, never silent:**
   - Store `ReviewMode = SoloSelfReview` on the agreement approval, the receipt/discrepancy movement and the resolution.
   - Write a distinct audit action (`consignment.solo-self-review`).
   - Show a visible "Self-reviewed (Solo)" badge in the UI and history.
   - Add a `Review mode` column to the manifest CSV, the reconciliation CSV and the history.
5. **Solo-specific compensating evidence (enforced in validation):**
   - **Agreement approval:** the signed partner agreement reference is mandatory (already true), and a cooling-off confirmation step shows the full term summary before freezing.
   - **Receipt:** the evidence must be a *partner-signed* count reference (recipient name plus a signed delivery-note reference). Self-attestation alone is not accepted.
   - **Discrepancy resolution:** requires a new evidence reference that differs from the original finding (no self-resolution on the same evidence). Missing units can only be resolved by "located" plus evidence, or an actual physical return. Unresolved shortages stay held exactly as today.
6. **Periodic external review in place of internal segregation:**
   - A bounded "Solo self-review log" export of every self-reviewed event, for a monthly founder–partner statement reconciliation and periodic accountant review.
   - The runbook records who reviews it and how often.
7. **Turning Team mode back on when employees join** needs no data migration. Historical Solo events keep their marker.

### 8.3 Minimum change set (scope estimate)

- **API:**
  - One setting entity plus admin endpoint (typed, audited).
  - One capability constant plus catalogue entry.
  - An attestation DTO on the approve, receive, record-discrepancy and resolve-discrepancy requests.
  - A `ReviewMode` column on agreement approval, movements and receiving findings.
  - The three independence checks gated by `setting == Solo AND capability AND attestation`.
  - Export columns.
- **Migration:** additive, with the setting seeded **Team**. Extend the Down guard to include the new data.
- **Web:** a Solo-mode setting card, attestation dialog fields, a "Self-reviewed" badge, and the capability mirror.
- **Tests (required before staging):**
  - The Team mode matrix stays unchanged (all current N3/N4/H2 tests).
  - Solo mode enabled with capability and attestation succeeds and is marked.
  - Solo enabled without the capability gives 403.
  - Capability without Solo enabled gives 403, including Super Admin.
  - Missing attestation or evidence gives 400.
  - Exports show the review mode.
  - Switching back to Team restores the independence checks immediately.
  - Inventory, PDF and finance-boundary regressions re-run.
- **Docs:**
  - Runbook Solo procedure.
  - Configuration inventory entry for the new setting.
  - Architecture note: what Solo relaxes and what it never relaxes.

**Production remains unauthorized; no real stock may be dispatched.**
