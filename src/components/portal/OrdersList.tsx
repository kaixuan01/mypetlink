"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import {
  buildPaymentReceiptText,
  canDownloadPaymentReceipt,
  canRequestReplacement,
  formatDeliverySummary,
  formatFullDeliveryAddress,
  formatOrderNumber,
  getOrderNextStep,
  getPaymentStatusLabel,
} from "@/lib/orders";
import { ownerRoutes } from "@/lib/routes";
import { getAllTags, getOrders } from "@/services/tagService";
import type { OrderStatus, Pet, PetTag, TagOrder } from "@/types";

type OrdersListProps = {
  pets: Pet[];
  initialOrders: TagOrder[];
  initialTags: PetTag[];
};

const orderTone: Record<OrderStatus, "warm" | "teal" | "mint" | "soft" | "danger"> = {
  Draft: "soft",
  "Pending Payment": "warm",
  "Payment Submitted": "teal",
  "Payment Confirmed": "mint",
  Preparing: "teal",
  Shipped: "teal",
  Delivered: "mint",
  Cancelled: "danger",
};

export function OrdersList({
  pets,
  initialOrders,
  initialTags,
}: OrdersListProps) {
  const [orders, setOrders] = useState(initialOrders);
  const [tags, setTags] = useState(initialTags);
  const [openOrderId, setOpenOrderId] = useState("");
  const [receiptMessage, setReceiptMessage] = useState("");
  const petMap = useMemo(
    () => new Map(pets.map((pet) => [pet.id, pet])),
    [pets]
  );
  const tagMap = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag])),
    [tags]
  );

  useEffect(() => {
    let active = true;

    Promise.all([getOrders(), getAllTags()]).then(([orderResponse, tagResponse]) => {
      if (active) {
        setOrders(orderResponse.data);
        setTags(tagResponse.data);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  function handleReceipt(order: TagOrder, petName: string) {
    downloadPaymentReceipt(order, petName);
    setReceiptMessage(`Payment receipt downloaded for ${formatOrderNumber(order)}.`);
    window.setTimeout(() => setReceiptMessage(""), 2500);
  }

  if (!orders.length) {
    const orderHref = pets[0]
      ? ownerRoutes.petTagOrder(pets[0].id)
      : ownerRoutes.petNew;

    return (
      <EmptyState
        icon="record"
        title="No tag orders yet"
        description="Orders for MyPetLink QR Tags and QR + NFC Smart Tags will appear here with payment status, delivery updates, and receipt actions."
        actionHref={orderHref}
        actionLabel="Order Physical Tag"
      />
    );
  }

  return (
    <div className="grid gap-4">
      {receiptMessage ? (
        <div className="rounded-[1.25rem] border border-pet-mint bg-[#e8f8f0] px-4 py-3 text-sm font-bold text-pet-sage">
          {receiptMessage}
        </div>
      ) : null}

      {orders.map((order) => {
        const pet = petMap.get(order.petId);
        const linkedTag = order.tagId ? tagMap.get(order.tagId) : undefined;
        const orderNumber = formatOrderNumber(order);
        const replacementHref =
          linkedTag && order.petId
            ? ownerRoutes.petTagOrder(order.petId, {
                type: order.tagType.includes("NFC") ? "nfc" : "qr",
                replacementFor: linkedTag.id,
              })
            : "";
        const receiptReady = canDownloadPaymentReceipt(order);
        const replacementReady = canRequestReplacement(order, linkedTag);

        return (
          <article
            className="brand-card rounded-[1.5rem] p-4 sm:p-5"
            key={order.id}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black text-pet-ink sm:text-xl">
                    {orderNumber}
                  </h2>
                  <Badge tone={orderTone[order.status]}>{order.status}</Badge>
                </div>
                <p className="mt-1 text-sm font-semibold text-pet-muted">
                  {pet?.name ?? "Pet profile"} - {order.tagType}
                </p>
              </div>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                <Icon name="record" className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <CompactItem label="Ordered" value={order.orderedDate} />
              <CompactItem label="Total" value={order.estimatedPrice} />
              <CompactItem
                label="Payment"
                value={getPaymentStatusLabel(order)}
              />
              <CompactItem
                label="Delivery"
                value={formatDeliverySummary(order) || "Delivery details added"}
              />
            </div>

            <div className="mt-3 rounded-[1.1rem] bg-pet-cream px-4 py-3">
              <p className="text-xs font-extrabold uppercase text-pet-muted">
                Next update
              </p>
              <p className="mt-1 text-sm font-semibold leading-5 text-pet-ink">
                {order.trackingStatus || getOrderNextStep(order)}
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
                onClick={() =>
                  setOpenOrderId((current) =>
                    current === order.id ? "" : order.id
                  )
                }
                type="button"
              >
                <Icon name="record" className="h-4 w-4" />
                {openOrderId === order.id ? "Close Details" : "View Order"}
              </button>
              {receiptReady ? (
                <button
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
                  onClick={() =>
                    handleReceipt(order, pet?.name ?? "Pet profile")
                  }
                  type="button"
                >
                  <Icon name="record" className="h-4 w-4" />
                  Download Receipt
                </button>
              ) : null}
              {replacementReady && replacementHref ? (
                <CTAButton href={replacementHref} icon="tag" variant="outline">
                  Request Replacement
                </CTAButton>
              ) : null}
            </div>

            <p className="mt-3 text-xs leading-5 text-pet-muted">
              {receiptReady
                ? "Receipt is available because manual payment has been confirmed."
                : "Receipt appears after manual payment is confirmed."}
            </p>

            {openOrderId === order.id ? (
              <OrderInlineDetail
                order={order}
                petName={pet?.name ?? "Pet profile"}
                tag={linkedTag}
              />
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function OrderInlineDetail({
  order,
  petName,
  tag,
}: {
  order: TagOrder;
  petName: string;
  tag?: PetTag;
}) {
  return (
    <div className="mt-4 grid gap-3 rounded-[1.25rem] border border-pet-border bg-white p-4 md:grid-cols-3">
      <CompactItem label="Pet" value={petName} />
      <CompactItem label="Design" value={order.shape} />
      <CompactItem
        label="Payment method"
        value={order.paymentMethod ?? "Manual QR Payment"}
      />
      <CompactItem
        label="Payment reference"
        value={order.paymentReference ?? "Not submitted yet"}
      />
      <CompactItem
        label="Payment date"
        value={order.paymentConfirmedDate ?? "Not confirmed yet"}
      />
      <CompactItem
        label="Submitted file"
        value={order.paymentProofName ?? "Not submitted yet"}
      />
      <CompactItem
        label="Recipient"
        value={order.delivery.recipientName}
      />
      <CompactItem
        label="Delivery address"
        value={formatFullDeliveryAddress(order)}
      />
      <CompactItem
        label="Tag status"
        value={tag?.status ?? "Pending tag preparation"}
      />
    </div>
  );
}

function CompactItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[1rem] bg-pet-cream px-3 py-3">
      <p className="text-[0.68rem] font-extrabold uppercase text-pet-muted">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-pet-ink">
        {value || "Not set"}
      </p>
    </div>
  );
}

function downloadPaymentReceipt(order: TagOrder, petName: string) {
  const orderNumber = formatOrderNumber(order);
  const blob = new Blob([buildPaymentReceiptText(order, petName)], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${orderNumber}-payment-receipt.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
