"use client";

import { useEffect, useMemo, useState } from "react";
import { ManualPaymentPanel } from "@/components/portal/ManualPaymentPanel";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import {
  buildPaymentReceiptText,
  canDownloadPaymentReceipt,
  canRequestReplacement,
  formatFullDeliveryAddress,
  formatOrderNumber,
  getOrderNextStep,
  getOrderStatusDisplay,
  getOrderStatusRank,
  getPaymentStatusLabel,
} from "@/lib/orders";
import {
  loadingTitle,
  orderNotFoundTitle,
  setPageTitle,
} from "@/lib/pageTitles";
import { ownerRoutes } from "@/lib/routes";
import { isApiConfigured } from "@/services/apiConfig";
import { getPets } from "@/services/petService";
import {
  getAllTags,
  getFriendlyTagErrorMessage,
  getOrder,
} from "@/services/tagService";
import type { OrderStatus, Pet, PetTag, TagOrder } from "@/types";

type OrderDetailViewProps = {
  initialOrder: TagOrder | null;
  orderKey: string;
  pets: Pet[];
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

type TimelineStep = {
  label: string;
  date?: string;
  completed: boolean;
  current: boolean;
};

export function OrderDetailView({
  initialOrder,
  orderKey,
  pets,
  initialTags,
}: OrderDetailViewProps) {
  const apiMode = isApiConfigured();
  const [order, setOrder] = useState(initialOrder);
  const [portalPets, setPortalPets] = useState<Pet[]>(apiMode ? [] : pets);
  const [tags, setTags] = useState<PetTag[]>(apiMode ? [] : initialTags);
  const [loaded, setLoaded] = useState(Boolean(initialOrder));
  const [downloadMessage, setDownloadMessage] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
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

    async function loadOrder() {
      setLoadError("");

      try {
        const [orderResponse, tagResponse, petsResponse] = await Promise.all([
          getOrder(orderKey),
          getAllTags(),
          getPets(),
        ]);

        if (active) {
          setOrder(orderResponse.data);
          setTags(tagResponse.data);
          setPortalPets(petsResponse.data);
          setLoaded(true);
        }
      } catch (caught) {
        if (active) {
          setLoadError(getFriendlyTagErrorMessage(caught));
          setLoaded(true);
        }
      }
    }

    void loadOrder();

    return () => {
      active = false;
    };
  }, [orderKey]);

  useEffect(() => {
    if (!loaded) {
      setPageTitle(loadingTitle);
      return;
    }

    setPageTitle(order ? formatOrderNumber(order) : orderNotFoundTitle);
  }, [loaded, order]);

  if (!order) {
    if (!loaded) {
      return (
        <div className="brand-card rounded-[1.75rem] p-6 text-sm font-semibold text-pet-muted">
          Loading your order...
        </div>
      );
    }

    return (
      <EmptyState
        icon="record"
        title={loadError ? "Order could not load" : "Order not found"}
        description={
          loadError ||
          "We could not find this order in your owner workspace. It may have been removed or the link is incorrect."
        }
        actionHref={ownerRoutes.orders}
        actionLabel="Back to Orders"
      />
    );
  }

  const pet = petMap.get(order.petId);
  const linkedTag = order.tagId ? tagMap.get(order.tagId) : undefined;
  const orderNumber = formatOrderNumber(order);
  const petName = pet?.name ?? order.petName ?? "Pet profile";
  const receiptReady = canDownloadPaymentReceipt(order);
  const replacementReady = canRequestReplacement(order, linkedTag);
  const timelineSteps = buildTimeline(order);
  const replacementHref =
    linkedTag && order.petId
      ? ownerRoutes.petTagOrder(order.petId, {
          type: order.tagType.includes("NFC") ? "nfc" : "qr",
          replacementFor: linkedTag.id,
        })
      : "";

  function handleDownloadReceipt() {
    if (!order) {
      return;
    }

    downloadTextFile(
      `${orderNumber}-payment-receipt.txt`,
      buildPaymentReceiptText(order, petName)
    );
    setDownloadMessage("Payment receipt downloaded.");
    window.setTimeout(() => setDownloadMessage(""), 2500);
  }

  function handleDownloadSummary() {
    if (!order) {
      return;
    }

    downloadTextFile(
      `${orderNumber}-order-summary.txt`,
      buildOrderSummaryText(order, petName)
    );
    setDownloadMessage("Order summary downloaded.");
    window.setTimeout(() => setDownloadMessage(""), 2500);
  }

  return (
    <div className="grid gap-5">
      {loadError ? (
        <div className="rounded-[1.25rem] border border-[#ffd2c9] bg-[#fff4f1] px-4 py-3 text-sm font-bold text-[#a63c2e]">
          {loadError}
        </div>
      ) : null}

      {downloadMessage ? (
        <div className="rounded-[1.25rem] border border-pet-mint bg-[#e8f8f0] px-4 py-3 text-sm font-bold text-pet-sage">
          {downloadMessage}
        </div>
      ) : null}

      {paymentMessage ? (
        <div className="rounded-[1.25rem] border border-pet-mint bg-[#e8f8f0] px-4 py-3 text-sm font-bold text-pet-sage">
          {paymentMessage}
        </div>
      ) : null}

      <section className="brand-card rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={orderTone[order.status]}>
                {getOrderStatusDisplay(order.status)}
              </Badge>
              <Badge tone="soft">{order.paymentMethod ?? "QR Payment"}</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-black text-pet-ink sm:text-3xl">
              {orderNumber}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-pet-muted">
              {getOrderNextStep(order)}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <CTAButton href={ownerRoutes.orders} variant="secondary">
              Back to Orders
            </CTAButton>
            {receiptReady ? (
              <button
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-teal bg-pet-teal px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#1570ef]/20 transition hover:bg-[#0f5fd0]"
                onClick={handleDownloadReceipt}
                type="button"
              >
                <Icon name="record" className="h-4 w-4" />
                Download Receipt
              </button>
            ) : (
              <button
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
                onClick={handleDownloadSummary}
                type="button"
              >
                <Icon name="record" className="h-4 w-4" />
                Download Order Summary
              </button>
            )}
          </div>
        </div>
      </section>

      {order.status === "Pending Payment" ? (
        <ManualPaymentPanel
          order={order}
          petName={petName}
          onSubmitted={(updated) => {
            setOrder(updated);
            setPaymentMessage(
              "Payment proof submitted. We will verify your payment and prepare the tag."
            );
          }}
        />
      ) : null}

      <section className="brand-card rounded-[1.75rem] p-5 sm:p-6">
        <h2 className="text-xl font-black text-pet-ink">Order status</h2>
        <div className="mt-5 grid gap-3">
          {timelineSteps.map((step, index) => (
            <div className="flex gap-3" key={step.label}>
              <div className="grid justify-items-center">
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full border text-xs font-black ${
                    step.current
                      ? "border-pet-coral bg-pet-apricot text-pet-coral"
                      : step.completed
                        ? "border-pet-teal bg-pet-teal text-white"
                        : "border-pet-border bg-white text-pet-muted"
                  }`}
                >
                  {index + 1}
                </span>
                {index < timelineSteps.length - 1 ? (
                  <span className="my-1 h-full min-h-6 w-px bg-pet-border" />
                ) : null}
              </div>
              <div className="min-w-0 pb-3">
                <p className="font-black text-pet-ink">{step.label}</p>
                <p className="mt-1 text-sm font-semibold text-pet-muted">
                  {step.date ?? (step.completed ? "Completed" : "Not yet")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <section className="brand-card rounded-[1.75rem] p-5 sm:p-6">
          <h2 className="text-xl font-black text-pet-ink">Order summary</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DetailItem label="Pet" value={petName} />
            <DetailItem label="Tag type" value={order.tagType} />
            <DetailItem label="Design" value={order.shape} />
            <DetailItem label="Total amount" value={order.estimatedPrice} />
            <DetailItem label="Ordered date" value={order.orderedDate} />
            <DetailItem
              label="Tag status"
              value={linkedTag?.status ?? "Pending tag preparation"}
            />
          </div>
          {linkedTag?.tagCode ? (
            <div className="mt-4 rounded-[1.25rem] bg-pet-cream p-4">
              <p className="text-xs font-extrabold uppercase text-pet-muted">
                Tag code
              </p>
              <p className="mt-1 break-words text-lg font-black text-pet-ink">
                {linkedTag.tagCode}
              </p>
            </div>
          ) : null}
        </section>

        <section className="brand-card rounded-[1.75rem] p-5 sm:p-6">
          <h2 className="text-xl font-black text-pet-ink">Payment</h2>
          <div className="mt-4 grid gap-3">
            <DetailItem
              label="Payment method"
              value={order.paymentMethod ?? "QR Payment"}
            />
            <DetailItem label="Payment status" value={getPaymentStatusLabel(order)} />
            <DetailItem
              label="Bank/eWallet transaction ID"
              value={order.paymentReference ?? "Not submitted yet"}
            />
            <DetailItem
              label="Submitted file"
              value={order.paymentProofName ?? "Not submitted yet"}
            />
            <DetailItem
              label="Payment date"
              value={order.paymentConfirmedDate ?? "Not confirmed yet"}
            />
          </div>
          <p className="mt-4 rounded-[1.25rem] bg-pet-cream p-4 text-sm leading-6 text-pet-muted">
            {receiptReady
              ? "Payment confirmed. Your receipt is ready."
              : order.status === "Payment Submitted"
                ? "We are reviewing your payment proof. Your order will be prepared after payment is confirmed."
                : "Receipt is available after payment is confirmed."}
          </p>
        </section>
      </div>

      <section className="brand-card rounded-[1.75rem] p-5 sm:p-6">
        <h2 className="text-xl font-black text-pet-ink">Delivery details</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <DetailItem
            label="Recipient"
            value={order.delivery.recipientName}
          />
          <DetailItem label="Phone" value={order.delivery.phone} />
          <DetailItem
            label="Delivery address"
            value={formatFullDeliveryAddress(order)}
          />
          <DetailItem
            label="Delivery notes"
            value={order.delivery.notes || "No extra notes"}
          />
          <DetailItem
            label="Tracking status"
            value={order.trackingStatus ?? "Not shipped yet"}
          />
          <DetailItem
            label="Tracking number"
            value={order.trackingNumber ?? "Not available yet"}
          />
        </div>
      </section>

      <section className="brand-card rounded-[1.75rem] p-5 sm:p-6">
        <h2 className="text-xl font-black text-pet-ink">Available actions</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <CTAButton href={ownerRoutes.orders} variant="secondary">
            View All Orders
          </CTAButton>
          {receiptReady ? (
            <button
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
              onClick={handleDownloadReceipt}
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
      </section>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[1.25rem] bg-pet-cream p-4">
      <p className="text-xs font-extrabold uppercase text-pet-muted">{label}</p>
      <p className="mt-1 break-words font-bold text-pet-ink">
        {value || "Not set"}
      </p>
    </div>
  );
}

function buildTimeline(order: TagOrder): TimelineStep[] {
  const rank = getOrderStatusRank(order.status);
  const cancelled = order.status === "Cancelled";
  const isAtLeast = (status: OrderStatus) =>
    !cancelled && rank >= getOrderStatusRank(status);

  return [
    {
      label: "Order created",
      date: order.orderedDate,
      completed: true,
      current: order.status === "Draft" || order.status === "Pending Payment",
    },
    {
      label: "Payment submitted",
      date: order.paymentSubmittedDate,
      completed: isAtLeast("Payment Submitted"),
      current: order.status === "Payment Submitted",
    },
    {
      label: "Payment confirmed",
      date: order.paymentConfirmedDate,
      completed: isAtLeast("Payment Confirmed"),
      current: order.status === "Payment Confirmed",
    },
    {
      label: "Preparing tag",
      completed: isAtLeast("Preparing"),
      current: order.status === "Preparing",
    },
    {
      label: "Shipped",
      date: order.shippedDate,
      completed: isAtLeast("Shipped"),
      current: order.status === "Shipped",
    },
    {
      label: "Delivered",
      date: order.deliveredDate,
      completed: order.status === "Delivered",
      current: order.status === "Delivered",
    },
  ].filter((step) => step.completed || step.current);
}

function buildOrderSummaryText(order: TagOrder, petName: string) {
  return [
    "MyPetLink Order Summary",
    "MyPetLink by GBB Software Solutions",
    "Malaysia",
    "Contact: support@gbbsoftwaresolutions.com",
    "",
    `Order ID: ${formatOrderNumber(order)}`,
    `Order status: ${getOrderStatusDisplay(order.status)}`,
    `Payment status: ${getPaymentStatusLabel(order)}`,
    `Payment method: ${order.paymentMethod ?? "QR Payment"}`,
    "",
    `Pet name: ${petName}`,
    `Tag type: ${order.tagType}`,
    `Design: ${order.shape}`,
    `Total amount: ${order.estimatedPrice}`,
    `Delivery recipient: ${order.delivery.recipientName}`,
    `Delivery address: ${formatFullDeliveryAddress(order)}`,
  ].join("\n");
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
