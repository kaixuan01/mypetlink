"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminEmptyPanel, AdminStatusBadge } from "@/components/admin/AdminStatus";
import * as api from "@/services/adminConsignmentService";
import { dateTime, fieldClass, primaryButton, secondaryButton } from "../shared";
import type { ConsignmentContext } from "./context";
import {
  errorMessage,
  lateLinkProblem,
  LIST_PAGE_SIZE,
  ringgit,
  salesPeriodLabel,
  salesReportNextStep,
  salesReportStatusLabel,
  salesReportTone,
} from "./model";
import { LateReportLinks } from "./LateReportLinks";
import { StockPositionPanel } from "./StockPositionPanel";
import { BackLink, Callout, dangerButton, NextStepCell, Pager, StatusPill } from "./ui";

const columns = "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_8rem_5rem_7rem_minmax(0,1.2fr)]";
const statuses: (api.SalesReportStatus | "")[] = ["", "Recorded", "Disputed", "Verified", "Draft", "Superseded"];

export function SalesReportsView({ context, reportId }: { context: ConsignmentContext; reportId: string | null }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<api.SalesReportStatus | "">("");
  const [list, setList] = useState<{ items: api.SalesReport[]; total: number } | null>(null);
  const [error, setError] = useState("");
  const { reloadKey } = context;

  useEffect(() => {
    if (reportId) return;
    let active = true;
    api
      .listSalesReports(page, { status })
      .then((result) => {
        if (!active) return;
        setList(result);
        setError("");
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [page, status, reloadKey, reportId]);

  if (reportId) {
    return <SalesReportDetail context={context} onBack={() => context.navigate({ view: "sales" })} reportId={reportId} />;
  }

  return (
    <div className="grid gap-4">
      <Callout tone="info">
        Partners report sales by SKU every half month. Recording a report changes nothing financial. Verifying it moves the sold
        quantities off the shelf, records what the partner owes for the period, and adds any sales commission as pending: a
        fixed amount per eligible sold tag. That commission becomes ready to pay once the partner has paid the period in full.
        No invoice is created and no Tag Code is marked sold.
      </Callout>
      <StockPositionPanel context={context} />
      <AdminSection
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <span className="whitespace-nowrap">Status</span>
              <select
                className={`${fieldClass} min-w-40`}
                onChange={(event) => {
                  setStatus(event.target.value as api.SalesReportStatus | "");
                  setPage(1);
                }}
                value={status}
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s ? salesReportStatusLabel(s) : "All reports"}
                  </option>
                ))}
              </select>
            </label>
            {context.can.recordSales ? (
              <button className={primaryButton} disabled={context.actions.busy} onClick={() => context.openSalesReport({ mode: "new" })} type="button">
                Record sales report
              </button>
            ) : null}
          </div>
        }
        description="Newest periods first. Open a report to verify, dispute or correct it."
        title="Sales reports"
      >
        {error ? (
          <div className="p-4">
            <Callout role="alert" tone="critical">
              {error}
            </Callout>
          </div>
        ) : null}
        {!list && !error ? (
          <p className="p-5 text-sm font-semibold text-slate-500" role="status">
            Loading sales reports…
          </p>
        ) : null}
        {list && list.items.length === 0 ? (
          <AdminEmptyPanel
            description={status ? "No reports have this status." : "Record the partner’s first half-month sales report when it arrives."}
            icon="record"
            title="No sales reports yet"
          />
        ) : null}
        {list && list.items.length > 0 ? (
          <>
            <div
              aria-hidden="true"
              className={`hidden border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-500 lg:grid lg:gap-4 ${columns}`}
            >
              <span>Period</span>
              <span>Partner</span>
              <span>Reference</span>
              <span>Status</span>
              <span>Sold</span>
              <span>Net value</span>
              <span>Next step</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {list.items.map((r) => (
                <li key={r.id}>
                  <button
                    aria-label={`Open sales report ${r.partnerReference} version ${r.version}, ${r.merchantName}`}
                    className={`grid w-full gap-2 px-4 py-3.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1570ef] sm:px-5 lg:items-center lg:gap-4 ${columns}`}
                    onClick={() => context.navigate({ report: r.id })}
                    type="button"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm font-black text-slate-950">{salesPeriodLabel(r.periodStart, r.periodEndExclusive)}</span>
                      <span className="lg:hidden">
                        <StatusPill tone={salesReportTone(r.status)}>{salesReportStatusLabel(r.status)}</StatusPill>
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-900">{r.merchantName}</span>
                      <span className="block text-xs text-slate-500">{r.branchName}</span>
                    </span>
                    <span className="text-sm text-slate-700">
                      {r.partnerReference}
                      {r.version > 1 ? <span className="text-xs text-slate-500"> · v{r.version}</span> : null}
                      <span className="mt-1 block">
                        <AdminStatusBadge tone={r.evidenceLevel === "Documented" ? "positive" : "neutral"}>
                          {r.evidenceLevel === "Documented" ? "Documented" : "Summary only"}
                        </AdminStatusBadge>
                      </span>
                    </span>
                    <span className="hidden lg:block">
                      <StatusPill tone={salesReportTone(r.status)}>{salesReportStatusLabel(r.status)}</StatusPill>
                    </span>
                    <span className="text-sm font-black text-slate-900">
                      {r.unitsSold}
                      {r.unitsRefunded ? <span className="block text-xs font-semibold text-slate-500">−{r.unitsRefunded} refunded</span> : null}
                    </span>
                    <span className="text-sm text-slate-700">{ringgit(r.netSalesValue)}</span>
                    <NextStepCell step={salesReportNextStep(r)} />
                  </button>
                </li>
              ))}
            </ul>
            <Pager noun="report" onPage={setPage} page={page} pageSize={LIST_PAGE_SIZE} total={list.total} />
          </>
        ) : null}
      </AdminSection>
    </div>
  );
}

