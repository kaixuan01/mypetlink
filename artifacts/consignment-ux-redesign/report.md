# Consignment Admin UX redesign — report

Date: 18 October 2026 · Scope: Admin → Merchant Sales → Consignment (`apps/web` only) · Status: **implemented locally, not staged, committed, pushed or deployed**.

## 1. The problems with the old screen

The old `ConsignmentPanel` put every consignment task on one 3,000–5,000 px page (see `screenshots/before-*.png`):

- The **Approval Policy** form, with its history, sat at the top of the page for every visit, though it changes rarely.
- **New agreement** opened a 14-field form inline, with "Pending confirmation" placeholders in every empty box. The 35% rate was pre-filled.
- One global **"Agreement closure reason"** field sat under the agreement list and applied to whichever Close button was clicked.
- The **reservation form**, the dispatch list and an open dispatch were stacked below one another. The open dispatch showed every action button at once (dispatch, receipt, returns, release, handovers, corrections, reversals, write-off) and one shared "Action reason / acknowledgment / tracker entry reference" field.
- **Exports** were mixed in with custody work.
- Nothing said which step came next, and buttons, spacing and empty states were plain.

## 2. The new structure

Consignment has a header with a one-line custody disclaimer and two primary actions, **Reserve stock** and **New agreement**. Each action appears only for operators with the matching capability. Five sections sit under it, and each keeps its state in the URL:

| Section | URL | Content |
|---|---|---|
| **Overview** (default) | `view=overview` | Three KPI cards from real records: active partner agreements, tags held by partners, and receipt/discrepancy actions. "What needs doing" lists only non-zero work. A short approval-policy summary links to Settings, and a seven-step guide explains the workflow. |
| **Agreements** | `view=agreements`, `agreement=<id>` | A paginated list with a server-side merchant filter. Columns: merchant, agreement and version, partner commission with MyPetLink's share, status, effective period, next step. The detail page shows a workflow stepper, the pending-terms callout, the terms grouped as they are negotiated, the stock under that agreement, and **contextual actions only**. |
| **Stock custody** | `view=custody`, `dispatch=<id>` | The delivery list: partner, dispatch reference, tags, receiving progress bar, unresolved damaged/missing units, custody status, next step. A filter narrows it by agreement. The delivery detail is described in §4. |
| **Reconciliation** | `view=reconciliation` | States plainly that partner-reported sales are unverified and never become an invoice, commission, payment or settlement. Lists deliveries still to reconcile. Exports reconciliation records and the review log for a From/Through date range; these exports require the manifest-export capability. |
| **Settings** | `view=settings` | The approval policy: summary cards for mode, founder authorization and last change, the change form (policy-manage capability only), and the change history. |

Old deep links still work: `?tab=consignment&dispatch=<id>` opens the delivery. Back, Forward and refresh restore the section and the open record.

## 3. New agreement wizard

`AgreementWizard` is a `FormDialog` with four steps: **Partner → Commercial terms → Review → Approval**.

- Each field is labelled **Required**, **Needed before approval** or **Optional**. Errors appear inline beside the field when you try to continue. The checks mirror the server: reference up to 100 characters, commission 0–100 with at most two decimals, payment deadline a whole number from 0 to 365, end date after start, text up to 2,000 characters.
- Terms are grouped: commission and duration, settlement and payment, discounts and returns, loss and damage, signed partner agreement, external tracker.
- **The commission starts blank.** A "Use proposed initial rate (35%)" link fills it in, and a note then says partner acceptance still has to be confirmed.
- A callout explains that internal approval is not the partner's signature. Settlement frequency offers suggestions through a datalist but never fills anything in.
- Dates use date pickers, with the chosen day restated in Malaysian form under each field ("Starts 18 Oct 2026").
- Entries survive Back/Continue and a failed save. Closing with unsaved entries asks "Discard?" first.
- After **Save draft**, the final step shows what the server still lists as pending. **Continue to approval** appears only when nothing is pending and the operator holds the approve capability. It opens the normal approval confirmation, including Solo self-review.

