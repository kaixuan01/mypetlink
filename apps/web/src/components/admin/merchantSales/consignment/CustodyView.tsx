"use client";

import { useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminEmptyPanel, AdminStatusBadge } from "@/components/admin/AdminStatus";
import * as api from "@/services/adminConsignmentService";
import { fieldClass, primaryButton } from "../shared";
import type { ConsignmentContext } from "./context";
import { DispatchDetail } from "./DispatchDetail";
import {
  dispatchNextStep,
  dispatchStatusLabel,
  dispatchTone,
  errorMessage,
  LIST_PAGE_SIZE,
  receivingProgress,
} from "./model";
import { Callout, NextStepCell, Pager, ProgressMeter, StatusPill } from "./ui";

const columns =
  "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_5.5rem_minmax(0,1fr)_7rem_minmax(0,1fr)_minmax(0,1.2fr)]";

export function CustodyView({ context, dispatchId }: { context: ConsignmentContext; dispatchId: string | null }) {
  const [page, setPage] = useState(1);
  const [agreementId, setAgreementId] = useState("");
  const [list, setList] = useState<{ items: api.ConsignmentDispatch[]; total: number } | null>(null);
  const [error, setError] = useState("");
  const { reloadKey } = context;

  useEffect(() => {
    if (dispatchId) return;
    let active = true;
    api
      .listDispatches(page, { agreementId: agreementId || undefined })
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
  }, [page, agreementId, reloadKey, dispatchId]);

  if (dispatchId) {
    return (
      <DispatchDetail
        context={context}
        dispatchId={dispatchId}
        onBack={() => context.navigate({ view: "custody", dispatch: null, agreement: null })}
      />
    );
  }

  const agreementOptions = context.agreements.filter((a) => a.status !== "Draft");

  return (
    <AdminSection
      action={
        <div className="flex flex-wrap items-center gap-2">
          {agreementOptions.length > 0 ? (
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <span className="whitespace-nowrap">Agreement</span>
              <select
                className={`${fieldClass} min-w-48`}
                onChange={(event) => {
                  setAgreementId(event.target.value);
                  setPage(1);
                }}
                value={agreementId}
              >
                <option value="">All agreements</option>
                {agreementOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.merchantName} · {a.reference} v{a.version}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      }
      description="Tags reserved for, sent to, or held by partners. Open a delivery to record its next step."
      title="Stock custody"
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
          Loading stock custody…
        </p>
      ) : null}
      {list && list.items.length === 0 ? (
        <div className="grid justify-items-center gap-3 pb-6">
          <AdminEmptyPanel
            description="Reserve inspected tags against an approved agreement to start a delivery."
            icon="tag"
            title="No stock with partners yet"
          />
          {context.can.allocate ? (
            <button className={primaryButton} onClick={() => context.openReserve(null)} type="button">
              Reserve stock
            </button>
          ) : null}
        </div>
      ) : null}
      {list && list.items.length > 0 ? (
        <>
          <div
            aria-hidden="true"
            className={`hidden border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-500 lg:grid lg:gap-4 ${columns}`}
          >
            <span>Dispatch</span>
            <span>Partner</span>
            <span>Tags</span>
            <span>Receiving</span>
            <span>Unresolved</span>
            <span>Custody status</span>
            <span>Next step</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {list.items.map((d) => {
              const progress = receivingProgress(d);
              return (
                <li key={d.id}>
                  <button
                    className={`grid w-full gap-2 px-4 py-3.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1570ef] sm:px-5 lg:items-center lg:gap-4 ${columns}`}
                    onClick={() => context.navigate({ dispatch: d.id, agreement: null })}
                    type="button"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-mono text-sm font-black text-slate-950">{d.dispatchNumber}</span>
                      <span className="lg:hidden">
                        <StatusPill tone={dispatchTone(d.status)}>{dispatchStatusLabel(d.status)}</StatusPill>
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-900">{d.merchantName}</span>
                      <span className="block text-xs text-slate-500">
                        {d.agreementReference} v{d.agreementVersion}
                      </span>
                    </span>
                    <span className="text-sm text-slate-700">
                      <span className="font-black">{d.units.length}</span>
                      <span className="text-xs text-slate-500"> {d.status === "Reserved" ? "reserved" : "tags"}</span>
                    </span>
                    <span>
                      {progress ? (
                        <ProgressMeter label={`Receiving for ${d.dispatchNumber}`} total={progress.total} value={progress.confirmed} />
                      ) : (
                        <span className="text-xs font-semibold text-slate-500">{d.status === "Cancelled" ? "—" : "Not dispatched yet"}</span>
                      )}
                    </span>
                    <span className="text-sm">
                      {progress && progress.unresolved > 0 ? (
                        <AdminStatusBadge tone="critical">{progress.unresolved} under review</AdminStatusBadge>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">None</span>
                      )}
                    </span>
                    <span className="hidden flex-wrap gap-1 lg:flex">
                      <StatusPill tone={dispatchTone(d.status)}>{dispatchStatusLabel(d.status)}</StatusPill>
                    </span>
                    <NextStepCell step={dispatchNextStep(d)} />
                  </button>
                </li>
              );
            })}
          </ul>
          <Pager noun="delivery" plural="deliveries" onPage={setPage} page={page} pageSize={LIST_PAGE_SIZE} total={list.total} />
        </>
      ) : null}
    </AdminSection>
  );
}
