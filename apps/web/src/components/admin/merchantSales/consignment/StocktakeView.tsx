"use client";

import { useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminEmptyPanel, AdminStatusBadge } from "@/components/admin/AdminStatus";
import { FormDialog } from "@/components/ui/FormDialog";
import * as api from "@/services/adminConsignmentService";
import { dateTime, primaryButton, secondaryButton } from "../shared";
import type { ConsignmentContext } from "./context";
import {
  countDateLabel,
  discrepancyKindLabel,
  errorMessage,
  malaysiaTimeLabel,
  outcomeDetail,
  outcomeLabel,
  stocktakeFinding,
  stocktakeStatusLabel,
  stocktakeTone,
} from "./model";
import { StocktakeDialog, type StocktakeRequest } from "./StocktakeDialog";
import { BackLink, Callout, StatusPill, TextField, dangerButton, textButton } from "./ui";

/**
 * Monthly stocktake and discrepancy investigation. A count is entered by SKU, compared with
 * the verified books at the end of the count date, and closing it carries the stock forward.
 */
export function StocktakeSection({ context, stocktakeId }: { context: ConsignmentContext; stocktakeId: string | null }) {
  const [dialog, setDialog] = useState<StocktakeRequest | null>(null);
  const openDialog = (request: StocktakeRequest) => setDialog(request);
  const body = stocktakeId ? (
    <StocktakeDetail context={context} id={stocktakeId} onEdit={(s) => openDialog({ mode: "edit", stocktake: s })} />
  ) : (
    <div className="grid gap-4">
      <StocktakeList context={context} onNew={() => openDialog({ mode: "new" })} />
      <DiscrepancyList context={context} />
    </div>
  );
  return (
    <>
      {body}
      {dialog ? (
        <StocktakeDialog
          context={context}
          onClose={() => setDialog(null)}
          onSaved={(saved, message) => {
            setDialog(null);
            context.actions.setNotice({ tone: "success", title: message });
            context.navigate({ stocktake: saved.id });
          }}
          request={dialog}
        />
      ) : null}
    </>
  );
}

const stocktakePage = 20;

/** Newest first; older history loads a page at a time, so no closed month is out of reach. */
function useStocktakes(context: ConsignmentContext, limit: number) {
  const [items, setItems] = useState<api.Stocktake[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .listStocktakes(1, {}, limit)
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setTotal(page.total);
        setError("");
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [context.reloadKey, limit]);
  return { items, total, error };
}

