"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isAbortError } from "@/services/apiClient";
import {
  getFulfilment,
  getMerchantFulfilmentError,
  isStaleInventory,
  issueDeliveryOrder,
  markDelivered,
  markReadyToShip,
  markShipped,
  type MerchantAllocationSummary,
  type MerchantOrderFulfilment,
} from "@/services/adminMerchantFulfilmentService";
import {
  listShippingCourierOptions,
  type ShippingCourierOption,
} from "@/services/adminShippingFulfilmentService";
import type { AdminMerchantOrder } from "@/services/adminMerchantSalesService";
import {
  DetailGrid,
  DetailRow,
  FulfilmentStatusBadge,
  InlineError,
  StatusMessage,
  addressLines,
  batchSummaryText,
  dateTime,
  fieldClass,
  money,
  primaryButton,
  secondaryButton,
} from "./shared";

const NOTES_MAX = 1000;
const SERVICE_MAX = 80;
const TRACKING_MAX = 64;

type Pending = "ready" | "shipped" | "delivered" | null;

/**
 * The shipping half of a merchant order: the explicit step that says the tags
 * are packed, the shipment they travel on, and the confirmation that they
 * arrived. Allocation stays next door — holding stock and sending it are
 * separate decisions, and the two are never collapsed into one status.
 */
