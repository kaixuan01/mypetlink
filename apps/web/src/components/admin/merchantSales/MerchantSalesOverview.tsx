"use client";

import { useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { isAbortError } from "@/services/apiClient";
import {
  getMerchantSalesOverview,
  type MerchantSalesOverview as Overview,
} from "@/services/adminMerchantBillingService";
import { getMerchantSalesError } from "@/services/adminMerchantSalesService";
import { money, primaryButton, secondaryButton } from "./shared";
import type { MerchantSalesTab } from "./tabs";

// The landing view. Every number comes from the server, so an administrator
// never acts on a figure assembled in the browser.

export function MerchantSalesOverview({
  onGoTo,
  onNewMerchant,
  onNewSalesperson,
  onNewQuotation,
}: {
  onGoTo: (tab: MerchantSalesTab, filters?: Record<string, string>) => void;
  onNewMerchant: () => void;
  onNewSalesperson: () => void;
  onNewQuotation: () => void;
}) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ready"; data: Overview } | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    getMerchantSalesOverview(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ kind: "ready", data });
      })
      .catch((caught) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setState({
          kind: "error",
          message: getMerchantSalesError(
            caught,
            "We couldn’t load the Merchant Sales summary. Please try again."
          ),
        });
      });

    return () => controller.abort();
  }, [reloadKey]);

  if (state.kind === "loading") {
    return (
      <div
        className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500"
        role="status"
      >
        Loading the Merchant Sales summary…
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        className="rounded-2xl border border-[#ffd2c9] bg-[#fff2ef] p-6"
        role="alert"
      >
        <p className="text-sm font-bold text-[#a63c2e]">{state.message}</p>
        <button
          className={`${secondaryButton} mt-3`}
          onClick={() => setReloadKey((value) => value + 1)}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  const data = state.data;
  const nothingYet =
    data.activeMerchants === 0 &&
    data.activeSalespersons === 0 &&
    data.draftQuotations === 0 &&
    data.sentQuotations === 0;

  return (
    <div className="grid gap-4" data-testid="merchant-sales-overview">
      {nothingYet ? (
        <AdminSection
          description="Add a salesperson and a merchant, then raise their first quotation."
          title="No merchant sales yet"
        >
          <div className="flex flex-wrap gap-2 p-5">
            <button className={primaryButton} onClick={onNewSalesperson} type="button">
              New salesperson
            </button>
            <button className={secondaryButton} onClick={onNewMerchant} type="button">
              New merchant
            </button>
          </div>
        </AdminSection>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active merchants" value={String(data.activeMerchants)} />
        <Stat label="Active salespersons" value={String(data.activeSalespersons)} />
        <Stat label="Draft quotations" value={String(data.draftQuotations)} />
        <Stat label="Sent quotations" value={String(data.sentQuotations)} />
        <Stat
          hint="Accepted and waiting to become an order."
          label="Awaiting conversion"
          value={String(data.acceptedQuotationsAwaitingConversion)}
        />
        <Stat
          hint="Orders with no live invoice yet."
          label="Awaiting invoice"
          value={String(data.ordersAwaitingInvoice)}
        />
        <Stat label="Invoices awaiting payment" value={String(data.invoicesAwaitingPayment)} />
        <Stat
          hint="Paid, with no tags allocated yet."
          label="Awaiting allocation"
          value={String(data.paidOrdersAwaitingAllocation)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat
          hint="Some tags allocated, more still needed."
          label="Partially allocated"
          value={String(data.partiallyAllocatedOrders)}
        />
        <Stat
          hint="Every ordered unit is held. Not the same as ready to ship."
          label="Fully allocated"
          value={String(data.fullyAllocatedOrders)}
        />
        <Stat label="Ready to ship" value={String(data.ordersReadyToShip)} />
        <Stat label="Shipped" value={String(data.ordersShipped)} />
        <Stat label="Delivered" value={String(data.ordersDelivered)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat
          label="Outstanding invoice total"
          value={money(data.currency, data.outstandingInvoiceTotal)}
        />
        <Stat
          hint="Internal only. Never shown to a merchant."
          label="Payable commission"
          value={money(data.currency, data.payableCommissionTotal)}
        />
      </div>

      <AdminSection description="Jump straight to the work." title="Quick actions">
        <div className="flex flex-wrap gap-2 p-5">
          <button className={primaryButton} onClick={onNewQuotation} type="button">
            New quotation
          </button>
          <button className={secondaryButton} onClick={onNewMerchant} type="button">
            New merchant
          </button>
          <button className={secondaryButton} onClick={onNewSalesperson} type="button">
            New salesperson
          </button>
          <button
            className={secondaryButton}
            onClick={() => onGoTo("invoices", { status: "Issued" })}
            type="button"
          >
            View awaiting payment
          </button>
          <button
            className={secondaryButton}
            onClick={() =>
              onGoTo("orders", { paymentStatus: "PaymentConfirmed", allocationState: "none" })
            }
            type="button"
          >
            View awaiting allocation
          </button>
          <button
            className={secondaryButton}
            onClick={() =>
              onGoTo("orders", { paymentStatus: "PaymentConfirmed", allocationState: "incomplete" })
            }
            type="button"
          >
            View partially allocated
          </button>
          <button
            className={secondaryButton}
            onClick={() =>
              onGoTo("orders", { paymentStatus: "PaymentConfirmed", allocationState: "complete" })
            }
            type="button"
          >
            View fully allocated
          </button>
        </div>
      </AdminSection>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[0.68rem] font-extrabold uppercase text-slate-400">{label}</p>
      <p className="mt-1 break-words text-2xl font-black text-slate-950">{value}</p>
      {hint ? <p className="mt-1 text-xs font-semibold text-slate-500">{hint}</p> : null}
    </div>
  );
}