function StocktakeList({ context, onNew }: { context: ConsignmentContext; onNew: () => void }) {
  const [limit, setLimit] = useState(stocktakePage);
  const { items, total, error } = useStocktakes(context, limit);
  return (
    <AdminSection
      action={
        context.can.recordStocktake ? (
          <button className={primaryButton} disabled={context.actions.busy} onClick={onNew} type="button">
            Record stocktake
          </button>
        ) : undefined
      }
      compact
      description="Count each partner by SKU on the 15th or the last day of the month. Closing a count carries the stock forward to the next month."
      title="Monthly stocktakes"
    >
      {error ? (
        <div className="p-4">
          <Callout role="alert" title="Stocktakes couldn’t be loaded" tone="critical">
            {error}
          </Callout>
        </div>
      ) : items === null ? (
        <p className="p-4 text-sm font-semibold text-slate-500" role="status">
          Loading stocktakes…
        </p>
      ) : items.length === 0 ? (
        <AdminEmptyPanel compact description="Record the first count at the end of a month." icon="tag" title="No stocktakes yet" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((s) => {
            const findings = s.lines.filter((l) => stocktakeFinding(l) !== "Matches").length;
            return (
              <li key={s.id}>
                <button
                  aria-label={`Open stocktake ${countDateLabel(s.countDate)} ${s.branchName}`}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1570ef] sm:px-5"
                  onClick={() => context.navigate({ stocktake: s.id })}
                  type="button"
                >
                  <span className="grid gap-0.5">
                    <span className="text-sm font-black text-slate-900">{countDateLabel(s.countDate)}</span>
                    <span className="text-xs text-slate-500">
                      {s.merchantName} · {s.branchName} · {s.lines.length} SKU{s.lines.length === 1 ? "" : "s"}
                      {s.status === "Approved" ? ` · ${findings ? `${findings} with differences` : "all matched"}` : ""}
                    </span>
                  </span>
                  <StatusPill tone={stocktakeTone(s.status)}>{stocktakeStatusLabel(s.status)}</StatusPill>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items && items.length < total ? (
        <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
          <button className={textButton} onClick={() => setLimit((n) => n + stocktakePage)} type="button">
            Show older stocktakes ({total - items.length} more)
          </button>
        </div>
      ) : null}
    </AdminSection>
  );
}

function StocktakeDetail({ context, id, onEdit }: { context: ConsignmentContext; id: string; onEdit: (s: api.Stocktake) => void }) {
  const { actions, can, policy } = context;
  const [record, setRecord] = useState<api.Stocktake | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .getStocktake(id)
      .then((value) => {
        if (!active) return;
        setRecord(value);
        setError("");
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [id, context.reloadKey]);

  const back = <BackLink label="All stocktakes" onClick={() => context.navigate({ stocktake: null, view: "reconciliation" })} />;
  if (error || !record || record.id !== id) {
    return (
      <div className="grid gap-3">
        {back}
        {error ? (
          <Callout role="alert" title="This stocktake couldn’t be loaded" tone="critical">
            {error}
          </Callout>
        ) : (
          <p className="text-sm font-semibold text-slate-500" role="status">
            Loading stocktake…
          </p>
        )}
      </div>
    );
  }
  const s = record;
  const busy = actions.busy;
  const date = countDateLabel(s.countDate);

  const recordCount = () =>
    void actions.work(async () => {
      setRecord(await api.stocktakeAction(s, "record"));
      return "Count recorded. Close the month once you have checked it.";
    }, "Count recorded.");

  const discard = () =>
    actions.request({
      title: "Discard this count?",
      message: `${s.merchantName} · ${date}. The count stays in history as discarded and changes nothing in the books.`,
      reason: { label: "Why it’s being discarded", hint: "At least 10 characters. Kept with the count.", minLength: 10 },
      destructive: true,
      confirmLabel: "Discard count",
      run: async ({ reason }) => {
        setRecord(await api.stocktakeAction(s, "void", { reason }));
        return "Count discarded.";
      },
    });

  const close = () =>
    actions.request({
      title: "Close the month and carry stock forward?",
      message: `${s.merchantName} · ${s.branchName} · count of ${date}. This freezes the count. Missing stock goes under investigation, extra stock is only noted, and the counted stock becomes next month’s opening. Nothing is sold, written off, re-dispatched or rescanned.`,
      details: (
        <ul className="grid gap-1 text-sm">
          {s.lines.map((l) => (
            <li key={l.productVariantId}>
              <span className="font-black">{l.sku}</span>: opens next month with {l.closingSellable} sellable
              {l.closingUnsellable ? `, ${l.closingUnsellable} unsellable` : ""}
              {l.closingInvestigation ? `, ${l.closingInvestigation} under investigation` : ""}
              {l.openSurplusAfter ? `, ${l.openSurplusAfter} extra noted` : ""}.
            </li>
          ))}
        </ul>
      ),
      warnings: s.warnings,
      allowSelfReview: policy?.canSelfReview,
      selfReviewEvidence: s.evidenceReference,
      confirmLabel: "Close month",
      run: async ({ selfReview, acknowledged }) => {
        // The close covers exactly the findings shown here; if anything changed since, the server asks for a fresh review.
        setRecord(await api.stocktakeAction(s, "approve", { selfReview, acknowledgeWarnings: acknowledged, reviewedFingerprint: s.reviewFingerprint }));
        return `The month to ${date} is closed. Stock carries forward.`;
      },
    });

  return (
    <div className="grid gap-4">
      {back}
      <section aria-labelledby="stocktake-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                {s.merchantName} · {s.branchName}
              </p>
              <h3 className="mt-1 text-xl font-black text-slate-950" id="stocktake-title">
                Stocktake {date}
              </h3>
              <p className="mt-0.5 text-sm text-slate-600">
                Counted by {s.countedBy}
                {s.countedAt ? ` on ${malaysiaTimeLabel(s.countedAt)}` : " · count time not recorded"} · {s.evidenceKind}
                {s.evidenceReference ? ` · ${s.evidenceReference}` : ""}
              </p>
              {s.countedAfterCutoffNote ? (
                <p className="mt-0.5 text-xs text-slate-500">Counted after the count date ended. Nothing moved since midnight because: {s.countedAfterCutoffNote}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusPill tone={stocktakeTone(s.status)}>{stocktakeStatusLabel(s.status)}</StatusPill>
                {s.reviewMode ? <AdminStatusBadge tone="warning">{s.reviewMode}</AdminStatusBadge> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {s.status === "Draft" && can.recordStocktake ? (
                <>
                  <button className={primaryButton} disabled={busy} onClick={recordCount} type="button">
                    Record count
                  </button>
                  <button className={secondaryButton} disabled={busy} onClick={() => onEdit(s)} type="button">
                    Edit count
                  </button>
                </>
              ) : null}
              {s.status === "Recorded" && can.closePeriods ? (
                <button
                  aria-describedby={s.issues.length ? "stocktake-issues" : undefined}
                  className={primaryButton}
                  disabled={busy || s.issues.length > 0}
                  onClick={close}
                  type="button"
                >
                  Close month
                </button>
              ) : null}
              {(s.status === "Draft" || s.status === "Recorded") && can.recordStocktake ? (
                <button className={dangerButton} disabled={busy} onClick={discard} type="button">
                  Discard count
                </button>
              ) : null}
            </div>
          </div>

          {s.status === "Approved" ? (
            <Callout title="This month is closed" tone="info">
              The count and its findings are frozen{s.approvedAt ? ` (closed ${dateTime(s.approvedAt)})` : ""}. Anything reported or found
              later is posted to the current month, never to this one.
            </Callout>
          ) : null}
          {s.issues.length > 0 ? (
            <Callout role="alert" title="Can’t close this month yet" tone="critical">
              <ul className="list-disc space-y-1 pl-5" id="stocktake-issues">
                {s.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Callout>
          ) : null}
          {s.warnings.length > 0 && s.status === "Recorded" ? (
            <Callout title="What closing will record" tone="warning">
              <ul className="list-disc space-y-1 pl-5">
                {s.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Callout>
          ) : null}
        </div>
        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Stocktake {date} by SKU</caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5 text-right">Expected on the shelf</th>
                <th className="px-4 py-2.5 text-right">Counted</th>
                <th className="px-4 py-2.5">Finding</th>
                <th className="px-4 py-2.5 text-right">{s.status === "Approved" ? "Closing" : "Would close at"}</th>
                <th className="px-4 py-2.5 text-right">Investigating</th>
                <th className="px-4 py-2.5 text-right">Sold · lost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {s.lines.map((l) => (
                <tr key={l.productVariantId}>
                  <td className="px-4 py-2.5">
                    <span className="block font-bold text-slate-900">{l.sku}</span>
                    <span className="block text-xs text-slate-500">{l.productName}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {l.expectedSellable}
                    {l.openSurplusBefore ? (
                      <span className="block text-xs text-slate-500">
                        {l.bookSellable} verified + {l.openSurplusBefore} extra noted
                      </span>
                    ) : null}
                    <span className="block text-xs text-slate-500">{l.expectedUnsellable} unsellable</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-black">
                    {l.countedSellable ?? "—"}
                    <span className="block text-xs font-normal text-slate-500">{l.countedUnsellable ?? "—"} unsellable</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-bold text-slate-700">{l.countedSellable === null ? "Not counted" : stocktakeFinding(l)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {l.closingSellable}
                    <span className="block text-xs text-slate-500">{l.closingUnsellable} unsellable</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">{l.closingInvestigation}</td>
                  <td className="px-4 py-2.5 text-right">
                    {l.closingSold} · {l.closingLost}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">
          Expected on the shelf is the verified sellable stock at the end of the count date plus extra packages noted at earlier counts;
          the closing figure is verified stock only, so extra packages never become stock. Shelf counts confirm what is physically at the shop. Sold, lost and investigated units stay the partner’s responsibility under
          their original Tag Code custody records until identified; a count never marks a Tag Code sold, lost or returned.
        </p>
      </section>
    </div>
  );
}

function DiscrepancyList({ context }: { context: ConsignmentContext }) {
  const [showResolved, setShowResolved] = useState(false);
  const [items, setItems] = useState<api.Discrepancy[] | null>(null);
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState<api.Discrepancy | null>(null);
  useEffect(() => {
    let active = true;
    api
      .listDiscrepancies({ status: showResolved ? "" : "Open" })
      .then((value) => {
        if (!active) return;
        setItems(value);
        setError("");
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [context.reloadKey, showResolved]);

  return (
    <AdminSection
      action={
        <button className={textButton} onClick={() => setShowResolved((v) => !v)} type="button">
          {showResolved ? "Show open only" : "Show resolved too"}
        </button>
      }
      compact
      description="What a closed count found. Each stays open until it is settled with evidence; nothing is written off or treated as sold automatically."
      title="Stock discrepancies"
    >
      {error ? (
        <div className="p-4">
          <Callout role="alert" title="Discrepancies couldn’t be loaded" tone="critical">
            {error}
          </Callout>
        </div>
      ) : items === null ? (
        <p className="p-4 text-sm font-semibold text-slate-500" role="status">
          Loading discrepancies…
        </p>
      ) : items.length === 0 ? (
        <AdminEmptyPanel compact description="Every closed count matched, or its differences are settled." icon="shield" title="No open discrepancies" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.length >= 500 ? (
            <li className="px-4 py-3 text-xs font-semibold text-slate-500 sm:px-5">
              Showing the 500 most recent. Export the stocktakes for the complete history.
            </li>
          ) : null}
          {items.map((d) => (
            <li className="grid gap-2 px-4 py-3 sm:px-5" key={d.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-0.5">
                  <span className="text-sm font-black text-slate-900">
                    {d.sku} · {discrepancyKindLabel(d.kind)}
                  </span>
                  <span className="text-xs text-slate-500">
                    {d.merchantName} · {d.branchName} · count of {countDateLabel(d.originCountDate)} ·{" "}
                    {d.status === "Open" ? `${d.openQuantity} of ${d.quantity} open` : `${d.quantity} settled`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={d.status === "Open" ? (d.kind === "Surplus" ? "info" : "warning") : "positive"}>{d.status}</StatusPill>
                  {d.status === "Open" && context.can.resolveDiscrepancies ? (
                    <button className={secondaryButton} disabled={context.actions.busy} onClick={() => setResolving(d)} type="button">
                      Resolve
                    </button>
                  ) : null}
                </div>
              </div>
              {d.resolutions.length ? (
                <ul className="grid gap-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                  {d.resolutions.map((r) => (
                    <li key={r.id}>
                      {dateTime(r.recordedAt)} · <span className="font-bold">{outcomeLabel(r.outcome)}</span> × {r.quantity}
                      {r.reversesResolutionId ? " (open again)" : ""} · {r.reason}
                      {r.reviewMode ? ` · ${r.reviewMode}` : ""}
                      <span className="block text-slate-500">Evidence: {r.evidenceReference}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {resolving ? (
        <ResolveDialog
          context={context}
          discrepancy={resolving}
          onClose={() => setResolving(null)}
          shortages={(items ?? []).filter((x) => x.status === "Open" && x.kind === "Shortage" && x.productVariantId === resolving.productVariantId
            && x.merchantBranchId === resolving.merchantBranchId)}
        />
      ) : null}
    </AdminSection>
  );
}

function ResolveDialog({
  context,
  discrepancy: d,
  shortages,
  onClose,
}: {
  context: ConsignmentContext;
  discrepancy: api.Discrepancy;
  shortages: api.Discrepancy[];
  onClose: () => void;
}) {
  const [outcome, setOutcome] = useState("");
  const [quantity, setQuantity] = useState(String(d.openQuantity));
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState("");
  const [related, setRelated] = useState(shortages[0]?.id ?? "");
  const [selfReview, setSelfReview] = useState(false);
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const errors = {
    outcome: outcome ? "" : "Choose what happened.",
    quantity: /^\d+$/.test(quantity) && Number(quantity) >= 1 && Number(quantity) <= d.openQuantity ? "" : `Choose from 1 to ${d.openQuantity}.`,
    evidence: evidence.trim().length >= 5 ? "" : "Record the evidence (at least 5 characters).",
    reason: reason.trim().length >= 10 ? "" : "Explain the outcome (at least 10 characters).",
    related: outcome !== "EarlierShortageFound" || related ? "" : "Choose the shortage this surplus came from.",
  };

  async function submit() {
    if (Object.values(errors).some(Boolean)) {
      setShowErrors(true);
      return;
    }
    setError("");
    const ok = await context.actions.work(
      async () => {
        await api.resolveDiscrepancy(d, {
          outcome, quantity: Number(quantity), evidenceReference: evidence.trim(), reason: reason.trim(),
          relatedDiscrepancyId: outcome === "EarlierShortageFound" ? related : null,
          ...(selfReview ? { selfReview: { confirmed: true, reason: reason.trim(), externalEvidenceReference: evidence.trim() } } : {}),
        });
        return `${d.sku}: ${outcomeLabel(outcome).toLowerCase()} recorded for ${quantity}.`;
      },
      "Discrepancy updated.",
      { onError: setError }
    );
    if (ok) onClose();
  }

  return (
    <FormDialog
      closeOnBackdrop={false}
      description={`${d.merchantName} · ${d.branchName} · count of ${countDateLabel(d.originCountDate)} · ${d.openQuantity} open.`}
      eyebrow={discrepancyKindLabel(d.kind)}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className={secondaryButton} disabled={context.actions.busy} onClick={onClose} type="button">
            Cancel
          </button>
          <button className={primaryButton} disabled={context.actions.busy} onClick={() => void submit()} type="button">
            Record outcome
          </button>
        </div>
      }
      maxWidthClassName="sm:max-w-2xl"
      onRequestClose={onClose}
      open
      title={`Resolve ${d.sku}`}
    >
      <div className="grid gap-4">
        {error ? (
          <div className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]" role="alert">
            {error}
          </div>
        ) : null}
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-black text-slate-800">What happened?</legend>
          {d.allowedOutcomes.map((value) => (
            <label
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${outcome === value ? "border-pet-teal bg-[#f0f7ff]" : "border-slate-200"}`}
              key={value}
            >
              <input checked={outcome === value} className="mt-1 h-4 w-4 shrink-0" name="discrepancy-outcome" onChange={() => setOutcome(value)} type="radio" />
              <span>
                <span className="block font-black text-slate-900">{outcomeLabel(value)}</span>
                <span className="block text-xs leading-5 text-slate-500">{outcomeDetail(value)}</span>
              </span>
            </label>
          ))}
          {showErrors && errors.outcome ? <p className="text-xs font-bold text-[#a63c2e]" role="alert">{errors.outcome}</p> : null}
        </fieldset>
        {outcome === "EarlierShortageFound" ? (
          shortages.length ? (
            <label className="grid gap-1.5 text-sm font-black text-slate-800">
              Shortage it came from
              <select className="min-h-11 rounded-xl border border-slate-300 px-3 font-normal" onChange={(e) => setRelated(e.target.value)} value={related}>
                {shortages.map((x) => (
                  <option key={x.id} value={x.id}>
                    Count of {countDateLabel(x.originCountDate)} · {x.openQuantity} open
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Callout tone="warning">There is no open shortage of this SKU at this branch to settle against.</Callout>
          )
        ) : null}
        <TextField error={showErrors ? errors.quantity || undefined : undefined} inputMode="numeric" label="Quantity" onChange={setQuantity} requirement="required" value={quantity} />
        <TextField
          error={showErrors ? errors.evidence || undefined : undefined}
          hint="New evidence of what happened, for example: shop photo of the found package, owner’s WhatsApp 3 Nov. The count sheet only shows what was missing or extra, so it can’t be used here."
          label="Evidence"
          onChange={setEvidence}
          requirement="required"
          value={evidence}
        />
        <TextField error={showErrors ? errors.reason || undefined : undefined} label="Explanation" onChange={setReason} requirement="required" value={reason} />
        {context.policy?.canSelfReview ? (
          <label className="flex items-start gap-2 text-sm font-semibold text-slate-800">
            <input checked={selfReview} className="mt-1 h-4 w-4" onChange={(e) => setSelfReview(e.target.checked)} type="checkbox" />
            I counted, edited or recorded a count behind this discrepancy. Record this as a Solo self-review, citing the evidence above.
          </label>
        ) : null}
      </div>
    </FormDialog>
  );
}
