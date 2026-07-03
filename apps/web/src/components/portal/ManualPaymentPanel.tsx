"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { paymentConfig } from "@/config/payment";
import { formatDeliverySummary, formatOrderNumber } from "@/lib/orders";
import {
  getFriendlyTagErrorMessage,
  submitOrderPayment,
} from "@/services/tagService";
import type { TagOrder } from "@/types";

type ManualPaymentPanelProps = {
  order: TagOrder;
  petName: string;
  /** Called with the updated order after the proof is submitted. */
  onSubmitted: (order: TagOrder) => void;
};

// Shared "Pay by QR" UI used both right after placing an order and when
// resuming a Pending Payment order from Orders / order details. The system
// generates the payment reference (the order number); the owner uploads a
// receipt or screenshot and may add their bank / eWallet transaction ID.
export function ManualPaymentPanel({
  order,
  petName,
  onSubmitted,
}: ManualPaymentPanelProps) {
  const [transactionReference, setTransactionReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [proofName, setProofName] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const paymentReference = formatOrderNumber(order);
  const deliverySummary = formatDeliverySummary(order);

  function handleCopyReference() {
    navigator.clipboard?.writeText(paymentReference).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => setCopied(false)
    );
  }

  async function handleSubmit() {
    if (!proofName.trim()) {
      setError(
        "Upload a receipt or screenshot so we can verify your payment."
      );
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const response = await submitOrderPayment(order.id, {
        paymentReference: transactionReference,
        paymentNote,
        paymentProofName: proofName,
      });

      if (response.data.order) {
        onSubmitted(response.data.order);
      }
    } catch (caught) {
      setError(getFriendlyTagErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="brand-card rounded-[1.75rem] p-5 sm:p-6">
      <Badge tone="warm">Pending payment</Badge>
      <h2 className="mt-4 text-2xl font-black text-pet-ink sm:text-3xl">
        Pay by QR
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-pet-muted">
        {paymentConfig.instructions}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* Merchant QR + payment reference */}
        <div className="rounded-[1.5rem] border border-pet-border bg-pet-cream p-5">
          <p className="text-center text-xs font-black uppercase tracking-wide text-pet-muted">
            {paymentConfig.merchantQrLabel}
          </p>
          <div className="mx-auto mt-4 grid aspect-square w-full max-w-[260px] place-items-center rounded-[1.25rem] border border-dashed border-pet-border bg-white p-6">
            {paymentConfig.merchantQrImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="Merchant QR code"
                  className="h-full w-full object-contain"
                  src={paymentConfig.merchantQrImage}
                />
              </>
            ) : (
              <div className="grid place-items-center gap-2 text-center text-pet-muted">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-pet-cream text-pet-teal">
                  <Icon name="qr" className="h-6 w-6" />
                </span>
                <span className="text-sm font-bold">
                  Merchant QR will appear here
                </span>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-pet-muted">
              Amount to pay
            </span>
            <span className="text-lg font-black text-pet-ink">
              {order.estimatedPrice}
            </span>
          </div>

          <div className="mt-3 rounded-[1.25rem] bg-white p-3">
            <label
              className="text-xs font-extrabold uppercase text-pet-muted"
              htmlFor={`payment-reference-${order.id}`}
            >
              Payment Reference
            </label>
            <div className="mt-1 flex items-center justify-between gap-2">
              <input
                className="min-w-0 flex-1 rounded-full border border-pet-border bg-pet-cream px-3 py-2 text-sm font-black text-pet-ink"
                id={`payment-reference-${order.id}`}
                readOnly
                type="text"
                value={paymentReference}
              />
              <button
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-pet-border bg-white px-3 text-xs font-bold text-pet-ink transition hover:bg-pet-cream"
                onClick={handleCopyReference}
                type="button"
              >
                <Icon name="record" className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-pet-muted">
              Please enter this reference in your bank or eWallet payment note if
              available.
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-pet-muted">Pet</span>
            <span className="font-bold text-pet-ink">{petName}</span>
          </div>
        </div>

        {/* Order summary + proof submission */}
        <div className="grid gap-4">
          <div className="grid gap-2 rounded-[1.5rem] bg-pet-cream p-4">
            <SummaryRow label="Tag type" value={order.tagType} />
            <SummaryRow label="Design" value={order.shape} />
            <SummaryRow label="Recipient" value={order.delivery.recipientName} />
            <SummaryRow label="Delivery" value={deliverySummary} />
            <SummaryRow label="Total amount" value={order.estimatedPrice} />
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-bold text-pet-ink">
              Upload receipt or screenshot
            </span>
            <input
              accept="image/*,application/pdf"
              className="block w-full text-sm text-pet-muted file:mr-3 file:rounded-full file:border-0 file:bg-pet-teal file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
              onChange={(event) => {
                setProofName(event.target.files?.[0]?.name ?? "");
                setError("");
              }}
              required
              type="file"
            />
            <span className="text-xs font-semibold leading-5 text-pet-muted">
              Upload a payment receipt or screenshot so we can verify your
              order.
            </span>
            {proofName ? (
              <span className="text-xs font-semibold text-pet-sage">
                Attached: {proofName}
              </span>
            ) : null}
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-bold text-pet-ink">
              Bank/eWallet transaction ID (optional)
            </span>
            <input
              className="brand-input"
              onChange={(event) => setTransactionReference(event.target.value)}
              placeholder="Optional, e.g. DuitNow transaction ID"
              type="text"
              value={transactionReference}
            />
            <span className="text-xs font-semibold leading-5 text-pet-muted">
              Add this if it appears on your payment receipt.
            </span>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-bold text-pet-ink">
              Payment note (optional)
            </span>
            <input
              className="brand-input"
              onChange={(event) => setPaymentNote(event.target.value)}
              placeholder="Anything we should know about your payment"
              type="text"
              value={paymentNote}
            />
          </label>

          {error ? (
            <span className="text-xs font-bold text-[#a63c2e]">{error}</span>
          ) : null}

          <button
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-pet-teal bg-pet-teal px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#1570ef]/20 transition hover:bg-[#0f5fd0] disabled:cursor-wait disabled:opacity-70 sm:w-auto"
            disabled={isSubmitting}
            onClick={handleSubmit}
            type="button"
          >
            {isSubmitting ? "Submitting..." : "Submit Payment Proof"}
          </button>
          <p className="text-xs leading-5 text-pet-muted">
            We will review your payment proof after you submit.{" "}
            {paymentConfig.supportText}
          </p>
        </div>
      </div>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="font-semibold text-pet-muted">{label}</span>
      <span className="break-words text-right font-bold text-pet-ink">
        {value}
      </span>
    </div>
  );
}