function SalesReportDetail({ context, reportId, onBack }: { context: ConsignmentContext; reportId: string; onBack: () => void }) {
  const [report, setReport] = useState<api.SalesReport | null>(null);
  const [error, setError] = useState("");
  // The reviewer's links for a report whose month is already closed, read only when verifying.
  const lateLinks = useRef<{ links: api.LateAllocationInput[]; problem: string }>({ links: [], problem: "" });
  const { reloadKey, can, actions, policy } = context;

  useEffect(() => {
    let active = true;
    api
      .getSalesReport(reportId)
      .then((value) => {
        if (!active) return;
        setReport(value);
        setError("");
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [reportId, reloadKey]);

  if (!report || report.id !== reportId) {
    return (
      <div className="grid gap-3">
        <BackLink label="All sales reports" onClick={onBack} />
        <AdminSection title="Sales report">
          <div className="p-5">
            {error ? (
              <Callout role="alert" tone="critical">
                {error}
              </Callout>
            ) : (
              <p className="text-sm font-semibold text-slate-500" role="status">
                Loading sales report…
              </p>
            )}
          </div>
        </AdminSection>
      </div>
    );
  }

  const r = report;
  const busy = actions.busy;
  // Issues the reviewer's links in the Verify dialog can resolve (for example sales beyond the shelf stock that the
  // closing count found missing) don't block opening it; everything else does. The server re-checks all of them.
  const linkable = new Set(r.lateReport ? r.linkResolvableIssues ?? [] : []);
  const blocking = r.issues.filter((issue) => !linkable.has(issue));
  const needsLinks = r.issues.filter((issue) => linkable.has(issue));
  const period = salesPeriodLabel(r.periodStart, r.periodEndExclusive);

  const record = () =>
    void actions.work(async () => {
      setReport(await api.salesReportAction(r, "record"));
      return "Sales report recorded. It stays unverified until you check it against the evidence.";
    }, "Recorded.");

  const verify = () => {
    lateLinks.current = { links: [], problem: r.lateReport ? lateLinkProblem(r.lateReport, {}) : "" };
    actions.request({
      title: "Verify this sales report?",
      message: `${r.merchantName} · ${period} · ${r.unitsSold} sold${r.unitsRefunded ? `, ${r.unitsRefunded} refunded` : ""}. Verifying moves these quantities off the partner’s shelf stock and records what the partner owes for this period. Any sales commission waits until the partner has paid the period in full. It creates no invoice or payment, and marks no Tag Code as sold.`,
      details:
        r.evidenceLevel === "Summary" || r.lateReport ? (
          <>
            {r.evidenceLevel === "Summary" ? (
              <Callout tone="info" title="Summary evidence">
                This report is a summary only. It will be corroborated when the next monthly stocktake matches.
              </Callout>
            ) : null}
            {r.lateReport ? (
              <LateReportLinks late={r.lateReport} onChange={(links, problem) => (lateLinks.current = { links, problem })} />
            ) : null}
          </>
        ) : undefined,
      warnings: r.warnings,
      allowSelfReview: policy?.canSelfReview,
      selfReviewEvidence: r.evidenceReference,
      confirmLabel: "Verify report",
      validate: () => lateLinks.current.problem,
      keepOpenOnError: true,
      run: async ({ selfReview, acknowledged }) => {
        const links = r.lateReport ? lateLinks.current.links : [];
        setReport(await api.salesReportAction(r, "verify", {
          selfReview, acknowledgeWarnings: acknowledged, ...(links.length ? { allocations: links } : {}) }));
        return links.length
          ? `${r.partnerReference} verified and linked to what the count found. Shelf stock is updated.`
          : `${r.partnerReference} verified. Shelf stock is updated.`;
      },
    });
  };

  const dispute = () =>
    actions.request({
      title: "Dispute this sales report?",
      message: `${r.merchantName} · ${period}. The report stays in history exactly as reported and moves no stock. Ask the partner for corrected figures, then record a correction.`,
      reason: { label: "What needs correcting", hint: "At least 10 characters. Kept with the report.", minLength: 10 },
      confirmLabel: "Dispute report",
      destructive: true,
      run: async ({ reason }) => {
        setReport(await api.salesReportAction(r, "dispute", { reason }));
        return "Report disputed. Record a correction when the partner sends corrected figures.";
      },
    });

  // Reopening reviewed figures is a review decision, so it needs the verify permission and a reason.
  // The new version is then edited and recorded like any draft.
  const correct = () =>
    actions.request({
      title: "Start a correction?",
      message: `${r.merchantName} · ${period}. A new draft version is created from this report. This version stays unchanged, and keeps its stock effect, until the correction is verified.`,
      reason: { label: "Why it needs correcting", hint: "At least 10 characters. Kept with both versions.", minLength: 10 },
      confirmLabel: "Start correction",
      run: async ({ reason }) => {
        const draft = await api.salesReportAction(r, "correct", { reason });
        context.navigate({ report: draft.id });
        if (can.recordSales) context.openSalesReport({ mode: "edit", report: draft });
        return can.recordSales
          ? `Correction started as version ${draft.version}. The original stays unchanged until the correction is verified.`
          : `Correction started as version ${draft.version}. Someone who records sales reports can now enter the corrected figures.`;
      },
    });

  // Recovery when earlier edits weren't recorded: a new, empty version entered from the partner's
  // evidence. Whoever re-enters and records it are its makers; someone else verifies it.
  const reenter = () =>
    actions.request({
      title: "Re-enter this report from evidence?",
      message: `${r.merchantName} · ${period}. A new, empty version is created for you to enter from the partner’s evidence. This version stays unchanged, and keeps its stock effect, until the new one is verified.`,
      reason: { label: "Why it’s being re-entered", hint: "At least 10 characters. Kept with both versions.", minLength: 10 },
      confirmLabel: "Re-enter report",
      run: async ({ reason }) => {
        const draft = await api.salesReportAction(r, "re-enter", { reason });
        context.navigate({ report: draft.id });
        if (can.recordSales) context.openSalesReport({ mode: "edit", report: draft });
        return `Version ${draft.version} started. Enter the partner’s figures, then record it.`;
      },
    });

  const historyUnknown = r.contributorHistoryComplete === false;

  const discard = () =>
    actions.request({
      title: "Discard this draft?",
      message: "The draft is kept in history as discarded and moves no stock.",
      destructive: true,
      confirmLabel: "Discard draft",
      run: async () => {
        setReport(await api.salesReportAction(r, "void"));
        return "Draft discarded.";
      },
    });

  return (
    <div className="grid gap-4">
      <BackLink label="All sales reports" onClick={onBack} />
      <section aria-labelledby="sales-report-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                {r.merchantName} · {r.branchName}
              </p>
              <h3 className="mt-1 text-xl font-black text-slate-950" id="sales-report-title">
                {period}
              </h3>
              <p className="mt-0.5 text-sm text-slate-600">
                {r.partnerReference} · version {r.version} · {r.agreementReference} v{r.agreementVersion}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusPill tone={salesReportTone(r.status)}>{salesReportStatusLabel(r.status)}</StatusPill>
                <AdminStatusBadge tone={r.evidenceLevel === "Documented" ? "positive" : "neutral"}>
                  {r.evidenceLevel === "Documented" ? "Documented evidence" : "Summary evidence"}
                </AdminStatusBadge>
                {r.reviewMode ? <AdminStatusBadge tone="warning">{r.reviewMode}</AdminStatusBadge> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {r.status === "Draft" && can.recordSales ? (
                <>
                  <button className={primaryButton} disabled={busy} onClick={record} type="button">
                    Record as unverified
                  </button>
                  <button className={secondaryButton} disabled={busy} onClick={() => context.openSalesReport({ mode: "edit", report: r })} type="button">
                    Edit draft
                  </button>
                  <button className={dangerButton} disabled={busy} onClick={discard} type="button">
                    Discard draft
                  </button>
                </>
              ) : null}
              {r.status === "Recorded" && can.verifySales ? (
                <>
                  <button
                    aria-describedby={blocking.length ? "report-issues" : needsLinks.length ? "report-link-issues" : undefined}
                    className={blocking.length ? secondaryButton : primaryButton}
                    disabled={busy || blocking.length > 0}
                    onClick={verify}
                    type="button"
                  >
                    Verify report
                  </button>
                  <button className={blocking.length ? primaryButton : dangerButton} disabled={busy} onClick={dispute} type="button">
                    Dispute report
                  </button>
                </>
              ) : null}
              {(r.status === "Verified" || r.status === "Disputed") && !r.supersededById && can.verifySales ? (
                historyUnknown ? (
                  <button className={primaryButton} disabled={busy} onClick={reenter} type="button">
                    Re-enter from evidence
                  </button>
                ) : (
                  <button className={r.status === "Disputed" ? primaryButton : secondaryButton} disabled={busy} onClick={correct} type="button">
                    Correct report
                  </button>
                )
              ) : null}
              {r.supersededById ? (
                <button className={secondaryButton} onClick={() => context.navigate({ report: r.supersededById })} type="button">
                  Open newer version
                </button>
              ) : null}
              {r.supersedesReportId ? (
                <button className={secondaryButton} onClick={() => context.navigate({ report: r.supersedesReportId })} type="button">
                  Open version {r.version - 1}
                </button>
              ) : null}
            </div>
          </div>

          {historyUnknown && !["Superseded", "Voided"].includes(r.status) ? (
            <Callout title="Earlier edits weren’t recorded" tone="warning">
              Who changed these figures before edits were tracked isn’t known, so nobody can verify them as an independent
              reviewer.{" "}
              {r.status === "Recorded"
                ? "Dispute the report, then re-enter it from the partner’s evidence, or have the named founder self-review it in Solo Mode."
                : "Re-enter it from the partner’s evidence, or have the named founder self-review it in Solo Mode."}
            </Callout>
          ) : null}
          {blocking.length > 0 ? (
            <Callout role="alert" title="Can’t be verified as reported" tone="critical">
              <ul className="list-disc space-y-1 pl-5" id="report-issues">
                {blocking.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Callout>
          ) : null}
          {needsLinks.length > 0 ? (
            <Callout title="Needs a link before it can be verified" tone="warning">
              <ul className="list-disc space-y-1 pl-5" id="report-link-issues">
                {needsLinks.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
              {blocking.length === 0 && r.status === "Recorded" ? (
                <p className="mt-2">Open Verify report to link these sales to what the count found, with the partner’s evidence.</p>
              ) : null}
            </Callout>
          ) : null}
          {r.warnings.length > 0 && r.status === "Recorded" ? (
            <Callout title="Check before verifying" tone="warning">
              <ul className="list-disc space-y-1 pl-5">
                {r.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Callout>
          ) : null}
          {r.status === "Disputed" && r.disputeReason ? (
            <Callout title="Disputed" tone="critical">
              {r.disputeReason}
            </Callout>
          ) : null}
        </div>

        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Line</th>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Price</th>
                <th className="px-4 py-2.5 text-right">Unit price</th>
                <th className="px-4 py-2.5 text-right">Qty</th>
                <th className="px-4 py-2.5 text-right">Net value</th>
                <th className="px-4 py-2.5 text-right">Promotion</th>
                <th className="px-4 py-2.5">Returns</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 font-bold">{l.lineType === "Sale" ? "Sale" : "Refund"}</td>
                  <td className="px-4 py-2.5">
                    <span className="block font-bold text-slate-900">{l.sku}</span>
                    <span className="block text-xs text-slate-500">{l.productName}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {l.priceTermName ? (
                      <span>{l.priceTermKind === "Promotion" ? l.priceTermName : "Standard price"}</span>
                    ) : (
                      <AdminStatusBadge tone="critical">Not approved</AdminStatusBadge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">{ringgit(l.unitNetPrice)}</td>
                  <td className="px-4 py-2.5 text-right font-black">{l.quantity}</td>
                  <td className="px-4 py-2.5 text-right">{ringgit(l.netValue)}</td>
                  <td className="px-4 py-2.5 text-right">{l.promotionalDiscount ? ringgit(l.promotionalDiscount) : "—"}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {l.lineType === "Refund"
                      ? `${l.restockableQuantity} restockable · ${l.unsellableReturnedQuantity} unsellable${
                          l.refundOfPeriodStart ? ` · sale from ${salesPeriodLabel(l.refundOfPeriodStart, halfEnd(l.refundOfPeriodStart))}` : ""
                        }`
                      : "—"}
                    {l.restockableQuantity > 0 ? (
                      l.sealedReturnConfirmed ? (
                        <span className="block text-slate-500">Sealed: {l.sealedReturnEvidence}</span>
                      ) : (
                        <span className="block font-bold text-[#a63c2e]">Seal not confirmed</span>
                      )
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 font-black text-slate-900">
              <tr>
                <td className="px-4 py-2.5" colSpan={4}>
                  Total
                </td>
                <td className="px-4 py-2.5 text-right">
                  {r.unitsSold}
                  {r.unitsRefunded ? <span className="block text-xs font-semibold text-slate-500">−{r.unitsRefunded}</span> : null}
                </td>
                <td className="px-4 py-2.5 text-right">{ringgit(r.netSalesValue)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        <dl className="grid gap-x-6 gap-y-3 border-t border-slate-200 p-4 text-sm sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
          <Info label="Evidence">
            {r.evidenceKind}
            {r.evidenceReference ? ` · ${r.evidenceReference}` : ""}
          </Info>
          <Info label="Received">{dateTime(r.reportReceivedAt)}</Info>
          <Info label="Recorded">{r.recordedAt ? dateTime(r.recordedAt) : "Not yet"}</Info>
          <Info label="Verified">{r.verifiedAt ? dateTime(r.verifiedAt) : "Not yet"}</Info>
          {r.notes ? (
            <div className="sm:col-span-2 xl:col-span-4">
              <Info label="Notes">{r.notes}</Info>
            </div>
          ) : null}
        </dl>
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">
          Values stay exactly as the partner reported them; a correction is a new version. Only a verified report counts towards
          the partner&apos;s settlement and sales commission.
        </p>
      </section>
    </div>
  );
}

function halfEnd(startIso: string) {
  const start = new Date(startIso);
  const local = new Date(start.getTime() + 8 * 3600000);
  const day = local.getUTCDate();
  const end = day < 16
    ? Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 16) - 8 * 3600000
    : Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - 8 * 3600000;
  return new Date(end).toISOString();
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] font-extrabold uppercase text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words font-semibold text-slate-800">{children}</dd>
    </div>
  );
}
