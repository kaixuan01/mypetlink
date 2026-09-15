"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { WorkspaceNav, type WorkspaceNavGroup } from "@/components/admin/WorkspaceNav";
import { InvoicesPanel } from "./InvoicesPanel";
import { MerchantsPanel } from "./MerchantsPanel";
import { MerchantSalesOverview } from "./MerchantSalesOverview";
import { OrdersPanel } from "./OrdersPanel";
import { QuotationsPanel } from "./QuotationsPanel";
import { SalespersonsPanel } from "./SalespersonsPanel";
import { ReferralAttributionsPanel } from "./ReferralAttributionsPanel";
import { CommissionsPanel } from "./CommissionsPanel";
import { SalesReportsPanel } from "./SalesReportsPanel";
import { PayoutsPanel } from "./PayoutsPanel";
import { adminCapabilities, hasCapability } from "@/lib/adminCapabilities";
import { getAdminCapabilities } from "@/services/authService";
import { AdminNoAccessNotice } from "@/components/admin/AdminNoAccessNotice";
import {
  MERCHANT_SALES_LIST_KEYS,
  isMerchantSalesTab,
  merchantSalesTabHref,
  merchantSalesTabs,
  merchantSalesTabsFor,
  merchantSalesWorkspaceGroups,
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
  const access = getAdminCapabilities();
  const can = (capability: Parameters<typeof hasCapability>[1]) =>
    hasCapability(access, capability);
  const availableTabs = merchantSalesTabsFor(access);
  const availableIds = new Set<string>(availableTabs.map((item) => item.id));

  const tabParam = searchParams.get("tab");
  const requestedTab = isMerchantSalesTab(tabParam) ? tabParam : null;
  // Asking for a section you cannot open lands on the first one you can, rather
  // than on an empty page or a request the API would refuse.
  const tab: MerchantSalesTab | null =
    requestedTab && availableIds.has(requestedTab)
      ? requestedTab
      : (availableTabs[0]?.id ?? null);
  const openId = searchParams.get("open");
  const editParam = searchParams.get("edit");

  const push = (href: string) => {
    if (`${window.location.pathname}${window.location.search}` === href) return;
    window.history.pushState(null, "", href);
    // Next's router listens for popstate, not pushState, so nudge it.
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const goToTab = (next: MerchantSalesTab, filters?: Record<string, string>) => {
    push(merchantSalesTabHref(pathname, next, filters));
  };

  // Record-level navigation keeps the current section and list state.
  const setParam = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    push(`${pathname}?${params.toString()}`);
  };

  const openRecord = (id: string | null) => setParam({ open: id, edit: null });

  const editRecord = (id: string | "new" | null) =>
    id === null
      ? setParam({ edit: null })
      : id === "new"
        ? setParam({ open: null, edit: "new" })
        : setParam({ open: id, edit: id });

  const closeEditor = () => setParam({ edit: null });

  if (tab === null) {
    return (
      <AdminNoAccessNotice
        title="Merchant Sales"
        description="You do not have permission to open any part of Merchant Sales. Ask an administrator who manages access if you need it."
      />
    );
  }

  const workspaceGroups: WorkspaceNavGroup<MerchantSalesTab>[] =
    merchantSalesWorkspaceGroups.map((group) => ({
      id: group.id,
      label: group.label,
      items: group.tabIds.map((id) => {
        const item = merchantSalesTabs.find((candidate) => candidate.id === id)!;
        return {
          id,
          label: item.label,
          href: merchantSalesTabHref(pathname, id),
          visible: availableIds.has(id),
        };
      }),
    }));

  return (
    <div className="grid gap-4">
      <WorkspaceNav
        activeId={tab}
        groups={workspaceGroups}
        label="Merchant Sales"
        onNavigate={goToTab}
      />

      {tab === "overview" ? (
        <MerchantSalesOverview
          onGoTo={goToTab}
          onNewQuotation={() => goToTab("quotations", { edit: "new" })}
        />
      ) : null}

      {tab === "merchants" ? (
        <MerchantsPanel
          canManage={can(adminCapabilities.salesManage)}
          editing={can(adminCapabilities.salesManage) && editParam !== null}
          onCloseEditor={closeEditor}
          onEdit={editRecord}
          onOpen={openRecord}
          openId={editParam === "new" ? "new" : openId}
        />
      ) : null}

      {tab === "salespersons" ? (
        <SalespersonsPanel
          canManage={can(adminCapabilities.salesManage)}
          canViewFinancial={can(adminCapabilities.salesCommissionsView)}
          editing={can(adminCapabilities.salesManage) && editParam !== null}
          onCloseEditor={closeEditor}
          onEdit={editRecord}
          onOpen={openRecord}
          openId={editParam === "new" ? "new" : openId}
        />
      ) : null}

      {tab === "reports" ? (
        <SalesReportsPanel canViewFinancial={can(adminCapabilities.salesCommissionsView)} />
      ) : null}

      {tab === "referrals" ? <ReferralAttributionsPanel canManage={can(adminCapabilities.salesManage)} /> : null}

      {tab === "quotations" ? (
        <QuotationsPanel
          editing={can(adminCapabilities.merchantOrdersManage) && editParam !== null}
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
          canRecordPayment={can(adminCapabilities.merchantInvoicesRecordPayment)}
          canViewFinancial={can(adminCapabilities.salesCommissionsView)}
          onOpen={openRecord}
          onOpenOrder={(orderId) => goToTab("orders", { open: orderId })}
          openId={openId}
          status={searchParams.get("status")}
        />
      ) : null}

      {tab === "commissions" ? (
        <CommissionsPanel
          canManageRules={can(adminCapabilities.salesCommissionRulesManage)}
          canReverse={can(adminCapabilities.salesCommissionsReverse)}
          onOpenPayout={(payoutId) => goToTab("payouts", { open: payoutId })}
        />
      ) : null}

      {tab === "payouts" ? (
        <PayoutsPanel
          canMarkPaid={can(adminCapabilities.payoutsSettle)}
          canPrepare={can(adminCapabilities.payoutsManage)}
          onOpen={openRecord}
          openId={openId}
        />
      ) : null}
    </div>
  );
}

export { MERCHANT_SALES_LIST_KEYS };
