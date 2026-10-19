"use client";

import { useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminEmptyPanel } from "@/components/admin/AdminStatus";
import * as api from "@/services/adminConsignmentService";
import { secondaryButton } from "../shared";
import type { ConsignmentContext } from "./context";
import { dateInputValue, dayAfterIso, dispatchNextStep, startOfDayIso } from "./model";
import { StockPositionPanel } from "./StockPositionPanel";
import { StocktakeSection } from "./StocktakeView";
import { Callout, DateField, NextStepCell } from "./ui";

function firstOfMonth() {
  const now = new Date();
  return dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
}

/**
 * Monthly stocktake and reconciliation: partner stock by SKU, counts, the discrepancies they
 * find, and the restricted exports. Nothing here posts a financial transaction.
 */
export function ReconciliationView({ context, stocktakeId = null }: { context: ConsignmentContext; stocktakeId?: string | null }) {
  const { can, actions, summary } = context;
  const [from, setFrom] = useState(firstOfMonth);
  const [through, setThrough] = useState(() => dateInputValue(new Date().toISOString()));
  const fromIso = from ? startOfDayIso(from) : null;
  const toIso = through ? dayAfterIso(through) : null;
  const rangeError = fromIso && toIso && Date.parse(toIso) <= Date.parse(fromIso) ? "The end date must be on or after the start date." : "";
  const ready = Boolean(fromIso && toIso && !rangeError);

  const needsWork = context.dispatches.filter(
    (d) =>
      d.status !== "Cancelled" &&
      (d.activatedWithoutExternalReference > 0 || d.returnedQuarantine > 0 || (d.status === "Received" && d.partnerHeld > 0))
  );

  if (stocktakeId) return <StocktakeSection context={context} stocktakeId={stocktakeId} />;

  return (
    <div className="grid gap-4">
      <StockPositionPanel context={context} />
      <StocktakeSection context={context} stocktakeId={null} />
      <Callout title="Partner-reported sales are unverified" tone="info">
        When a partner reports a sale, it is recorded against the tag as evidence only. MyPetLink never turns it into an
        invoice, commission, payment or settlement automatically — reconcile each report with the agreed external tracker.
      </Callout>

      <AdminSection compact description="Deliveries with tags still to reconcile, inspect or hand over." title="Open reconciliation">
        {!summary.dispatchesComplete ? (
          <div className="p-4">
            <Callout tone="info">Only the most recent deliveries are checked here. Older ones are in Stock custody.</Callout>
          </div>
        ) : null}
        {needsWork.length === 0 ? (
          <AdminEmptyPanel compact description="No delivery has tags waiting for reconciliation." icon="shield" title="Nothing to reconcile right now" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {needsWork.map((d) => (
              <li key={d.id}>
                <button
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1570ef] sm:px-5"
                  onClick={() => context.navigate({ dispatch: d.id, agreement: null })}
                  type="button"
                >
                  <span className="grid gap-0.5">
                    <span className="font-mono text-sm font-black text-slate-900">{d.dispatchNumber}</span>
                    <span className="text-xs text-slate-500">
                      {d.merchantName} · {d.partnerHeld} with partner · {d.returnedQuarantine} in return inspection
                    </span>
                  </span>
                  <NextStepCell step={dispatchNextStep(d)} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection
        compact
        description="Restricted exports for matching with the external tracker. Store downloaded files securely."
        title="Reports and exports"
      >
        {can.exportRecords ? (
          <div className="grid gap-4 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 sm:max-w-xl">
              <DateField label="From" onChange={setFrom} value={from} />
              <DateField error={rangeError || undefined} label="Through" min={from || undefined} onChange={setThrough} value={through} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <ExportCard
                description="Handovers, corrections, reversals and reported sales recorded in the period."
                disabled={actions.busy || !ready}
                label="Download reconciliation records"
                onClick={() =>
                  void actions.work(
                    async () => {
                      await api.downloadReconciliation(fromIso!, toIso!);
                    },
                    "Restricted reconciliation export downloaded.",
                    { refresh: false }
                  )
                }
                title="Reconciliation records (CSV)"
              />
              <ExportCard
                description="Approvals, receipt reviews and Solo self-reviews with their evidence references."
                disabled={actions.busy || !ready}
                label="Download review log"
                onClick={() =>
                  void actions.work(
                    async () => {
                      await api.downloadReviewLog(fromIso!, toIso!);
                    },
                    "Review log downloaded.",
                    { refresh: false }
                  )
                }
                title="Review log (CSV)"
              />
              <ExportCard
                description="Every partner sales report and line in the period, with prices, promotions, refunds and verification status."
                disabled={actions.busy || !ready}
                label="Download sales reports"
                onClick={() =>
                  void actions.work(
                    async () => {
                      await api.downloadSalesReports(fromIso!, toIso!);
                    },
                    "Sales reports downloaded.",
                    { refresh: false }
                  )
                }
                title="Sales reports (CSV)"
              />
              <ExportCard
                description="Every SKU stock movement at partner branches: deliveries, verified sales, refunds, returns and handovers."
                disabled={actions.busy || !ready}
                label="Download stock ledger"
                onClick={() =>
                  void actions.work(
                    async () => {
                      await api.downloadStockLedger(fromIso!, toIso!);
                    },
                    "Stock ledger downloaded.",
                    { refresh: false }
                  )
                }
                title="Stock ledger (CSV)"
              />
              <ExportCard
                description="Every stocktake in the period by SKU: the books at the count, what was counted, what it found and the closing stock."
                disabled={actions.busy || !ready}
                label="Download stocktakes"
                onClick={() =>
                  void actions.work(
                    async () => {
                      await api.downloadStocktakes(fromIso!, toIso!);
                    },
                    "Stocktakes downloaded.",
                    { refresh: false }
                  )
                }
                title="Stocktake history (CSV)"
              />
            </div>
          </div>
        ) : (
          <div className="p-4">
            <Callout tone="info">You don’t have permission to download reconciliation exports.</Callout>
          </div>
        )}
      </AdminSection>
    </div>
  );
}

function ExportCard({
  title,
  description,
  label,
  disabled,
  onClick,
}: {
  title: string;
  description: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-4">
      <div>
        <p className="text-sm font-black text-slate-900">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      <button className={`${secondaryButton} self-start`} disabled={disabled} onClick={onClick} type="button">
        {label}
      </button>
    </div>
  );
}