export function OrderFulfilmentSection({
  order,
  summary,
  onFulfilmentChanged,
}: {
  order: AdminMerchantOrder;
  summary: MerchantAllocationSummary;
  onFulfilmentChanged: () => void;
}) {
  const courierId = useId();
  const serviceId = useId();
  const trackingId = useId();
  const costId = useId();
  const notesId = useId();

  const [fulfilment, setFulfilment] = useState<MerchantOrderFulfilment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [couriers, setCouriers] = useState<ShippingCourierOption[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  const [courierCode, setCourierCode] = useState("");
  const [service, setService] = useState("");
  const [tracking, setTracking] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Pending>(null);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    getFulfilment(order.id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setFulfilment(result);
        setError("");
      })
      .catch((caught) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setFulfilment(null);
        setError(getMerchantFulfilmentError(caught, "We couldn’t load the shipping details."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });

    return () => controller.abort();
  }, [order.id, reloadKey, summary.allocatedUnits, summary.fulfilmentStatus]);

  // Only the couriers an operator has actually configured may be chosen, so the
  // list is loaded rather than hardcoded, and re-read whenever the form reopens.
  useEffect(() => {
    const controller = new AbortController();

    listShippingCourierOptions()
      .then((options) => {
        if (controller.signal.aborted) return;
        setCouriers(options);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCouriers([]);
      });

    return () => controller.abort();
  }, [reloadKey]);

  if (!loaded && !fulfilment) {
    return (
      <AdminSection title="Fulfilment">
        <p className="p-5 text-sm font-semibold text-slate-500" role="status">
          Loading shipping details…
        </p>
      </AdminSection>
    );
  }

  if (!fulfilment) {
    return (
      <AdminSection title="Fulfilment">
        <div className="grid gap-3 p-5">
          <InlineError message={error} />
          <div>
            <button className={secondaryButton} onClick={reload} type="button">
              Try again
            </button>
          </div>
        </div>
      </AdminSection>
    );
  }

  const status = fulfilment.fulfilmentStatus;
  const cancelled = summary.paymentStatus === "Cancelled";
  const paid = summary.paymentStatus === "PaymentConfirmed";
  const shortfall = summary.items.filter((item) => item.remainingUnits > 0);
  const totalUnits = summary.requiredUnits;
  const selectedCourier = couriers.find((option) => option.code === courierCode) ?? null;

  const canMarkReady =
    paid
    && !cancelled
    && summary.isFullyAllocated
    && shortfall.length === 0
    && status !== "ReadyToShip"
    && status !== "Shipped"
    && status !== "Delivered";

  const showShipmentForm = status === "ReadyToShip";
  const shipped = status === "Shipped" || status === "Delivered";

  // From Ready to Ship onward the delivery note should exist. Deriving this
  // from the server's answer rather than from the failed call means a reload,
  // a Back, or a different admin opening the order all see the same warning
  // and the same way out.
  const deliveryOrderExpected =
    !fulfilment.deliveryOrder
    && (status === "ReadyToShip" || status === "Shipped" || status === "Delivered");

  async function handleFailure(caught: unknown, fallback: string) {
    setError(getMerchantFulfilmentError(caught, fallback));
    if (isStaleInventory(caught) || isConflict(caught)) {
      // Someone else moved this order on. Take the server's word for where it
      // is now instead of leaving a stale action on screen.
      reload();
      onFulfilmentChanged();
    }
  }

  async function runReady() {
    setBusy(true);
    setError("");
    try {
      const next = await markReadyToShip(order.id, fulfilment!.concurrencyToken);
      setFulfilment(next);
      setMessage("This order is ready to ship. Record the shipment below.");

      // The delivery note is the paperwork for this shipment. The server issues
      // one per order and returns the existing one if asked again, so recording
      // it here needs no separate decision from the admin.
      //
      // A failure here must not make the completed transition look failed — but
      // it must not vanish either, or the order sits Ready to Ship with no
      // paperwork and nobody knows. The missing record is derived from the
      // server's own answer below, so the warning and its retry survive a
      // reload rather than living only in this moment.
      try {
        await issueDeliveryOrder(order.id);
      } catch {
        // Deliberately not rethrown: the transition itself succeeded.
      }
      reload();
      onFulfilmentChanged();
    } catch (caught) {
      await handleFailure(caught, "We couldn’t mark this order ready to ship.");
    } finally {
      setBusy(false);
    }
  }

  /** The deterministic way back from a delivery note that was never prepared. */
  async function runRetryDeliveryOrder() {
    setBusy(true);
    setError("");
    try {
      await issueDeliveryOrder(order.id);
      setMessage("The Delivery Order is prepared.");
      reload();
      onFulfilmentChanged();
    } catch (caught) {
      await handleFailure(caught, "We couldn’t prepare the Delivery Order.");
    } finally {
      setBusy(false);
    }
  }

  function validateShipment(): boolean {
    const next: Record<string, string> = {};
    const trimmedTracking = tracking.trim();

    if (!courierCode) {
      next.courier = "Choose the courier carrying this shipment.";
    }
    if (!trimmedTracking) {
      next.tracking = "Enter the courier tracking number before marking this order as Shipped.";
    } else if (/[\u0000-\u001f\u007f]/.test(trimmedTracking)) {
      next.tracking = "Tracking numbers cannot contain line breaks or control characters.";
    } else if (trimmedTracking.length > TRACKING_MAX) {
      next.tracking = `Tracking numbers can be at most ${TRACKING_MAX} characters.`;
    }
    if (service.trim().length > SERVICE_MAX) {
      next.service = `The service description can be at most ${SERVICE_MAX} characters.`;
    }
    if (cost.trim()) {
      const amount = Number(cost);
      if (!Number.isFinite(amount)) {
        next.cost = "Enter the cost as a number, or leave it blank.";
      } else if (amount < 0) {
        next.cost = "The cost cannot be negative.";
      } else if (!/^\d+(\.\d{1,2})?$/.test(cost.trim())) {
        next.cost = "Enter the cost with at most two decimal places.";
      }
    }
    if (notes.trim().length > NOTES_MAX) {
      next.notes = `Internal notes can be at most ${NOTES_MAX} characters.`;
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function runShipped() {
    setBusy(true);
    setError("");
    try {
      const next = await markShipped(order.id, {
        courierProviderCode: courierCode,
        courierService: service.trim() || null,
        trackingNumber: tracking.trim(),
        internalCourierCost: cost.trim() ? Number(cost) : null,
        internalShippingNotes: notes.trim() || null,
        concurrencyToken: fulfilment!.concurrencyToken,
      });
      setFulfilment(next);
      setMessage(`This order is marked as shipped. ${totalUnits} tags are on their way.`);
      reload();
      onFulfilmentChanged();
    } catch (caught) {
      await handleFailure(caught, "We couldn’t mark this order as shipped.");
    } finally {
      setBusy(false);
    }
  }

  async function runDelivered() {
    setBusy(true);
    setError("");
    try {
      const next = await markDelivered(order.id, fulfilment!.concurrencyToken);
      setFulfilment(next);
      setMessage("This order is marked as delivered.");
      reload();
      onFulfilmentChanged();
    } catch (caught) {
      await handleFailure(caught, "We couldn’t mark this order as delivered.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminSection
      description="Packing, dispatch and delivery of the tags this order holds."
      title="Fulfilment"
    >
      <div className="grid gap-4 p-5">
        {message ? <StatusMessage message={message} /> : null}
        <InlineError message={error} />

        <div className="grid gap-1">
          <span className="text-[0.68rem] font-extrabold uppercase text-slate-400">Fulfilment</span>
          <div data-testid="fulfilment-status">
            <FulfilmentStatusBadge status={status} />
          </div>
        </div>

        {/* --- Ready to ship ------------------------------------------- */}
        {!shipped && status !== "ReadyToShip" && !cancelled ? (
          canMarkReady ? (
            <div className="grid gap-2">
              <p className="text-sm text-slate-600">
                All required tags are allocated.
              </p>
              <div>
                <button
                  className={primaryButton}
                  data-testid="mark-ready-to-ship"
                  disabled={busy}
                  onClick={() => setPending("ready")}
                  type="button"
                >
                  Mark Ready to Ship
                </button>
              </div>
            </div>
          ) : (
            <div
              className="rounded-xl border border-[#ffe2b8] bg-[#fff8ec] p-4"
              data-testid="ready-blocked"
            >
              <p className="text-sm font-bold text-[#8a5a12]">Cannot mark Ready to Ship yet.</p>
              {shortfall.length > 0 ? (
                <>
                  <p className="mt-2 text-sm font-bold text-slate-700">Missing inventory:</p>
                  <ul className="mt-1 grid gap-1">
                    {shortfall.map((item) => (
                      <li
                        className="break-words text-sm text-slate-700"
                        key={item.merchantOrderItemId}
                      >
                        • {item.skuCode} — {item.remainingUnits} tags remaining
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-700">
                  {paid
                    ? "This order cannot move to the shipping step yet."
                    : "Inventory can be shipped once the merchant’s payment is confirmed."}
                </p>
              )}
            </div>
          )
        ) : null}

        {/* --- Shipment form ------------------------------------------- */}
        {showShipmentForm ? (
          <div className="grid gap-4" data-testid="shipment-form">
            <h3 className="text-sm font-black text-pet-ink">Shipment</h3>

            <label className="grid gap-1 text-sm font-bold text-pet-ink" htmlFor={courierId}>
              Courier provider
            </label>
            <select
              aria-describedby={fieldErrors.courier ? `${courierId}-error` : undefined}
              aria-invalid={fieldErrors.courier ? true : undefined}
              className={`${fieldClass} sm:max-w-sm`}
              data-testid="courier-provider"
              id={courierId}
              onChange={(event) => setCourierCode(event.target.value)}
              required
              value={courierCode}
            >
              <option value="">Choose a courier</option>
              {couriers.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.displayName}
                </option>
              ))}
            </select>
            {fieldErrors.courier ? (
              <p className="text-sm font-bold text-[#a63c2e]" id={`${courierId}-error`}>
                {fieldErrors.courier}
              </p>
            ) : null}

            <label className="grid gap-1 text-sm font-bold text-pet-ink" htmlFor={serviceId}>
              Courier service (optional)
            </label>
            <input
              aria-describedby={fieldErrors.service ? `${serviceId}-error` : undefined}
              aria-invalid={fieldErrors.service ? true : undefined}
              className={`${fieldClass} sm:max-w-sm`}
              data-testid="courier-service"
              id={serviceId}
              maxLength={SERVICE_MAX}
              onChange={(event) => setService(event.target.value)}
              placeholder="Standard, Express, Next Day"
              type="text"
              value={service}
            />
            {fieldErrors.service ? (
              <p className="text-sm font-bold text-[#a63c2e]" id={`${serviceId}-error`}>
                {fieldErrors.service}
              </p>
            ) : null}

            <label className="grid gap-1 text-sm font-bold text-pet-ink" htmlFor={trackingId}>
              Tracking number
            </label>
            <input
              aria-describedby={fieldErrors.tracking ? `${trackingId}-error` : undefined}
              aria-invalid={fieldErrors.tracking ? true : undefined}
              className={`${fieldClass} sm:max-w-sm`}
              data-testid="tracking-number"
              id={trackingId}
              maxLength={TRACKING_MAX}
              onChange={(event) => setTracking(event.target.value)}
              required
              type="text"
              value={tracking}
            />
            {fieldErrors.tracking ? (
              <p className="text-sm font-bold text-[#a63c2e]" id={`${trackingId}-error`}>
                {fieldErrors.tracking}
              </p>
            ) : null}

            <TrackingPreview courier={selectedCourier} tracking={tracking.trim()} />

            <label className="grid gap-1 text-sm font-bold text-pet-ink" htmlFor={costId}>
              Internal courier cost
            </label>
            <input
              aria-describedby={`${costId}-help${fieldErrors.cost ? ` ${costId}-error` : ""}`}
              aria-invalid={fieldErrors.cost ? true : undefined}
              className={`${fieldClass} sm:max-w-40`}
              data-testid="internal-cost"
              id={costId}
              inputMode="decimal"
              onChange={(event) => setCost(event.target.value)}
              type="text"
              value={cost}
            />
            <p className="text-xs text-slate-500" id={`${costId}-help`}>
              For internal cost tracking only. The merchant will not see this amount.
            </p>
            {fieldErrors.cost ? (
              <p className="text-sm font-bold text-[#a63c2e]" id={`${costId}-error`}>
                {fieldErrors.cost}
              </p>
            ) : null}

            <label className="grid gap-1 text-sm font-bold text-pet-ink" htmlFor={notesId}>
              Internal shipping notes
            </label>
            <textarea
              aria-describedby={`${notesId}-help${fieldErrors.notes ? ` ${notesId}-error` : ""}`}
              aria-invalid={fieldErrors.notes ? true : undefined}
              className={`${fieldClass} min-h-20 py-3`}
              data-testid="internal-notes"
              id={notesId}
              maxLength={NOTES_MAX}
              onChange={(event) => setNotes(event.target.value)}
              value={notes}
            />
            <p className="text-xs text-slate-500" id={`${notesId}-help`}>
              Admin only. These notes are not shown to the merchant.
            </p>
            {fieldErrors.notes ? (
              <p className="text-sm font-bold text-[#a63c2e]" id={`${notesId}-error`}>
                {fieldErrors.notes}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                className={primaryButton}
                data-testid="mark-shipped"
                disabled={busy}
                onClick={() => {
                  if (validateShipment()) setPending("shipped");
                }}
                type="button"
              >
                Mark as Shipped
              </button>
            </div>
          </div>
        ) : null}

        {/* --- Shipped / delivered ------------------------------------- */}
        {shipped ? (
          <ShipmentCard
            fulfilment={fulfilment}
            onDeliver={() => setPending("delivered")}
            summary={summary}
            busy={busy}
          />
        ) : null}

        {fulfilment.deliveryOrder ? (
          <DetailGrid>
            <DetailRow label="Delivery Order">
              <span data-testid="delivery-order-number">
                {fulfilment.deliveryOrder.deliveryOrderNumber}
              </span>
            </DetailRow>
          </DetailGrid>
        ) : deliveryOrderExpected ? (
          <div
            className="grid gap-3 rounded-xl border border-[#ffe2b8] bg-[#fff8ec] p-4"
            data-testid="delivery-order-missing"
          >
            <p className="text-sm font-bold text-[#8a5a12]">
              The order is Ready to Ship, but the Delivery Order could not be prepared. Try again.
            </p>
            <div>
              <button
                className={secondaryButton}
                data-testid="retry-delivery-order"
                disabled={busy}
                onClick={() => void runRetryDeliveryOrder()}
                type="button"
              >
                Retry Delivery Order
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        confirmDisabled={busy}
        confirmLabel={
          pending === "ready"
            ? "Mark Ready to Ship"
            : pending === "shipped"
              ? "Mark as Shipped"
              : "Mark as Delivered"
        }
        message={confirmMessage(pending, order, summary, {
          courier: selectedCourier?.displayName ?? "",
          service: service.trim(),
          tracking: tracking.trim(),
          fulfilment,
        })}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const target = pending;
          setPending(null);
          if (target === "ready") void runReady();
          if (target === "shipped") void runShipped();
          if (target === "delivered") void runDelivered();
        }}
        open={pending !== null}
        title={
          pending === "ready"
            ? "Mark this order Ready to Ship?"
            : pending === "shipped"
              ? "Mark this order as Shipped?"
              : "Mark this order as Delivered?"
        }
      >
        {pending === "ready" ? (
          <ul className="grid gap-1" data-testid="ready-item-summary">
            {summary.items.map((item) => (
              <li
                className="flex flex-wrap justify-between gap-3 text-sm text-slate-700"
                key={item.merchantOrderItemId}
              >
                <span className="break-words font-bold">{item.skuCode}</span>
                <span className="whitespace-nowrap">{item.allocatedUnits} tags</span>
              </li>
            ))}
          </ul>
        ) : null}
      </ConfirmDialog>
    </AdminSection>
  );
}

/** The shipment as recorded, plus the only action still open on it. */
function ShipmentCard({
  fulfilment,
  summary,
  busy,
  onDeliver,
}: {
  fulfilment: MerchantOrderFulfilment;
  summary: MerchantAllocationSummary;
  busy: boolean;
  onDeliver: () => void;
}) {
  const batches = summary.items.flatMap((item) => item.batches);

  return (
    <div className="grid gap-4" data-testid="shipment-card">
      <h3 className="text-sm font-black text-pet-ink">Shipment</h3>
      <DetailGrid>
        <DetailRow label="Courier">{fulfilment.courierProvider ?? "Not provided"}</DetailRow>
        {fulfilment.courierService ? (
          <DetailRow label="Service">{fulfilment.courierService}</DetailRow>
        ) : null}
        <DetailRow label="Tags sent">{summary.allocatedUnits}</DetailRow>
        <DetailRow label="Batches">{batchSummaryText(batches)}</DetailRow>
        <DetailRow label="Shipped">{dateTime(fulfilment.shippedAt)}</DetailRow>
        {fulfilment.deliveredAt ? (
          <DetailRow label="Delivered">{dateTime(fulfilment.deliveredAt)}</DetailRow>
        ) : null}
      </DetailGrid>

      <TrackingActions fulfilment={fulfilment} />

      {fulfilment.fulfilmentStatus === "Shipped" ? (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            className={primaryButton}
            data-testid="mark-delivered"
            disabled={busy}
            onClick={onDeliver}
            type="button"
          >
            Mark as Delivered
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The tracking number is always shown; the link only when one is configured. */
function TrackingActions({ fulfilment }: { fulfilment: MerchantOrderFulfilment }) {
  const [copied, setCopied] = useState("");
  const trackingNumber = fulfilment.trackingNumber ?? "";
  const trackingUrl = safeTrackingUrl(fulfilment.trackingUrl);

  async function copy() {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      setCopied("Tracking number copied");
    } catch {
      setCopied("Copy the tracking number manually: your browser blocked the clipboard.");
    }
  }

  return (
    <div className="grid gap-2">
      <span className="text-[0.68rem] font-extrabold uppercase text-slate-400">
        Tracking number
      </span>
      <p className="break-all font-mono text-sm font-bold text-slate-950" data-testid="tracking-value">
        {trackingNumber || "Not provided"}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          className={secondaryButton}
          data-testid="copy-tracking"
          onClick={() => void copy()}
          type="button"
        >
          Copy
        </button>
        {trackingUrl ? (
          <a
            className={secondaryButton}
            data-testid="track-parcel"
            href={trackingUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            Track Parcel with {fulfilment.courierProvider ?? "the courier"}
          </a>
        ) : null}
      </div>

      <p aria-live="polite" className="min-h-5 text-sm font-semibold text-[#0f8a5f]">
        {copied}
      </p>

      {trackingUrl ? null : (
        <p className="text-sm text-slate-600" data-testid="no-tracking-link">
          Tracking is available directly from the courier using this number.
        </p>
      )}
    </div>
  );
}

/** What the tracking link will be, before the shipment exists. */
function TrackingPreview({
  courier,
  tracking,
}: {
  courier: ShippingCourierOption | null;
  tracking: string;
}) {
  if (!courier || !tracking) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" data-testid="tracking-preview">
      <p className="text-sm font-bold text-slate-700">Tracking link preview</p>
      <p className="mt-1 text-sm text-slate-600">
        The Track Parcel button will use the configured courier tracking link after shipment.
      </p>
    </div>
  );
}

/**
 * Only a plain http(s) link may become a clickable destination. Provider
 * configuration is operator-supplied text, and it never becomes markup.
 */
function safeTrackingUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isConflict(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "status" in error
    && (error as { status: number }).status === 409
  );
}

function confirmMessage(
  pending: Pending,
  order: AdminMerchantOrder,
  summary: MerchantAllocationSummary,
  shipment: {
    courier: string;
    service: string;
    tracking: string;
    fulfilment: MerchantOrderFulfilment;
  }
): string {
  if (pending === "ready") {
    const address = addressLines(order.deliveryAddress).join("\n");
    return (
      `All ${summary.requiredUnits} required tags are allocated.\n\n`
      + `Delivery to:\n${order.merchantLegalName}\n${address}\n\n`
      + "Once confirmed, the order will move to the shipping step."
    );
  }

  if (pending === "shipped") {
    const service = shipment.service ? `Service:\n${shipment.service}\n\n` : "";
    return (
      `Courier:\n${shipment.courier}\n\n`
      + service
      + `Tracking:\n${shipment.tracking}\n\n`
      + `${summary.requiredUnits} tags will be recorded as sent to the Merchant.\n\n`
      + "The tags will remain unclaimed and can later be activated by their final pet owners."
    );
  }

  if (pending === "delivered") {
    return (
      `Merchant:\n${order.merchantLegalName}\n\n`
      + `Courier:\n${shipment.fulfilment.courierProvider ?? "Not provided"}\n\n`
      + `Tracking:\n${shipment.fulfilment.trackingNumber ?? "Not provided"}\n\n`
      + "This will record the shipment as delivered."
    );
  }

  return "";
}

/** Kept for the internal cost display, which never leaves the Admin Portal. */
export function internalCostLabel(currency: string, amount: number | null): string {
  return amount === null ? "Not recorded" : money(currency, amount);
}
