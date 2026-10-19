"use client";

import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminStat, AdminStatusBadge } from "@/components/admin/AdminStatus";
import { AttentionQueue } from "@/components/admin/AttentionQueue";
import { primaryButton, secondaryButton } from "../shared";
import type { ConsignmentContext } from "./context";
import type { Metric } from "./model";
import { Callout } from "./ui";

const guide = [
  { title: "Draft", detail: "Record the terms discussed with the partner. Nothing is binding yet." },
  { title: "Signed evidence", detail: "Add the reference of the agreement the partner actually signed." },
  { title: "Approval", detail: "An internal check of the version. It is not the partner’s signature." },
  { title: "Stock reservation", detail: "Hold inspected tags for the partner’s branch." },
  { title: "Dispatch", detail: "Confirm the tags left. The dispatch note is issued here." },
  { title: "Partner receipt", detail: "Record the partner’s signed count, including damaged or missing units." },
  { title: "Reconciliation & returns", detail: "Match handovers with the external tracker and inspect returns." },
];

const unavailableHint = "Too many records to total here";

function stat(value: Metric) {
  return value === null ? "—" : value;
}

export function ConsignmentOverview({ context }: { context: ConsignmentContext }) {
  const { summary, policy, can, navigate, loading } = context;
  const awaitingWork =
    summary.awaitingReceipt === null || summary.openDiscrepancies === null ? null : summary.awaitingReceipt + summary.openDiscrepancies;
  const empty = !loading && summary.agreementsComplete && context.agreements.length === 0;
  // Sales report and stock counts come from partner stock. When it couldn't be loaded they are
  // unknown, so they are left out of the queue (never shown as zero) and flagged below.
  const stockFailed = context.positionsStatus.state === "error" || context.positionsStatus.state === "forbidden";
  const stock = stockFailed ? null : context.positions;

  const attention = [
    {
      id: "drafts-ready",
      label: "Drafts ready for approval",
      count: summary.draftsReady ?? 0,
      detail: "Every term and the signed partner agreement are recorded.",
      onSelect: () => navigate({ view: "agreements", agreement: null, dispatch: null }),
    },
    {
      id: "drafts-incomplete",
      label: "Drafts with terms still to agree",
      count: summary.draftsIncomplete ?? 0,
      detail: "Complete the pending terms before approval.",
      onSelect: () => navigate({ view: "agreements", agreement: null, dispatch: null }),
    },
    {
      id: "awaiting-dispatch",
      label: "Reservations awaiting dispatch",
      count: summary.awaitingDispatch ?? 0,
      detail: "Send the tags, then confirm dispatch.",
      onSelect: () => navigate({ view: "custody", agreement: null, dispatch: null }),
    },
    {
      id: "awaiting-receipt",
      label: "Deliveries awaiting partner receipt",
      count: summary.awaitingReceipt ?? 0,
      detail: "Record the partner’s signed count.",
      onSelect: () => navigate({ view: "custody", agreement: null, dispatch: null }),
    },
    {
      id: "open-discrepancies",
      label: "Open delivery discrepancies",
      count: summary.openDiscrepancies ?? 0,
      detail: "Damaged or missing units under review.",
      onSelect: () => navigate({ view: "custody", agreement: null, dispatch: null }),
    },
    {
      id: "returns",
      label: "Returned tags awaiting inspection",
      count: summary.returnsAwaitingInspection ?? 0,
      detail: "Returns stay unavailable until a fresh inspection passes.",
      onSelect: () => navigate({ view: "reconciliation", agreement: null, dispatch: null }),
    },
    {
      id: "handovers",
      label: "Activated tags without a handover reference",
      count: summary.handoversNeeded ?? 0,
      detail: "Check the external tracker; activation is not proof of sale.",
      onSelect: () => navigate({ view: "reconciliation", agreement: null, dispatch: null }),
    },
    {
      id: "reports-to-verify",
      label: "Sales reports awaiting verification",
      count: (stock ?? []).reduce((n, p) => n + p.reportsAwaitingVerification, 0),
      detail: "Check each against the partner’s evidence.",
      onSelect: () => navigate({ view: "sales" }),
    },
    {
      id: "reports-disputed",
      label: "Disputed sales reports",
      count: (stock ?? []).reduce((n, p) => n + p.disputedReports, 0),
      detail: "Waiting for the partner’s corrected figures.",
      onSelect: () => navigate({ view: "sales" }),
    },
    {
      id: "untracked-stock",
      label: "Received tags not yet in SKU stock",
      count: (stock ?? []).reduce((n, p) => n + p.skus.reduce((m, s) => m + s.untrackedUnits, 0), 0),
      detail: "Bring them into stock tracking before verifying sales.",
      onSelect: () => navigate({ view: "sales" }),
    },
    {
      id: "stocktake-open",
      label: "Stocktakes waiting to close the month",
      count: (stock ?? []).filter((p) => p.stocktakeInProgress).length,
      detail: "Finish recording the count, then close the month.",
      onSelect: () => navigate({ view: "reconciliation" }),
    },
    {
      id: "stock-discrepancies",
      label: "Stock discrepancies under investigation",
      count: (stock ?? []).reduce((n, p) => n + (p.openDiscrepancies ?? 0), 0),
      detail: "Settle each with evidence. Nothing is written off automatically.",
      onSelect: () => navigate({ view: "reconciliation" }),
    },
  ];

  return (
    <div className="grid gap-4" data-testid="consignment-overview">
      {empty ? (
        <section className="grid gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <h3 className="text-lg font-black text-slate-950">Start with a partner agreement</h3>
          <p className="mx-auto max-w-xl text-sm leading-6 text-slate-500">
            Record the terms you have discussed with a partner as a draft. Once the partner signs and the draft is approved, you
            can reserve and dispatch stock to them.
          </p>
          {can.manage ? (
            <button className={`${primaryButton} justify-self-center`} onClick={() => context.openWizard({ mode: "new" })} type="button">
              New agreement
            </button>
          ) : null}
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
        <AdminStat
          hint={summary.agreementsComplete ? "Approved versions in force" : unavailableHint}
          label="Active partner agreements"
          tone="positive"
          value={stat(summary.activeAgreements)}
        />
        <AdminStat
          hint={summary.dispatchesComplete ? "Sent and not yet returned or handed over" : unavailableHint}
          label="Tags held by partners"
          tone="info"
          value={stat(summary.tagsWithPartners)}
        />
        <AdminStat
          hint={summary.dispatchesComplete ? "Deliveries awaiting receipt or discrepancy review" : unavailableHint}
          label="Receipt and discrepancy actions"
          tone="warning"
          value={stat(awaitingWork)}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <AdminSection compact description="Only current, non-zero work appears here." title="What needs doing">
          {summary.agreementsComplete && summary.dispatchesComplete ? (
            <>
              {stockFailed ? (
                <div className="px-4 pt-4">
                  <Callout role="alert" title="Sales report and partner stock work is unavailable" tone="warning">
                    <span className="block">{context.positionsStatus.message} Reports awaiting verification aren’t listed below until this loads.</span>
                    {context.positionsStatus.state === "error" ? (
                      <button className={`${secondaryButton} mt-2`} onClick={context.retryPositions} type="button">
                        Try again
                      </button>
                    ) : null}
                  </Callout>
                </div>
              ) : null}
              <AttentionQueue
                emptyDescription={stockFailed ? "No other consignment work needs doing." : "Consignment work is clear based on the current records."}
                items={attention}
              />
            </>
          ) : (
            <div className="p-4">
              <Callout tone="info">
                {loading
                  ? "Loading consignment records…"
                  : "There are too many records to summarise here. Work through Agreements and Stock custody directly."}
              </Callout>
            </div>
          )}
        </AdminSection>

        <div className="grid content-start gap-4">
          <AdminSection
            action={
              <button
                className={secondaryButton}
                onClick={() => navigate({ view: "settings", agreement: null, dispatch: null })}
                type="button"
              >
                Settings
              </button>
            }
            compact
            title="Approval policy"
          >
            <div className="grid gap-2 p-4 text-sm sm:p-5">
              {policy ? (
                <>
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-700">
                    Approval mode:{" "}
                    <AdminStatusBadge dot tone={policy.mode === "Solo" ? "warning" : "positive"}>
                      {policy.mode}
                    </AdminStatusBadge>
                  </p>
                  <p className="font-semibold text-slate-700">
                    Authorized self-reviewer:{" "}
                    {policy.mode === "Solo" ? (policy.selfReviewerName ?? "Unavailable; self-review is blocked") : "None"}
                  </p>
                  {policy.mode === "Solo" && policy.selfReviewerIsEligible === false ? (
                    <Callout role="alert" tone="critical">
                      The named founder no longer has self-review permission. Self-review is blocked until access is restored or
                      Team Mode is selected.
                    </Callout>
                  ) : (
                    <p className="text-xs leading-5 text-slate-500">
                      {policy.mode === "Solo"
                        ? "Only the named founder may review their own work, with explicit confirmation, a reason and external evidence."
                        : "Approvals and receipts are reviewed by a different administrator."}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-slate-500">Approval policy unavailable.</p>
              )}
            </div>
          </AdminSection>

          <AdminSection compact title="How consignment works">
            <ol className="grid gap-3 p-4 sm:p-5">
              {guide.map((step, index) => (
                <li className="flex gap-3" key={step.title}>
                  <span
                    aria-hidden="true"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#e8f3ff] text-xs font-black text-pet-teal"
                  >
                    {index + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-black text-slate-900">{step.title}</span>
                    <span className="block text-xs leading-5 text-slate-500">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </AdminSection>
        </div>
      </div>
    </div>
  );
}