## 4. Workflow-guided, contextual actions

Draft → Signed evidence → Approval → Stock reservation → Dispatch → Partner receipt → Reconciliation/Returns.

- **Agreement detail.**
  - Draft: **Edit draft** is highlighted while terms are pending. **Approve agreement** stays visible but disabled, with the reason given.
  - Draft with nothing pending: **Approve** is highlighted.
  - Active: **Reserve stock**, **Create new version** and **Close agreement**.
  - Closed: **Create new version** only.
  - **Close** opens a confirmation dialog that requires a reason. The global closure-reason field is gone.
- **Delivery detail.**
  - Reserved: one task panel, **Confirm dispatch** with a "Courier or shipment reference" field, plus **Cancel reservation**, which asks for a reason.
  - Dispatched or discrepancy open: a **Record partner receipt** or **Review the delivery discrepancy** panel. It holds recipient, receipt date (with the earliest allowed time shown), signed evidence, acknowledgment reference, a finding for each unit in the table, a live count and "Mark all unconfirmed units good". The Team or Solo rule that applies is stated.
  - After dispatch: a **Record a stock movement** picker. The operator chooses return, release, customer handover, correction, reversal or write-off, and only that action's fields and button appear. Unit checkboxes appear only where a movement is possible.
  - History (custody activity, receiving review evidence, external reconciliation) sits in collapsible sections. Units are labelled with their stable custody reference, not "Unit N".
- **Solo Mode** is unchanged: an explicit "This is my own work" attestation, a reason (at least 10 characters), an external evidence reference, and the "Self-reviewed (Solo)" history markers.
- Tag Codes stay masked until **View Tag Codes** is used. That button and the controlled-manifest download still need the manifest-export capability. The Dispatch Note PDF is still the issued, immutable document.

## 5. Bugs fixed during browser QA

1. **A refused reservation was invisible.** The server's 409 ("not enough eligible inspected tags") appeared in the page notice *behind* the open reservation dialog. The action runner now accepts an `onError` option. The dialog shows the refusal inside itself ("Nothing was reserved; your entries are kept.") and stays on the review step. A regression test covers this.
2. **A receipt dated before dispatch reached the server.** The UI now runs the same check as the server before submitting (on or after dispatch, not in the future) and shows "On or after dispatch: …" under the date field. A regression test covers this.

## 6. Screenshots (`artifacts/consignment-ux-redesign/screenshots/`)

- **Before:** `before-desktop-page`, `before-desktop-new-agreement`, `before-desktop-dispatch-open`, `before-mobile-page`.
- **After, desktop 1440:** `after-desktop-overview`, `-agreements`, `-agreement-draft`, `-agreement-active`, `-custody`, `-dispatch-reserved`, `-dispatch-awaiting-receipt`, `-dispatch-discrepancy`, `-reconciliation`, `-settings`, `-wizard-partner`, `-wizard-terms`, `-reserve`.
- **After, mobile 390:** `after-mobile-overview`, `-agreements`, `-agreement`, `-custody`, `-dispatch`.
- **End-to-end run:** `e2e-01` … `e2e-09`. `e2e-failure.png` was removed; it was a diagnostic from a superseded run.

All screens use synthetic data in the disposable database `MyPetLinkQA_ConsignmentUX`. No Production record was touched.

## 7. Test results (`logs/`)

| Check | Result |
|---|---|
| `npm run typecheck` (app + functions) | exit 0 |
| `npm run lint` | exit 0 |
| Full web suite `npm test` | 375 files passed (1 skipped) · **4,369 tests passed**, 7 skipped |
| Merchant Sales suites, including Consignment, Approval Policy and navigation/authorization | 22 files · 360 tests passed |
| Production build `npm run build` (all four release flags `true`) | exit 0. The only warnings are the existing ones: `releaseFlags.ts` module type, and the SEO thin-content warning for `/p/topu-…` |
| End-to-end browser workflow (`e2e-workflow.mjs`): production export + real API | **10/10 steps passed** — overview; wizard save; Solo approval; contextual reservation; dispatch (note issued); Solo partner receipt; return to inspection; closure refused with the server's 409 and a refresh action; Back/Forward/refresh restore; keyboard section navigation |
| Phone-width check (390 px, every section and record view) | no horizontal page scroll (`logs/mobile-overflow.log`) |

