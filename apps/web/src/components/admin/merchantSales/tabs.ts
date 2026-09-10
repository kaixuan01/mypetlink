// The Merchant Sales workspace keeps its section in the URL, like the Tag
// Products workspace does, so refresh and Back both restore where you were.

export const merchantSalesTabs = [
  { id: "overview", label: "Overview" },
  { id: "reports", label: "Reports" },
  { id: "quotations", label: "Quotations" },
  { id: "orders", label: "Orders" },
  { id: "invoices", label: "Invoices & Receipts" },
  { id: "merchants", label: "Merchants" },
  { id: "salespersons", label: "Salespersons" },
  { id: "referrals", label: "Owner Referrals" },
  { id: "commissions", label: "Commissions" },
  { id: "payouts", label: "Payouts" },
] as const;

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

export function merchantSalesTabsForRole(role: string) {
  if (role === "SuperAdmin" || role === "Admin") return merchantSalesTabs;
  if (role === "Operations") {
    return merchantSalesTabs.filter((tab) =>
      tab.id !== "overview" && tab.id !== "commissions" && tab.id !== "payouts"
    );
  }
  return merchantSalesTabs.filter((tab) =>
    tab.id === "quotations" || tab.id === "orders" || tab.id === "invoices"
  );
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
