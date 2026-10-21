"use client";

import Link from "next/link";
import { useState, type FormEvent, type MouseEvent } from "react";
import { DateInput } from "@/components/ui/DateInput";
import { FormDialog } from "@/components/ui/FormDialog";
import { getMalaysiaTodayIsoDate } from "@/lib/careRecordStatus";
import { ownerRoutes } from "@/lib/routes";
import type { CareCompletionInput, UpcomingCareItem } from "@/types";

/**
 * One Log as done attempt, owned by the page (the Care planner), not by this
 * dialog, so closing the dialog never loses it.
 *
 * - `key`: generated once; sent with every retry of this attempt.
 * - `input`: the details as first sent — frozen, with `key`. Every retry sends
 *   exactly this.
 * - `phase`: `editing` (nothing sent, or the service refused it as invalid
 *   and nothing was written — correctable under a new key); `sending`;
 *   `unknown` (it may have been written: details locked, Try again resends
 *   `input`, and closing keeps the attempt on the page to review); `refused`
 *   (the item can't be logged this way).
 */
export type CompletionAttempt = {
  id: number;
  item: UpcomingCareItem;
  key: string;
  input: CareCompletionInput | null;
  phase: "editing" | "sending" | "unknown" | "refused";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** The values a refused-as-invalid request carried, to correct. */
  draft?: CareCompletionInput;
};

/**
 * Log as done in one step: when it was done, the next due date if there is
 * one, and an optional note. The completing record copies the item's type,
 * title and care name and is private. Attachments and the clinic go through
 * the full form, linked here.
 */
