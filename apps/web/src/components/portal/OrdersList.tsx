"use client";

import { useEffect, useMemo, useState } from "react";
import {
  OrderPriceBreakdown,
  priceLinesFromOrder,
} from "@/components/orders/OrderPriceBreakdown";
import {
  MissingTrackingNumberNote,
  OrderTrackingPanel,
} from "@/components/portal/OrderTrackingPanel";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import {
  canDownloadPaymentReceipt,
  canRequestReplacement,
  formatDeliveryDestination,
  formatFullDeliveryAddress,
  formatOrderNumber,
  getMissingProofLabel,
  getOrderNextStep,
  getOrderShipmentView,
  getOrderStatusDisplay,
  getPaymentDateLabel,
  getPaymentStatusLabel,
  getShipmentSummaryLabel,
} from "@/lib/orders";
import { formatOrderOption } from "@/lib/orderDisplay";
import {
  findOrderLinkedTag,
  getOrderTagActivations,
  getSharedTagActivationState,
  type OrderTagActivation,
} from "@/lib/tagStatus";
import { smartTagOrderingEnabled } from "@/lib/features";
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
  "Ready to Ship": "teal",
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
        await downloadOwnerOrderReceiptPdf(
          orderKey,
          order.receiptNumber ?? orderNumber
        );
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
    if (!smartTagOrderingEnabled) {
      return (
        <EmptyState
          icon="record"
          title="No tag orders yet"
          description="Smart Tag ordering is coming soon. Your pet's free Safety Profile and Public Share Profile are already active — no order needed."
          actionHref={ownerRoutes.pets}
          actionLabel="Go to My Pets"
        />
      );
    }

    return (
      <EmptyState
        icon="record"
        title="No tag orders yet"
        description="Orders for MyPetLink QR Tags and QR + NFC Smart Tags will appear here with payment status, delivery updates, and receipt actions."
        actionHref={ownerRoutes.tagOrder()}
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
        const linkedTag = findOrderLinkedTag(order, tags);
        // Only the order itself may unlock tag actions, so a reserved tag
        // reports activation without changing what else the card offers.
        const orderDisclosedTag = order.tagId ? linkedTag : undefined;
        const petName = pet?.name ?? order.petName ?? "Pet profile";
        const orderNumber = formatOrderNumber(order);
        const replacementHref =
          orderDisclosedTag && order.petId
            ? ownerRoutes.petTagOrder(order.petId, {
                type: order.tagType.includes("NFC") ? "nfc" : "qr",
                replacementFor: orderDisclosedTag.id,
              })
            : "";
        const receiptReady = canDownloadPaymentReceipt(order);
        const replacementReady = canRequestReplacement(order, orderDisclosedTag);
        const shipment = getOrderShipmentView(order);
        const shipmentSummary = getShipmentSummaryLabel(order);

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
                  {petName} - {order.productName ?? order.tagType}
                </p>
              </div>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                <Icon name="record" className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <CompactItem label="Ordered" value={order.orderedDate} />
              <CompactItem label="Total" value={order.totalAmount != null ? `${order.currency ?? "MYR"} ${order.totalAmount.toFixed(2)}` : order.estimatedPrice} />
              <CompactItem
                label="Payment"
                value={getPaymentStatusLabel(order)}
              />
              <CompactItem
                label={shipmentSummary.label}
                value={shipmentSummary.value}
              />
              {/* A short, normalised destination. The complete address belongs
                  to the expanded details, so this is never a cut-off copy of
                  it. */}
              <CompactItem
                label="Deliver to"
                value={formatDeliveryDestination(order)}
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

            <OrderTrackingPanel compact shipment={shipment} />
            <MissingTrackingNumberNote shipment={shipment} />

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
  const shipment = getOrderShipmentView(order);
  const tagActivations = getOrderTagActivations(order, tag);

  return (
    <div className="mt-4 grid gap-4 rounded-[1.25rem] border border-pet-border bg-white p-4">
      {/* Every line of the order, priced, using the same breakdown the order
          page and checkout show so the numbers can never disagree. */}
      <section className="min-w-0">
        <h3 className="text-[0.68rem] font-extrabold uppercase tracking-wide text-pet-teal">
          Order items
        </h3>
        <div className="mt-2">
          <OrderPriceBreakdown
            compact
            currency={order.currency}
            deliveryFee={order.deliveryFee ?? 0}
            deliveryMethod={order.delivery.deliveryMethod}
            discountTotal={order.discountTotal}
            freeDeliveryReason={order.delivery.freeDeliveryReason}
            lines={priceLinesFromOrder(order)}
            merchandiseSubtotal={order.merchandiseSubtotal}
            total={order.totalAmount}
          />
        </div>
      </section>

      <DetailSection title="Order">
        <CompactItem label="Pet" value={petName} />
        <CompactItem label="Option" value={formatOrderOption(order)} />
        <CompactItem
          label="Fulfilment status"
          value={getOrderStatusDisplay(order.status)}
        />
      </DetailSection>

      {/* The tag's own state, kept apart from the order's progress above so a
          fulfilment step can never read as the tag's activation state. */}
      <TagActivationSection activations={tagActivations} />

      <DetailSection title="Payment">
        <CompactItem
          label="Payment method"
          value={order.paymentMethod ?? "QR Payment"}
        />
        <CompactItem
          label="Payment date"
          value={getPaymentDateLabel(order)}
        />
        {/* Optional: owners may pay without ever quoting a reference. A blank
            one is not an outstanding task, so it must not read like one. */}
        <CompactItem
          label="Bank/eWallet transaction ID"
          value={order.paymentReference || "Not provided"}
        />
        <CompactItem
          label="Submitted file"
          value={order.paymentProofName || getMissingProofLabel(order)}
        />
      </DetailSection>

      {/* The complete address lives here and nowhere else, so it is never
          shown twice in two different truncated forms. */}
      <DetailSection title="Delivery">
        <CompactItem label="Recipient" value={order.delivery.recipientName} />
        <CompactItem label="Phone" value={order.delivery.phone} />
        <CompactItem
          label="Delivery address"
          value={formatFullDeliveryAddress(order)}
        />
        {order.delivery.notes ? (
          <CompactItem label="Delivery notes" value={order.delivery.notes} />
        ) : null}
      </DetailSection>

      {shipment.visible ? (
        <DetailSection title="Shipment">
          <CompactItem
            label="Courier"
            value={shipment.courierName ?? "Handed to courier"}
          />
          {shipment.courierService ? (
            <CompactItem label="Service" value={shipment.courierService} />
          ) : null}
          {shipment.shippedDate ? (
            <CompactItem label="Shipped" value={shipment.shippedDate} />
          ) : null}
          {shipment.deliveredDate ? (
            <CompactItem label="Delivered" value={shipment.deliveredDate} />
          ) : null}
        </DetailSection>
      ) : null}
    </div>
  );
}

