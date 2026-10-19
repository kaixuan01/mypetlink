"use client";

import { useState } from "react";
import type * as api from "@/services/adminConsignmentService";
import { countDateLabel, lateLinkProblem } from "./model";
import { Callout, TextField } from "./ui";

type Draft = { quantity: string; evidence: string; explanation: string };

/**
 * For a report whose month a stocktake has already closed: lets the reviewer link it to what the
 * first count after its period found, one discrepancy at a time, with evidence. Nothing is linked
 * by default; an unlinked report is simply posted to the current month.
 */
export function LateReportLinks({
  late,
  onChange,
}: {
  late: api.LateReport;
  onChange: (links: api.LateAllocationInput[], problem: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const date = countDateLabel(late.closedCountDate);

  function update(id: string, patch: Partial<Draft>) {
    const next = { ...drafts, [id]: { ...(drafts[id] ?? { quantity: "0", evidence: "", explanation: "" }), ...patch } };
    setDrafts(next);
    const links = Object.entries(next)
      .filter(([, d]) => /^\d+$/.test(d.quantity.trim()) && Number(d.quantity) > 0)
      .map(([discrepancyId, d]) => ({ discrepancyId, quantity: Number(d.quantity), evidenceReference: d.evidence.trim(), explanation: d.explanation.trim() }));
    onChange(links, lateLinkProblem(late, next));
  }

  return (
    <section aria-label={`Link to the count of ${date}`} className="grid gap-3 rounded-2xl border border-slate-200 p-4 text-sm">
      <div>
        <p className="font-black text-slate-900">The stocktake of {date} already closed this period</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          This report is posted to the current month. If the partner’s records show it accounts for something that count found, link
          it below with that evidence. Matching dates and quantities alone aren’t proof, so leave it unlinked if you aren’t sure: the
          finding stays open for investigation.
        </p>
      </div>
      {late.skus.map((sku) => (
        <div className="grid gap-2 border-t border-slate-100 pt-3" key={sku.productVariantId}>
          <p className="font-bold text-slate-900">
            {sku.sku}:{" "}
            {sku.explainsKind === "Shortage"
              ? `${sku.capacity} sold that the count couldn’t have seen`
              : sku.explainsKind === "Surplus"
                ? `${sku.capacity} back on the shelf that the count couldn’t have seen`
                : "no change the count couldn’t have seen"}
          </p>
          {sku.requiredLinks ? (
            <Callout tone="warning">
              Link at least {sku.requiredLinks}: these sales are more than the shelf stock, so the report can be verified only if the
              partner’s records show they account for what the count found missing.
            </Callout>
          ) : null}
          {sku.withdrawn.length ? (
            <Callout tone="warning">
              The version this replaces explained {sku.withdrawn.reduce((n, w) => n + w.quantity, 0)} of what the count found. Verifying
              reopens it unless you link it again here.
            </Callout>
          ) : null}
          {sku.candidates.length === 0 ? (
            <p className="text-xs text-slate-500">Nothing open from that count can be linked to this report.</p>
          ) : (
            sku.candidates.map((c) => {
              const d = drafts[c.discrepancyId];
              const linked = d && /^\d+$/.test(d.quantity.trim()) && Number(d.quantity) > 0;
              return (
                <div className="grid gap-2 rounded-xl bg-slate-50 p-3" key={c.discrepancyId}>
                  <p className="text-xs font-bold text-slate-700">
                    {c.kind === "Shortage" ? "Missing from the shelf" : "More than the books"} · count of {countDateLabel(c.originCountDate)} ·{" "}
                    {c.openQuantity} of {c.quantity} open
                  </p>
                  <TextField
                    hint={`0 to leave it open. At most ${Math.min(c.openQuantity, sku.capacity)}.`}
                    inputMode="numeric"
                    label={`Link to this ${c.kind === "Shortage" ? "shortage" : "surplus"}`}
                    onChange={(value) => update(c.discrepancyId, { quantity: value })}
                    requirement="optional"
                    value={d?.quantity ?? "0"}
                  />
                  {linked ? (
                    <>
                      <TextField
                        hint="What links them, for example the dated sale or refund record. The count sheet can’t show this."
                        label="Link evidence"
                        onChange={(value) => update(c.discrepancyId, { evidence: value })}
                        requirement="required"
                        value={d.evidence}
                      />
                      <TextField
                        label="Why this report accounts for it"
                        onChange={(value) => update(c.discrepancyId, { explanation: value })}
                        requirement="required"
                        value={d.explanation}
                      />
                    </>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ))}
    </section>
  );
}
