"use client";

import { useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminStat, AdminStatStrip, AdminStatusRow } from "@/components/admin/AdminStatus";
import { AttentionQueue } from "@/components/admin/AttentionQueue";
import { PipelineStrip } from "@/components/admin/PipelineStrip";
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
  onNewQuotation,
}: {
  onGoTo: (tab: MerchantSalesTab, filters?: Record<string, string>) => void;
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
  const attention = [
    {
      id: "invoices-awaiting-payment",
      label: "Invoices awaiting payment",
      count: data.invoicesAwaitingPayment,
      detail: "Issued invoices that have not been paid.",
      onSelect: () => onGoTo("invoices", { status: "Issued" }),
    },
    {
      id: "awaiting-conversion",
      label: "Awaiting conversion",
      count: data.acceptedQuotationsAwaitingConversion,
      detail: "Accepted quotations ready to become orders.",
      onSelect: () => onGoTo("quotations", { status: "Accepted" }),
    },
    {
      id: "awaiting-invoice",
      label: "Awaiting invoice",
      count: data.ordersAwaitingInvoice,
      detail: "Unpaid orders without a current invoice.",
      onSelect: () => onGoTo("orders", { paymentStatus: "AwaitingPayment" }),
    },
    {
      id: "awaiting-allocation",
      label: "Awaiting allocation",
      count: data.paidOrdersAwaitingAllocation,
      detail: "Paid orders with no inventory allocated yet.",
      onSelect: () => onGoTo("orders", {
        paymentStatus: "PaymentConfirmed",
        allocationState: "none",
      }),
    },
    {
      id: "partially-allocated",
      label: "Partially allocated",
      count: data.partiallyAllocatedOrders,
      detail: "Paid orders that still need inventory.",
      onSelect: () => onGoTo("orders", {
        paymentStatus: "PaymentConfirmed",
        allocationState: "incomplete",
      }),
    },
    {
      id: "ready-to-ship",
      label: "Ready to ship",
      count: data.ordersReadyToShip,
      detail: "Orders ready for dispatch.",
      onSelect: () => onGoTo("orders", { fulfilmentStatus: "ReadyToShip" }),
    },
  ];

  const pipeline = [
    { id: "draft", label: "Draft", value: data.draftQuotations, onSelect: () => onGoTo("quotations", { status: "Draft" }) },
    { id: "sent", label: "Sent", value: data.sentQuotations, onSelect: () => onGoTo("quotations", { status: "Sent" }) },
    { id: "awaiting-conversion", label: "Awaiting conversion", value: data.acceptedQuotationsAwaitingConversion, onSelect: () => onGoTo("quotations", { status: "Accepted" }) },
    { id: "awaiting-invoice", label: "Awaiting invoice", value: data.ordersAwaitingInvoice, onSelect: () => onGoTo("orders", { paymentStatus: "AwaitingPayment" }) },
    { id: "awaiting-payment", label: "Awaiting payment", value: data.invoicesAwaitingPayment, onSelect: () => onGoTo("invoices", { status: "Issued" }) },
    { id: "awaiting-allocation", label: "Awaiting allocation", value: data.paidOrdersAwaitingAllocation, onSelect: () => onGoTo("orders", { paymentStatus: "PaymentConfirmed", allocationState: "none" }) },
    { id: "partially-allocated", label: "Partially allocated", value: data.partiallyAllocatedOrders, onSelect: () => onGoTo("orders", { paymentStatus: "PaymentConfirmed", allocationState: "incomplete" }) },
    { id: "fully-allocated", label: "Fully allocated", value: data.fullyAllocatedOrders, onSelect: () => onGoTo("orders", { paymentStatus: "PaymentConfirmed", allocationState: "complete" }) },
    { id: "ready-to-ship", label: "Ready to ship", value: data.ordersReadyToShip, onSelect: () => onGoTo("orders", { fulfilmentStatus: "ReadyToShip" }) },
    { id: "shipped", label: "Shipped", value: data.ordersShipped, onSelect: () => onGoTo("orders", { fulfilmentStatus: "Shipped" }) },
    { id: "delivered", label: "Delivered", value: data.ordersDelivered, onSelect: () => onGoTo("orders", { fulfilmentStatus: "Delivered" }) },
  ];

  return (
    <div className="grid gap-4" data-testid="merchant-sales-overview">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-950">Sales overview</h2>
          <p className="mt-1 text-sm text-slate-500">Financial position, work requiring attention, and sales progress.</p>
        </div>
        <button className={primaryButton} onClick={onNewQuotation} type="button">
          New quotation
        </button>
      </div>

      <AdminStatStrip columns="two">
        <AdminStat
          label="Outstanding invoice total"
          tone="warning"
          value={money(data.currency, data.outstandingInvoiceTotal)}
        />
        <AdminStat
          hint="Internal only. Never shown to a merchant."
          label="Payable commission"
          tone="info"
          value={money(data.currency, data.payableCommissionTotal)}
        />
      </AdminStatStrip>

      <AdminSection
        description="Only current non-zero work appears here."
        title="Attention queue"
      >
        <AttentionQueue items={attention} />
      </AdminSection>

      <AdminSection
        description="Counts follow the existing quotation, payment, allocation, and fulfilment states."
        title="Lifecycle pipeline"
      >
        <div className="px-4 py-4">
          <PipelineStrip stages={pipeline} />
        </div>
      </AdminSection>

      <section aria-labelledby="merchant-sales-reference" className="px-1 py-2">
        <h2 className="text-sm font-black text-slate-700" id="merchant-sales-reference">
          Reference
        </h2>
        <div className="mt-1 grid gap-x-8 sm:grid-cols-2">
          <AdminStatusRow label="Active merchants" value={data.activeMerchants} />
          <AdminStatusRow label="Active salespersons" value={data.activeSalespersons} />
        </div>
      </section>
    </div>
  );
}
