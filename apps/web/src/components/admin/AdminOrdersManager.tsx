"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminActionButton,
  AdminDetailItem,
  AdminFilterTabs,
  AdminSection,
  AdminTable,
} from "@/components/admin/AdminPanels";
import { OrderDocumentButtons } from "@/components/admin/OrderDocumentButtons";
import { orderStatusTone } from "@/components/admin/adminDisplay";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  formatFullDeliveryAddress,
  formatOrderNumber,
  getAdminOrderActions,
  getOrderStatusDisplay,
  getPaymentStatusLabel,
  type AdminOrderAction,
} from "@/lib/orders";
import { getAdminData, type AdminData } from "@/services/adminService";
import {
  adminCancelOrder,
  adminConfirmOrderPayment,
  adminMarkOrderDelivered,
  adminMarkOrderPreparing,
  adminMarkOrderShipped,
  adminRejectOrderPayment,
} from "@/services/tagService";
import type { OrderStatus, TagOrder } from "@/types";

type OrderFilter = OrderStatus | "all";

const filterDefs: { id: OrderFilter; label: string }[] = [
  { id: "Pending Payment", label: "Pending Payment" },
  { id: "Payment Submitted", label: "Payment Proof Submitted" },
  { id: "Payment Confirmed", label: "Payment Confirmed" },
  { id: "Preparing", label: "Preparing Tag" },
  { id: "Shipped", label: "Shipped" },
  { id: "Delivered", label: "Delivered" },
  { id: "Cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

const actionLabels: Record<AdminOrderAction, string> = {
  "confirm-payment": "Confirm Payment",
  "reject-payment": "Request Resubmission",
  "mark-preparing": "Mark Preparing",
  "mark-shipped": "Mark Shipped",
  "mark-delivered": "Mark Delivered",
  "cancel-order": "Cancel Order",
};

export function AdminOrdersManager({ initialData }: { initialData: AdminData }) {
  const searchParams = useSearchParams();
  const requestedOrder = searchParams.get("order") ?? "";
  const [data, setData] = useState(initialData);
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [openOverride, setOpenOverride] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pendingCancelId, setPendingCancelId] = useState("");
  const [pendingRejectId, setPendingRejectId] = useState("");

  const refresh = useCallback(async () => {
    setData(await getAdminData());
  }, []);

  useEffect(() => {
    let active = true;

    getAdminData()
      .then((next) => {
        if (active) {
          setData(next);
        }
      })
      .catch(() => {
        if (active) {
          setMessage("We could not load orders. Please refresh to try again.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // ?order= deep-links open a specific order (e.g. from the payment proof
  // queue); toggling in the UI overrides the deep link.
  const requestedOrderId = useMemo(() => {
    if (!requestedOrder) {
      return "";
    }

    const normalized = requestedOrder.trim().toLowerCase();
    return (
      data.orders.find(
        (order) =>
          order.id.toLowerCase() === normalized ||
          formatOrderNumber(order).toLowerCase() === normalized
      )?.id ?? ""
    );
  }, [requestedOrder, data.orders]);

  const openOrderId = openOverride ?? requestedOrderId;

  const petMap = useMemo(
    () => new Map(data.pets.map((pet) => [pet.id, pet])),
    [data.pets]
  );

  const counts = useMemo(() => {
    const map = new Map<OrderFilter, number>();
    map.set("all", data.orders.length);

    for (const order of data.orders) {
      map.set(order.status, (map.get(order.status) ?? 0) + 1);
    }

    return map;
  }, [data.orders]);

  const visibleOrders = useMemo(
    () =>
      filter === "all"
        ? data.orders
        : data.orders.filter((order) => order.status === filter),
    [data.orders, filter]
  );

  async function runAction(order: TagOrder, action: AdminOrderAction) {
    if (action === "cancel-order") {
      setPendingCancelId(order.id);
      return;
    }

    if (action === "reject-payment") {
      setPendingRejectId(order.id);
      return;
    }

    const handlers: Record<
      Exclude<AdminOrderAction, "cancel-order" | "reject-payment">,
      (id: string) => Promise<{ data: TagOrder | null }>
    > = {
      "confirm-payment": adminConfirmOrderPayment,
      "mark-preparing": adminMarkOrderPreparing,
      "mark-shipped": adminMarkOrderShipped,
      "mark-delivered": adminMarkOrderDelivered,
    };

    const result = await handlers[action](order.id);
    await refresh();
    setMessage(
      result.data
        ? `${formatOrderNumber(order)} updated to ${getOrderStatusDisplay(result.data.status)}.`
        : "This order could not be updated from its current status."
    );
  }

  async function confirmCancel() {
    const order = data.orders.find((item) => item.id === pendingCancelId);
    setPendingCancelId("");

    if (!order) {
      return;
    }

    const result = await adminCancelOrder(order.id);
    await refresh();
    setMessage(
      result.data
        ? `${formatOrderNumber(order)} has been cancelled.`
        : "This order could not be cancelled from its current status."
    );
  }

  async function confirmReject() {
    const order = data.orders.find((item) => item.id === pendingRejectId);
    setPendingRejectId("");

    if (!order) {
      return;
    }

    const result = await adminRejectOrderPayment(
      order.id,
      "We could not verify this payment proof. Please resubmit your receipt or screenshot."
    );
    await refresh();
    setMessage(
      result.data
        ? `${formatOrderNumber(order)} returned to Pending Payment for resubmission.`
        : "This payment proof could not be updated from its current status."
    );
  }

  return (
    <AdminSection
      title="Tag orders"
      description="Review orders, confirm manual payments, and move orders through preparation and delivery."
    >
      <AdminFilterTabs
        active={filter}
        filters={filterDefs.map((def) => ({
          ...def,
          count: counts.get(def.id) ?? 0,
        }))}
        onChange={setFilter}
      />
      {message ? (
        <p className="px-4 pt-3 text-sm font-bold text-[#1b4f9c]">{message}</p>
      ) : null}
      <div className="p-4">
        {visibleOrders.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
            No orders in this status.
          </p>
        ) : (
          <AdminTable
            headers={[
              "Order",
              "Owner",
              "Pet",
              "Tag type",
              "Amount",
              "Payment",
              "Status",
              "Created",
              "Delivery",
              "Actions",
            ]}
          >
            {visibleOrders.map((order) => {
              const pet = petMap.get(order.petId);
              const actions = getAdminOrderActions(order);
              const open = openOrderId === order.id;

              return (
                <OrderRow
                  actions={actions}
                  key={order.id}
                  onAction={(action) => void runAction(order, action)}
                  onToggle={() =>
                    setOpenOverride(openOrderId === order.id ? "" : order.id)
                  }
                  open={open}
                  order={order}
                  ownerName={pet?.owner.name ?? "Owner"}
                  petName={pet?.name ?? "Pet profile"}
                />
              );
            })}
          </AdminTable>
        )}
      </div>

      <ConfirmDialog
        confirmLabel="Cancel Order"
        destructive
        message="The order will be marked as Cancelled and its unprepared tag will be removed from the owner's tag list. This does not delete the order history."
        onCancel={() => setPendingCancelId("")}
        onConfirm={() => void confirmCancel()}
        open={Boolean(pendingCancelId)}
        title="Cancel this order?"
      />
      <ConfirmDialog
        confirmLabel="Request Resubmission"
        destructive
        message="The order will return to Pending Payment with a friendly note asking the owner to resubmit their receipt. The order is not cancelled."
        onCancel={() => setPendingRejectId("")}
        onConfirm={() => void confirmReject()}
        open={Boolean(pendingRejectId)}
        title="Request payment proof resubmission?"
      />
    </AdminSection>
  );
}

function OrderRow({
  order,
  ownerName,
  petName,
  actions,
  open,
  onToggle,
  onAction,
}: {
  order: TagOrder;
  ownerName: string;
  petName: string;
  actions: AdminOrderAction[];
  open: boolean;
  onToggle: () => void;
  onAction: (action: AdminOrderAction) => void;
}) {
  return (
    <>
      <tr className="align-top">
        <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-950">
          {formatOrderNumber(order)}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{ownerName}</td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{petName}</td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
          {order.tagType.includes("NFC") ? "QR + NFC" : "QR"}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
          {order.estimatedPrice}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
          {getPaymentStatusLabel(order)}
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          <Badge tone={orderStatusTone[order.status]}>
            {getOrderStatusDisplay(order.status)}
          </Badge>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
          {order.orderedDate}
        </td>
        <td className="max-w-52 px-4 py-3 text-slate-600">
          {order.trackingStatus || "Not started"}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            <AdminActionButton onClick={onToggle}>
              {open ? "Close" : "View"}
            </AdminActionButton>
            {actions.map((action) => (
              <AdminActionButton
                key={action}
                onClick={() => onAction(action)}
                tone={
                  action === "cancel-order" || action === "reject-payment"
                    ? "danger"
                    : "primary"
                }
              >
                {actionLabels[action]}
              </AdminActionButton>
            ))}
          </div>
        </td>
      </tr>
      {open ? (
        <tr>
          <td className="bg-slate-50/60 px-4 py-4" colSpan={10}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <AdminDetailItem label="Pet" value={petName} />
              <AdminDetailItem label="Design" value={order.shape} />
              <AdminDetailItem
                label="Payment method"
                value={order.paymentMethod ?? "QR Payment"}
              />
              <AdminDetailItem
                label="Payment reference"
                value={order.paymentReference ?? "Not submitted"}
              />
              <AdminDetailItem
                label="Payment proof"
                value={order.paymentProofName ?? "Not submitted"}
              />
              <AdminDetailItem
                label="Proof submitted"
                value={order.paymentSubmittedDate ?? "Not submitted"}
              />
              <AdminDetailItem
                label="Payment confirmed"
                value={order.paymentConfirmedDate ?? "Not confirmed"}
              />
              <AdminDetailItem
                label="Resubmission note"
                value={order.paymentRejectionReason ?? "None"}
              />
              <AdminDetailItem
                label="Recipient"
                value={order.delivery.recipientName}
              />
              <AdminDetailItem
                label="Delivery phone"
                value={order.delivery.phone}
              />
              <AdminDetailItem
                label="Delivery address"
                value={formatFullDeliveryAddress(order)}
              />
              <AdminDetailItem
                label="Delivery notes"
                value={order.delivery.notes || "None"}
              />
              <AdminDetailItem
                label="Shipped"
                value={order.shippedDate ?? "Not shipped"}
              />
              <AdminDetailItem
                label="Delivered"
                value={order.deliveredDate ?? "Not delivered"}
              />
              <AdminDetailItem
                label="Linked tag"
                value={order.tagId ? "Created with this order" : "None"}
              />
              <AdminDetailItem
                label="Latest update"
                value={order.trackingStatus || "Not started"}
              />
            </div>
            <OrderDocumentButtons order={order} />
            <ProofHistory order={order} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

const proofStatusLabels: Record<
  NonNullable<TagOrder["paymentProofs"]>[number]["status"],
  string
> = {
  PendingReview: "Awaiting review",
  Approved: "Approved",
  Rejected: "Rejected / resubmission requested",
  Superseded: "Replaced by a newer upload",
};

// Payment proof attempt history for the admin. Each resubmission is kept as its
// own row, so a rejected-then-resubmitted order shows the full trail with the
// rejection reason and reviewed timestamp rather than only the latest upload.
function ProofHistory({ order }: { order: TagOrder }) {
  const proofs = order.paymentProofs ?? [];

  if (proofs.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        Payment proof history ({proofs.length}{" "}
        {proofs.length === 1 ? "attempt" : "attempts"})
      </p>
      <ol className="mt-2 grid gap-2">
        {proofs.map((proof, index) => {
          const attemptNumber = proofs.length - index;

          return (
            <li
              className="rounded-xl border border-slate-200 bg-white p-3"
              key={proof.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-black text-slate-950">
                  Attempt {attemptNumber}
                </span>
                <Badge
                  tone={
                    proof.status === "Approved"
                      ? "mint"
                      : proof.status === "Rejected"
                        ? "danger"
                        : proof.status === "PendingReview"
                          ? "warm"
                          : "soft"
                  }
                >
                  {proofStatusLabels[proof.status]}
                </Badge>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <AdminDetailItem
                  label="Uploaded file"
                  value={proof.originalFileName || "Not provided"}
                />
                <AdminDetailItem
                  label="Reference"
                  value={proof.paymentReference ?? "Not provided"}
                />
                <AdminDetailItem
                  label="Submitted"
                  value={proof.submittedLabel ?? "Time not available"}
                />
                <AdminDetailItem
                  label="Reviewed"
                  value={proof.reviewedLabel ?? "Not reviewed"}
                />
              </div>
              {proof.status === "Rejected" && proof.rejectionReason ? (
                <p className="mt-2 rounded-lg bg-[#fff4f1] px-3 py-2 text-xs font-bold text-[#a63c2e]">
                  Reason: {proof.rejectionReason}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
