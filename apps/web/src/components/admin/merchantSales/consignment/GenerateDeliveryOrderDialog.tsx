"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SignaturePreview } from "@/components/admin/AdminDocumentSignatureManager";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { adminCapabilities, hasCapability } from "@/lib/adminCapabilities";
import { adminRoutes } from "@/lib/routes";
import { getAdminCapabilities } from "@/services/authService";
import * as api from "@/services/adminConsignmentService";
import {
  getDocumentSignature,
  getDocumentSignatureImage,
  type DocumentSignature,
} from "@/services/adminDocumentSignatureService";
import { secondaryButton } from "../shared";
import { errorMessage } from "./model";
import type { ConsignmentActions } from "./useConsignmentActions";

type SignatureState = { state: "loading" } | { state: "none" } | { state: "unavailable" } | { state: "ready"; signature: DocumentSignature; url: string | null };

/**
 * Generating a Delivery Order, with a preview first. Delivered By is left for a
 * handwritten signature unless the person generating it chooses to sign it with
 * their own signature and confirms that they are signing. Received By is always
 * left for the partner.
 */
export function GenerateDeliveryOrderDialog({
  dispatch: d,
  open,
  actions,
  onClose,
  onIssued,
}: {
  dispatch: api.ConsignmentDispatch;
  open: boolean;
  actions: ConsignmentActions;
  onClose: () => void;
  onIssued: (order: api.DeliveryOrderSummary) => void;
}) {
  const canSign = hasCapability(getAdminCapabilities(), adminCapabilities.documentSignatureManage);
  const [signature, setSignature] = useState<SignatureState>({ state: "loading" });
  const [sign, setSign] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [problem, setProblem] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const busy = actions.busy || previewing;

  // Mounted fresh for each opening, so a choice or confirmation is never carried over.
  useEffect(() => {
    if (!open || !canSign) return;
    let cancelled = false;
    let url: string | null = null;
    void (async () => {
      try {
        const status = await getDocumentSignature();
        if (!status.signature) {
          if (!cancelled) setSignature({ state: "none" });
          return;
        }
        try {
          url = URL.createObjectURL(await getDocumentSignatureImage());
        } catch {
          url = null;
        }
        if (!cancelled) setSignature({ state: "ready", signature: status.signature, url });
      } catch {
        if (!cancelled) setSignature({ state: "unavailable" });
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, canSign]);

  const ready = signature.state === "ready" ? signature.signature : null;
  const signing = sign && ready !== null;
  const delivered = d.units.length;

  async function preview() {
    setProblem("");
    setPreviewing(true);
    try {
      await api.previewDeliveryOrder(d.id, signing ? ready.id : undefined);
    } catch (caught) {
      setProblem(errorMessage(caught));
    } finally {
      setPreviewing(false);
    }
  }

  function generate() {
    if (busy) return;
    if (signing && !confirmed) {
      setProblem("Confirm that you are signing this Delivery Order, or choose to leave it unsigned.");
      return;
    }
    void actions.work(
      async () => {
        const order = signing
          ? await api.issueDeliveryOrder(d.id, { signatureId: ready.id, confirmed: true })
          : await api.issueDeliveryOrder(d.id);
        // Issued: from here the dialog is done, whatever happens to the download.
        onIssued(order);
        onClose();
        const number = order.deliveryOrderNumber;
        try {
          await api.downloadConsignment(d.id, "delivery-order.pdf");
        } catch {
          return `Delivery Order ${number} ${order.signatoryName ? "signed and generated" : "generated"}. It couldn’t be downloaded just now; use Download DO to save it.`;
        }
        return order.signatoryName ? `Delivery Order ${number} signed, generated and downloaded.` : `Delivery Order ${number} generated and downloaded.`;
      },
      "Delivery Order generated.",
      { refresh: false, onError: setProblem, keepOpenOnError: true }
    );
  }

  return (
    <ConfirmDialog
      confirmDisabled={busy || (signing && !confirmed)}
      confirmLabel={signing ? "Sign and generate DO" : "Generate DO"}
      message={`${d.dispatchNumber} · ${d.merchantName}. The Delivery Order lists the ${delivered} ${
        delivered === 1 ? "tag" : "tags"
      } dispatched on this delivery by SKU. Its number and contents are fixed once generated; downloading it again returns the same document. No stock is moved.`}
      onCancel={() => {
        if (!busy) onClose();
      }}
      onConfirm={generate}
      open={open}
      title="Generate Delivery Order?"
    >
      <div className="grid gap-4">
        {problem ? (
          <div className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]" role="alert">
            {problem}
          </div>
        ) : null}
        {canSign ? (
          <fieldset className="grid gap-3 rounded-2xl border border-slate-200 p-4">
            <legend className="px-1 text-sm font-black text-slate-900">Delivered By</legend>
            <label className="flex items-start gap-3 text-sm font-semibold text-slate-800">
              <input
                checked={!sign}
                className="mt-1 h-4 w-4 shrink-0"
                name="delivery-order-signing"
                onChange={() => { setSign(false); setConfirmed(false); setProblem(""); }}
                type="radio"
                value="unsigned"
              />
              <span>Leave unsigned. Both parties sign the printed copies by hand.</span>
            </label>
            <label className="flex items-start gap-3 text-sm font-semibold text-slate-800">
              <input
                checked={sign}
                className="mt-1 h-4 w-4 shrink-0"
                disabled={!ready}
                name="delivery-order-signing"
                onChange={() => { setSign(true); setProblem(""); }}
                type="radio"
                value="signed"
              />
              <span>
                Sign Delivered By with my signature
                {ready ? <span className="block text-xs font-semibold text-slate-500">{ready.signatoryName}, {ready.signatoryPosition}</span> : null}
              </span>
            </label>
            {signature.state === "loading" ? <p className="text-xs font-semibold text-slate-500">Checking for your signature...</p> : null}
            {signature.state === "none" ? (
              <p className="text-xs font-semibold text-slate-500">
                You don’t have a signature on file. <Link className="underline" href={adminRoutes.documentSignature}>Add your signature</Link> to sign Delivery Orders.
              </p>
            ) : null}
            {signature.state === "unavailable" ? (
              <p className="text-xs font-semibold text-slate-500">Your signature couldn’t be loaded right now. You can still generate an unsigned Delivery Order.</p>
            ) : null}
            {signing ? (
              <div className="grid gap-3 rounded-xl border border-[#f6dfae] bg-[#fdf6e7] p-3">
                <SignaturePreview alt="Your signature" caption="Added to Delivered By only. Received By stays blank for the partner." url={signature.state === "ready" ? signature.url : null} />
                <label className="flex items-start gap-3 text-sm font-bold text-slate-800">
                  <input
                    checked={confirmed}
                    className="mt-1 h-4 w-4 shrink-0"
                    onChange={(event) => { setConfirmed(event.target.checked); setProblem(""); }}
                    type="checkbox"
                  />
                  <span>
                    I, {ready.signatoryName}, am signing this Delivery Order as {ready.signatoryPosition} for MyPetLink. Once
                    generated, the signed Delivery Order can’t be changed.
                  </span>
                </label>
              </div>
            ) : null}
          </fieldset>
        ) : (
          <p className="text-sm font-semibold text-slate-600">Delivered By and Received By are left blank for both parties to sign by hand.</p>
        )}
        <div>
          <button className={secondaryButton} disabled={busy} onClick={() => void preview()} type="button">
            {previewing ? "Preparing preview..." : signing ? "Preview signed DO" : "Preview DO"}
          </button>
          <p className="mt-2 text-xs font-semibold text-slate-500">A preview is marked as not issued and doesn’t use a Delivery Order number.</p>
        </div>
      </div>
    </ConfirmDialog>
  );
}
