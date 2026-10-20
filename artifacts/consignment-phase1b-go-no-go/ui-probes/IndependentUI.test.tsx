// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsignmentPanel } from "@/components/admin/merchantSales/ConsignmentPanel";
import { allAdminCapabilities } from "@/lib/adminCapabilities";
import type { SalesReport, StockPosition } from "@/services/adminConsignmentService";
import { ApiClientError } from "@/services/apiClient";
// The fixed server's actual response for Codex FG10: 10 received, 3 sold, a count of 0, then a late report of 7 sales.
import { readFileSync } from "node:fs"; const readEvidence = (name: string) => JSON.parse(readFileSync("C:/Project/MyPetLink/artifacts/consignment-phase1b-go-no-go/" + name + ".json", "utf8").replace(/^\uFEFF/, "")); const soldOutReport = readEvidence("sold-out-report");

const mocks = vi.hoisted(() => ({
  access: vi.fn(), policy: vi.fn(), agreements: vi.fn(), dispatches: vi.fn(), positions: vi.fn(), salesReports: vi.fn(), salesReport: vi.fn(),
  reportAction: vi.fn(),
}));
vi.mock("@/services/authService", () => ({ getAdminCapabilities: mocks.access }));
vi.mock("@/services/adminMerchantSalesService", () => ({ listMerchants: vi.fn(async () => ({ items: [], total: 0 })) }));
vi.mock("@/services/merchantDirectoryService", () => ({ getMerchantListing: vi.fn(async () => ({ branches: [] })) }));
vi.mock("@/services/tagCatalogService", () => ({ listAdminTagCatalogOptions: vi.fn(async () => []) }));
vi.mock("@/services/adminConsignmentService", () => ({
  getApprovalPolicy: mocks.policy, listAgreements: mocks.agreements, listDispatches: mocks.dispatches, getDispatch: vi.fn(),
  custodyAction: vi.fn(), saveAgreement: vi.fn(), agreementAction: vi.fn(), downloadConsignment: vi.fn(), reserveConsignment: vi.fn(),
  downloadReconciliation: vi.fn(), downloadReviewLog: vi.fn(), downloadSalesReports: vi.fn(), downloadStockLedger: vi.fn(),
  listStockPositions: mocks.positions, listPriceTerms: vi.fn(async () => []), listSalesReports: mocks.salesReports, getSalesReport: mocks.salesReport,
  saveSalesReport: vi.fn(), salesReportAction: mocks.reportAction, savePriceTerm: vi.fn(), priceTermAction: vi.fn(), startStockTracking: vi.fn(),
  copyPriceTerms: vi.fn(), listStocktakes: vi.fn(async () => ({ items: [], total: 0 })), listDiscrepancies: vi.fn(async () => []),
}));

const actual = soldOutReport as unknown as SalesReport;
const shortageId = actual.lateReport!.skus[0].candidates[0].discrepancyId;
const position: StockPosition = { merchantId: actual.merchantId, merchantName: actual.merchantName, merchantBranchId: actual.merchantBranchId,
  branchName: actual.branchName, lastVerifiedPeriodEnd: null, reportsAwaitingVerification: 1, disputedReports: 0,
  skus: [{ productVariantId: actual.lines[0].productVariantId, sku: actual.lines[0].sku, productName: actual.lines[0].productName, sellable: 0,
    unsellable: 0, investigation: 7, soldUnidentified: 3, lostUnidentified: 0, unverifiedSold: 7, unverifiedRestockable: 0, provisionalSellable: 0,
    custodyUnits: 10, tieOutBalanced: true, untrackedUnits: 0, deliveryHolds: 0, activatedInCustody: 0 }] };

beforeEach(() => {
  vi.clearAllMocks(); window.sessionStorage.clear();
  mocks.access.mockReturnValue(allAdminCapabilities());
  mocks.policy.mockResolvedValue({ mode: "Team", selfReviewerAdminUserId: null, selfReviewerName: null, canSelfReview: false,
    updatedByAdminUserId: null, updatedAt: null, concurrencyToken: "policy", eligibleReviewers: [], history: [] });
  mocks.agreements.mockResolvedValue({ items: [], total: 0 }); mocks.dispatches.mockResolvedValue({ items: [], total: 0 });
  mocks.positions.mockResolvedValue([position]); mocks.salesReports.mockResolvedValue({ items: [actual], total: 1 });
  mocks.salesReport.mockResolvedValue(actual);
  window.history.replaceState(null, "", `/?tab=consignment&report=${actual.id}`);
});
afterEach(cleanup);

