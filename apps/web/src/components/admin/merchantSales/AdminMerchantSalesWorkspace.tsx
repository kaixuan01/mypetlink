"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { InvoicesPanel } from "./InvoicesPanel";
import { MerchantsPanel } from "./MerchantsPanel";
import { MerchantSalesOverview } from "./MerchantSalesOverview";
import { OrdersPanel } from "./OrdersPanel";
import { QuotationsPanel } from "./QuotationsPanel";
import { SalespersonsPanel } from "./SalespersonsPanel";
import {
  MERCHANT_SALES_LIST_KEYS,
  isMerchantSalesTab,
  merchantSalesTabHref,
  merchantSalesTabs,
  type MerchantSalesTab,
} from "./tabs";

/**
 * The Merchant Sales workspace.
 *
 * The section, the open record and the list filters all live in the URL — the
 * same convention Tag Products uses — so refresh restores exactly where you
 * were and Back walks the trail you actually followed.
 */
export function AdminMerchantSalesWorkspace() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const tab: MerchantSalesTab = isMerchantSalesTab(tabParam) ? tabParam : "overview";
  const openId = searchParams.get("open");
  const editParam = searchParams.get("edit");

  const push = useCallback((href: string) => {
    if (`${window.location.pathname}${window.location.search}` === href) return;
    window.history.pushState(null, "", href);
    // Next's router listens for popstate, not pushState, so nudge it.
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  const goToTab = useCallback(
    (next: MerchantSalesTab, filters?: Record<string, string>) => {
      push(merchantSalesTabHref(pathname, next, filters));
    },
    [pathname, push]
  );

  // Record-level navigation keeps the current section and list state.
  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      push(`${pathname}?${params.toString()}`);
    },
    [pathname, push, searchParams]
  );

  const openRecord = useCallback(
    (id: string | null) => setParam({ open: id, edit: null }),
    [setParam]
  );

  const editRecord = useCallback(
    (id: string | "new" | null) =>
      id === null
        ? setParam({ edit: null })
        : id === "new"
          ? setParam({ open: null, edit: "new" })
          : setParam({ open: id, edit: id }),
    [setParam]
  );

  const closeEditor = useCallback(() => setParam({ edit: null }), [setParam]);

  return (
    <div className="grid gap-4">
      <nav aria-label="Merchant Sales sections" className="-mx-1 overflow-x-auto px-1 pb-1">
        <ul className="flex min-w-max gap-2">
          {merchantSalesTabs.map((item) => (
            <li key={item.id}>
              <Link
                aria-current={tab === item.id ? "page" : undefined}
                className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-full border px-4 text-sm font-extrabold ${
                  tab === item.id
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                data-testid={`merchant-sales-tab-${item.id}`}
                href={merchantSalesTabHref(pathname, item.id)}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  goToTab(item.id);
                }}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "overview" ? (
        <MerchantSalesOverview
          onGoTo={goToTab}
          onNewMerchant={() => goToTab("merchants", { edit: "new" })}
          onNewQuotation={() => goToTab("quotations", { edit: "new" })}
          onNewSalesperson={() => goToTab("salespersons", { edit: "new" })}
        />
      ) : null}

      {tab === "merchants" ? (
        <MerchantsPanel
          editing={editParam !== null}
          onCloseEditor={closeEditor}
          onEdit={editRecord}
          onOpen={openRecord}
          openId={editParam === "new" ? "new" : openId}
        />
      ) : null}

      {tab === "salespersons" ? (
        <SalespersonsPanel
          editing={editParam !== null}
          onCloseEditor={closeEditor}
          onEdit={editRecord}
          onOpen={openRecord}
          openId={editParam === "new" ? "new" : openId}
        />
      ) : null}

      {tab === "quotations" ? (
        <QuotationsPanel
          editing={editParam !== null}
          onCloseEditor={closeEditor}
          onEdit={editRecord}
          onOpen={openRecord}
          onOpenOrder={(orderId) => goToTab("orders", { open: orderId })}
          openId={editParam === "new" ? "new" : openId}
        />
      ) : null}

      {tab === "orders" ? (
        <OrdersPanel
          allocationState={searchParams.get("allocationState")}
          fulfilmentStatus={searchParams.get("fulfilmentStatus")}
          onOpen={openRecord}
          onOpenInvoice={(invoiceId) => goToTab("invoices", { open: invoiceId })}
          openId={openId}
          paymentStatus={searchParams.get("paymentStatus")}
        />
      ) : null}

      {tab === "invoices" ? (
        <InvoicesPanel
          onOpen={openRecord}
          onOpenOrder={(orderId) => goToTab("orders", { open: orderId })}
          openId={openId}
          status={searchParams.get("status")}
        />
      ) : null}
    </div>
  );
}

export { MERCHANT_SALES_LIST_KEYS };
