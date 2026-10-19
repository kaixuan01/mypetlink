"use client";

import { useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminStatusBadge } from "@/components/admin/AdminStatus";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import * as api from "@/services/adminConsignmentService";
import { dateTime, fieldClass, primaryButton } from "./shared";
import { textAreaClass } from "./consignment/ui";

/**
 * Consignment Settings: who may review approvals and receipts. Team requires
 * an independent administrator; Solo lets one named founder self-review with
 * explicit confirmation, a reason and external evidence on every operation.
 */
export function ConsignmentApprovalPolicy({
  policy,
  canManage,
  onChange,
}: {
  policy: api.ApprovalPolicy;
  canManage: boolean;
  onChange: (p: api.ApprovalPolicy) => void;
}) {
  const [mode, setMode] = useState<"Team" | "Solo">("Team");
  const [founder, setFounder] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      onChange(
        await api.saveApprovalPolicy({
          concurrencyToken: policy.concurrencyToken,
          mode,
          selfReviewerAdminUserId: mode === "Solo" ? founder : null,
          confirmed: true,
          reason,
        })
      );
      setConfirm(false);
      setReason("");
      setNotice("Approval policy saved.");
    } catch (e) {
      setConfirm(false);
      setError(e instanceof Error ? e.message : "We couldn't save the approval policy. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  }

  const solo = policy.mode === "Solo";
  const founders = policy.eligibleReviewers.filter((a) => a.hasSelfReviewCapability);

  return (
    <div aria-label="Consignment approval policy" className="grid gap-4" role="region">
      <AdminSection
        description="Decides who may review consignment agreement approvals and partner receipts."
        title="Consignment approval policy"
      >
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-400">Current approval mode</p>
              <p className="mt-2 flex items-center gap-2 text-lg font-black text-slate-950">
                <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${solo ? "bg-[#c78a1c]" : "bg-[#1d9a68]"}`} />
                <strong>{policy.mode}</strong>
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {solo ? "One named founder may self-review." : "A different administrator reviews each operation."}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-400">Founder authorization</p>
              <p className="mt-2 text-sm font-bold text-slate-900">
                Authorized self-reviewer: {solo ? (policy.selfReviewerName ?? "Unavailable; self-review is blocked") : "None"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-400">Last change</p>
              <p className="mt-2 text-sm font-bold text-slate-900">{policy.updatedAt ? dateTime(policy.updatedAt) : "Initial Team policy"}</p>
            </div>
          </div>
          {solo && policy.selfReviewerIsEligible === false ? (
            <p className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]" role="alert">
              The named founder no longer has active self-review permission. Self-review is blocked until access is restored or
              Team Mode is selected.
            </p>
          ) : null}
          <p className="text-sm leading-6 text-slate-600">
            Team requires independent internal review. Solo permits only the named founder with self-review permission to review
            their own consignment work. Partner acceptance, real counts, supporting evidence and stock holds still apply.
          </p>
          {notice ? (
            <p className="text-sm font-bold text-[#166b48]" role="status">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </AdminSection>

      {canManage ? (
        <AdminSection compact description="Every change is recorded with your reason." title="Change approval mode">
          <form
            className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5"
            onSubmit={(e) => {
              e.preventDefault();
              setConfirm(true);
            }}
          >
            <label className="grid gap-1.5 text-sm font-black text-slate-800">
              New approval mode
              <select className={fieldClass} onChange={(e) => setMode(e.target.value as "Team" | "Solo")} value={mode}>
                <option value="Team">Team</option>
                <option value="Solo">Solo</option>
              </select>
            </label>
            {mode === "Solo" ? (
              <label className="grid gap-1.5 text-sm font-black text-slate-800">
                Authorize founder for self-review
                <select className={fieldClass} onChange={(e) => setFounder(e.target.value)} required value={founder}>
                  <option value="">Choose one founder</option>
                  {founders.map((a) => (
                    <option key={a.adminUserId} value={a.adminUserId}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="hidden sm:block" />
            )}
            <div className="grid gap-1.5 sm:col-span-2">
              <label className="text-sm font-black text-slate-800" htmlFor="consignment-policy-reason">
                Approval policy change reason
              </label>
              <textarea
                aria-describedby="consignment-policy-reason-hint"
                className={textAreaClass}
                id="consignment-policy-reason"
                maxLength={1000}
                minLength={10}
                onChange={(e) => setReason(e.target.value)}
                required
                value={reason}
              />
              <span className="text-xs font-semibold text-slate-500" id="consignment-policy-reason-hint">
                At least 10 characters.
              </span>
            </div>
            <div className="sm:col-span-2">
              <button className={primaryButton} disabled={busy || reason.trim().length < 10 || (mode === "Solo" && !founder)} type="submit">
                Review policy change
              </button>
            </div>
          </form>
        </AdminSection>
      ) : null}

      <AdminSection compact title="Approval policy change history">
        {policy.history.length === 0 ? (
          <p className="p-4 text-sm text-slate-500 sm:p-5">No changes recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {policy.history.map((e) => (
              <li className="grid gap-1 px-4 py-3 text-sm sm:px-5" key={e.id}>
                <span className="flex flex-wrap items-center gap-2">
                  <AdminStatusBadge tone={e.policyMode === "Solo" ? "warning" : "positive"}>{e.policyMode}</AdminStatusBadge>
                  <span className="text-xs text-slate-500">{dateTime(e.recordedAt)}</span>
                </span>
                <span className="text-xs text-slate-600">
                  {e.actorAdminUserId} · {e.previousPolicyMode} → {e.policyMode} · Founder{" "}
                  {e.selfReviewerAdminUserId ?? "None"} · {e.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">
          The latest 20 changes are shown. Download the review log from Reconciliation for a complete date range.
        </p>
      </AdminSection>

      <ConfirmDialog
        confirmDisabled={busy}
        confirmLabel="Confirm policy change"
        destructive={mode === "Solo"}
        message={
          mode === "Solo"
            ? "This removes independent internal review for the named founder only. Each self-review requires explicit confirmation, a reason and genuine external evidence. It does not prove partner acceptance or authorize stock release, payments or financial postings."
            : "New operations will require independent internal review immediately. Historical Solo self-reviews keep their original evidence and labels."
        }
        onCancel={() => setConfirm(false)}
        onConfirm={() => void save()}
        open={confirm}
        title={mode === "Solo" ? "Enable Solo Operator Mode?" : "Restore Team Approval Mode?"}
      />
    </div>
  );
}
