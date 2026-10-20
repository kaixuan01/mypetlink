// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsignmentPanel } from "./ConsignmentPanel";
import { allAdminCapabilities } from "@/lib/adminCapabilities";
import type { SalesReport, StockPosition } from "@/services/adminConsignmentService";
import { ApiClientError } from "@/services/apiClient";
// The fixed server's actual response for Codex FG10: 10 received, 3 sold, a count of 0, then a late report of 7 sales.
import soldOutReport from "./__fixtures__/sold-out-late-report.json";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), policy: vi.fn(), agreements: vi.fn(), dispatches: vi.fn(), positions: vi.fn(), salesReports: vi.fn(), salesReport: vi.fn(),
  reportAction: vi.fn(),
}));
vi.mock("@/services/authService", () => ({ getAdminCapabilities: mocks.access }));
vi.mock("@/services/adminMerchantSalesService", () => ({ listMerchants: vi.fn(async () => ({ items: [], total: 0 })) }));
vi.mock("@/services/merchantDirectoryService", () => ({ getMerchantListing: vi.fn(async () => ({ branches: [] })) }));
vi.mock("@/services/tagCatalogService", () => ({ listAdminTagCatalogOptions: vi.fn(async () => []) }));
vi.mock("@/services/adminConsignmentService", () => ({
  getAgreementDocument: vi.fn(() => new Promise(() => {})),
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

describe("A sold-out late report (Codex FG10, real server response)", () => {
  it("is shown as needing a link, not as unverifiable, and opens the linking review", async () => {
    expect(actual.issues).toHaveLength(1);
    expect(actual.linkResolvableIssues).toEqual(actual.issues);
    render(<ConsignmentPanel />);
    expect(await screen.findByText("Needs a link before it can be verified")).toBeTruthy();
    expect(screen.queryByText("Can’t be verified as reported")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Verify report" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Missing from the shelf · count of 31 Aug 2026 · 7 of 7 open/)).toBeTruthy();
    expect(within(dialog).getByText(/Link at least 7/)).toBeTruthy();
  });

  it("refuses too small or unsupported links in the dialog, then verifies the full link with its evidence", async () => {
    mocks.reportAction.mockResolvedValue({ ...actual, status: "Verified", issues: [], linkResolvableIssues: [], lateReport: null });
    const dialog = await openVerify();
    const confirm = within(dialog).getByRole("button", { name: "Verify report" });
    fireEvent.click(confirm);
    expect(within(dialog).getByText(/these sales are 7 more than the shelf stock\. Link at least 7/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Link to this shortage"), { target: { value: "6" } });
    fireEvent.change(within(dialog).getByLabelText("Link evidence"), { target: { value: "Six dated sale receipts" } });
    fireEvent.change(within(dialog).getByLabelText("Why this report accounts for it"), { target: { value: "Sold before the count" } });
    fireEvent.click(confirm);
    expect(within(dialog).getByText(/Link at least 7/, { selector: "[role=alert]" })).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Link to this shortage"), { target: { value: "7" } });
    fireEvent.change(within(dialog).getByLabelText("Link evidence"), { target: { value: "Seven dated sale receipts" } });
    expect(mocks.reportAction).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.reportAction).toHaveBeenCalledWith(expect.objectContaining({ id: actual.id }), "verify", {
      selfReview: undefined, acknowledgeWarnings: true,
      allocations: [{ discrepancyId: shortageId, quantity: 7, evidenceReference: "Seven dated sale receipts", explanation: "Sold before the count" }] }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the dialog and the entries open when the server refuses the links", async () => {
    mocks.reportAction
      .mockRejectedValueOnce(new ApiClientError(400, "bad_request", "WS-NFC-0001: the count's own evidence shows what was missing or extra, not why."))
      .mockResolvedValueOnce({ ...actual, status: "Verified", issues: [], linkResolvableIssues: [], lateReport: null });
    const dialog = await openVerify();
    fireEvent.change(within(dialog).getByLabelText("Link to this shortage"), { target: { value: "7" } });
    fireEvent.change(within(dialog).getByLabelText("Link evidence"), { target: { value: "Count sheet photo 2026-08-31" } });
    fireEvent.change(within(dialog).getByLabelText("Why this report accounts for it"), { target: { value: "Sold before the count" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Verify report" }));
    expect(await within(screen.getByRole("dialog")).findByText(/the count's own evidence shows what was missing/)).toBeTruthy();
    expect((within(screen.getByRole("dialog")).getByLabelText("Link to this shortage") as HTMLInputElement).value).toBe("7");
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("Link evidence"), { target: { value: "Seven dated sale receipts" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Verify report" }));
    await waitFor(() => expect(mocks.reportAction).toHaveBeenCalledTimes(2));
    expect(mocks.reportAction.mock.calls[1][2].allocations[0].evidenceReference).toBe("Seven dated sale receipts");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("still blocks verification when any issue is structural", async () => {
    const priceIssue = "WS-NFC-0001: RM35.00 isn't an approved price. Dispute the report, or approve the promotion first if the partner genuinely ran one.";
    mocks.salesReport.mockResolvedValue({ ...actual, issues: [...actual.issues, priceIssue] });
    render(<ConsignmentPanel />);
    const button = (await screen.findByRole("button", { name: "Verify report" })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Can’t be verified as reported")).toBeTruthy();
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.reportAction).not.toHaveBeenCalled();
  });

  it("still blocks a shortfall the count can't cover, which the server never marks linkable", async () => {
    mocks.salesReport.mockResolvedValue({ ...actual, linkResolvableIssues: [],
      lateReport: { ...actual.lateReport!, skus: [{ ...actual.lateReport!.skus[0], requiredLinks: 0 }] } });
    render(<ConsignmentPanel />);
    expect(((await screen.findByRole("button", { name: "Verify report" })) as HTMLButtonElement).disabled).toBe(true);
  });
});
