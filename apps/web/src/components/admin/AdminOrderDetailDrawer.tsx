"use client";

import { useModalDialogFocus } from "@/lib/useModalDialogFocus";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminActionButton, AdminDetailItem } from "@/components/admin/AdminPanels";
import { OrderDocumentButtons } from "@/components/admin/OrderDocumentButtons";
import { formatAdminDateTime, getTagTypeLabel } from "@/components/admin/adminDisplay";
import { Badge } from "@/components/ui/Badge";
import { formatFullDeliveryAddress, getOrderStatusDisplay, type AdminOrderAction } from "@/lib/orders";
import { adminRoutes } from "@/lib/routes";
import {
  fulfilmentStatusLabels,
  getAdminOrderAvailableActions,
  getAdminOrderDetail,
  latestProof,
  openAdminPaymentProof,
  paymentStatusLabels,
  type AdminOrder,
  type AdminOrderDetail,
} from "@/services/adminOrderService";
import { getAdminOrderHistory, type AdminOrderHistoryEntry } from "@/services/adminOrderHistoryService";
import { getFriendlyTagErrorMessage } from "@/services/tagService";

const actionLabels: Record<AdminOrderAction, string> = {
  "confirm-payment": "Confirm payment",
  "reject-payment": "Reject payment proof",
  "assign-tag": "Assign inventory tag",
  "change-tag": "Change assigned tag",
  "replace-tag": "Replace tag",
  "mark-preparing": "Start preparing",
  "mark-shipped": "Mark shipped",
  "mark-delivered": "Mark delivered",
  "cancel-order": "Cancel order",
};

const historyLabels: Record<string, string> = {
  "order.confirm-payment": "Payment confirmed",
  "order.reject-payment-proof": "Payment proof rejected",
  "order.assign-inventory-tag": "Inventory tag assigned",
  "order.change-assigned-tag": "Assigned tag changed",
  "order.replace-tag": "Replacement tag issued",
  "order.mark-preparing": "Preparation started",
  "order.mark-shipped": "Marked shipped",
  "order.mark-delivered": "Marked delivered",
  "order.cancel": "Order cancelled",
};

