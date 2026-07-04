"use client";

import { useEffect, useMemo, useState } from "react";
import { ManualPaymentPanel } from "@/components/portal/ManualPaymentPanel";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import {
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
import { activatePath, ownerRoutes, tagPath } from "@/lib/routes";
import { QrCodeCard } from "@/components/qr/QrCodeCard";
import { isApiConfigured } from "@/services/apiConfig";
import {
  downloadOwnerOrderReceiptPdf,
  downloadOwnerOrderSummaryPdf,
} from "@/services/orderDocuments";
import { getPets } from "@/services/petService";
import {
  getAllTags,
  getFriendlyTagErrorMessage,
  getOrder,
} from "@/services/tagService";
import type {
  OrderStatus,
  OrderTimelineEvent,
  OrderTimelineTone,
  Pet,
  PetTag,
  TagOrder,
} from "@/types";

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

// Circle + text styling per timeline tone. `completed` steps read as done,
// `current` is highlighted, `warning` marks a rejected proof (amber, not
// alarming), and `cancelled` is a muted red.
const timelineToneStyles: Record<
  OrderTimelineTone,
  { circle: string; description: string }
> = {
  completed: {
    circle: "border-pet-teal bg-pet-teal text-white",
    description: "text-pet-muted",
  },
  current: {
    circle: "border-pet-coral bg-pet-apricot text-pet-coral",
    description: "text-pet-muted",
  },
  warning: {
    circle: "border-[#f4cf8a] bg-[#fdf3df] text-[#9a6b18]",
    description: "text-[#9a6b18]",
  },
  cancelled: {
    circle: "border-[#ffd2c9] bg-[#fff4f1] text-[#a63c2e]",
    description: "text-[#a63c2e]",
  },
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
  const [downloadError, setDownloadError] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);
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
  const timelineEvents =
    order.timeline && order.timeline.length > 0
      ? order.timeline
      : buildFallbackTimeline(order);
  const replacementHref =
    linkedTag && order.petId
      ? ownerRoutes.petTagOrder(order.petId, {
          type: order.tagType.includes("NFC") ? "nfc" : "qr",
          replacementFor: linkedTag.id,
        })
      : "";

  const orderKeyForApi = order.orderNumber || order.id;

  async function handleDownloadReceipt() {
    if (!order || downloadBusy) {
      return;
    }

    setDownloadBusy(true);
    setDownloadMessage("");
    setDownloadError("");

    try {
      await downloadOwnerOrderReceiptPdf(orderKeyForApi, orderNumber);
      setDownloadMessage("Receipt PDF downloaded.");
      window.setTimeout(() => setDownloadMessage(""), 2500);
    } catch (caught) {
      setDownloadError(getFriendlyTagErrorMessage(caught));
    } finally {
      setDownloadBusy(false);
    }
  }

  async function handleDownloadSummary() {
    if (!order || downloadBusy) {
      return;
    }

    setDownloadBusy(true);
    setDownloadMessage("");
    setDownloadError("");

    try {
      await downloadOwnerOrderSummaryPdf(orderKeyForApi, orderNumber);
      setDownloadMessage("Order Summary PDF downloaded.");
      window.setTimeout(() => setDownloadMessage(""), 2500);
    } catch (caught) {
      setDownloadError(getFriendlyTagErrorMessage(caught));
    } finally {
      setDownloadBusy(false);
    }
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

      {downloadError ? (
        <div className="rounded-[1.25rem] border border-[#ffd2c9] bg-[#fff4f1] px-4 py-3 text-sm font-bold text-[#a63c2e]">
          {downloadError}
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
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-teal bg-pet-teal px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#1570ef]/20 transition hover:bg-[#0f5fd0] disabled:cursor-wait disabled:opacity-70"
                disabled={downloadBusy}
                onClick={handleDownloadReceipt}
                type="button"
              >
                <Icon name="record" className="h-4 w-4" />
                {downloadBusy ? "Preparing..." : "Download Receipt PDF"}
              </button>
            ) : (
              <button
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream disabled:cursor-wait disabled:opacity-70"
                disabled={downloadBusy}
                onClick={handleDownloadSummary}
                type="button"
              >
                <Icon name="record" className="h-4 w-4" />
                {downloadBusy ? "Preparing..." : "Download Order Summary PDF"}
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
          {timelineEvents.map((event, index) => {
            const toneStyles = timelineToneStyles[event.tone];

            return (
              <div className="flex gap-3" key={`${event.type}-${index}`}>
                <div className="grid justify-items-center">
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-full border text-xs font-black ${toneStyles.circle}`}
                  >
                    {index + 1}
                  </span>
                  {index < timelineEvents.length - 1 ? (
                    <span className="my-1 h-full min-h-6 w-px bg-pet-border" />
                  ) : null}
                </div>
                <div className="min-w-0 pb-3">
                  <p className="font-black text-pet-ink">{event.title}</p>
                  <p className="mt-1 text-sm font-semibold text-pet-muted">
                    {event.timestampLabel ?? "Time not available"}
                  </p>
                  {event.description ? (
                    <p
                      className={`mt-1 text-sm font-semibold ${toneStyles.description}`}
                    >
                      {event.description}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
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
            linkedTag.status === "Active" ? (
              <QrCodeCard
                className="mt-4"
                fileNameBase={`${linkedTag.tagCode}-physical-tag-qr`}
                helperText="This is the QR printed on your physical tag. If the tag is lost or disabled, the scan page will stop showing your contact details."
                targetPath={tagPath(linkedTag.tagCode)}
                title="Physical Tag QR"
                viewLabel="View Tag Scan Page"
              />
            ) : (
              <div className="mt-4 rounded-[1.25rem] bg-pet-cream p-4">
                <p className="text-xs font-extrabold uppercase text-pet-muted">
                  Tag code
                </p>
                <p className="mt-1 break-words text-lg font-black text-pet-ink">
                  {linkedTag.tagCode}
                </p>
                <p className="mt-2 text-xs font-bold leading-5 text-pet-muted">
                  Your tag has been assigned to {petName}. Scan or tap the tag
                  when you receive it to activate. It will not show contact
                  details before activation.
                </p>
                <CTAButton
                  className="mt-3"
                  href={activatePath(linkedTag.tagCode)}
                  icon="tag"
                  variant="secondary"
                >
                  Activate Tag
                </CTAButton>
              </div>
            )
          ) : (
            <div className="mt-4 rounded-[1.25rem] bg-pet-cream p-4">
              <p className="text-sm font-bold leading-6 text-pet-ink">
                Your physical tag will be assigned after your payment is
                confirmed.
              </p>
              <p className="mt-1 text-xs font-bold leading-5 text-pet-muted">
                No tag code is shown until our team assigns inventory to this
                order.
              </p>
            </div>
          )}
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
          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream disabled:cursor-wait disabled:opacity-70"
            disabled={downloadBusy}
            onClick={receiptReady ? handleDownloadReceipt : handleDownloadSummary}
            type="button"
          >
            <Icon name="record" className="h-4 w-4" />
            {downloadBusy
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

// Fallback timeline for demo mode, where the backend history is not available.
// The API-connected path renders order.timeline directly; this only mirrors the
// order's current status from the flattened fields on the order.
function buildFallbackTimeline(order: TagOrder): OrderTimelineEvent[] {
  const rank = getOrderStatusRank(order.status);
  const cancelled = order.status === "Cancelled";
  const reached = (status: OrderStatus) =>
    !cancelled && rank >= getOrderStatusRank(status);

  const tone = (status: OrderStatus): OrderTimelineTone =>
    order.status === status ? "current" : "completed";

  const events: OrderTimelineEvent[] = [
    {
      type: "OrderCreated",
      title: "Order created",
      timestampLabel: order.orderedDate,
      tone:
        order.status === "Draft" || order.status === "Pending Payment"
          ? "current"
          : "completed",
    },
  ];

  if (reached("Payment Submitted")) {
    events.push({
      type: "PaymentProofSubmitted",
      title: "Payment proof submitted",
      timestampLabel: order.paymentSubmittedDate,
      tone: tone("Payment Submitted"),
    });
  }

  if (reached("Payment Confirmed")) {
    events.push({
      type: "PaymentConfirmed",
      title: "Payment confirmed",
      timestampLabel: order.paymentConfirmedDate,
      tone: tone("Payment Confirmed"),
    });
  }

  if (reached("Preparing")) {
    events.push({
      type: "PreparingTag",
      title: "Tag preparing",
      tone: tone("Preparing"),
    });
  }

  if (reached("Shipped")) {
    events.push({
      type: "Shipped",
      title: "Shipped",
      timestampLabel: order.shippedDate,
      tone: tone("Shipped"),
    });
  }

  if (order.status === "Delivered") {
    events.push({
      type: "Delivered",
      title: "Delivered",
      timestampLabel: order.deliveredDate,
      tone: "current",
    });
  }

  if (cancelled) {
    events.push({
      type: "Cancelled",
      title: "Order cancelled",
      tone: "cancelled",
    });
  }

  return events;
}

