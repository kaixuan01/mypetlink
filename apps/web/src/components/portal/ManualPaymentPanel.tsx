"use client";

import { useRef, useState } from "react";
import { OrderPriceBreakdown, priceLinesFromOrder } from "@/components/orders/OrderPriceBreakdown";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { paymentConfig } from "@/config/payment";
import { formatDeliverySummary, formatOrderNumber } from "@/lib/orders";
import { canUseApi } from "@/services/apiConfig";
import { uploadMediaFile } from "@/services/mediaService";
import {
  getFriendlyTagErrorMessage,
  submitOrderPayment,
} from "@/services/tagService";
import type { TagOrder } from "@/types";

type MerchantQrStatus = "loading" | "available" | "unavailable";

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
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(() => expectedPaymentAmount(order).toFixed(2));
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [qrStatus, setQrStatus] = useState<MerchantQrStatus>(
    paymentConfig.merchantQrImage ? "loading" : "unavailable"
  );
  const [qrRetry, setQrRetry] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const paymentReference = formatOrderNumber(order);
  const deliverySummary = formatDeliverySummary(order);
  const amountPayable = `${order.currency ?? "MYR"} ${expectedPaymentAmount(order).toFixed(2)}`;
  const qrAvailable = qrStatus === "available";
  const merchantQrSource = qrRetry
    ? `${paymentConfig.merchantQrImage}?retry=${qrRetry}`
    : paymentConfig.merchantQrImage;

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
    if (!qrAvailable) {
      setError("DuitNow payment is temporarily unavailable. Please try again later.");
      return;
    }
    if (!isValidPaymentAmount(paymentAmount)) {
      setError("Enter the payment amount using up to two decimal places.");
      return;
    }
    if (!proofName.trim()) {
      setError(
        "Upload a receipt or screenshot so we can verify your payment."
      );
      return;
    }

    setError("");
    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      const uploadedProof = canUseApi()
        ? await uploadMediaFile({
            file: requireProofFile(proofFile),
            category: "OrderReceipt",
            orderId: order.id,
            onProgress: setUploadProgress,
          })
        : null;
      const response = await submitOrderPayment(order.id, {
        paymentReference: transactionReference,
        paymentNote,
        paymentProofName: proofName,
        submittedAmount: Number(paymentAmount),
        mediaFileId: uploadedProof?.mediaId,
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
    <section className="brand-card min-w-0 overflow-hidden rounded-[1.75rem] p-4 sm:p-6">
      <Badge tone="warm">Pending payment</Badge>
      <h2 className="mt-4 text-2xl font-black text-pet-ink sm:text-3xl">
        Pay by QR
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-pet-muted">
        {paymentConfig.instructions}
      </p>

      {order.paymentRejectionReason ? (
        <div className="mt-4 rounded-[1.25rem] border border-[#f4cf8a] bg-[#fdf3df] px-4 py-3 text-sm font-semibold leading-6 text-[#9a6b18]">
          Your previous payment proof needs another look. Reason:{" "}
          {order.paymentRejectionReason} Please upload a clearer receipt or
          screenshot below and submit again.
        </div>
      ) : null}

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2 lg:items-start">
        {/* Merchant QR + payment reference */}
        <div className="min-w-0 rounded-[1.5rem] border border-pet-border bg-pet-cream p-4 sm:p-5">
          <p className="text-center text-xs font-black uppercase tracking-wide text-pet-muted">
            {paymentConfig.merchantQrLabel}
          </p>
          <div className="mx-auto mt-4 grid w-full max-w-[260px] place-items-center overflow-hidden rounded-[1.25rem] border border-pet-border bg-white p-2">
            {paymentConfig.merchantQrImage && qrStatus !== "unavailable" ? (
              <a aria-label="Open a larger view of the merchant DuitNow QR code" className="block w-full" href={paymentConfig.merchantQrImage} rel="noopener noreferrer" target="_blank">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="GBB Software Solutions DuitNow merchant QR code"
                  className="h-auto w-full object-contain"
                  key={merchantQrSource}
                  onLoad={() => setQrStatus("available")}
                  onError={() => {
                    setQrStatus("unavailable");
                    console.error("Merchant payment QR failed to load.");
                  }}
                  src={merchantQrSource}
                />
              </a>
            ) : (
              <div className="grid min-h-48 place-items-center gap-2 p-4 text-center text-pet-muted" role="alert">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-pet-cream text-pet-teal">
                  <Icon name="qr" className="h-6 w-6" />
                </span>
                <span className="text-sm font-bold">
                  DuitNow payment is temporarily unavailable. Please try again later.
                </span>
                {paymentConfig.merchantQrImage ? (
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-pet-teal bg-white px-4 text-sm font-bold text-pet-teal"
                    onClick={() => {
                      setQrStatus("loading");
                      setQrRetry((current) => current + 1);
                    }}
                    type="button"
                  >
                    Try QR again
                  </button>
                ) : null}
              </div>
            )}
          </div>
          <p aria-live="polite" className="mt-2 text-center text-xs font-semibold text-pet-muted">
            {qrStatus === "loading"
              ? "Checking DuitNow payment availability…"
              : qrStatus === "available"
                ? "DuitNow QR is ready to scan."
                : "Payment proof submission is unavailable until the DuitNow QR can be loaded."}
          </p>

          <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-pet-muted">
              Amount to pay
            </span>
            <span className="break-words text-right text-lg font-black text-pet-ink">
              {amountPayable}
            </span>
          </div>

          <div className="mt-3 rounded-[1.25rem] bg-white p-3">
            <label
              className="text-xs font-extrabold uppercase text-pet-muted"
              htmlFor={`payment-reference-${order.id}`}
            >
              Payment Reference
            </label>
            <div className="mt-1 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <input
                className="min-w-0 flex-1 break-all rounded-2xl border border-pet-border bg-pet-cream px-3 py-2 text-sm font-black text-pet-ink"
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

          <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-pet-muted">Pet</span>
            <span className="font-bold text-pet-ink">{petName}</span>
          </div>
        </div>

        {/* Order summary + proof submission */}
        <div className="grid min-w-0 gap-4">
          <div className="grid gap-3 rounded-[1.5rem] bg-pet-cream p-4">
            <SummaryRow label="Recipient" value={order.delivery.recipientName} />
            <SummaryRow label="Delivery" value={deliverySummary} />
          </div>
          <OrderPriceBreakdown
            currency={order.currency}
            deliveryFee={order.deliveryFee ?? 0}
            deliveryMethod={order.delivery.deliveryMethod}
            discountTotal={order.discountTotal}
            freeDeliveryReason={order.delivery.freeDeliveryReason}
            lines={priceLinesFromOrder(order)}
            merchandiseSubtotal={order.merchandiseSubtotal}
            total={order.totalAmount ?? expectedPaymentAmount(order)}
          />

          <label className="grid gap-2" htmlFor={`payment-amount-${order.id}`}>
            <span className="text-sm font-bold text-pet-ink">Payment amount</span>
            <span className="text-xs font-semibold text-pet-muted">Expected amount: {amountPayable}</span>
            <input className="brand-input" id={`payment-amount-${order.id}`} inputMode="decimal" min="0.01" onChange={(event) => { setPaymentAmount(event.target.value); setError(""); }} required step="0.01" type="number" value={paymentAmount} />
            <span className="text-xs font-semibold leading-5 text-pet-muted">Confirm the exact amount shown on your payment receipt. Our team will still verify the payment.</span>
          </label>

          <div className="grid gap-2">
            <span className="text-sm font-bold text-pet-ink">
              Upload receipt or screenshot
            </span>
            <input
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              id={`payment-proof-${order.id}`}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setProofFile(file);
                setProofName(file?.name ?? "");
                setUploadProgress(0);
                setError("");
              }}
              required
              ref={fileInputRef}
              type="file"
            />
            <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-dashed border-pet-border bg-pet-cream p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="break-all text-sm font-bold text-pet-ink">{proofName || "No receipt selected"}</p>
                <p className="mt-1 text-xs font-semibold text-pet-muted">JPEG, PNG, WebP, or PDF · maximum 10 MB</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-pet-teal px-4 text-sm font-bold text-white" htmlFor={`payment-proof-${order.id}`}>{proofName ? "Change Receipt" : "Select Receipt"}</label>
                {proofName ? <button className="inline-flex min-h-11 items-center justify-center rounded-full border border-pet-border bg-white px-4 text-sm font-bold text-pet-ink" onClick={() => { setProofFile(null); setProofName(""); setUploadProgress(0); if (fileInputRef.current) fileInputRef.current.value = ""; }} type="button">Remove</button> : null}
              </div>
            </div>
            <span className="text-xs font-semibold leading-5 text-pet-muted">
              Upload a payment receipt or screenshot so we can verify your
              order.
            </span>
            {proofName ? (
              <span className="text-xs font-semibold text-pet-sage">
                Attached: {proofName}
              </span>
            ) : null}
            {uploadProgress > 0 && uploadProgress < 100 ? (
              <span className="text-xs font-semibold text-pet-teal">
                Uploading: {uploadProgress}%
              </span>
            ) : null}
          </div>

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
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-pet-teal bg-pet-teal px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#1570ef]/20 transition hover:bg-[#0f5fd0] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            disabled={isSubmitting || !qrAvailable}
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

function requireProofFile(file: File | null) {
  if (!file) {
    throw new Error("Upload a receipt or screenshot so we can verify your payment.");
  }

  return file;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 text-sm">
      <span className="font-semibold text-pet-muted">{label}</span>
      <span className="min-w-0 max-w-full break-words text-right font-bold text-pet-ink">
        {value}
      </span>
    </div>
  );
}

function expectedPaymentAmount(order: TagOrder) {
  if (typeof order.totalAmount === "number") return order.totalAmount;
  const parsed = Number(order.estimatedPrice.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isValidPaymentAmount(value: string) {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.trim()) && Number(value) > 0;
}
