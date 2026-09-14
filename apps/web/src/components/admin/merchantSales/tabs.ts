// The Merchant Sales workspace keeps its section in the URL, like the Tag
// Products workspace does, so refresh and Back both restore where you were.

import {
  adminCapabilities,
  hasAnyCapability,
  type AdminAccessCapabilities,
  type AdminCapabilityKey,
} from "@/lib/adminCapabilities";

// Each section names the permission that makes it worth showing. The API
// enforces the same permission on the data behind it, so a hidden section is a
// convenience, not the control.
export const merchantSalesTabs = [
  { id: "overview", label: "Overview", capability: adminCapabilities.salesCommissionsView },
  { id: "reports", label: "Reports", capability: adminCapabilities.salesView },
  { id: "quotations", label: "Quotations", capability: adminCapabilities.merchantOrdersView },
  { id: "orders", label: "Orders", capability: adminCapabilities.merchantOrdersView },
  { id: "invoices", label: "Invoices & Receipts", capability: adminCapabilities.merchantInvoicesView },
  { id: "merchants", label: "Merchants", capability: adminCapabilities.salesView },
  { id: "salespersons", label: "Salespersons", capability: adminCapabilities.salesView },
  { id: "referrals", label: "Owner Referrals", capability: adminCapabilities.salesView },
  { id: "commissions", label: "Commissions", capability: adminCapabilities.salesCommissionsView },
  { id: "payouts", label: "Payouts", capability: adminCapabilities.payoutsView },
] as const satisfies readonly {
  id: string;
  label: string;
  capability: AdminCapabilityKey;
}[];

export type MerchantSalesTab = (typeof merchantSalesTabs)[number]["id"];

export const merchantSalesWorkspaceGroups: {
  id: string;
  label: string | null;
  tabIds: MerchantSalesTab[];
}[] = [
  { id: "primary", label: null, tabIds: ["overview", "reports"] },
  { id: "sales", label: "Sales", tabIds: ["quotations", "orders", "invoices"] },
  { id: "partners", label: "Partners", tabIds: ["merchants", "salespersons", "referrals"] },
  { id: "finance", label: "Finance", tabIds: ["commissions", "payouts"] },
];

/** The sections this operator can actually open. May be empty. */
export function merchantSalesTabsFor(access: AdminAccessCapabilities) {
  return merchantSalesTabs.filter((tab) => hasAnyCapability(access, [tab.capability]));
}

export function isMerchantSalesTab(value: string | null): value is MerchantSalesTab {
  return merchantSalesTabs.some((tab) => tab.id === value);
}

/**
 * Every list parameter a section owns. Switching sections drops them all, so
 * a filter can never leak from one list into another.
 */
export const MERCHANT_SALES_LIST_KEYS = [
  "q",
  "page",
  "size",
  "sort",
  "dir",
  "status",
  "active",
  "merchantId",
  "salespersonId",
  "state",
  "fromDate",
  "toDate",
  "expired",
  "paymentStatus",
  "open",
  "edit",
] as const;

export function merchantSalesTabHref(
  pathname: string,
  nextTab: MerchantSalesTab,
  filters?: Record<string, string>
): string {
  const params = new URLSearchParams();
  params.set("tab", nextTab);

  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value) params.set(key, value);
  }

  return `${pathname}?${params.toString()}`;
}
