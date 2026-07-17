"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AdminActionButton, AdminDetailItem } from "@/components/admin/AdminPanels";
import { formatAdminDateTime } from "@/components/admin/adminDisplay";
import { Badge } from "@/components/ui/Badge";
import { adminRoutes } from "@/lib/routes";
import { useModalDialogFocus } from "@/lib/useModalDialogFocus";
import { getAdminPaymentProofAccess, openAdminPaymentProof } from "@/services/adminOrderService";
import { getAdminPaymentProofHistory, type AdminPaymentProofHistoryEntry } from "@/services/adminPaymentProofHistoryService";
import {
  fulfilmentStatusLabels,
  getAdminPaymentProofDetail,
  paymentProofStatusLabels,
  paymentStatusLabels,
  type AdminPaymentProof,
} from "@/services/adminPaymentProofService";
import type { BackendMediaDownloadUrlResponse } from "@/services/apiDtos";
import { getFriendlyTagErrorMessage } from "@/services/tagService";

const historyLabels: Record<string, string> = {
  "payment-proof.approve": "Payment proof approved",
  "payment-proof.reject": "Payment proof rejected",
  "order.confirm-payment": "Order payment confirmed",
  "order.reject-payment-proof": "Order returned for resubmission",
};

export function AdminPaymentProofDetailDrawer({
  summary,
  refreshKey,
  busy,
  onClose,
  onReview,
}: {
  summary: AdminPaymentProof;
  refreshKey: number;
  busy: boolean;
  onClose: () => void;
  onReview: (decision: "approve" | "reject", proof: AdminPaymentProof) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const key = `${summary.id}:${refreshKey}`;
  const [detailState, setDetailState] = useState<{ key: string; detail: AdminPaymentProof | null; error: string } | null>(null);
  const [historyState, setHistoryState] = useState<{ key: string; entries: AdminPaymentProofHistoryEntry[] | null } | null>(null);
  const [mediaState, setMediaState] = useState<{ key: string; access: BackendMediaDownloadUrlResponse | null; error: string } | null>(null);
  const [proofMessage, setProofMessage] = useState("");

  useModalDialogFocus({ dialogRef, initialFocusRef: closeRef, onEscape: onClose });

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getAdminPaymentProofDetail(summary.id, controller.signal),
      getAdminPaymentProofHistory(summary.id, summary.orderId, controller.signal),
    ])
      .then(([detail, history]) => {
        if (!controller.signal.aborted) {
          setDetailState({ key, detail, error: "" });
          setHistoryState({ key, entries: history });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDetailState({ key, detail: null, error: "We couldn't load this payment proof. Please try again." });
          setHistoryState({ key, entries: null });
        }
      });
    return () => controller.abort();
  }, [key, summary.id, summary.orderId]);

  useEffect(() => {
    if (!summary.hasMedia || !summary.contentType.startsWith("image/")) {
      return;
    }
    const controller = new AbortController();
    getAdminPaymentProofAccess(summary.id)
      .then((access) => {
        if (!controller.signal.aborted) setMediaState({ key, access, error: "" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setMediaState({ key, access: null, error: "The secure preview could not be loaded." });
      });
    return () => controller.abort();
  }, [key, summary.contentType, summary.hasMedia, summary.id]);

  const detail = detailState?.key === key ? detailState.detail : null;
  const error = detailState?.key === key ? detailState.error : "";
  const history = historyState?.key === key ? historyState.entries : undefined;
  const media = mediaState?.key === key ? mediaState : null;
  const reviewable = detail?.status === "PendingReview" && !detail.orderStateConflict;

  async function openProof() {
    setProofMessage("");
    try {
      await openAdminPaymentProof(summary.id);
    } catch (caught) {
      setProofMessage(getFriendlyTagErrorMessage(caught));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-pet-ink/35 backdrop-blur-sm">
      <button aria-label="Close payment proof details" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <aside
        aria-label={`Payment proof for ${summary.orderNumber}`}
        aria-modal="true"
        className="relative flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-white shadow-2xl"
        ref={dialogRef}
        role="dialog"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase text-slate-400">Payment proof</p>
            <h2 className="truncate text-xl font-black text-slate-950">{summary.orderNumber}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={summary.status === "Approved" ? "mint" : summary.status === "Rejected" ? "danger" : "warm"}>{paymentProofStatusLabels[summary.status]}</Badge>
              {summary.requiresAttention ? <Badge tone="danger">Requires manual verification</Badge> : null}
            </div>
          </div>
          <button aria-label="Close" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50" onClick={onClose} ref={closeRef} type="button">×</button>
        </header>

        <div className="grid gap-5 p-4 sm:p-5">
          {!detail && !error ? <p className="text-sm font-semibold text-slate-500">Loading payment proof details…</p> : null}
          {error ? <p className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700" role="alert">{error}</p> : null}

          {detail ? (
            <>
              {reviewable ? (
                <section aria-labelledby="proof-review-actions">
                  <h3 className="text-sm font-black text-slate-900" id="proof-review-actions">Review decision</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <AdminActionButton disabled={busy} onClick={() => onReview("approve", detail)} tone="primary">Approve payment</AdminActionButton>
                    <AdminActionButton disabled={busy} onClick={() => onReview("reject", detail)} tone="danger">Reject proof</AdminActionButton>
                  </div>
                </section>
              ) : detail.status === "PendingReview" ? (
                <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">The linked order is not in a reviewable payment state. Open the order before taking action.</p>
              ) : null}

              <section>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900">Secure proof</h3>
                  {detail.hasMedia ? <AdminActionButton onClick={() => void openProof()}>Open proof</AdminActionButton> : null}
                </div>
                <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  {detail.hasMedia && detail.contentType.startsWith("image/") && media?.access ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={`Payment proof submitted for order ${detail.orderNumber}`} className="max-h-[52vh] w-full bg-slate-100 object-contain" src={media.access.downloadUrl} />
                  ) : detail.hasMedia ? (
                    <div className="grid min-h-40 place-items-center p-6 text-center">
                      <div>
                        <p className="font-bold text-slate-800">{detail.originalFileName}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{detail.contentType === "application/pdf" ? "PDF document" : "Open the secure file to inspect this proof."}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid min-h-40 place-items-center p-6 text-center text-sm font-bold text-amber-800">Proof media is missing or unavailable.</div>
                  )}
                </div>
                {media?.error ? <p className="mt-2 text-sm font-bold text-red-700" role="alert">{media.error}</p> : null}
                {proofMessage ? <p className="mt-2 text-sm font-bold text-red-700" role="alert">{proofMessage}</p> : null}
              </section>

              <section>
                <h3 className="text-sm font-black text-slate-900">Proof details</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <AdminDetailItem label="Filename" value={detail.originalFileName} />
                  <AdminDetailItem label="File type" value={detail.contentType} />
                  <AdminDetailItem label="Submitted" value={formatAdminDateTime(detail.submittedAt)} />
                  <AdminDetailItem label="Payment method" value={detail.paymentMethod} />
                  <AdminDetailItem label="Payment reference" value={detail.paymentReference ?? ""} />
                  <AdminDetailItem label="Owner note" value={detail.ownerNote ?? ""} />
                </div>
              </section>

              <section>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900">Linked order</h3>
                  <Link className="inline-flex min-h-10 items-center rounded-full border border-slate-200 px-3.5 text-xs font-extrabold text-slate-700 hover:bg-slate-50" href={adminRoutes.order(detail.orderId)}>View order</Link>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <AdminDetailItem label="Order number" value={detail.orderNumber} />
                  <AdminDetailItem label="Customer" value={detail.ownerName} />
                  <AdminDetailItem label="Customer email" value={detail.ownerEmail} />
                  <AdminDetailItem label="Pet" value={detail.petName ?? ""} />
                  <AdminDetailItem label="Order payment" value={paymentStatusLabels[detail.orderPaymentStatus]} />
                  <AdminDetailItem label="Fulfilment" value={fulfilmentStatusLabels[detail.fulfilmentStatus]} />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-black text-slate-900">Verification comparison</h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <AdminDetailItem label="Expected order total" value={`${detail.currency} ${detail.expectedAmount.toFixed(2)}`} />
                  <AdminDetailItem label="Submitted amount" value="Not captured separately" />
                </div>
                <ul className="mt-3 grid gap-2 text-sm font-semibold">
                  {detail.referenceUsedByOtherOrder ? <li className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">Reference already used by another order. Requires manual verification.</li> : null}
                  {detail.proofFileUsedByOtherOrder ? <li className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">The same proof file appears on another order. Requires manual verification.</li> : null}
                  {detail.pendingProofCount > 1 ? <li className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">Multiple proofs are marked pending for this order. Only the latest can be reviewed.</li> : null}
                  {!detail.hasMedia ? <li className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">Proof media is missing or unavailable.</li> : null}
                  {!detail.requiresAttention ? <li className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">No automated mismatch warning was detected. Admin review is still required.</li> : null}
                </ul>
              </section>

              <section>
                <h3 className="text-sm font-black text-slate-900">Review record</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <AdminDetailItem label="Review status" value={paymentProofStatusLabels[detail.status]} />
                  <AdminDetailItem label="Reviewer" value={detail.reviewerName ?? ""} />
                  <AdminDetailItem label="Reviewed" value={formatAdminDateTime(detail.reviewedAt)} />
                  <AdminDetailItem label="Rejection reason" value={detail.rejectionReason ?? ""} />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-black text-slate-900">Audit history</h3>
                {history === undefined ? <p className="mt-2 text-sm font-semibold text-slate-500">Loading history…</p> : history === null ? <p className="mt-2 text-sm font-semibold text-slate-500">Audit history is not available right now.</p> : history.length === 0 ? <p className="mt-2 text-sm font-semibold text-slate-500">No review decisions recorded yet.</p> : (
                  <ol className="mt-2 grid gap-1.5">
                    {history.map((entry) => (
                      <li className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm" key={`${entry.action}:${entry.id}`}>
                        <span className="min-w-0"><span className="block font-bold text-slate-900">{historyLabels[entry.action] ?? entry.action}</span>{entry.reason ? <span className="mt-0.5 block break-words text-xs font-semibold text-slate-500">Reason: {entry.reason}</span> : null}</span>
                        <span className="shrink-0 text-right text-xs font-semibold text-slate-500">{entry.actorType ? <span className="block">{entry.actorType}</span> : null}<span className="block">{formatAdminDateTime(entry.createdAt)}</span></span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
