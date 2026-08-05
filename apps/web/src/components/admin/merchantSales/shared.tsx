"use client";

import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { adminRoutes } from "@/lib/routes";
import {
  downloadMerchantDocument,
  getDocumentErrorMessage,
  type MerchantDocumentEmailStatus,
  type MerchantDocumentKind,
} from "@/services/adminMerchantBillingService";

// Presentation shared by every Merchant Sales panel. Nothing here decides a
// business rule; it only renders what the server already said.

export function money(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function shortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(parsed));
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(parsed));
}

/** Optional values read better as a stated absence than as a blank cell. */
export function orNotProvided(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : "Not provided";
}

/** The term merchants see. "Prepaid" is our internal word for it. */
export function paymentTermLabel(term: string): string {
  return term === "Prepaid" || term === "Due on receipt" ? "Due on receipt" : term;
}

export function addressLines(address: {
  addressLine1: string;
  addressLine2?: string | null;
  postcode: string;
  city: string;
  state: string;
  country: string;
}): string[] {
  const locality = [address.postcode, address.city]
    .filter((part) => part && part.trim().length > 0)
    .join(" ");

  return [
    address.addressLine1,
    address.addressLine2 ?? "",
    locality,
    address.state,
    address.country,
  ].filter((line) => line && line.trim().length > 0);
}

export function capabilityLabel(supportsQr: boolean, supportsNfc: boolean): string {
  if (supportsQr && supportsNfc) return "QR + NFC Smart Tag";
  if (supportsNfc) return "NFC Smart Tag";
  return "QR Pet Tag";
}

// --- Status presentation ---------------------------------------------------

type Tone = "warm" | "mint" | "teal" | "soft" | "danger";

const quotationTones: Record<string, Tone> = {
  Draft: "soft",
  Sent: "teal",
  Accepted: "mint",
  Converted: "mint",
  Rejected: "danger",
  Expired: "warm",
  Cancelled: "soft",
};

export function QuotationStatusBadge({ status }: { status: string }) {
  return <Badge tone={quotationTones[status] ?? "soft"}>{status}</Badge>;
}

const invoiceTones: Record<string, Tone> = {
  Draft: "soft",
  Issued: "teal",
  Paid: "mint",
  Cancelled: "danger",
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  return <Badge tone={invoiceTones[status] ?? "soft"}>{status}</Badge>;
}

export function paymentStatusLabel(status: string): string {
  switch (status) {
    case "AwaitingPayment":
      return "Awaiting payment";
    case "PaymentConfirmed":
      return "Payment confirmed";
    default:
      return status;
  }
}

export function MerchantOrderStatusBadge({ status }: { status: string }) {
  const tone: Tone =
    status === "PaymentConfirmed" ? "mint" : status === "Cancelled" ? "danger" : "teal";
  return <Badge tone={tone}>{paymentStatusLabel(status)}</Badge>;
}

/**
 * Email state, in words. Queued is never presented as delivered, and the state
 * is never carried by colour alone.
 */
export function EmailStatusBadge({
  status,
  globalPauseHint = false,
}: {
  status: MerchantDocumentEmailStatus | undefined;
  globalPauseHint?: boolean;
}) {
  if (!status) {
    return <Badge tone="soft">Not sent yet</Badge>;
  }

  if (status.status === "Suppressed") {
    return (
      <Badge tone="warm">
        {status.suppressionReason === "TemplateDisabled"
          ? "Held — template off"
          : "Held"}
      </Badge>
    );
  }

  switch (status.status) {
    case "Sent":
      return <Badge tone="mint">Sent</Badge>;
    case "Failed":
      return <Badge tone="danger">Failed</Badge>;
    case "Sending":
      return <Badge tone="teal">Sending</Badge>;
    default:
      return (
        <Badge tone="teal">{globalPauseHint ? "Queued — delivery paused" : "Queued"}</Badge>
      );
  }
}

export function emailStatusDetail(
  status: MerchantDocumentEmailStatus | undefined
): string {
  if (!status) return "No email has been queued for this document yet.";

  switch (status.status) {
    case "Sent":
      return `Sent to ${status.recipientEmail} on ${dateTime(status.sentAt)}.`;
    case "Suppressed":
      return status.suppressionReason === "TemplateDisabled"
        ? `Recorded for ${status.recipientEmail} but not sent: the template was switched off when it was queued. Switching the template on later will not release it.`
        : `Recorded for ${status.recipientEmail} but not eligible to send.`;
    case "Failed":
      return `Delivery to ${status.recipientEmail} failed.${
        status.canRetry ? " It will be retried automatically." : ""
      }`;
    case "Sending":
      return `Being delivered to ${status.recipientEmail} now.`;
    default:
      return `Queued for ${status.recipientEmail}. Queued is not the same as delivered.`;
  }
}

