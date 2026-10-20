// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsignmentPanel } from "@/components/admin/merchantSales/ConsignmentPanel";
import { adminCapabilities, allAdminCapabilities, noAdminAccess } from "@/lib/adminCapabilities";
import type { Agreement, ConsignmentDispatch, PriceTerm, SalesReport, SalesReportInput, StockPosition } from "@/services/adminConsignmentService";
import { ApiClientError } from "@/services/apiClient";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), policy: vi.fn(), agreements: vi.fn(), dispatches: vi.fn(), get: vi.fn(), act: vi.fn(), listing: vi.fn(), catalog: vi.fn(),
  positions: vi.fn(), priceTerms: vi.fn(), salesReports: vi.fn(), salesReport: vi.fn(), saveReport: vi.fn(), reportAction: vi.fn(),
  savePrice: vi.fn(), priceAction: vi.fn(), startTracking: vi.fn(), copyPrices: vi.fn(),
}));
vi.mock("@/services/authService", () => ({ getAdminCapabilities: mocks.access }));
vi.mock("@/services/adminMerchantSalesService", () => ({ listMerchants: vi.fn(async () => ({ items: [], total: 0 })) }));
vi.mock("@/services/merchantDirectoryService", () => ({ getMerchantListing: mocks.listing }));
vi.mock("@/services/tagCatalogService", () => ({ listAdminTagCatalogOptions: mocks.catalog }));
vi.mock("@/services/adminConsignmentService", () => ({
  getApprovalPolicy: mocks.policy, listAgreements: mocks.agreements, listDispatches: mocks.dispatches, getDispatch: mocks.get,
  custodyAction: mocks.act, saveAgreement: vi.fn(), agreementAction: vi.fn(), downloadConsignment: vi.fn(), reserveConsignment: vi.fn(),
  downloadReconciliation: vi.fn(), downloadReviewLog: vi.fn(), downloadSalesReports: vi.fn(), downloadStockLedger: vi.fn(),
  listStockPositions: mocks.positions, listPriceTerms: mocks.priceTerms, listSalesReports: mocks.salesReports, getSalesReport: mocks.salesReport,
  saveSalesReport: mocks.saveReport, salesReportAction: mocks.reportAction, savePriceTerm: mocks.savePrice, priceTermAction: mocks.priceAction,
  startStockTracking: mocks.startTracking, copyPriceTerms: mocks.copyPrices,
  listStocktakes: vi.fn(async () => ({ items: [], total: 0 })), listDiscrepancies: vi.fn(async () => []),
}));

const agreement: Agreement = { id: "agreement", merchantId: "merchant", merchantName: "Paws Corner", reference: "PAWS-1", version: 1, status: "Active",
  partnerCommissionPercentage: 35, effectiveFrom: "2026-10-01T00:00:00+08:00", effectiveTo: null, durationTerms: "60 days", settlementFrequency: "Monthly",
  paymentDeadlineDays: 14, discountTerms: "None", returnTerms: "30 days", lossTerms: "Partner", signedAgreementReference: "SIGNED", externalTrackerReference: "TRACKER",
  pendingTerms: [], concurrencyToken: "agreement-token" };
const standard: PriceTerm = { id: "std", agreementId: "agreement", productVariantId: "plw", sku: "PAWSOME-LW", kind: "Standard", name: "Standard price",
  unitNetPrice: 39.9, validFrom: "2026-10-01T00:00:00+08:00", validToExclusive: null, approvalEvidenceReference: "SIGNED", status: "Approved",
  approvedAt: "2026-10-01T00:00:00Z", reviewMode: "Self-reviewed (Solo)", concurrencyToken: "std-token" };
const promo: PriceTerm = { ...standard, id: "promo", kind: "Promotion", name: "Opening week", unitNetPrice: 34.9, validToExclusive: "2026-10-08T00:00:00+08:00",
  status: "Draft", approvalEvidenceReference: "WA promo ok", approvedAt: null, reviewMode: null, concurrencyToken: "promo-token" };
