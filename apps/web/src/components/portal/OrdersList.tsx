"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import {
  canDownloadPaymentReceipt,
  canRequestReplacement,
  formatDeliverySummary,
  formatFullDeliveryAddress,
  formatOrderNumber,
  getOrderNextStep,
  getOrderStatusDisplay,
  getPaymentStatusLabel,
} from "@/lib/orders";
import { ownerRoutes } from "@/lib/routes";
import { isApiConfigured } from "@/services/apiConfig";
import {
  downloadOwnerOrderReceiptPdf,
  downloadOwnerOrderSummaryPdf,
} from "@/services/orderDocuments";
import { getPets } from "@/services/petService";
import {
  getAllTags,
  getFriendlyTagErrorMessage,
  getOrders,
} from "@/services/tagService";
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
  const apiMode = isApiConfigured();
  const [portalPets, setPortalPets] = useState<Pet[]>(apiMode ? [] : pets);
  const [orders, setOrders] = useState<TagOrder[]>(
    apiMode ? [] : initialOrders
  );
  const [tags, setTags] = useState<PetTag[]>(apiMode ? [] : initialTags);
  const [openOrderId, setOpenOrderId] = useState("");
  const [receiptMessage, setReceiptMessage] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloadingId, setDownloadingId] = useState("");
  const [loading, setLoading] = useState(apiMode);
  const [loadError, setLoadError] = useState("");
  const petMap = useMemo(
    () => new Map(portalPets.map((pet) => [pet.id, pet])),
    [portalPets]
  );
  const tagMap = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag])),
    [tags]
  );

  useEffect(() => {
    let active = true;

    async function loadOrders() {
      setLoading(true);
      setLoadError("");

      try {
        const [orderResponse, tagResponse, petsResponse] = await Promise.all([
          getOrders(),
          getAllTags(),
          getPets(),
        ]);

        if (active) {
          setOrders(orderResponse.data);
          setTags(tagResponse.data);
          setPortalPets(petsResponse.data);
        }
      } catch (caught) {
        if (active) {
          setLoadError(getFriendlyTagErrorMessage(caught));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadOrders();

    return () => {
      active = false;
    };
  }, []);

  async function handleDownloadDocument(order: TagOrder) {
    if (downloadingId) {
      return;
    }

    const orderKey = order.orderNumber || order.id;
    const orderNumber = formatOrderNumber(order);
    const isReceipt = canDownloadPaymentReceipt(order);

    setDownloadingId(order.id);
    setReceiptMessage("");
    setDownloadError("");

    try {
      if (isReceipt) {
        await downloadOwnerOrderReceiptPdf(orderKey, orderNumber);
        setReceiptMessage(`Receipt PDF downloaded for ${orderNumber}.`);
      } else {
        await downloadOwnerOrderSummaryPdf(orderKey, orderNumber);
        setReceiptMessage(`Order Summary PDF downloaded for ${orderNumber}.`);
      }

      window.setTimeout(() => setReceiptMessage(""), 2500);
    } catch (caught) {
      setDownloadError(getFriendlyTagErrorMessage(caught));
    } finally {
      setDownloadingId("");
    }
  }

  if (loading) {
    return (
      <div className="brand-card rounded-[1.75rem] p-6 text-sm font-semibold text-pet-muted">
        Loading orders...
      </div>
    );
  }

  if (loadError && !orders.length) {
    return (
      <EmptyState
        icon="record"
        title="Orders could not load"
        description={loadError}
        actionHref={ownerRoutes.dashboard}
        actionLabel="Back to Dashboard"
      />
    );
  }

  if (!orders.length) {
    const orderHref = portalPets[0]
      ? ownerRoutes.petTagOrder(portalPets[0].id)
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
      {loadError ? (
        <div className="rounded-[1.25rem] border border-[#ffd2c9] bg-[#fff4f1] px-4 py-3 text-sm font-bold text-[#a63c2e]">
          {loadError}
        </div>
      ) : null}

      {receiptMessage ? (
        <div className="rounded-[1.25rem] border border-pet-mint bg-[#e8f8f0] px-4 py-3 text-sm font-bold text-pet-sage">
          {receiptMessage}
        </div>
      ) : null}

      {downloadError ? (
        <div className="rounded-[1.25rem] border border-[#ffd2c9] bg-[#fff4f1] px-4 py-3 text-sm font-bold text-[#a63c2e]">
          {downloadError}
        </div>
      ) : null}

      {orders.map((order) => {
        const pet = petMap.get(order.petId);
        const linkedTag = order.tagId ? tagMap.get(order.tagId) : undefined;
        const petName = pet?.name ?? order.petName ?? "Pet profile";
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
                  <Badge tone={orderTone[order.status]}>
                    {getOrderStatusDisplay(order.status)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm font-semibold text-pet-muted">
                  {petName} - {order.tagType}
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
              {order.status === "Pending Payment" ? (
                <CTAButton
                  href={ownerRoutes.orderDetail(orderNumber)}
                  icon="record"
                  variant="coral"
                >
                  Pay by QR
                </CTAButton>
              ) : null}
              {order.status === "Payment Submitted" ? (
                <CTAButton
                  href={ownerRoutes.orderDetail(orderNumber)}
                  icon="record"
                  variant="secondary"
                >
                  View Payment Status
                </CTAButton>
              ) : null}
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
              <button
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream disabled:cursor-wait disabled:opacity-70"
                disabled={downloadingId === order.id}
                onClick={() => void handleDownloadDocument(order)}
                type="button"
              >
                <Icon name="record" className="h-4 w-4" />
                {downloadingId === order.id
                  ? "Preparing..."
                  : receiptReady
                    ? "Download Receipt PDF"
                    : "Download Order Summary PDF"}
              </button>
              {replacementReady && replacementHref ? (
                <CTAButton href={replacementHref} icon="tag" variant="outline">
                  Request Replacement
                </CTAButton>
              ) : null}
            </div>

            <p className="mt-3 text-xs leading-5 text-pet-muted">
              {order.status === "Pending Payment"
                ? "Complete QR payment to continue this order."
                : order.status === "Payment Submitted"
                  ? "Payment proof under review."
                  : receiptReady
                    ? "Payment confirmed. Your receipt is ready."
                    : "Receipt is available after payment is confirmed."}
            </p>

            {openOrderId === order.id ? (
              <OrderInlineDetail
                order={order}
                petName={petName}
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
        value={order.paymentMethod ?? "QR Payment"}
      />
      <CompactItem
        label="Bank/eWallet transaction ID"
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
        wrap
      />
      <CompactItem
        label="Tag status"
        value={tag?.status ?? "Pending tag preparation"}
      />
    </div>
  );
}

function CompactItem({
  label,
  value,
  wrap,
}: {
  label: string;
  value: string;
  wrap?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-[1rem] bg-pet-cream px-3 py-3">
      <p className="text-[0.68rem] font-extrabold uppercase text-pet-muted">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-bold text-pet-ink ${
          wrap ? "break-words" : "truncate"
        }`}
      >
        {value || "Not set"}
      </p>
    </div>
  );
}