// --- Business identity readiness ------------------------------------------

/**
 * Turns the server's "business_identity_incomplete" message into the exact
 * missing requirements plus a way to go and fix them.
 */
export function BusinessIdentityBlockedNotice({ message }: { message: string }) {
  const missing = message
    .replace(/^.*?:\s*/, "")
    .replace(/\.$/, "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return (
    <div
      className="rounded-2xl border border-[#ffd2c9] bg-[#fff2ef] p-4 text-sm text-[#a63c2e]"
      role="alert"
    >
      <p className="font-black">Business Identity is incomplete for Merchant documents.</p>
      {missing.length > 0 ? (
        <>
          <p className="mt-1 font-bold">Missing:</p>
          <ul className="mt-1 list-disc pl-5 font-semibold">
            {missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
      <Link
        className="mt-3 inline-flex min-h-10 items-center rounded-full border border-[#a63c2e] px-4 text-sm font-black"
        href={adminRoutes.businessIdentity}
      >
        Complete Business Identity
      </Link>
    </div>
  );
}

export function isBusinessIdentityMessage(message: string): boolean {
  return message.toLowerCase().includes("complete the business identity");
}

// --- Document download -----------------------------------------------------

const documentLabels: Record<MerchantDocumentKind, string> = {
  quotation: "Download Quotation",
  invoice: "Download Invoice",
  receipt: "Download Receipt",
};

/**
 * Downloads through the authorized endpoint. The button disables itself while
 * the request is in flight, so a repeated click cannot start a second one.
 */
export function DocumentDownloadButton({
  kind,
  id,
  onError,
  variant = "secondary",
}: {
  kind: MerchantDocumentKind;
  id: string;
  onError: (message: string) => void;
  variant?: "primary" | "secondary";
}) {
  const [busy, setBusy] = useState(false);

  const download = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    onError("");
    try {
      await downloadMerchantDocument(kind, id);
    } catch (caught) {
      onError(
        getDocumentErrorMessage(caught, "We couldn’t prepare that document. Please try again.")
      );
    } finally {
      setBusy(false);
    }
  }, [busy, id, kind, onError]);

  return (
    <button
      className={
        variant === "primary"
          ? "min-h-11 rounded-full bg-pet-teal px-4 text-sm font-black text-white disabled:opacity-50"
          : "min-h-11 rounded-full border border-pet-border bg-white px-4 text-sm font-black text-pet-ink disabled:opacity-50"
      }
      data-testid={`download-${kind}`}
      disabled={busy}
      onClick={() => void download()}
      type="button"
    >
      {busy ? "Preparing…" : documentLabels[kind]}
    </button>
  );
}

// --- Small layout helpers --------------------------------------------------

export function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>;
}

export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2.5">
      <dt className="text-[0.68rem] font-extrabold uppercase text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-bold text-slate-900">{children}</dd>
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      className="rounded-2xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]"
      role="alert"
    >
      {message}
    </div>
  );
}

/** A restrained live region: assertive announcements are reserved for errors. */
export function StatusMessage({ message }: { message: string }) {
  return (
    <p aria-live="polite" className="text-sm font-bold text-[#1b4f9c]" role="status">
      {message}
    </p>
  );
}

/**
 * Option pickers load one page of choices. The API caps a page at 100, so
 * asking for more is a validation failure, not a bigger list.
 */
export const OPTION_PAGE_SIZE = 100;

export const fieldClass =
  "min-h-11 w-full rounded-xl border border-pet-border bg-white px-3 font-semibold text-pet-ink outline-none focus:border-pet-teal disabled:bg-slate-100";

export const primaryButton =
  "min-h-11 rounded-full bg-pet-teal px-5 text-sm font-black text-white disabled:opacity-50";

export const secondaryButton =
  "min-h-11 rounded-full border border-pet-border bg-white px-4 text-sm font-black text-pet-ink disabled:cursor-not-allowed disabled:opacity-50";
