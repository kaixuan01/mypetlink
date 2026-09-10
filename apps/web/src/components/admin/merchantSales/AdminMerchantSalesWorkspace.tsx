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
import { getAdminCapabilities } from "@/services/authService";
import {
  MERCHANT_SALES_LIST_KEYS,
  isMerchantSalesTab,
  merchantSalesTabHref,
  merchantSalesTabs,
  merchantSalesTabsForRole,
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
  const capabilities = getAdminCapabilities();
  const availableTabs = merchantSalesTabsForRole(capabilities.role);
  const availableIds = new Set(availableTabs.map((item) => item.id));

  const tabParam = searchParams.get("tab");
  const requestedTab = isMerchantSalesTab(tabParam) ? tabParam : null;
  const tab: MerchantSalesTab = requestedTab && availableTabs.some((item) => item.id === requestedTab)
    ? requestedTab
    : availableTabs[0].id;
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
          canManage={capabilities.canManageSales}
          editing={capabilities.canManageSales && editParam !== null}
          onCloseEditor={closeEditor}
          onEdit={editRecord}
          onOpen={openRecord}
          openId={editParam === "new" ? "new" : openId}
        />
      ) : null}

      {tab === "salespersons" ? (
        <SalespersonsPanel
          canManage={capabilities.canManageSales}
          canViewFinancial={capabilities.canViewCommissionFinancials}
          editing={capabilities.canManageSales && editParam !== null}
          onCloseEditor={closeEditor}
          onEdit={editRecord}
          onOpen={openRecord}
          openId={editParam === "new" ? "new" : openId}
        />
      ) : null}

      {tab === "reports" ? (
        <SalesReportsPanel canViewFinancial={capabilities.canViewCommissionFinancials} />
      ) : null}

      {tab === "referrals" ? <ReferralAttributionsPanel canManage={capabilities.canManageSales} /> : null}

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
          canRecordPayment={capabilities.canViewCommissionFinancials}
          canViewFinancial={capabilities.canViewCommissionFinancials}
          onOpen={openRecord}
          onOpenOrder={(orderId) => goToTab("orders", { open: orderId })}
          openId={openId}
          status={searchParams.get("status")}
        />
      ) : null}

      {tab === "commissions" ? (
        <CommissionsPanel
          canManageRules={capabilities.canManageCommissionRules}
          canReverse={capabilities.canReverseCommission}
          onOpenPayout={(payoutId) => goToTab("payouts", { open: payoutId })}
        />
      ) : null}

      {tab === "payouts" ? (
        <PayoutsPanel
          canMarkPaid={capabilities.canMarkCommissionPaid}
          canPrepare={capabilities.canPreparePayout}
          onOpen={openRecord}
          openId={openId}
        />
      ) : null}
    </div>
  );
}

export { MERCHANT_SALES_LIST_KEYS };
