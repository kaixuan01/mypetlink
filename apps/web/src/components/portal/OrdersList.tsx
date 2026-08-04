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
import {
  findOrderLinkedTag,
  getOrderItemActivationLines,
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
              <OrderInlineDetail order={order} tag={linkedTag} />
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

/**
 * Everything the compact card does not already say, in the three groups a
 * customer actually thinks in: what they bought, what they paid, and where it
 * is going.
 *
 * Pet, option and the fulfilment status are deliberately absent — the priced
 * items carry the first two and the status badge above carries the third, so
 * repeating them here only made the panel longer.
 */
function OrderInlineDetail({
  order,
  tag,
}: {
  order: TagOrder;
  tag?: PetTag;
}) {
  const shipment = getOrderShipmentView(order);
  // Activation belongs to the physical unit, so it is resolved per line rather
  // than averaged into one answer for the whole order.
  const lines = priceLinesFromOrder(order).map((line, index) => ({
    ...line,
    activation: getOrderItemActivationLines(order, index, tag),
  }));

  return (
    <div className="mt-4 grid gap-5 rounded-[1.25rem] border border-pet-border bg-white p-4">
      <DetailSection title="Order items">
        {/* The same breakdown checkout and the order page use, so the numbers
            can never disagree. It carries the only Total inside this panel. */}
        <OrderPriceBreakdown
          compact
          currency={order.currency}
          deliveryFee={order.deliveryFee ?? 0}
          deliveryMethod={order.delivery.deliveryMethod}
          discountTotal={order.discountTotal}
          freeDeliveryReason={order.delivery.freeDeliveryReason}
          lines={lines}
          merchandiseSubtotal={order.merchandiseSubtotal}
          total={order.totalAmount}
        />
      </DetailSection>

      <DetailSection title="Payment">
        <DetailPanel>
          <DetailRow
            label="Payment method"
            value={order.paymentMethod ?? "QR Payment"}
          />
          <DetailRow label="Payment date" value={getPaymentDateLabel(order)} />
          {order.submittedPaymentAmount != null ? (
            <DetailRow
              label="Amount paid"
              value={`${order.currency ?? "MYR"} ${order.submittedPaymentAmount.toFixed(2)}`}
            />
          ) : null}
          {/* Optional: owners may pay without ever quoting a reference. A blank
              one is not an outstanding task, so it must not read like one. */}
          <DetailRow
            label="Bank/eWallet transaction ID"
            value={order.paymentReference || "Not provided"}
          />
          <DetailRow
            label="Submitted receipt"
            value={order.paymentProofName || getMissingProofLabel(order)}
          />
        </DetailPanel>
      </DetailSection>

      {/* One journey, one section. The complete address appears here and
          nowhere else, so it is never shown twice in two different forms. */}
      <DetailSection title="Delivery &amp; shipment">
        <DetailPanel>
          <DetailRow label="Recipient" value={order.delivery.recipientName} />
          <DetailRow label="Phone" value={order.delivery.phone} />
          <DetailRow
            label="Delivery address"
            value={formatFullDeliveryAddress(order)}
            wide
          />
          {order.delivery.notes ? (
            <DetailRow label="Delivery notes" value={order.delivery.notes} wide />
          ) : null}

          {shipment.visible ? (
            <div className="sm:col-span-2">
              <p className="border-t border-pet-border pt-4 text-[0.68rem] font-extrabold uppercase tracking-wide text-pet-teal">
                Shipment
              </p>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <DetailRow
                  label="Courier"
                  value={
                    shipment.courierService
                      ? `${shipment.courierName ?? "Handed to courier"} · ${shipment.courierService}`
                      : shipment.courierName ?? "Handed to courier"
                  }
                />
                {/* Reference only. Copying lives on the tracking card above, so
                    the same action is not offered twice. */}
                {shipment.trackingNumber ? (
                  <DetailRow
                    label="Tracking number"
                    value={shipment.trackingNumber}
                  />
                ) : null}
                {shipment.shippedDate ? (
                  <DetailRow label="Shipped" value={shipment.shippedDate} />
                ) : null}
                {shipment.deliveredDate ? (
                  <DetailRow label="Delivered" value={shipment.deliveredDate} />
                ) : null}
              </dl>
            </div>
          ) : null}
        </DetailPanel>
      </DetailSection>
    </div>
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
      <h3 className="text-sm font-black text-pet-ink">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/**
 * Related fields share one surface. A tile per field made a short list of
 * facts read like a dashboard.
 */
function DetailPanel({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid min-w-0 gap-3 rounded-2xl border border-pet-border bg-pet-cream p-4 sm:grid-cols-2">
      {children}
    </dl>
  );
}

function DetailRow({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  /** Full width, for addresses and notes that need the room. */
  wide?: boolean;
}) {
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[0.68rem] font-extrabold uppercase text-pet-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-bold text-pet-ink [overflow-wrap:anywhere]">
        {value || "Not set"}
      </dd>
    </div>
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