const position: StockPosition = { merchantId: "merchant", merchantName: "Paws Corner", merchantBranchId: "branch", branchName: "Main branch",
  lastVerifiedPeriodEnd: null, reportsAwaitingVerification: 1, disputedReports: 0,
  skus: [{ productVariantId: "plw", sku: "PAWSOME-LW", productName: "Pawsome · Lightweight", sellable: 40, unsellable: 0, investigation: 0,
    soldUnidentified: 0, lostUnidentified: 0, unverifiedSold: 8, unverifiedRestockable: 0, provisionalSellable: 32, custodyUnits: 40,
    tieOutBalanced: true, untrackedUnits: 0, deliveryHolds: 0, activatedInCustody: 0 }] };
const report: SalesReport = { id: "report", merchantId: "merchant", merchantName: "Paws Corner", merchantBranchId: "branch", branchName: "Main branch",
  agreementId: "agreement", agreementReference: "PAWS-1", agreementVersion: 1, periodStart: "2026-10-01T00:00:00+08:00",
  periodEndExclusive: "2026-10-16T00:00:00+08:00", partnerReference: "2026-10-A", version: 1, supersedesReportId: null, supersededById: null,
  reportReceivedAt: "2026-10-16T13:00:00Z", evidenceLevel: "Summary", evidenceKind: "WhatsApp summary", evidenceReference: "WA 16 Oct from owner",
  notes: null, status: "Recorded", createdAt: "2026-10-16T13:00:00Z", recordedAt: "2026-10-16T13:05:00Z", verifiedAt: null, reviewMode: null,
  disputedAt: null, disputeReason: null, unitsSold: 8, unitsRefunded: 0, netSalesValue: 319.2, issues: [], warnings: [], concurrencyToken: "report-token",
  lines: [{ id: "line", productVariantId: "plw", sku: "PAWSOME-LW", productName: "Pawsome · Lightweight", lineType: "Sale", priceTermId: "std",
    priceTermName: "Standard price", priceTermKind: "Standard", unitListPrice: 39.9, unitNetPrice: 39.9, quantity: 8, netValue: 319.2,
    promotionalDiscount: 0, refundOfPeriodStart: null, restockableQuantity: 0, unsellableReturnedQuantity: 0, notes: null,
    sealedReturnConfirmed: false, sealedReturnEvidence: null }] };
const soloPolicy = { mode: "Solo", selfReviewerAdminUserId: "admin", selfReviewerName: "Founder", canSelfReview: true, updatedByAdminUserId: null,
  updatedAt: null, concurrencyToken: "policy", eligibleReviewers: [], history: [] };

beforeEach(() => {
  vi.clearAllMocks(); window.history.replaceState(null, "", "/"); window.sessionStorage.clear();
  mocks.access.mockReturnValue(allAdminCapabilities()); mocks.policy.mockResolvedValue(soloPolicy);
  mocks.agreements.mockResolvedValue({ items: [agreement], total: 1 }); mocks.dispatches.mockResolvedValue({ items: [], total: 0 });
  mocks.catalog.mockResolvedValue([]); mocks.positions.mockResolvedValue([position]); mocks.priceTerms.mockResolvedValue([standard, promo]);
  mocks.salesReports.mockResolvedValue({ items: [report], total: 1 }); mocks.salesReport.mockResolvedValue(report);
  mocks.listing.mockResolvedValue({ branches: [{ id: "branch", name: "Main branch", isActive: true, address: { addressLine1: "1 Street", addressLine2: null, postcode: "50000", city: "KL", state: "KL", country: "Malaysia" } }] });
});
afterEach(cleanup);

const sections = () => screen.getByRole("navigation", { name: "Consignment sections" });
const goTo = (label: RegExp) => fireEvent.click(within(sections()).getByRole("button", { name: label }));

import { readFileSync } from "node:fs";
it("reproduces a valid sold-out report whose required allocation dialog is unreachable", async () => {
  const actual=JSON.parse(readFileSync("C:/Project/MyPetLink/artifacts/consignment-phase1b-final-gate/sold-out-report.json","utf8"));
  expect(actual.issues.length).toBeGreaterThan(0);
  expect(actual.lateReport.skus[0].candidates[0].openQuantity).toBe(7);
  mocks.policy.mockResolvedValue({...soloPolicy,mode:"Team",canSelfReview:false});
  mocks.salesReport.mockResolvedValue(actual);
  window.history.replaceState(null,"",`/?tab=consignment&report=${actual.id}`);
  render(<ConsignmentPanel />);
  const button=await screen.findByRole("button",{name:"Verify report"}) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(mocks.reportAction).not.toHaveBeenCalled();
});
