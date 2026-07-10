"use client";

import { useState } from "react";
import { AdminActionButton } from "@/components/admin/AdminPanels";
import { canDownloadPaymentReceipt, formatOrderNumber } from "@/lib/orders";
import {
  downloadAdminOrderReceiptPdf,
  downloadAdminOrderSummaryPdf,
} from "@/services/orderDocuments";
import { getFriendlyTagErrorMessage } from "@/services/tagService";
import type { TagOrder } from "@/types";

// Admin support/accounting PDF downloads for an order. Order Summary is always
// available; the Official Receipt appears only after payment is confirmed
// (the backend also enforces this).
export function OrderDocumentButtons({
  order,
  heading = "Documents",
}: {
  order: TagOrder;
  heading?: string;
}) {
  const [busy, setBusy] = useState<"summary" | "receipt" | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const orderNumber = formatOrderNumber(order);
  const receiptReady = canDownloadPaymentReceipt(order);

  async function download(kind: "summary" | "receipt") {
    if (busy) {
      return;
    }

    setBusy(kind);
    setMessage("");
    setError("");

    try {
      if (kind === "receipt") {
        await downloadAdminOrderReceiptPdf(order.id, orderNumber);
        setMessage("Receipt PDF downloaded.");
      } else {
        await downloadAdminOrderSummaryPdf(order.id, orderNumber);
        setMessage("Order Summary PDF downloaded.");
      }

      window.setTimeout(() => setMessage(""), 2500);
    } catch (caught) {
      setError(getFriendlyTagErrorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mt-3">
      {heading ? (
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">
          {heading}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <AdminActionButton
          disabled={busy === "summary"}
          onClick={() => void download("summary")}
        >
          {busy === "summary" ? "Preparing..." : "Download Order Summary PDF"}
        </AdminActionButton>
        {receiptReady ? (
          <AdminActionButton
            disabled={busy === "receipt"}
            onClick={() => void download("receipt")}
            tone="primary"
          >
            {busy === "receipt" ? "Preparing..." : "Download Receipt PDF"}
          </AdminActionButton>
        ) : null}
      </div>
      {message ? (
        <p className="mt-2 text-xs font-bold text-[#1b4f9c]">{message}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs font-bold text-[#a63c2e]">{error}</p> : null}
    </div>
  );
}
