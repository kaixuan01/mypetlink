"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type * as api from "@/services/adminConsignmentService";
import { errorMessage } from "./model";
import { TextAreaField, TextField } from "./ui";

/**
 * A consequential operation waiting for confirmation. When the policy lets the
 * operator self-review, the dialog collects that attestation; `reason` adds a
 * required free-text field (for example, why an agreement is closing).
 */
export type PendingAction = {
  title: string;
  message: string;
  details?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  allowSelfReview?: boolean;
  reason?: { label: string; hint?: string; minLength?: number };
  /** Warnings the operator must explicitly acknowledge before confirming. */
  warnings?: string[];
  /** Pre-fills the self-review evidence with the reference the server will expect. */
  selfReviewEvidence?: string;
  /** Checked on confirm: a message keeps the dialog open (with the operator's entries) and shows it. */
  validate?: () => string;
  /** A refused request keeps the dialog open, with the operator's entries and the reason, for correction. */
  keepOpenOnError?: boolean;
  run: (input: { selfReview?: api.SelfReview; reason: string; acknowledged: boolean }) => Promise<void | string>;
};

export type Notice = { tone: "success" | "error"; title: string } | null;

/**
 * refresh: false — for reads and downloads that change no record.
 * onError — shows a failure where the operator is looking (inside an open
 * dialog) instead of in the page notice behind it.
 */
export type WorkOptions = { refresh?: boolean; onError?: (message: string) => void; keepOpenOnError?: boolean };

export type ConsignmentActions = {
  busy: boolean;
  request: (action: PendingAction) => void;
  work: (fn: () => Promise<void | string>, success: string, options?: WorkOptions) => Promise<boolean>;
  notice: Notice;
  setNotice: (notice: Notice) => void;
};

/**
 * Runs every write the same way: one at a time, refreshing the records
 * afterwards, and reporting success only when the server accepted it.
 */
export function useConsignmentActions(reload: () => Promise<void> | void) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPendingState] = useState<PendingAction | null>(null);
  const [selfConfirmed, setSelfConfirmed] = useState(false);
  const [selfReason, setSelfReason] = useState("");
  const [selfEvidence, setSelfEvidence] = useState("");
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [problem, setProblem] = useState("");

  const setPending = useCallback((next: PendingAction | null) => {
    setProblem("");
    setSelfConfirmed(false);
    setSelfReason("");
    setSelfEvidence("");
    setReason("");
    setAcknowledged(false);
    setSelfEvidence(next?.selfReviewEvidence ?? "");
    setPendingState(next);
  }, []);

  const work = useCallback(
    async (fn: () => Promise<void | string>, success: string, options?: WorkOptions) => {
      setBusy(true);
      setNotice(null);
      let succeeded = false;
      try {
        const result = await fn();
        succeeded = true;
        if (options?.refresh !== false) await reload();
        setNotice({ tone: "success", title: typeof result === "string" ? result : success });
        return true;
      } catch (e) {
        if (options?.onError) options.onError(errorMessage(e));
        else setNotice({ tone: "error", title: errorMessage(e) });
        return false;
      } finally {
        setBusy(false);
        if (succeeded || !options?.keepOpenOnError) setPending(null);
      }
    },
    [reload, setPending]
  );

  const selfReviewIncomplete =
    Boolean(pending?.allowSelfReview && selfConfirmed) && (selfReason.trim().length < 10 || selfEvidence.trim().length < 5);
  const reasonMissing = Boolean(pending?.reason) && reason.trim().length < (pending?.reason?.minLength ?? 1);
  const warningsUnacknowledged = Boolean(pending?.warnings?.length) && !acknowledged;

  const dialog = (
    <ConfirmDialog
      confirmDisabled={busy || selfReviewIncomplete || reasonMissing || warningsUnacknowledged}
      confirmLabel={pending?.confirmLabel ?? "Confirm"}
      destructive={pending?.destructive}
      message={pending?.message ?? ""}
      onCancel={() => {
        if (!busy) setPending(null);
      }}
      onConfirm={() => {
        if (!pending || busy) return;
        const invalid = pending.validate?.() ?? "";
        setProblem(invalid);
        if (invalid) return;
        const selfReview =
          pending.allowSelfReview && selfConfirmed
            ? { confirmed: true, reason: selfReason, externalEvidenceReference: selfEvidence }
            : undefined;
        void work(() => pending.run({ selfReview, reason, acknowledged }), "Changes recorded.",
          pending.keepOpenOnError ? { onError: setProblem, keepOpenOnError: true } : undefined);
      }}
      open={pending !== null}
      title={pending?.title ?? "Confirm action"}
    >
      {pending?.details || pending?.reason || pending?.allowSelfReview || pending?.warnings?.length ? (
        <div className="grid gap-4">
          {problem ? (
            <div className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]" role="alert">
              {problem}
            </div>
          ) : null}
          {pending?.details}
          {pending?.warnings?.length ? (
            <div className="grid gap-2 rounded-2xl border border-[#f6dfae] bg-[#fdf6e7] p-4 text-sm text-[#7a4f0d]">
              <p className="font-black">Check before confirming</p>
              <ul className="list-disc space-y-1 pl-5 font-semibold">
                {pending.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              <label className="mt-1 flex items-start gap-3 font-bold text-slate-800">
                <input
                  checked={acknowledged}
                  className="mt-1 h-4 w-4 shrink-0"
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  type="checkbox"
                />
                <span>I have checked these points against the partner&apos;s evidence.</span>
              </label>
            </div>
          ) : null}
          {pending?.reason ? (
            <TextAreaField hint={pending.reason.hint} label={pending.reason.label} onChange={setReason} requirement="required" value={reason} />
          ) : null}
          {pending?.allowSelfReview ? (
            <fieldset className="grid gap-3 rounded-2xl border border-[#f6dfae] bg-[#fdf6e7] p-4">
              <legend className="px-1 text-sm font-black text-[#7a4f0d]">Solo self-review</legend>
              <label className="flex items-start gap-3 text-sm font-semibold text-slate-800">
                <input
                  checked={selfConfirmed}
                  className="mt-1 h-4 w-4 shrink-0"
                  onChange={(event) => setSelfConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  This is my own work. I confirm the actual partner acceptance, acknowledgment or new supporting evidence. Record
                  this as Self-reviewed (Solo).
                </span>
              </label>
              {selfConfirmed ? (
                <>
                  <TextField hint="At least 10 characters." label="Self-review reason" onChange={setSelfReason} requirement="required" value={selfReason} />
                  <TextField
                    hint="Use the exact signed agreement or receiving evidence reference for this operation. A discrepancy resolution must cite new evidence."
                    label="Self-review external evidence reference"
                    onChange={setSelfEvidence}
                    requirement="required"
                    value={selfEvidence}
                  />
                </>
              ) : (
                <p className="text-xs leading-5 text-[#7a4f0d]">
                  Leave this unticked when you are independently reviewing work another administrator prepared.
                </p>
              )}
            </fieldset>
          ) : null}
        </div>
      ) : null}
    </ConfirmDialog>
  );

  const actions: ConsignmentActions = { busy, request: setPending, work, notice, setNotice };
  return { actions, dialog };
}