export function AdminOrderDetailDrawer({
  summary,
  refreshKey,
  busy,
  onClose,
  onAction,
}: {
  summary: AdminOrder;
  refreshKey: number;
  busy: boolean;
  onClose: () => void;
  onAction: (action: AdminOrderAction, detail: AdminOrderDetail) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [detailState, setDetailState] = useState<{
    key: string;
    detail: AdminOrderDetail | null;
    error: string;
  } | null>(null);
  const [historyState, setHistoryState] = useState<{
    key: string;
    entries: AdminOrderHistoryEntry[] | null;
  } | null>(null);
  const [proofMessage, setProofMessage] = useState("");
  const key = `${summary.id}:${refreshKey}`;

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getAdminOrderDetail(summary.id, controller.signal),
      getAdminOrderHistory(summary.id, controller.signal),
    ])
      .then(([detail, entries]) => {
        if (!controller.signal.aborted) {
          setDetailState({ key, detail, error: "" });
          setHistoryState({ key, entries });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDetailState({ key, detail: null, error: "We couldn't load this order. Please try again." });
          setHistoryState({ key, entries: null });
        }
      });
    return () => controller.abort();
  }, [key, summary.id]);

  useModalDialogFocus({ dialogRef, onEscape: onClose });

  const detail = detailState?.key === key ? detailState.detail : null;
  const error = detailState?.key === key ? detailState.error : "";
  const history = historyState?.key === key ? historyState.entries : undefined;
  const actions = useMemo(
    () => (detail ? getAdminOrderAvailableActions(summary) : []),
    [detail, summary]
  );
  const proof = detail ? latestProof(detail) : undefined;

  async function viewProof() {
    if (!proof) return;
    setProofMessage("");
    try {
      await openAdminPaymentProof(proof.id);
    } catch (caught) {
      setProofMessage(getFriendlyTagErrorMessage(caught));
    }
  }

  return (
    <div
      aria-label={`Order details for ${summary.orderNumber}`}
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-pet-ink/35 backdrop-blur-sm"
      role="dialog"
    >
      <button aria-label="Close order details" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <aside className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl" ref={dialogRef}>
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase text-slate-400">Tag order</p>
            <h2 className="truncate text-xl font-black text-slate-950">{summary.orderNumber}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={summary.paymentStatus === "Confirmed" ? "mint" : summary.paymentStatus === "Rejected" ? "danger" : "warm"}>
                Payment: {paymentStatusLabels[summary.paymentStatus]}
              </Badge>
              <Badge tone={summary.fulfilmentStatus === "Delivered" ? "mint" : summary.fulfilmentStatus === "Cancelled" ? "danger" : "teal"}>
                Fulfilment: {fulfilmentStatusLabels[summary.fulfilmentStatus]}
              </Badge>
            </div>
          </div>
          <button aria-label="Close" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50" onClick={onClose} type="button">×</button>
        </header>

        <div className="grid gap-5 p-5">
          {!detail && !error ? <p className="text-sm font-semibold text-slate-500">Loading order details…</p> : null}
          {error ? <p className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}

          {detail ? (
            <>
              {actions.length > 0 ? (
                <section>
                  <h3 className="text-sm font-black text-slate-900">Available actions</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {actions.map((action) => (
                      <AdminActionButton
                        disabled={busy}
                        key={action}
                        onClick={() => onAction(action, detail)}
                        tone={action === "cancel-order" || action === "reject-payment" || action === "replace-tag" ? "danger" : "primary"}
                      >
                        {actionLabels[action]}
                      </AdminActionButton>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <h3 className="text-sm font-black text-slate-900">Order summary</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <AdminDetailItem label="Order status" value={getOrderStatusDisplay(detail.order.status)} />
                  <AdminDetailItem label="Product" value={summary.productName ?? getTagTypeLabel(summary.hasNfc)} />
                  <AdminDetailItem label="SKU" value={summary.sku ?? "Legacy order"} />
                  <AdminDetailItem label="Variant" value={summary.variantName ?? `${summary.variant} Tag`} />
                  <AdminDetailItem label="Quantity" value={String(summary.quantity ?? 1)} />
                  <AdminDetailItem label="Original unit price" value={`${summary.currency} ${(summary.unitBasePrice ?? summary.amount).toFixed(2)}`} />
                  <AdminDetailItem label="Discount" value={`${summary.currency} ${(summary.discountAmount ?? 0).toFixed(2)}`} />
                  <AdminDetailItem label="Final amount" value={`${summary.currency} ${(summary.finalAmount ?? summary.amount).toFixed(2)}`} />
                  <AdminDetailItem label="Promotion" value={summary.promotionName ?? "None"} />
                  <AdminDetailItem label="Delivery fee" value={`${summary.currency} ${summary.deliveryFee.toFixed(2)}`} />
                  <AdminDetailItem label="Created" value={formatAdminDateTime(summary.createdAt)} />
                  <AdminDetailItem label="Updated" value={formatAdminDateTime(summary.updatedAt)} />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-black text-slate-900">Customer and pet</h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <AdminDetailItem label="Customer" value={detail.owner.name} />
                  <AdminDetailItem label="Email" value={detail.owner.email} />
                  <AdminDetailItem label="Phone / WhatsApp" value={detail.order.delivery.phone} />
                  <AdminDetailItem label="Pet" value={detail.order.petName ?? summary.petName} />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-black text-slate-900">Delivery</h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <AdminDetailItem label="Recipient" value={detail.order.delivery.recipientName} />
                  <AdminDetailItem label="Address" value={formatFullDeliveryAddress(detail.order)} />
                  <AdminDetailItem label="Delivery notes" value={detail.order.delivery.notes} />
                  <AdminDetailItem label="Tracking number" value={detail.order.trackingNumber ?? ""} />
                  <AdminDetailItem label="Shipped" value={formatAdminDateTime(summary.shippedAt)} />
                  <AdminDetailItem label="Delivered" value={formatAdminDateTime(summary.deliveredAt)} />
                </div>
              </section>

              <section>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900">Payment</h3>
                  {proof ? (
                    <AdminActionButton onClick={() => void viewProof()}>
                      Open payment proof
                    </AdminActionButton>
                  ) : null}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <AdminDetailItem label="Payment status" value={paymentStatusLabels[summary.paymentStatus]} />
                  <AdminDetailItem label="Method" value={summary.paymentMethod ?? ""} />
                  <AdminDetailItem label="Reference" value={summary.paymentReference ?? ""} />
                  <AdminDetailItem label="Proof submitted" value={formatAdminDateTime(summary.paymentProofSubmittedAt)} />
                  <AdminDetailItem label="Payment confirmed" value={formatAdminDateTime(summary.paymentConfirmedAt)} />
                  <AdminDetailItem label="Latest proof review" value={summary.latestPaymentProofStatus ? summary.latestPaymentProofStatus.replace(/([a-z])([A-Z])/g, "$1 $2") : ""} />
                </div>
                {proofMessage ? <p className="mt-2 text-sm font-bold text-red-700">{proofMessage}</p> : null}
                {detail.backendOrder?.paymentProofs?.length ? (
                  <ol className="mt-3 grid gap-2">
                    {detail.backendOrder.paymentProofs.map((item, index) => (
                      <li className="rounded-xl border border-slate-200 p-3 text-sm" key={item.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">Attempt {detail.backendOrder!.paymentProofs.length - index}</span>
                          <Badge tone={item.status === "Approved" ? "mint" : item.status === "Rejected" ? "danger" : "warm"}>{item.status.replace(/([a-z])([A-Z])/g, "$1 $2")}</Badge>
                        </div>
                        <p className="mt-1 font-semibold text-slate-500">Submitted {formatAdminDateTime(item.uploadedAt)}{item.reviewedAt ? ` · Reviewed ${formatAdminDateTime(item.reviewedAt)}` : ""}</p>
                        {item.rejectionReason ? <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-700">Reason: {item.rejectionReason}</p> : null}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </section>

              <section>
                <h3 className="text-sm font-black text-slate-900">Fulfilment</h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <AdminDetailItem label="Fulfilment status" value={fulfilmentStatusLabels[summary.fulfilmentStatus]} />
                  <AdminDetailItem label="Assigned tag" value={summary.assignedTagCode ?? ""} />
                </div>
                {summary.assignedTagId && summary.assignedTagCode ? (
                  <Link className="mt-2 inline-flex min-h-9 items-center rounded-full border border-slate-200 px-3.5 text-xs font-extrabold text-slate-700 hover:bg-slate-50" href={adminRoutes.smartTag(summary.assignedTagId)}>
                    View assigned Smart Tag
                  </Link>
                ) : null}
              </section>

              <OrderDocumentButtons order={detail.order} />

              <section>
                <h3 className="text-sm font-black text-slate-900">Status history</h3>
                {history === undefined ? <p className="mt-2 text-sm font-semibold text-slate-500">Loading history…</p> : history === null ? <p className="mt-2 text-sm font-semibold text-slate-500">Audit history is not available right now.</p> : history.length === 0 ? <p className="mt-2 text-sm font-semibold text-slate-500">No admin changes recorded yet.</p> : (
                  <ol className="mt-2 grid gap-1.5">
                    {history.map((entry) => (
                      <li className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm" key={entry.id}>
                        <span className="min-w-0">
                          <span className="block font-bold text-slate-900">{historyLabels[entry.action] ?? entry.action}</span>
                          {entry.detail ? <span className="mt-0.5 block break-words text-xs font-semibold text-slate-500">Reason: {entry.detail}</span> : null}
                        </span>
                        <span className="shrink-0 text-right text-xs font-semibold text-slate-500">
                          {entry.actorType ? <span className="block">{entry.actorType}</span> : null}
                          <span className="block">{formatAdminDateTime(entry.createdAt)}</span>
                        </span>
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
