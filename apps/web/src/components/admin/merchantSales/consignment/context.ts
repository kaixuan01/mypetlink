import type { AdminMerchant } from "@/services/adminMerchantSalesService";
import type * as api from "@/services/adminConsignmentService";
import type { AgreementRequest } from "./AgreementWizard";
import type { SalesReportRequest } from "./SalesReportWizard";
import type { ConsignmentSummary } from "./model";
import type { ConsignmentActions } from "./useConsignmentActions";
import type { ConsignmentLocation } from "./useConsignmentLocation";

/** What the operator may do. Hiding an action is a courtesy; the API decides. */
export type ConsignmentPermissions = {
  manage: boolean;
  approve: boolean;
  allocate: boolean;
  dispatch: boolean;
  reconcile: boolean;
  returns: boolean;
  release: boolean;
  writeOff: boolean;
  exportRecords: boolean;
  managePolicy: boolean;
  managePrices: boolean;
  recordSales: boolean;
  verifySales: boolean;
  recordStocktake: boolean;
  closePeriods: boolean;
  resolveDiscrepancies: boolean;
};

export type SkuOption = { id: string; label: string };

export type PositionsStatus = {
  state: "loading" | "loaded" | "error" | "forbidden";
  message?: string;
  /** When the shown positions were loaded; kept after a failed refresh so stale figures are labelled. */
  loadedAt: string | null;
};

/** Shared by every Consignment view. */
export type ConsignmentContext = {
  can: ConsignmentPermissions;
  policy: api.ApprovalPolicy | null;
  actions: ConsignmentActions;
  reloadKey: number;
  summary: ConsignmentSummary;
  /** The summary page: the most recent records, complete only when the summary says so. */
  agreements: api.Agreement[];
  dispatches: api.ConsignmentDispatch[];
  /** SKU stock per partner branch as last loaded, or null if it has never loaded. */
  positions: api.StockPosition[] | null;
  /** Whether `positions` is current. Unavailable stock is never shown as zero. */
  positionsStatus: PositionsStatus;
  retryPositions: () => void;
  merchants: AdminMerchant[];
  /** Sellable tag options, for price and stock forms. */
  skus: SkuOption[];
  loading: boolean;
  navigate: ConsignmentLocation["navigate"];
  openWizard: (request: AgreementRequest) => void;
  openReserve: (agreementId: string | null) => void;
  approve: (agreement: api.Agreement) => void;
  close: (agreement: api.Agreement) => void;
  openSalesReport: (request: SalesReportRequest) => void;
};