/**
 * The physical tags on this order and whether each one has been activated.
 *
 * A single shared answer is shown when every tag agrees. When they differ —
 * one tag already tapped, another still in the envelope — each is listed, since
 * one aggregate value would be wrong for at least one of them.
 */
function TagActivationSection({
  activations,
}: {
  activations: OrderTagActivation[];
}) {
  const shared = getSharedTagActivationState(activations);

  if (shared) {
    return (
      <DetailSection title="Tag">
        <CompactItem label="Tag activation" value={shared} />
      </DetailSection>
    );
  }

  return (
    <section className="min-w-0">
      <h3 className="text-[0.68rem] font-extrabold uppercase tracking-wide text-pet-teal">
        Tag
      </h3>
      <div className="mt-2 grid gap-3 md:grid-cols-3">
        {activations.map((activation) => (
          <CompactItem
            key={activation.id}
            label={`Tag activation - ${activation.tagCode}`}
            value={`${activation.state} (${activation.petName})`}
          />
        ))}
      </div>
    </section>
  );
}

/** One labelled group inside the expanded panel. */
function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <h3 className="text-[0.68rem] font-extrabold uppercase tracking-wide text-pet-teal">
        {title}
      </h3>
      <div className="mt-2 grid gap-3 md:grid-cols-3">{children}</div>
    </section>
  );
}

function CompactItem({
  label,
  value,
  truncate,
}: {
  label: string;
  value: string;
  /** Compact summary tiles only. Full-detail values always wrap. */
  truncate?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-[1rem] bg-pet-cream px-3 py-3">
      <p className="text-[0.68rem] font-extrabold uppercase text-pet-muted">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-bold text-pet-ink ${
          truncate ? "truncate" : "break-words [overflow-wrap:anywhere]"
        }`}
        title={truncate ? value : undefined}
      >
        {value || "Not set"}
      </p>
    </div>
  );
}
