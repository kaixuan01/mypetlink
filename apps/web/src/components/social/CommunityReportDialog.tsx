"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { HouseholdBlockDialog } from "@/components/social/HouseholdBlockDialog";
import { getCurrentLocalDestination, ownerLoginPath } from "@/lib/authRedirect";
import { ownerRoutes } from "@/lib/routes";
import type { OwnerRelationship } from "@/services/socialGraphService";
import {
  CommunityReportError, reportReasons, submitCommunityReport,
  type CommunityReportReason, type CommunityReportTargetType,
} from "@/services/communityReportService";

type ReportTarget = {
  type: CommunityReportTargetType;
  target: string;
  household?: { handle: string; displayName: string } | null;
};

export function CommunityReportDialog({
  open, report, onClose, canBlock = true, onBlocked,
}: {
  open: boolean;
  report: ReportTarget;
  onClose: () => void;
  canBlock?: boolean;
  onBlocked?: (relationship: OwnerRelationship) => void;
}) {
  // Mount a fresh instance for each selected target. A failed request retains
  // every field; a different target never inherits a previous household's text.
  if (!open) return null;
  return <ReportForm key={`${report.type}:${report.target}`} report={report} onClose={onClose} canBlock={canBlock} onBlocked={onBlocked} />;
}

function ReportForm({ report, onClose, canBlock, onBlocked }: {
  report: ReportTarget;
  onClose: () => void;
  canBlock: boolean;
  onBlocked?: (relationship: OwnerRelationship) => void;
}) {
  const formId = useId();
  const errorId = useId();
  const reasonRef = useRef<HTMLInputElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const submittingRef = useRef(false);
  const [reason, setReason] = useState<CommunityReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"form" | "success" | "unavailable" | "own" | "profile" | "restricted" | "session">("form");
  const [pending, setPending] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => { if (state !== "form") resultRef.current?.focus(); }, [state]);
  const name = report.type === "comment" ? "comment" : report.type === "moment" ? "Moment" : "household";
  const title = `Report ${name}`;

  function close() { if (!pending && !blockOpen) onClose(); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!reason) { setError("Choose a reason for your report."); reasonRef.current?.focus(); return; }
    if (reason === "Other" && !details.trim()) { setError("Add details for Something else."); return; }
    if (details.length > 500) { setError("Keep details to 500 characters or fewer."); return; }
    submittingRef.current = true;
    setPending(true);
    setError(null);
    try {
      await submitCommunityReport({ targetType: report.type, target: report.target, reason, details });
      setState("success");
    } catch (caught) {
      if (caught instanceof CommunityReportError) {
        if (["unavailable", "own", "profile", "restricted", "session"].includes(caught.reason)) {
          setState(caught.reason as typeof state);
        } else setError(caught.message);
      } else setError("Couldn’t send report. Please try again.");
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  const terminal = state !== "form";
  const blockAvailable = state === "success" && canBlock && !blocked && Boolean(report.household?.handle);
  const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal";

  return (
    <>
      <FormDialog
        open
        title={terminal ? state === "success" ? "Report received" : title : title}
        description={state === "form" ? "Tell us what’s wrong. Our team will review the report." : undefined}
        onRequestClose={close}
        dismissible={!pending}
        maxWidthClassName="sm:max-w-lg"
        initialFocusRef={reasonRef}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            {state === "form" ? (
              <>
                <button className={`${buttonClass} border border-pet-border text-pet-ink`} disabled={pending} onClick={close} type="button">Cancel</button>
                <button className={`${buttonClass} bg-pet-teal text-white disabled:opacity-60`} disabled={pending} form={formId} type="submit">{pending ? "Sending…" : "Submit report"}</button>
              </>
            ) : (
              <>
                {blockAvailable ? <button className={`${buttonClass} border border-pet-border text-pet-ink`} onClick={() => setBlockOpen(true)} type="button">Block {report.household?.displayName}</button> : null}
                <button className={`${buttonClass} bg-pet-teal text-white`} onClick={close} type="button">Done</button>
              </>
            )}
          </div>
        }
      >
        {state === "form" ? (
          <form id={formId} onSubmit={(event) => void submit(event)}>
            {report.household ? <p className="mb-4 text-sm font-semibold text-pet-muted">{report.type === "comment" ? "Comment by" : report.type === "moment" ? "Moment by" : "Community Profile of"} {report.household.displayName} (@{report.household.handle})</p> : null}
            <fieldset aria-describedby={error && !reason ? errorId : undefined} className="space-y-1">
              <legend className="mb-2 text-sm font-black text-pet-ink">Reason</legend>
              {reportReasons.map((item, index) => (
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 text-sm font-semibold text-pet-ink hover:bg-pet-cream focus-within:outline-2 focus-within:outline-pet-teal" key={item.value}>
                  <input checked={reason === item.value} className="h-5 w-5 accent-pet-teal" name={`${formId}-reason`} onChange={() => { setReason(item.value); setError(null); }} ref={index === 0 ? reasonRef : undefined} type="radio" value={item.value} />
                  {item.label}
                </label>
              ))}
            </fieldset>
            <label className="mt-5 block text-sm font-black text-pet-ink" htmlFor={`${formId}-details`}>Add details (optional)</label>
            {reason === "Other" ? <p className="mt-1 text-xs font-semibold text-pet-muted">Details are required for Something else.</p> : null}
            <textarea aria-describedby={`${formId}-count${error ? ` ${errorId}` : ""}`} aria-invalid={Boolean(error && (reason === "Other" && !details.trim() || details.length > 500))} className="mt-2 min-h-24 w-full rounded-xl border border-pet-border p-3 text-sm text-pet-ink focus-visible:outline-2 focus-visible:outline-pet-teal" id={`${formId}-details`} maxLength={500} onChange={(event) => { setDetails(event.target.value); setError(null); }} rows={3} value={details} />
            <p className="text-right text-xs font-semibold text-pet-muted" id={`${formId}-count`}>{details.length >= 400 ? `${details.length} / 500` : "Up to 500 characters"}</p>
            {error ? <p className="mt-2 text-sm font-bold text-pet-coral" id={errorId} role="alert">{error}</p> : null}
            {pending ? <p className="sr-only" role="status">Sending report…</p> : null}
          </form>
        ) : (
          <div aria-live="polite" className="space-y-3 text-sm font-semibold leading-6 text-pet-ink outline-none" ref={resultRef} role="status" tabIndex={-1}>
            {state === "success" ? <><p>Thanks. Our team will review this.</p><p>Reports are private.</p>{blocked ? <p>Household blocked.</p> : null}</> : null}
            {state === "unavailable" ? <p>This content is no longer available.</p> : null}
            {state === "own" ? <p>You can’t report your own content.</p> : null}
            {state === "profile" ? <><p>Set up your Community profile to send a report.</p><Link className="inline-flex min-h-11 items-center text-pet-teal underline" href={ownerRoutes.socialProfile}>Set up Community profile</Link></> : null}
            {state === "restricted" ? <p>Reporting isn’t available for this account right now.</p> : null}
            {state === "session" ? <><p>Sign in to send a report.</p><Link className="inline-flex min-h-11 items-center text-pet-teal underline" href={ownerLoginPath(getCurrentLocalDestination(ownerRoutes.socialProfile))}>Sign in</Link></> : null}
          </div>
        )}
      </FormDialog>
      {report.household ? <HouseholdBlockDialog
        displayName={report.household.displayName}
        handle={report.household.handle}
        onAuthenticationRequired={() => window.location.assign(ownerLoginPath(getCurrentLocalDestination(ownerRoutes.socialProfile)))}
        onBlocked={(relationship) => { setBlocked(true); onBlocked?.(relationship); }}
        onClose={() => setBlockOpen(false)}
        open={blockOpen}
      /> : null}
    </>
  );
}