New and rewritten tests:

- `ConsignmentPanel.test.tsx` has 35 tests: all 19 earlier scenarios adapted to the new layout, plus section navigation and URL state, Back/Forward, policy only in Settings, export permission, complete-data-only totals, contextual agreement and delivery actions, closure and cancellation reasons, the stock-movement picker, wizard validation and state preservation, failed-save recovery, the discard prompt, a new version without the old signature, the in-dialog reservation error, and the receipt-date check.
- `consignment/model.test.ts` is new and covers next-step rules, workflow stages, summary completeness, form rules and date handling.
- `ConsignmentApprovalPolicy.test.tsx` passes unchanged.

## 8. Changed files

Modified:
- `apps/web/src/components/admin/merchantSales/ConsignmentPanel.tsx` — now the workspace shell: header, section navigation, data loading, approve/close requests, dialogs.
- `apps/web/src/components/admin/merchantSales/ConsignmentApprovalPolicy.tsx` — restyled as the Settings page; same controls and rules.
- `apps/web/src/components/admin/merchantSales/ConsignmentPanel.test.tsx`
- `apps/web/src/services/adminConsignmentService.ts` — `listAgreements`/`listDispatches` accept `pageSize` and the `merchantId`/`agreementId` filters the API already supports.

New, in `apps/web/src/components/admin/merchantSales/consignment/`:
`model.ts`, `model.test.ts`, `ui.tsx`, `context.ts`, `useConsignmentActions.tsx`, `useConsignmentLocation.ts`, `ConsignmentOverview.tsx`, `AgreementsView.tsx`, `AgreementTermsSummary.tsx`, `AgreementWizard.tsx`, `CustodyView.tsx`, `DispatchDetail.tsx`, `ReserveStockDialog.tsx`, `ReconciliationView.tsx`, `SettingsView.tsx`.

Not touched by this work: the API, the database schema and migrations, `migration.sql`, and the unrelated working-tree changes (Marketing Demo, `communityModeration.test.ts`, marketing docs and others).

## 9. Behaviour notes to review

- **A new version no longer copies the previous version's signed agreement reference.** The new terms need their own partner signature. Every other term is copied as a starting point.
- **Effective dates are now whole local days.** The start is 00:00 on the chosen day and the end is 23:59:59.999, so the last day counts. Previously these were free date-time inputs.
- **Exports use From/Through dates.** "Through" is sent as the following midnight, matching the server's exclusive end.
- **The approval-policy summary no longer shows the last editor's internal ID.** The history list still shows actor IDs.

## 10. Backend work needed separately (nothing here was changed)

1. **Agreement search and status filter on the server.** The list endpoint only takes `merchantId`, so the UI offers a merchant filter but no free-text or status search. Filtering a single page in the browser would be misleading.
2. **A consignment summary (aggregate) endpoint.** Overview totals and attention counts come from one page of 100 agreements and 100 deliveries. Above that they show "—" and "Too many records to total here" rather than an under-count.
3. **GET agreement by ID.** No such endpoint exists, so an `agreement=<id>` link resolves only within the latest page of up to 100 agreements.
4. **Optional:** a light dispatch list projection without per-unit arrays, which would make the Overview and custody lists cheaper as volume grows.

## 11. QA environment

The QA ran on the disposable LocalDB database `MyPetLinkQA_ConsignmentUX`, built from the root `migration.sql`, with a synthetic seed: three test merchants, 80 inspected tags and a dev admin in Solo Mode. The browser used local dev-auth tokens only. When the work finished, the QA servers were stopped, `.claude/launch.json` was restored byte-for-byte, and the database was dropped.