export function CompleteCareDialog({
  attempt,
  onClose,
  onSubmit,
}: {
  attempt: CompletionAttempt;
  onClose: () => void;
  onSubmit: (input: CareCompletionInput) => void;
}) {
  const today = getMalaysiaTodayIsoDate();
  const start = attempt.input ?? attempt.draft;
  const [completedOn, setCompletedOn] = useState(start?.completedOn ?? today);
  const [nextDueDate, setNextDueDate] = useState(start?.nextDueDate ?? "");
  const [notes, setNotes] = useState(start?.notes ?? "");
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { item, phase } = attempt;
  const fieldErrors = { ...(attempt.fieldErrors ?? {}), ...localErrors };
  const locked = phase !== "editing";
  const dirty = completedOn !== today || nextDueDate !== "" || notes.trim() !== "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase === "sending" || phase === "refused") return;
    if (phase === "unknown" && attempt.input) {
      onSubmit(attempt.input);
      return;
    }

    const errors: Record<string, string> = {};
    if (!completedOn) errors.completedOn = "Choose the day this care was done.";
    else if (completedOn > today) errors.completedOn = "The day this care was done can't be in the future.";
    if (nextDueDate && completedOn && nextDueDate < completedOn) {
      errors.nextDueDate = "The next due date can't be before the day it was done.";
    }
    setLocalErrors(errors);
    if (Object.keys(errors).length) return;

    onSubmit({
      idempotencyKey: attempt.key,
      completedOn,
      nextDueDate: nextDueDate || undefined,
      notes: notes.trim() || undefined,
    });
  }

  function handleFullForm(event: MouseEvent<HTMLAnchorElement>) {
    // Entered details don't travel to the full form: say so before leaving.
    if (dirty && !confirmLeave) {
      event.preventDefault();
      setConfirmLeave(true);
    }
  }

  const formId = `complete-care-${item.id}`;
  const name = item.careName && item.careName !== item.title ? `${item.title} · ${item.careName}` : item.title;
  const fullFormHref = ownerRoutes.petRecords(item.petId, { complete: item.id });

  return (
    <FormDialog
      cancelAction={{ label: phase === "refused" ? "Close" : "Cancel", disabled: phase === "sending" }}
      closeLabel="Close log as done"
      closeOnBackdrop={false}
      description={`${name} for ${item.petName} · due ${item.dueDate}`}
      dismissible={phase !== "sending"}
      eyebrow="Log as done"
      footer={
        phase === "refused" ? (
          <div className="flex justify-end">
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>
        ) : undefined
      }
      maxWidthClassName="sm:max-w-lg"
      onRequestClose={() => {
        if (phase !== "sending") onClose();
      }}
      open
      primaryAction={
        phase === "refused"
          ? undefined
          : {
              disabled: phase === "sending",
              form: formId,
              label: phase === "unknown" ? "Try again" : "Save as done",
              pending: phase === "sending",
              pendingLabel: "Saving...",
              type: "submit",
            }
      }
      title="Mark as done"
    >
      <form className="grid gap-4" data-complete-care id={formId} noValidate onSubmit={handleSubmit}>
        {attempt.message ? (
          <p
            className={[
              "rounded-[1.25rem] border p-4 text-sm font-bold leading-6",
              phase === "refused"
                ? "border-[#f3b4a8] bg-[#fff1ee] text-[#8f3025]"
                : "border-pet-border bg-pet-cream text-pet-ink",
            ].join(" ")}
            data-complete-care-message={phase}
            role={phase === "refused" ? "alert" : "status"}
          >
            {attempt.message}
          </p>
        ) : null}

        <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0" disabled={locked}>
          <label className="grid gap-1.5 text-sm font-bold text-pet-ink">
            Done on
            <DateInput
              aria-describedby={fieldErrors.completedOn ? `${formId}-completed-error` : undefined}
              aria-invalid={Boolean(fieldErrors.completedOn)}
              className="brand-input"
              id={`${formId}-done`}
              max={today}
              onChange={(event) => setCompletedOn(event.target.value)}
              required
              value={completedOn}
            />
            {fieldErrors.completedOn ? (
              <span className="text-xs font-bold text-[#a63c2e]" id={`${formId}-completed-error`}>
                {fieldErrors.completedOn}
              </span>
            ) : null}
          </label>

          <div className="grid gap-1.5">
            <label className="text-sm font-bold text-pet-ink" htmlFor={`${formId}-next`}>
              Next due date (optional)
            </label>
            <span className="text-xs font-semibold text-pet-muted" id={`${formId}-next-help`}>
              From your vet card or clinic. Leave empty if there&apos;s no next date.
            </span>
            <DateInput
              aria-describedby={
                fieldErrors.nextDueDate ? `${formId}-next-help ${formId}-next-error` : `${formId}-next-help`
              }
              aria-invalid={Boolean(fieldErrors.nextDueDate)}
              className="brand-input"
              id={`${formId}-next`}
              min={completedOn || undefined}
              onChange={(event) => setNextDueDate(event.target.value)}
              value={nextDueDate}
            />
            {fieldErrors.nextDueDate ? (
              <span className="text-xs font-bold text-[#a63c2e]" id={`${formId}-next-error`}>
                {fieldErrors.nextDueDate}
              </span>
            ) : null}
          </div>

          <label className="grid gap-1.5 text-sm font-bold text-pet-ink">
            Note (optional)
            <textarea
              aria-describedby={fieldErrors.notes ? `${formId}-notes-error` : undefined}
              aria-invalid={Boolean(fieldErrors.notes)}
              className="brand-input min-h-20"
              maxLength={2000}
              onChange={(event) => setNotes(event.target.value)}
              value={notes}
            />
            {fieldErrors.notes ? (
              <span className="text-xs font-bold text-[#a63c2e]" id={`${formId}-notes-error`}>
                {fieldErrors.notes}
              </span>
            ) : null}
          </label>
        </fieldset>

        {phase === "refused" ? null : (
          <div className="grid gap-2 text-xs font-semibold leading-5 text-pet-muted" data-complete-care-full-form>
            <p>
              Saved as a private record.{" "}
              {phase === "editing" ? (
                <Link
                  className="font-bold text-pet-teal underline-offset-2 hover:underline"
                  href={fullFormHref}
                  onClick={handleFullForm}
                >
                  Add documents or a clinic
                </Link>
              ) : (
                <span aria-disabled="true" className="font-bold text-pet-muted">
                  Add documents or a clinic
                </span>
              )}{" "}
              with the full form instead.
              {phase === "editing" ? null : " That's available once this save is settled."}
            </p>
            {confirmLeave && phase === "editing" ? (
              <div
                className="grid gap-2 rounded-[1rem] border border-pet-border bg-pet-cream p-3 text-sm text-pet-ink"
                role="alert"
              >
                <p>Your note and dates here won&apos;t carry over to the full form. Nothing has been saved yet.</p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    className="inline-flex min-h-11 items-center rounded-full border border-pet-teal/35 bg-white px-4 font-bold text-pet-teal"
                    href={fullFormHref}
                  >
                    Go to the full form
                  </Link>
                  <button
                    className="inline-flex min-h-11 items-center rounded-full border border-pet-border bg-white px-4 font-bold text-pet-ink"
                    onClick={() => setConfirmLeave(false)}
                    type="button"
                  >
                    Stay here
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </form>
    </FormDialog>
  );
}