async function openVerify() {
  render(<ConsignmentPanel />);
  const button = (await screen.findByRole("button", { name: "Verify report" })) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("checkbox", { name: /checked these points/ }));
  return dialog;
}

describe("Independent intended FG10 with fresh SQL-backed server responses", () => {
  it("opens only the linkable review, keeps all entries through local and actual server refusal, then completes", async () => {
    const rejection = readEvidence("invalid-link-error");
    mocks.reportAction.mockRejectedValueOnce(new ApiClientError(rejection.statusCode, rejection.code, rejection.message))
      .mockResolvedValueOnce(readEvidence("sold-out-verified"));
    const dialog = await openVerify();
    expect(actual.linkResolvableIssues).toEqual(actual.issues);
    expect(actual.lateReport!.skus[0].requiredLinks).toBe(7);
    expect(within(dialog).getByText(/7 of 7 open/)).toBeTruthy();
    expect(within(dialog).getByText(/Link at least 7/)).toBeTruthy();
    const change = (label: string, value: string) => fireEvent.change(within(screen.getByRole("dialog")).getByLabelText(label), { target: { value } });
    const submit = () => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Verify report" }));
    submit();
    expect(mocks.reportAction).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBe(dialog);
    change("Link to this shortage", "6");
    change("Link evidence", "Six dated receipts");
    change("Why this report accounts for it", "Sold before the physical count");
    submit();
    expect(mocks.reportAction).not.toHaveBeenCalled();
    expect((within(dialog).getByLabelText("Link to this shortage") as HTMLInputElement).value).toBe("6");
    expect((within(dialog).getByLabelText("Link evidence") as HTMLInputElement).value).toBe("Six dated receipts");
    expect((within(dialog).getByLabelText("Why this report accounts for it") as HTMLInputElement).value).toBe("Sold before the physical count");
    change("Link to this shortage", "7");
    change("Link evidence", "Count sheet photo 2026-08-31");
    submit();
    await within(dialog).findByText(rejection.message);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect((within(dialog).getByLabelText("Link to this shortage") as HTMLInputElement).value).toBe("7");
    expect((within(dialog).getByLabelText("Link evidence") as HTMLInputElement).value).toBe("Count sheet photo 2026-08-31");
    expect((within(dialog).getByLabelText("Why this report accounts for it") as HTMLInputElement).value).toBe("Sold before the physical count");
    change("Link evidence", "Seven dated sale receipts before count"); submit();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.reportAction).toHaveBeenCalledTimes(2);
    expect(mocks.reportAction.mock.calls[1][2]).toEqual({ acknowledgeWarnings: true, selfReview: undefined,
      allocations: [{ discrepancyId: shortageId, quantity: 7, evidenceReference: "Seven dated sale receipts before count", explanation: "Sold before the physical count" }] });
    expect(await screen.findByText("Verified", { exact: true })).toBeTruthy();
  });

  it.each(["mixed-structural-report", "uncoverable-report"])("blocks the actual %s assessment", async (name) => {
    const response = readEvidence(name) as SalesReport;
    expect(response.issues.some(i => !response.linkResolvableIssues!.includes(i))).toBe(true);
    if(name === "mixed-structural-report") expect(response.linkResolvableIssues).toHaveLength(1);
    else expect(response.linkResolvableIssues).toHaveLength(0);
    mocks.salesReport.mockResolvedValue(response);
    window.history.replaceState(null, "", `/?tab=consignment&report=${response.id}`);
    render(<ConsignmentPanel />);
    const verify = await screen.findByRole("button", { name: "Verify report" }) as HTMLButtonElement;
    expect(verify.disabled).toBe(true); fireEvent.click(verify);
    expect(screen.queryByRole("dialog")).toBeNull(); expect(mocks.reportAction).not.toHaveBeenCalled();
  });
});

