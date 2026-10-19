"use client";

import { useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminEmptyPanel } from "@/components/admin/AdminStatus";
import { FormDialog } from "@/components/ui/FormDialog";
import * as api from "@/services/adminConsignmentService";
import { primaryButton, secondaryButton, shortDate } from "../shared";
import type { ConsignmentContext } from "./context";
import { dateInputValue, dayAfterIso, errorMessage, ringgit, startOfDayIso } from "./model";
import { Callout, DateField, SelectField, StatusPill, TextField, dangerButton, textButton } from "./ui";

/**
 * The selling prices and promotions a partner may use under one agreement
 * version. Sales reports can only be verified at an approved price.
 */
export function PriceTermsCard({ context, agreement }: { context: ConsignmentContext; agreement: api.Agreement }) {
  const [terms, setTerms] = useState<api.PriceTerm[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<api.PriceTerm | "new" | null>(null);
  const [ending, setEnding] = useState<api.PriceTerm | null>(null);
  const { reloadKey, can, actions, policy } = context;
  const open = agreement.status !== "Closed";

  useEffect(() => {
    let active = true;
    api
      .listPriceTerms(agreement.id)
      .then((value) => {
        if (!active) return;
        setTerms(value);
        setError("");
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [agreement.id, reloadKey]);

  const approve = (term: api.PriceTerm) =>
    actions.request({
      title: "Approve this selling price?",
      message: `${term.sku} · ${term.kind === "Standard" ? "standard price" : term.name} · ${ringgit(term.unitNetPrice)}. Sales at this price can then be verified. Approve only a price the partner has agreed to.`,
      allowSelfReview: policy?.canSelfReview,
      selfReviewEvidence: term.approvalEvidenceReference ?? "",
      confirmLabel: "Approve price",
      run: async ({ selfReview }) => {
        await api.priceTermAction(term, "approve", { selfReview });
        return `${term.sku} price approved.`;
      },
    });

  const withdraw = (term: api.PriceTerm) =>
    actions.request({
      title: "Withdraw this draft price?",
      message: `${term.sku} · ${ringgit(term.unitNetPrice)}. The draft is kept in history as withdrawn.`,
      destructive: true,
      confirmLabel: "Withdraw draft",
      run: async () => {
        await api.priceTermAction(term, "withdraw");
        return "Draft price withdrawn.";
      },
    });

  const copy = () =>
    void actions.work(async () => {
      await api.copyPriceTerms(agreement.supersedesAgreementId!, agreement.id);
      return "The previous version’s approved prices were copied as drafts. Approve each one once the partner confirms it.";
    }, "Prices copied.");

  return (
    <AdminSection
      action={
        can.managePrices && open ? (
          <div className="flex flex-wrap gap-2">
            {agreement.supersedesAgreementId && terms?.length === 0 ? (
              <button className={secondaryButton} disabled={actions.busy} onClick={copy} type="button">
                Copy previous prices
              </button>
            ) : null}
            <button className={secondaryButton} disabled={actions.busy} onClick={() => setEditing("new")} type="button">
              Add price
            </button>
          </div>
        ) : undefined
      }
      compact
      description="Sales reports can only be verified at an approved price. Saving a price doesn’t mean the partner accepted it."
      title="Approved selling prices"
    >
      {error ? (
        <div className="p-4">
          <Callout role="alert" tone="critical">
            {error}
          </Callout>
        </div>
      ) : null}
      {terms === null && !error ? (
        <p className="p-4 text-sm font-semibold text-slate-500" role="status">
          Loading prices…
        </p>
      ) : null}
      {terms?.length === 0 ? (
        <AdminEmptyPanel
          compact
          description="Add the standard selling price for each tag option, and any promotion the partner agreed to."
          icon="tag"
          title="No selling prices yet"
        />
      ) : null}
      {terms && terms.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Price</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5">Applies</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {terms.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2.5 font-bold text-slate-900">{t.sku}</td>
                  <td className="px-4 py-2.5">{t.kind === "Standard" ? "Standard price" : `Promotion · ${t.name}`}</td>
                  <td className="px-4 py-2.5 text-right font-black">{ringgit(t.unitNetPrice)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {shortDate(t.validFrom)} – {t.validToExclusive ? shortDate(new Date(Date.parse(t.validToExclusive) - 1).toISOString()) : "agreement end"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPill tone={t.status === "Approved" ? "positive" : t.status === "Draft" ? "warning" : "neutral"}>
                      {t.status === "Draft" ? "Draft · not approved" : t.status}
                    </StatusPill>
                    {t.reviewMode ? <span className="mt-1 block text-[0.7rem] font-bold text-slate-500">{t.reviewMode}</span> : null}
                    {t.status === "Draft" && t.contributorHistoryComplete === false ? (
                      <span className="mt-1 block text-[0.7rem] font-bold text-[#a63c2e]">
                        Earlier edits weren’t recorded. Withdraw it and add the price again, or self-review it in Solo Mode.
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap justify-end gap-1">
                      {t.status === "Draft" && can.approve ? (
                        <button
                          className={textButton}
                          disabled={actions.busy || !t.approvalEvidenceReference || agreement.status !== "Active"}
                          onClick={() => approve(t)}
                          title={!t.approvalEvidenceReference ? "Record the partner’s acceptance first" : undefined}
                          type="button"
                        >
                          Approve
                        </button>
                      ) : null}
                      {t.status === "Draft" && can.managePrices ? (
                        <>
                          <button className={textButton} disabled={actions.busy} onClick={() => setEditing(t)} type="button">
                            Edit
                          </button>
                          <button className={textButton} disabled={actions.busy} onClick={() => withdraw(t)} type="button">
                            Withdraw
                          </button>
                        </>
                      ) : null}
                      {t.status === "Approved" && can.approve && open ? (
                        <button className={textButton} disabled={actions.busy} onClick={() => setEnding(t)} type="button">
                          End price
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {editing ? (
        <PriceTermDialog
          agreement={agreement}
          context={context}
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {ending ? <EndPriceDialog context={context} onClose={() => setEnding(null)} term={ending} /> : null}
    </AdminSection>
  );
}

function PriceTermDialog({
  context,
  agreement,
  existing,
  onClose,
}: {
  context: ConsignmentContext;
  agreement: api.Agreement;
  existing: api.PriceTerm | null;
  onClose: () => void;
}) {
  const [variantId, setVariantId] = useState(existing?.productVariantId ?? "");
  const [kind, setKind] = useState<api.PriceTermKind>(existing?.kind ?? "Standard");
  const [name, setName] = useState(existing?.kind === "Promotion" ? existing.name : "");
  const [price, setPrice] = useState(existing ? existing.unitNetPrice.toFixed(2) : "");
  const [from, setFrom] = useState(dateInputValue(existing?.validFrom ?? agreement.effectiveFrom ?? new Date().toISOString()));
  const [lastDay, setLastDay] = useState(existing?.validToExclusive ? dateInputValue(new Date(Date.parse(existing.validToExclusive) - 1).toISOString()) : "");
  const [evidence, setEvidence] = useState(existing?.approvalEvidenceReference ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState("");

  const skuOptions = context.skus.map((s) => ({ value: s.id, label: s.label }));
  if (existing && !skuOptions.some((o) => o.value === existing.productVariantId))
    skuOptions.unshift({ value: existing.productVariantId, label: existing.sku });
  const errors = {
    variant: variantId ? "" : "Choose the tag option.",
    name: kind === "Promotion" && !name.trim() ? "Name the promotion." : "",
    price: /^\d{1,6}(\.\d{1,2})?$/.test(price.trim()) && Number(price) > 0 ? "" : "Enter the price in MYR, above zero.",
    from: from ? "" : "Choose the first day.",
    lastDay: kind === "Promotion" && !lastDay ? "A promotion needs a last day." : lastDay && from && lastDay < from ? "The last day can’t be before the first." : "",
  };

  const save = () => {
    if (Object.values(errors).some(Boolean)) {
      setShowErrors(true);
      return;
    }
    void context.actions.work(
      async () => {
        await api.savePriceTerm(
          {
            agreementId: agreement.id, productVariantId: variantId, kind, name: kind === "Promotion" ? name.trim() : null,
            unitNetPrice: Number(price), validFrom: startOfDayIso(from)!, validToExclusive: lastDay ? dayAfterIso(lastDay) : null,
            approvalEvidenceReference: evidence.trim() || null,
          },
          existing ?? undefined
        );
        onClose();
        return "Price saved as a draft. Approve it once the partner has accepted it.";
      },
      "Price saved.",
      { onError: setError }
    );
  };

  return (
    <FormDialog
      closeOnBackdrop={false}
      description={`${agreement.merchantName} · ${agreement.reference} v${agreement.version}. Record the price the partner agreed to; approval is a separate step.`}
      eyebrow="Selling price"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className={secondaryButton} disabled={context.actions.busy} onClick={onClose} type="button">
            Cancel
          </button>
          <button className={primaryButton} disabled={context.actions.busy} onClick={save} type="button">
            Save draft price
          </button>
        </div>
      }
      maxWidthClassName="sm:max-w-2xl"
      onRequestClose={onClose}
      open
      title={existing ? "Edit draft price" : "Add selling price"}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {error ? (
          <div className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e] sm:col-span-2" role="alert">
            {error}
          </div>
        ) : null}
        <SelectField
          emptyLabel={skuOptions.length ? "Choose tag option" : "No tag options available"}
          error={showErrors ? errors.variant || undefined : undefined}
          label="Tag option"
          onChange={setVariantId}
          options={skuOptions}
          requirement="required"
          value={variantId}
        />
        <fieldset className="grid gap-1.5">
          <legend className="text-sm font-black text-slate-800">Price type</legend>
          <div className="flex gap-2">
            {(["Standard", "Promotion"] as const).map((k) => (
              <label
                className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-bold ${
                  kind === k ? "border-pet-teal bg-[#f0f7ff] text-pet-teal" : "border-slate-200 text-slate-700"
                }`}
                key={k}
              >
                <input checked={kind === k} className="sr-only" name="price-kind" onChange={() => setKind(k)} type="radio" />
                {k === "Standard" ? "Standard price" : "Promotion"}
              </label>
            ))}
          </div>
        </fieldset>
        {kind === "Promotion" ? (
          <TextField
            error={showErrors ? errors.name || undefined : undefined}
            label="Promotion name"
            maxLength={100}
            onChange={setName}
            requirement="required"
            value={name}
          />
        ) : null}
        <TextField
          error={showErrors ? errors.price || undefined : undefined}
          hint="The actual price a customer pays, after the promotion."
          inputMode="decimal"
          label="Selling price (RM)"
          onChange={setPrice}
          requirement="required"
          value={price}
        />
        <DateField error={showErrors ? errors.from || undefined : undefined} label="First day" onChange={setFrom} requirement="required" value={from} />
        <DateField
          error={showErrors ? errors.lastDay || undefined : undefined}
          hint={kind === "Standard" ? "Leave blank to apply until the agreement ends." : undefined}
          label="Last day"
          min={from || undefined}
          onChange={setLastDay}
          requirement={kind === "Promotion" ? "required" : "optional"}
          value={lastDay}
        />
        <div className="sm:col-span-2">
          <TextField
            hint="Where the partner agreed to this price, for example the signed schedule or a WhatsApp confirmation. Needed before approval."
            label="Partner acceptance reference"
            onChange={setEvidence}
            requirement="approval"
            value={evidence}
          />
        </div>
      </div>
    </FormDialog>
  );
}

function EndPriceDialog({ context, term, onClose }: { context: ConsignmentContext; term: api.PriceTerm; onClose: () => void }) {
  const [lastDay, setLastDay] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    if (!lastDay) {
      setError("Choose the last day this price applies.");
      return;
    }
    void context.actions.work(
      async () => {
        await api.priceTermAction(term, "end", { endAt: dayAfterIso(lastDay) });
        onClose();
        return `${term.sku} price ends after ${shortDate(startOfDayIso(lastDay)!)}.`;
      },
      "Price ended.",
      { onError: setError }
    );
  };
  return (
    <FormDialog
      closeOnBackdrop={false}
      description={`${term.sku} · ${ringgit(term.unitNetPrice)}. Sales already reported at this price keep it.`}
      eyebrow="Selling price"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className={secondaryButton} disabled={context.actions.busy} onClick={onClose} type="button">
            Cancel
          </button>
          <button className={dangerButton} disabled={context.actions.busy} onClick={submit} type="button">
            End price
          </button>
        </div>
      }
      maxWidthClassName="sm:max-w-lg"
      onRequestClose={onClose}
      open
      title="End this price"
    >
      <div className="grid gap-3">
        {error ? (
          <div className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]" role="alert">
            {error}
          </div>
        ) : null}
        <DateField label="Last day at this price" onChange={setLastDay} requirement="required" value={lastDay} />
      </div>
    </FormDialog>
  );
}
