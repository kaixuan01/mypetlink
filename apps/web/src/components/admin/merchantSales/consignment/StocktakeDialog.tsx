"use client";

import { useEffect, useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import * as api from "@/services/adminConsignmentService";
import { primaryButton, secondaryButton } from "../shared";
import type { ConsignmentContext } from "./context";
import {
  countDateLabel,
  countedAfterCutoff,
  errorMessage,
  malaysiaDateTime,
  malaysiaTimestamp,
  previewCount,
  stocktakeCountDates,
  stocktakeMatches,
} from "./model";
import { Callout, SelectField, TextAreaField, TextField } from "./ui";

export type StocktakeRequest = { mode: "new"; branchId?: string } | { mode: "edit"; stocktake: api.Stocktake };

const evidenceKinds: api.CountEvidenceKind[] = ["Count sheet photo", "WhatsApp count summary", "Joint count in person", "Other"];
const isCount = (value: string) => /^\d{1,6}$/.test(value.trim());

type Counts = Record<string, { sellable: string; unsellable: string }>;

/** What closing the month would record for this count, before anything is posted. */
function variance(line: api.StocktakeLine, counts: Counts[string] | undefined): string {
  if (!counts || !isCount(counts.sellable) || !isCount(counts.unsellable)) return "";
  return previewCount(line, Number(counts.sellable), Number(counts.unsellable));
}

/**
 * Enters a partner's physical count by SKU. The books it is compared with come from the
 * server; nothing is posted until the month is closed. Shop staff never scan Tag Codes.
 */
export function StocktakeDialog({
  context,
  request,
  onClose,
  onSaved,
}: {
  context: ConsignmentContext;
  request: StocktakeRequest;
  onClose: () => void;
  onSaved: (stocktake: api.Stocktake, message: string) => void;
}) {
  const editing = request.mode === "edit" ? request.stocktake : null;
  const branches = (context.positions ?? []).map((p) => ({ value: p.merchantBranchId, label: `${p.merchantName} · ${p.branchName}` }));
  const dates = stocktakeCountDates();
  const [branchId, setBranchId] = useState(
    editing?.merchantBranchId ?? (request.mode === "new" ? request.branchId : undefined) ?? (branches.length === 1 ? branches[0].value : "")
  );
  const [countDate, setCountDate] = useState(editing?.countDate ?? dates[0]?.value ?? "");
  const [countedBy, setCountedBy] = useState(editing?.countedBy ?? "");
  const [evidenceKind, setEvidenceKind] = useState<api.CountEvidenceKind>(editing?.evidenceKind ?? "Count sheet photo");
  const [evidenceReference, setEvidenceReference] = useState(editing?.evidenceReference ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  // When the shelf was physically counted, in Malaysia time: not the count date, and not when it is typed in.
  const [countedAt, setCountedAt] = useState(() => {
    if (!editing?.countedAt) return "";
    const { date, time } = malaysiaDateTime(editing.countedAt);
    return `${date}T${time}`;
  });
  const [afterCutoffNote, setAfterCutoffNote] = useState(editing?.countedAfterCutoffNote ?? "");
  const [counts, setCounts] = useState<Counts>(() =>
    Object.fromEntries((editing?.lines ?? []).filter((l) => l.countedSellable !== null)
      .map((l) => [l.productVariantId, { sellable: String(l.countedSellable), unsellable: String(l.countedUnsellable) }]))
  );
  const [expectation, setExpectation] = useState<api.StocktakeExpectation | null>(null);
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedDraft, setSavedDraft] = useState<api.Stocktake | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!branchId || !countDate) return;
    let active = true;
    api
      .getStocktakeExpectation(branchId, countDate)
      .then((value) => {
        if (active) setExpectation(value);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [branchId, countDate]);

  const lines = expectation && expectation.merchantBranchId === branchId && expectation.countDate === countDate ? expectation.lines : [];
  const lineError = (line: api.StocktakeLine) => {
    const c = counts[line.productVariantId];
    return !c || !isCount(c.sellable) || !isCount(c.unsellable) ? "Enter both counts (0 if none)." : "";
  };
  const countedOn = countedAt.slice(0, 10);
  const countedStamp = malaysiaTimestamp(countedOn, countedAt.slice(11, 16));
  const afterCutoff = countedAfterCutoff(countDate, countedOn);
  const errors = {
    branch: branchId ? "" : "Choose the branch that was counted.",
    countedAt: !countedStamp
      ? "Enter when the shelf was actually counted."
      : countedOn < countDate
        ? `A count taken before ${countDateLabel(countDate)} can’t close that period. Choose the count date it was taken on.`
        : "",
    afterCutoffNote: !afterCutoff || afterCutoffNote.trim().length >= 20
      ? ""
      : "Explain how you know nothing was sold, delivered or returned between midnight and the count (at least 20 characters).",
    countedBy: countedBy.trim() ? "" : "Say who counted.",
    evidence: evidenceReference.trim().length >= 5 ? "" : "Say where the count is recorded, for example the photo of the count sheet.",
    lines: lines.length === 0 ? "There is nothing to count at this branch yet." : lines.some((l) => lineError(l)) ? "Count every SKU." : "",
  };
  const setCount = (variant: string, key: "sellable" | "unsellable", value: string) =>
    setCounts((current) => ({ ...current, [variant]: { ...(current[variant] ?? { sellable: "", unsellable: "" }), [key]: value } }));

  async function save(record: boolean) {
    if (errors.branch || errors.countedBy || errors.countedAt || errors.afterCutoffNote || errors.lines || (record && errors.evidence)) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const input: api.StocktakeInput = {
        merchantBranchId: branchId, countDate, countedBy: countedBy.trim(), evidenceKind,
        evidenceReference: evidenceReference.trim() || null, notes: notes.trim() || null, idempotencyKey: editing ? undefined : idempotencyKey,
        countedAt: countedStamp, countedAfterCutoffNote: afterCutoff ? afterCutoffNote.trim() : null,
        lines: lines.map((l) => ({
          productVariantId: l.productVariantId,
          countedSellable: Number(counts[l.productVariantId].sellable),
          countedUnsellable: Number(counts[l.productVariantId].unsellable),
        })),
      };
      const recordedMessage = "Count recorded. Close the month once you have checked it.";
      let saved: api.Stocktake;
      const known = savedDraft ?? editing;
      if (known) {
        // An earlier attempt may have gone through after its reply was lost.
        const latest = await api.getStocktake(known.id);
        if (latest.status !== "Draft") {
          if (latest.status === "Recorded" && stocktakeMatches(latest, input)) {
            onSaved(latest, recordedMessage);
            return;
          }
          throw new Error("This count was already recorded with different values, so nothing was changed. Close this window and open the stocktake to check it.");
        }
        saved = await api.saveStocktake(input, latest);
      } else {
        saved = await api.saveStocktake(input);
      }
      setSavedDraft(saved);
      if (record) saved = await api.stocktakeAction(saved, "record");
      onSaved(saved, record ? recordedMessage : "Count saved as a draft.");
    } catch (e) {
      setError(`${errorMessage(e)} Your entries are kept.`);
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button className={secondaryButton} disabled={saving} onClick={onClose} type="button">
        Cancel
      </button>
      <button className={secondaryButton} disabled={saving} onClick={() => void save(false)} type="button">
        Save draft
      </button>
      <button className={primaryButton} disabled={saving} onClick={() => void save(true)} type="button">
        {saving ? "Saving…" : "Record count"}
      </button>
    </div>
  );

  return (
    <FormDialog
      closeOnBackdrop={false}
      description="Enter what the shop counted, by SKU. Sealed packages are sellable; opened or damaged ones are unsellable. Nothing changes in the books until you close the month."
      eyebrow="Monthly stocktake"
      footer={footer}
      maxWidthClassName="sm:max-w-4xl"
      onRequestClose={() => {
        if (!saving) onClose();
      }}
      open
      title={editing ? `Edit count of ${countDateLabel(editing.countDate)}` : "Record stocktake"}
    >
      <div className="grid gap-5">
        {error ? (
          <div className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]" role="alert">
            {error}
          </div>
        ) : null}
        <section className="grid gap-4 sm:grid-cols-2">
          <SelectField
            disabled={Boolean(editing)}
            emptyLabel={branches.length ? "Choose branch" : "No partner stock yet"}
            error={showErrors ? errors.branch || undefined : undefined}
            label="Partner branch"
            onChange={setBranchId}
            options={branches}
            requirement="required"
            value={branchId}
          />
          <SelectField
            emptyLabel="Choose count date"
            hint="Count at the end of the 15th or the last day of the month, after the shop closes."
            label="Count date"
            onChange={setCountDate}
            options={dates.some((d) => d.value === countDate) || !countDate ? dates : [{ value: countDate, label: countDateLabel(countDate) }, ...dates]}
            requirement="required"
            value={countDate}
          />
          <TextField
            error={showErrors ? errors.countedAt || undefined : undefined}
            hint="Malaysia time, when the shelf was physically counted. If it was the next morning before the shop opened, enter that time."
            label="Counted at"
            onChange={setCountedAt}
            requirement="required"
            type="datetime-local"
            value={countedAt}
          />
          {afterCutoff ? (
            <div className="sm:col-span-2">
              <TextAreaField
                error={showErrors ? errors.afterCutoffNote || undefined : undefined}
                hint="Counted after the count date ended, so record how you know nothing moved in between, for example: the shop opens at 10 am and the owner confirms no sales or deliveries before the count. If stock may have moved, count again on the next count date instead."
                label="Nothing moved since midnight because"
                onChange={setAfterCutoffNote}
                requirement="required"
                value={afterCutoffNote}
              />
            </div>
          ) : null}
          <TextField
            error={showErrors ? errors.countedBy || undefined : undefined}
            hint="For example: the shop owner, with you on video call."
            label="Counted by"
            maxLength={200}
            onChange={setCountedBy}
            requirement="required"
            value={countedBy}
          />
          <SelectField
            emptyLabel="Choose"
            label="Count recorded as"
            onChange={(value) => setEvidenceKind(value as api.CountEvidenceKind)}
            options={evidenceKinds.map((k) => ({ value: k, label: k }))}
            requirement="required"
            value={evidenceKind}
          />
          <div className="sm:col-span-2">
            <TextField
              error={showErrors ? errors.evidence || undefined : undefined}
              hint="Where to find it later, for example: count sheet photo from the shop owner, WhatsApp 31 Oct 9:40 pm."
              label="Evidence reference"
              onChange={setEvidenceReference}
              requirement="required"
              value={evidenceReference}
            />
          </div>
        </section>

        {expectation?.issues.length ? (
          <Callout title="Before this month can be closed" tone="warning">
            <ul className="list-disc space-y-1 pl-5">
              {expectation.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </Callout>
        ) : null}

        <section aria-label="Counted stock" className="grid gap-2">
          {lines.length === 0 ? (
            <p className="text-sm font-semibold text-slate-500">{branchId && countDate ? "Loading what the books expect…" : "Choose the branch and count date."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">Expected and counted stock by SKU</caption>
                <thead className="border-b border-slate-200 text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">SKU</th>
                    <th className="px-3 py-2 text-right">Expected on the shelf</th>
                    <th className="px-3 py-2">Counted sellable</th>
                    <th className="px-3 py-2 text-right">Expected unsellable</th>
                    <th className="px-3 py-2">Counted unsellable</th>
                    <th className="py-2 pl-3">Difference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line) => {
                    const c = counts[line.productVariantId];
                    const err = showErrors ? lineError(line) : "";
                    return (
                      <tr key={line.productVariantId}>
                        <td className="py-2 pr-3">
                          <span className="block font-black text-slate-900">{line.sku}</span>
                          <span className="block text-xs text-slate-500">{line.productName}</span>
                          {err ? <span className="block text-xs font-bold text-[#a63c2e]" role="alert">{err}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right font-black">
                          {line.expectedSellable}
                          {line.openSurplusBefore ? (
                            <span className="block text-xs font-normal text-slate-500">
                              {line.bookSellable} verified + {line.openSurplusBefore} extra noted
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            aria-label={`Counted sellable ${line.sku}`}
                            className="min-h-10 w-24 rounded-lg border border-slate-300 px-2 text-right"
                            inputMode="numeric"
                            onChange={(e) => setCount(line.productVariantId, "sellable", e.target.value)}
                            value={c?.sellable ?? ""}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">{line.expectedUnsellable}</td>
                        <td className="px-3 py-2">
                          <input
                            aria-label={`Counted unsellable ${line.sku}`}
                            className="min-h-10 w-24 rounded-lg border border-slate-300 px-2 text-right"
                            inputMode="numeric"
                            onChange={(e) => setCount(line.productVariantId, "unsellable", e.target.value)}
                            value={c?.unsellable ?? ""}
                          />
                        </td>
                        <td className="py-2 pl-3 text-xs font-bold text-slate-700">{variance(line, c)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs leading-5 text-slate-500">
            Expected on the shelf is the verified sellable stock at the end of the count date, plus any extra packages an earlier count
            noted. Those extras are never added to verified stock. Missing packages are investigated, extra ones are only noted, and
            damaged ones are investigated. Nothing is treated as sold or written off automatically.
          </p>
        </section>
        <TextAreaField label="Notes" onChange={setNotes} requirement="optional" value={notes} />
      </div>
    </FormDialog>
  );
}
