"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { getMerchantListing, type AdminBranch } from "@/services/merchantDirectoryService";
import { readStoredAuthSession } from "@/services/authStorage";
import * as api from "@/services/adminConsignmentService";
import { primaryButton, secondaryButton } from "../shared";
import type { SkuOption } from "./context";
import { errorMessage, percentLabel } from "./model";
import type { ConsignmentActions } from "./useConsignmentActions";
import { Callout, SelectField, TextField, textButton } from "./ui";

const emptyLines = () => [{ productVariantId: "", quantity: 100 }];

function storageKey() {
  return `mypetlink_consignment_submission:${readStoredAuthSession()?.user.id ?? "local"}`;
}

function branchDestination(b: AdminBranch) {
  return [b.name, b.address.addressLine1, b.address.addressLine2, b.address.postcode, b.address.city, b.address.state, b.address.country]
    .filter((v) => v?.trim())
    .map((v) => v!.trim())
    .join(", ");
}

/**
 * Reserves inspected, available tags for an approved agreement. The form stays
 * filled while the dialog is closed, and a resubmitted identical request reuses
 * its submission reference so a refresh can never reserve twice.
 */
export function ReserveStockDialog({
  open,
  initialAgreementId,
  agreements,
  skus,
  actions,
  onClose,
  onReserved,
}: {
  open: boolean;
  initialAgreementId: string | null;
  agreements: api.Agreement[];
  skus: SkuOption[];
  actions: ConsignmentActions;
  onClose: () => void;
  onReserved: (result: api.ConsignmentDispatch) => void;
}) {
  const [agreementId, setAgreementId] = useState("");
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [branchError, setBranchError] = useState("");
  const [branchId, setBranchId] = useState("");
  const [destination, setDestination] = useState("");
  const [tracker, setTracker] = useState("");
  const [lines, setLines] = useState(emptyLines);
  const [reviewing, setReviewing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const request = useRef<{ fingerprint: string; key: string } | null>(null);

  const approved = agreements.filter((a) => a.status === "Active");
  const agreement = approved.find((a) => a.id === agreementId) ?? null;
  const merchantId = agreement?.merchantId;

  function chooseAgreement(id: string) {
    const chosen = approved.find((a) => a.id === id);
    setAgreementId(id);
    setBranchId("");
    setDestination("");
    // Branches belong to the merchant; another agreement with the same partner keeps them.
    if (chosen?.merchantId !== merchantId) setBranches([]);
    setReviewing(false);
    if (chosen?.externalTrackerReference) setTracker(chosen.externalTrackerReference);
  }

  // Opening from an agreement preselects it, unless the form already holds another one.
  const [seenOpen, setSeenOpen] = useState(false);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) {
      setMessage("");
      setFormError("");
      setReviewing(false);
      setConfirmClear(false);
      if (initialAgreementId && initialAgreementId !== agreementId && approved.some((a) => a.id === initialAgreementId)) {
        chooseAgreement(initialAgreementId);
      }
    }
  }

  useEffect(() => {
    if (!merchantId) return;
    let active = true;
    getMerchantListing(merchantId)
      .then((r) => {
        if (!active) return;
        setBranches(r.branches.filter((b) => b.isActive));
        setBranchError("");
      })
      .catch((e) => {
        if (active) setBranchError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [merchantId]);

  const quantity = lines.reduce((n, l) => n + (Number.isFinite(l.quantity) ? l.quantity : 0), 0);

  function review() {
    setFormError("");
    setMessage("");
    if (!agreementId || !branchId || !tracker.trim()) {
      setFormError("Choose the approved agreement and delivery branch, and enter the external tracker reference.");
      return;
    }
    if (lines.some((l) => !l.productVariantId || !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 1000)) {
      setFormError("Choose a tag option and a whole quantity from 1 to 1,000 on every line.");
      return;
    }
    setReviewing(true);
  }

  function reserve() {
    const content = { agreementId, merchantBranchId: branchId, destination, externalTrackerReference: tracker, lines };
    const fingerprint = JSON.stringify(content);
    const key = storageKey();
    try {
      const previous = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as typeof request.current;
      if (previous?.fingerprint === fingerprint) request.current = previous;
    } catch {
      /* A stale local draft does not authorize a stock change. */
    }
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    try {
      window.sessionStorage.setItem(key, JSON.stringify(request.current));
    } catch {
      setFormError("Your browser could not retain this submission reference. Enable session storage before reserving stock.");
      return;
    }
    const submission = { ...content, idempotencyKey: request.current.key };
    setFormError("");
    void actions.work(
      async () => {
        const result = await api.reserveConsignment(submission);
        onReserved(result);
        return result.reservationReused
          ? `Existing reservation ${result.dispatchNumber} reopened. No additional tags were reserved.`
          : `Reservation ${result.dispatchNumber} created. Confirm dispatch once the tags are sent.`;
      },
      "Reservation recorded.",
      // The dialog stays open on a refusal, so the reason belongs inside it.
      { onError: (message) => setFormError(`${message} Nothing was reserved; your entries are kept.`) }
    );
  }

  function clear() {
    request.current = null;
    try {
      window.sessionStorage.removeItem(storageKey());
    } catch {
      /* Nothing stored to clear. */
    }
    setAgreementId("");
    setBranchId("");
    setDestination("");
    setBranches([]);
    setTracker("");
    setLines(emptyLines());
    setReviewing(false);
    setConfirmClear(false);
    setFormError("");
    setMessage("Reservation form cleared. Existing reservations are unchanged.");
  }

  if (!open) return null;

  const busy = actions.busy;
  const footer = confirmClear ? (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold text-slate-700">
        Clear this form? This clears the form only. Matching active reservations will still reopen without reserving additional tags.
      </p>
      <div className="flex gap-2">
        <button className={secondaryButton} onClick={() => setConfirmClear(false)} type="button">
          Keep
        </button>
        <button className={primaryButton} onClick={clear} type="button">
          Clear form
        </button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2">
        {reviewing ? (
          <button className={secondaryButton} disabled={busy} onClick={() => setReviewing(false)} type="button">
            Back
          </button>
        ) : (
          <button className={textButton} disabled={busy} onClick={() => setConfirmClear(true)} type="button">
            Clear reservation form
          </button>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button className={secondaryButton} disabled={busy} onClick={onClose} type="button">
          Close
        </button>
        {reviewing ? (
          <button className={primaryButton} disabled={busy} onClick={reserve} type="button">
            {busy ? "Reserving…" : "Reserve tags"}
          </button>
        ) : (
          <button className={primaryButton} disabled={busy} onClick={review} type="button">
            Review reservation
          </button>
        )}
      </div>
    </div>
  );

  return (
    <FormDialog
      closeOnBackdrop={false}
      description="Only inspected, available tags are selected. Existing customer reservations are protected. No payment, invoice or commission is created."
      eyebrow="Stock custody"
      footer={footer}
      maxWidthClassName="sm:max-w-2xl"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
      open
      title={reviewing ? "Review reservation" : "Reserve consignment stock"}
    >
      <div className="grid gap-4">
        {message ? (
          <p className="text-sm font-bold text-[#166b48]" role="status">
            {message}
          </p>
        ) : null}
        {reviewing && agreement ? (
          <div className="grid gap-4">
            <Callout title={`${quantity} tags will leave central availability`} tone="warning">
              They are held for {agreement.merchantName} until dispatch is confirmed or the reservation is cancelled.
            </Callout>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <ReviewRow label="Agreement">
                {agreement.reference} v{agreement.version} · {percentLabel(agreement.partnerCommissionPercentage)} partner commission
              </ReviewRow>
              <ReviewRow label="External tracker">{tracker}</ReviewRow>
              <ReviewRow label="Deliver to" wide>
                {destination}
              </ReviewRow>
              {lines.map((line, i) => (
                <ReviewRow key={i} label={`Tag option ${i + 1}`} wide>
                  {skus.find((s) => s.id === line.productVariantId)?.label ?? "—"} × {line.quantity}
                </ReviewRow>
              ))}
            </dl>
          </div>
        ) : (
          <>
            {approved.length === 0 ? (
              <Callout tone="warning">
                No approved agreements are available. Approve an agreement before reserving stock.
              </Callout>
            ) : null}
            <SelectField
              emptyLabel="Choose agreement"
              label="Approved agreement"
              onChange={chooseAgreement}
              options={approved.map((a) => ({ value: a.id, label: `${a.merchantName} · ${a.reference} v${a.version}` }))}
              requirement="required"
              value={agreementId}
            />
            <SelectField
              disabled={!agreementId}
              emptyLabel={agreementId ? "Choose an active merchant branch" : "Choose an agreement first"}
              error={branchError || undefined}
              hint={destination || (agreementId && branches.length === 0 ? "Create or confirm the merchant’s physical branch before reserving stock." : undefined)}
              label="Delivery branch"
              onChange={(value) => {
                setBranchId(value);
                const b = branches.find((x) => x.id === value);
                setDestination(b ? branchDestination(b) : "");
              }}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
              requirement="required"
              value={branchId}
            />
            <TextField
              hint="Prefilled from the agreement when one is recorded."
              label="External tracker reference"
              onChange={setTracker}
              requirement="required"
              value={tracker}
            />
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-sm font-black text-slate-800">Tags to reserve</legend>
              {lines.map((line, i) => (
                <div className="grid items-end gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto]" key={i}>
                  <SelectField
                    emptyLabel={skus.length ? "Choose tag option" : "No sellable tag options"}
                    label={`Tag option ${i + 1}`}
                    onChange={(value) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, productVariantId: value } : l)))}
                    options={skus.map((s) => ({ value: s.id, label: s.label }))}
                    value={line.productVariantId}
                  />
                  <TextField
                    inputMode="numeric"
                    label={`Quantity ${i + 1}`}
                    max="1000"
                    min="1"
                    onChange={(value) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, quantity: Number(value) } : l)))}
                    step="1"
                    type="number"
                    value={String(line.quantity)}
                  />
                  {lines.length > 1 ? (
                    <button className={`${secondaryButton} !min-h-11`} onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))} type="button">
                      Remove line {i + 1}
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                className={`${textButton} justify-self-start`}
                onClick={() => setLines((ls) => [...ls, { productVariantId: "", quantity: 1 }])}
                type="button"
              >
                + Add tag option
              </button>
            </fieldset>
          </>
        )}
        {formError ? (
          <div className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]" role="alert">
            {formError}
          </div>
        ) : null}
      </div>
    </FormDialog>
  );
}

function ReviewRow({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl bg-slate-50 px-3 py-2.5 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[0.68rem] font-extrabold uppercase text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words font-bold text-slate-900">{children}</dd>
    </div>
  );
}
