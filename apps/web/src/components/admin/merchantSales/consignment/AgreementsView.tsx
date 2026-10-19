"use client";

import { useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminEmptyPanel, AdminStatusBadge } from "@/components/admin/AdminStatus";
import { Icon } from "@/components/ui/Icon";
import * as api from "@/services/adminConsignmentService";
import { fieldClass, primaryButton, secondaryButton } from "../shared";
import { AgreementTermsSummary } from "./AgreementTermsSummary";
import { PriceTermsCard } from "./PriceTermsCard";
import type { ConsignmentContext } from "./context";
import {
  agreementNextStep,
  agreementStages,
  agreementTone,
  dispatchNextStep,
  dispatchStatusLabel,
  dispatchTone,
  effectivePeriod,
  errorMessage,
  LIST_PAGE_SIZE,
  myPetLinkShare,
  percentLabel,
  SUMMARY_PAGE_SIZE,
  statusLabel,
} from "./model";
import { BackLink, Callout, dangerButton, NextStepCell, Pager, StatusPill, WorkflowStepper } from "./ui";

export function AgreementsView({ context, agreementId }: { context: ConsignmentContext; agreementId: string | null }) {
  const [page, setPage] = useState(1);
  const [merchantId, setMerchantId] = useState("");
  const [list, setList] = useState<{ items: api.Agreement[]; total: number } | null>(null);
  const [error, setError] = useState("");
  const { reloadKey } = context;

  useEffect(() => {
    let active = true;
    api
      .listAgreements(page, { merchantId: merchantId || undefined })
      .then((result) => {
        if (!active) return;
        setList(result);
        setError("");
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [page, merchantId, reloadKey]);

  const open = (id: string | null) => context.navigate({ view: "agreements", agreement: id, dispatch: null });

  if (agreementId) {
    const agreement =
      list?.items.find((a) => a.id === agreementId) ?? context.agreements.find((a) => a.id === agreementId) ?? null;
    return <AgreementDetail agreement={agreement} context={context} loading={!list || context.loading} onBack={() => open(null)} />;
  }

  return (
    <AdminSection
      action={
        context.merchants.length > 0 ? (
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <span className="whitespace-nowrap">Merchant</span>
            <select
              className={`${fieldClass} min-w-48`}
              onChange={(event) => {
                setMerchantId(event.target.value);
                setPage(1);
              }}
              value={merchantId}
            >
              <option value="">All merchants</option>
              {context.merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.tradingName ?? m.legalBusinessName}
                </option>
              ))}
            </select>
          </label>
        ) : undefined
      }
      description="Each version keeps the terms a partner signed. Open an agreement to see what it needs next."
      title="Partner agreements"
    >
      {error ? (
        <div className="p-4">
          <Callout role="alert" tone="critical">
            {error}
          </Callout>
        </div>
      ) : null}
      {!list && !error ? (
        <p className="p-5 text-sm font-semibold text-slate-500" role="status">
          Loading agreements…
        </p>
      ) : null}
      {list && list.items.length === 0 ? (
        <div className="grid justify-items-center gap-3 pb-6">
          <AdminEmptyPanel
            description={
              merchantId
                ? "This merchant has no consignment agreements yet."
                : "Start with the terms you have discussed with a partner. A draft is not binding."
            }
            icon="record"
            title="No consignment agreements yet"
          />
          {context.can.manage ? (
            <button className={primaryButton} onClick={() => context.openWizard({ mode: "new" })} type="button">
              New agreement
            </button>
          ) : null}
        </div>
      ) : null}
      {list && list.items.length > 0 ? (
        <>
          <div
            aria-hidden="true"
            className="hidden border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)_7rem_minmax(0,1.1fr)_minmax(0,1.2fr)_1.5rem] lg:gap-4"
          >
            <span>Merchant</span>
            <span>Agreement</span>
            <span>Partner commission</span>
            <span>Status</span>
            <span>Effective</span>
            <span>Next step</span>
            <span />
          </div>
          <ul className="divide-y divide-slate-100">
            {list.items.map((a) => (
              <li key={a.id}>
                <button
                  aria-label={`Open agreement ${a.reference} v${a.version}, ${a.merchantName}`}
                  className="grid w-full gap-2 px-4 py-3.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1570ef] sm:px-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)_7rem_minmax(0,1.1fr)_minmax(0,1.2fr)_1.5rem] lg:items-center lg:gap-4"
                  onClick={() => open(a.id)}
                  type="button"
                >
                  <span className="flex min-w-0 items-start justify-between gap-2">
                    <span className="truncate text-sm font-black text-slate-950">{a.merchantName}</span>
                    <span className="lg:hidden">
                      <StatusPill tone={agreementTone(a.status)}>{statusLabel(a.status)}</StatusPill>
                    </span>
                  </span>
                  <span className="min-w-0 text-sm font-bold text-slate-700">
                    {a.reference} v{a.version}
                    {a.approvalReviewMode ? (
                      <span className="mt-1 block">
                        <AdminStatusBadge tone="warning">{a.approvalReviewMode}</AdminStatusBadge>
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm text-slate-700">
                    <span className="font-black">{percentLabel(a.partnerCommissionPercentage)}</span>{" "}
                    <span className="text-xs text-slate-500">MyPetLink {myPetLinkShare(a.partnerCommissionPercentage)}%</span>
                  </span>
                  <span className="hidden lg:block">
                    <StatusPill tone={agreementTone(a.status)}>{statusLabel(a.status)}</StatusPill>
                  </span>
                  <span className="text-xs font-semibold text-slate-600">{effectivePeriod(a)}</span>
                  <NextStepCell step={agreementNextStep(a)} />
                  <Icon className="hidden h-4 w-4 -rotate-90 text-slate-400 lg:block" name="chevron" />
                </button>
              </li>
            ))}
          </ul>
          <Pager noun="agreement" onPage={setPage} page={page} pageSize={LIST_PAGE_SIZE} total={list.total} />
        </>
      ) : null}
    </AdminSection>
  );
}

function AgreementDetail({
  agreement: a,
  context,
  loading,
  onBack,
}: {
  agreement: api.Agreement | null;
  context: ConsignmentContext;
  loading: boolean;
  onBack: () => void;
}) {
  const [dispatches, setDispatches] = useState<api.ConsignmentDispatch[] | null>(null);
  const [dispatchError, setDispatchError] = useState("");
  const id = a?.id;
  const { reloadKey } = context;

  useEffect(() => {
    if (!id) return;
    let active = true;
    api
      .listDispatches(1, { agreementId: id, pageSize: SUMMARY_PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        setDispatches(result.items);
        setDispatchError("");
      })
      .catch((e) => {
        if (active) setDispatchError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  if (!a) {
    return (
      <div className="grid gap-3">
        <BackLink label="All agreements" onClick={onBack} />
        <AdminSection title="Agreement">
          <p className="p-5 text-sm font-semibold text-slate-500" role="status">
            {loading ? "Loading agreement…" : "This agreement isn’t in the recent records. Open it from the agreement list."}
          </p>
        </AdminSection>
      </div>
    );
  }

  const { can } = context;
  const busy = context.actions.busy;
  const draft = a.status === "Draft";
  const active = a.status === "Active";
  const pending = a.pendingTerms;
  // The highlighted action is the next one that can actually succeed.
  const primary =
    draft && can.approve && pending.length === 0 ? "approve" : draft && can.manage ? "edit" : active && can.allocate ? "reserve" : null;

  const approveButton = can.approve && draft ? (
    <button
      aria-describedby={pending.length ? "approve-blocked" : undefined}
      className={primary === "approve" ? primaryButton : secondaryButton}
      disabled={busy || pending.length > 0}
      onClick={() => context.approve(a)}
      type="button"
    >
      Approve agreement
    </button>
  ) : null;
  const editButton = can.manage && draft ? (
    <button className={primary === "edit" ? primaryButton : secondaryButton} disabled={busy} onClick={() => context.openWizard({ mode: "edit", agreement: a })} type="button">
      Edit draft
    </button>
  ) : null;
  const reserveButton = can.allocate && active ? (
    <button className={primaryButton} disabled={busy} onClick={() => context.openReserve(a.id)} type="button">
      Reserve stock
    </button>
  ) : null;
  const revisionButton = can.manage && !draft ? (
    <button className={secondaryButton} disabled={busy} onClick={() => context.openWizard({ mode: "revision", agreement: a })} type="button">
      Create new version
    </button>
  ) : null;
  const closeButton = can.approve && a.status !== "Closed" ? (
    <button className={dangerButton} disabled={busy} onClick={() => context.close(a)} type="button">
      Close agreement
    </button>
  ) : null;

  return (
    <div className="grid gap-4">
      <BackLink label="All agreements" onClick={onBack} />
      <section aria-labelledby="agreement-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-4 border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">{a.merchantName}</p>
              <h3 className="mt-1 break-words text-xl font-black text-slate-950" id="agreement-title">
                {a.reference} · version {a.version}
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusPill tone={agreementTone(a.status)}>{statusLabel(a.status)}</StatusPill>
                {a.approvalReviewMode ? <AdminStatusBadge tone="warning">{a.approvalReviewMode}</AdminStatusBadge> : null}
              </div>
            </div>
            {approveButton || editButton || reserveButton || revisionButton || closeButton ? (
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {reserveButton}
                {approveButton}
                {editButton}
                {revisionButton}
                {closeButton}
              </div>
            ) : null}
          </div>
          <WorkflowStepper label="Agreement progress" stages={agreementStages(a, dispatches)} />
          {draft && pending.length > 0 ? (
            <Callout title="Before this draft can be approved" tone="warning">
              <span id="approve-blocked">Pending: {pending.join(", ")}.</span>{" "}
              {pending.includes("Signed agreement reference")
                ? "Record the signed partner agreement once it exists — an internal approval is not the partner’s signature."
                : "Agree these with the partner, then edit the draft."}
            </Callout>
          ) : null}
          {draft && pending.length === 0 ? (
            <Callout title="Ready for approval" tone="info">
              All commercial terms and the signed partner agreement are recorded.{" "}
              {can.approve ? "Check the signed agreement matches these terms, then approve." : "An administrator with approval permission can now approve it."}
            </Callout>
          ) : null}
        </div>
        <div className="p-4 sm:p-5">
          <AgreementTermsSummary agreement={a} />
        </div>
      </section>

      <PriceTermsCard agreement={a} context={context} />

      <AdminSection
        action={
          can.allocate && active ? (
            <button className={secondaryButton} disabled={busy} onClick={() => context.openReserve(a.id)} type="button">
              Reserve stock
            </button>
          ) : undefined
        }
        compact
        description="Reservations and deliveries made under this version."
        title="Stock under this agreement"
      >
        {dispatchError ? (
          <div className="p-4">
            <Callout role="alert" tone="critical">
              {dispatchError}
            </Callout>
          </div>
        ) : null}
        {!dispatches && !dispatchError ? (
          <p className="p-4 text-sm font-semibold text-slate-500" role="status">
            Loading stock records…
          </p>
        ) : null}
        {dispatches?.length === 0 ? (
          <AdminEmptyPanel
            compact
            description={active ? "Reserve stock when the partner is ready to receive tags." : "Stock can be reserved once this version is approved."}
            icon="tag"
            title="No stock reserved yet"
          />
        ) : null}
        {dispatches && dispatches.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {dispatches.map((d) => (
              <li key={d.id}>
                <button
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1570ef] sm:px-5"
                  onClick={() => context.navigate({ dispatch: d.id, agreement: null })}
                  type="button"
                >
                  <span className="grid gap-0.5">
                    <span className="font-mono text-sm font-black text-slate-900">{d.dispatchNumber}</span>
                    <span className="text-xs text-slate-500">{d.units.length} tags</span>
                  </span>
                  <StatusPill tone={dispatchTone(d.status)}>{dispatchStatusLabel(d.status)}</StatusPill>
                  <NextStepCell step={dispatchNextStep(d)} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </AdminSection>
    </div>
  );
}
