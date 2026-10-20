// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsignmentPanel } from "./ConsignmentPanel";
import { adminCapabilities, allAdminCapabilities, noAdminAccess } from "@/lib/adminCapabilities";
import type { Discrepancy, Stocktake, StocktakeExpectation, StocktakeLine, StockPosition } from "@/services/adminConsignmentService";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), policy: vi.fn(), agreements: vi.fn(), dispatches: vi.fn(), positions: vi.fn(), catalog: vi.fn(),
  stocktakes: vi.fn(), stocktake: vi.fn(), expectation: vi.fn(), saveStocktake: vi.fn(), stocktakeAction: vi.fn(),
  discrepancies: vi.fn(), resolve: vi.fn(),
}));
vi.mock("@/services/authService", () => ({ getAdminCapabilities: mocks.access }));
vi.mock("@/services/adminMerchantSalesService", () => ({ listMerchants: vi.fn(async () => ({ items: [], total: 0 })) }));
vi.mock("@/services/merchantDirectoryService", () => ({ getMerchantListing: vi.fn(async () => ({ branches: [] })) }));
vi.mock("@/services/tagCatalogService", () => ({ listAdminTagCatalogOptions: mocks.catalog }));
vi.mock("@/services/adminConsignmentService", () => ({
  getAgreementDocument: vi.fn(() => new Promise(() => {})),
  getApprovalPolicy: mocks.policy, listAgreements: mocks.agreements, listDispatches: mocks.dispatches, getDispatch: vi.fn(),
  custodyAction: vi.fn(), saveAgreement: vi.fn(), agreementAction: vi.fn(), downloadConsignment: vi.fn(), reserveConsignment: vi.fn(),
  downloadReconciliation: vi.fn(), downloadReviewLog: vi.fn(), downloadSalesReports: vi.fn(), downloadStockLedger: vi.fn(),
  listStockPositions: mocks.positions, listPriceTerms: vi.fn(async () => []), listSalesReports: vi.fn(async () => ({ items: [], total: 0 })),
  getSalesReport: vi.fn(), saveSalesReport: vi.fn(), salesReportAction: vi.fn(), savePriceTerm: vi.fn(), priceTermAction: vi.fn(),
  startStockTracking: vi.fn(), copyPriceTerms: vi.fn(),
  listStocktakes: mocks.stocktakes, getStocktake: mocks.stocktake, getStocktakeExpectation: mocks.expectation, saveStocktake: mocks.saveStocktake,
  stocktakeAction: mocks.stocktakeAction, listDiscrepancies: mocks.discrepancies, resolveDiscrepancy: mocks.resolve, downloadStocktakes: vi.fn(),
}));

const position: StockPosition = { merchantId: "merchant", merchantName: "Paws Corner", merchantBranchId: "branch", branchName: "Main branch",
  lastVerifiedPeriodEnd: null, reportsAwaitingVerification: 0, disputedReports: 0, openDiscrepancies: 1, stocktakeInProgress: true,
  skus: [{ productVariantId: "plw", sku: "PAWSOME-LW", productName: "Pawsome · Lightweight", sellable: 32, unsellable: 0, investigation: 0,
    soldUnidentified: 8, lostUnidentified: 0, unverifiedSold: 0, unverifiedRestockable: 0, provisionalSellable: 32, custodyUnits: 40,
    tieOutBalanced: true, untrackedUnits: 0, deliveryHolds: 0, activatedInCustody: 0 }] };
const line: StocktakeLine = { id: "line", productVariantId: "plw", sku: "PAWSOME-LW", productName: "Pawsome · Lightweight",
  bookSellable: 32, bookUnsellable: 0, bookInvestigation: 0, bookSold: 8, bookLost: 0, openSurplusBefore: 0, expectedSellable: 32,
  expectedUnsellable: 0, countedSellable: 30, countedUnsellable: 0, sellableVariance: -2, unsellableVariance: 0, unsellableFound: 0,
  unsellableShortage: 0, shortage: 2, surplus: 0, surplusNoLongerPresent: 0, closingSellable: 30, closingUnsellable: 0,
  closingInvestigation: 2, closingSold: 8, closingLost: 0, openSurplusAfter: 0, custodyUnits: 40, notes: null, frozen: false };
const recorded: Stocktake = { id: "count", merchantId: "merchant", merchantName: "Paws Corner", merchantBranchId: "branch",
  branchName: "Main branch", countDate: "2026-09-30", cutoffAt: "2026-09-30T16:00:00Z", countedBy: "Shop owner", evidenceKind: "Count sheet photo",
  evidenceReference: "Count sheet photo 30 Sep", notes: null, status: "Recorded", previousStocktakeId: null, previousCutoffAt: null,
  createdAt: "2026-10-01T01:00:00Z", recordedAt: "2026-10-01T01:05:00Z", approvedAt: null, reviewMode: null, lines: [line], issues: [],
  warnings: ["PAWSOME-LW: 2 short, held under investigation."], concurrencyToken: "count-token",
  countedAt: "2026-09-30T13:40:00Z", countedAfterCutoffNote: null, reviewFingerprint: "fingerprint-1" };
const expectation: StocktakeExpectation = { merchantBranchId: "branch", countDate: "2026-09-30", cutoffAt: "2026-09-30T16:00:00Z",
  previousCutoffAt: null, issues: [], lines: [{ ...line, id: null, countedSellable: null, countedUnsellable: null, sellableVariance: null,
    unsellableVariance: null, shortage: 0, closingSellable: 32, closingInvestigation: 0 }] };
const shortage: Discrepancy = { id: "short", merchantId: "merchant", merchantName: "Paws Corner", merchantBranchId: "branch",
  branchName: "Main branch", productVariantId: "plw", sku: "PAWSOME-LW", originStocktakeId: "count", originCountDate: "2026-08-31",
  kind: "Shortage", quantity: 2, openQuantity: 2, status: "Open", allowedOutcomes: ["Found", "FoundDamaged", "ApprovedLoss"], resolutions: [],
  createdAt: "2026-09-01T01:00:00Z", concurrencyToken: "short-token" };

beforeEach(() => {
  vi.clearAllMocks(); window.history.replaceState(null, "", "/"); window.sessionStorage.clear();
  mocks.access.mockReturnValue(allAdminCapabilities());
  mocks.policy.mockResolvedValue({ mode: "Team", selfReviewerAdminUserId: null, selfReviewerName: null, canSelfReview: false,
    updatedByAdminUserId: null, updatedAt: null, concurrencyToken: "policy", eligibleReviewers: [], history: [] });
  mocks.agreements.mockResolvedValue({ items: [], total: 0 }); mocks.dispatches.mockResolvedValue({ items: [], total: 0 });
  mocks.catalog.mockResolvedValue([]); mocks.positions.mockResolvedValue([position]);
  mocks.stocktakes.mockResolvedValue({ items: [recorded], total: 1 }); mocks.stocktake.mockResolvedValue(recorded);
  mocks.expectation.mockResolvedValue(expectation); mocks.discrepancies.mockResolvedValue([shortage]);
});
afterEach(cleanup);

const goTo = (label: RegExp) =>
  fireEvent.click(within(screen.getByRole("navigation", { name: "Consignment sections" })).getByRole("button", { name: label }));

describe("Stocktake & reconciliation", () => {
  it("records a count by SKU against the books, showing the difference before saving", async () => {
    mocks.saveStocktake.mockImplementation(async () => ({ ...recorded, status: "Draft" }));
    mocks.stocktakeAction.mockResolvedValue(recorded);
    render(<ConsignmentPanel />); goTo(/^Stocktake & reconciliation/);
    expect(await screen.findByText("Monthly stocktakes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Record stocktake" }));
    fireEvent.change(screen.getByLabelText("Count date"), { target: { value: "2026-09-30" } });
    const counted = await screen.findByLabelText("Counted sellable PAWSOME-LW");
    expect(within(screen.getByRole("table", { name: /Expected and counted/ })).getByText("32")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Counted by"), { target: { value: "Shop owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Record count" }));
    expect(screen.getAllByText("Enter both counts (0 if none).").length).toBeGreaterThan(0);
    expect(mocks.saveStocktake).not.toHaveBeenCalled();
    fireEvent.change(counted, { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Counted unsellable PAWSOME-LW"), { target: { value: "0" } });
    expect(screen.getByText("2 missing")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Evidence reference"), { target: { value: "Count sheet photo 30 Sep" } });
    // The actual count time is required, in Malaysia time.
    fireEvent.click(screen.getByRole("button", { name: "Record count" }));
    expect(screen.getByText("Enter when the shelf was actually counted.")).toBeTruthy();
    expect(mocks.saveStocktake).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Counted at"), { target: { value: "2026-09-30T21:40" } });
    expect(screen.queryByLabelText("Nothing moved since midnight because")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Record count" }));
    await waitFor(() => expect(mocks.stocktakeAction).toHaveBeenCalledWith(expect.anything(), "record"));
    expect(mocks.saveStocktake.mock.calls[0][0]).toMatchObject({ merchantBranchId: "branch", countDate: "2026-09-30", countedBy: "Shop owner",
      evidenceKind: "Count sheet photo", countedAt: "2026-09-30T21:40:00+08:00", countedAfterCutoffNote: null,
      lines: [{ productVariantId: "plw", countedSellable: 30, countedUnsellable: 0 }] });
    expect(mocks.saveStocktake.mock.calls[0][0].idempotencyKey).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("stocktake")).toBe("count");
  });

  it("closes the month only after its findings are acknowledged, showing next month's opening", async () => {
    mocks.stocktakeAction.mockResolvedValue({ ...recorded, status: "Approved", reviewMode: "Independent (Team)" });
    window.history.replaceState(null, "", "/?tab=consignment&stocktake=count"); render(<ConsignmentPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Close month" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/opens next month with 30 sellable, 2 under investigation/)).toBeTruthy();
    const confirm = within(dialog).getByRole("button", { name: "Close month" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /checked these points/ }));
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.stocktakeAction).toHaveBeenCalledWith(expect.objectContaining({ id: "count" }), "approve",
      { selfReview: undefined, acknowledgeWarnings: true, reviewedFingerprint: "fingerprint-1" }));
  });

  it("accepts a next-morning count only with a reason nothing moved, and never backdates it", async () => {
    mocks.saveStocktake.mockImplementation(async () => ({ ...recorded, status: "Draft" }));
    mocks.stocktakeAction.mockResolvedValue(recorded);
    render(<ConsignmentPanel />); goTo(/^Stocktake & reconciliation/);
    fireEvent.click(await screen.findByRole("button", { name: "Record stocktake" }));
    fireEvent.change(screen.getByLabelText("Count date"), { target: { value: "2026-09-30" } });
    fireEvent.change(await screen.findByLabelText("Counted sellable PAWSOME-LW"), { target: { value: "32" } });
    fireEvent.change(screen.getByLabelText("Counted unsellable PAWSOME-LW"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Counted by"), { target: { value: "Shop owner" } });
    fireEvent.change(screen.getByLabelText("Evidence reference"), { target: { value: "Count sheet photo 1 Oct" } });
    fireEvent.change(screen.getByLabelText("Counted at"), { target: { value: "2026-10-01T08:30" } });
    const note = screen.getByLabelText("Nothing moved since midnight because");
    fireEvent.click(screen.getByRole("button", { name: "Record count" }));
    expect(screen.getByText(/Explain how you know nothing was sold/)).toBeTruthy();
    expect(mocks.saveStocktake).not.toHaveBeenCalled();
    fireEvent.change(note, { target: { value: "Shop opens at 10 am; counted before opening" } });
    fireEvent.click(screen.getByRole("button", { name: "Record count" }));
    await waitFor(() => expect(mocks.saveStocktake).toHaveBeenCalled());
    expect(mocks.saveStocktake.mock.calls[0][0]).toMatchObject({ countDate: "2026-09-30", countedAt: "2026-10-01T08:30:00+08:00",
      countedAfterCutoffNote: "Shop opens at 10 am; counted before opening" });
  });

  it("shows verified stock, extra packages noted and the count time separately", async () => {
    mocks.stocktake.mockResolvedValue({ ...recorded, lines: [{ ...line, bookSellable: 30, openSurplusBefore: 2, expectedSellable: 32 }] });
    window.history.replaceState(null, "", "/?tab=consignment&stocktake=count"); render(<ConsignmentPanel />);
    expect(await screen.findByText("30 verified + 2 extra noted")).toBeTruthy();
    expect(screen.getByText(/Counted by Shop owner on 30 Sep 2026, 9:40 pm/)).toBeTruthy();
  });

  it("loads older stocktakes on request", async () => {
    mocks.stocktakes.mockResolvedValue({ items: [recorded], total: 25 });
    render(<ConsignmentPanel />); goTo(/^Stocktake & reconciliation/);
    fireEvent.click(await screen.findByRole("button", { name: "Show older stocktakes (24 more)" }));
    await waitFor(() => expect(mocks.stocktakes).toHaveBeenLastCalledWith(1, {}, 40));
  });

  it("can't close while issues remain, or without the close permission", async () => {
    mocks.stocktake.mockResolvedValue({ ...recorded, issues: ["Verify, dispute or discard the sales reports for this period first (2026-09-B)."] });
    window.history.replaceState(null, "", "/?tab=consignment&stocktake=count"); const view = render(<ConsignmentPanel />);
    expect(await screen.findByText(/sales reports for this period first/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Close month" }) as HTMLButtonElement).disabled).toBe(true);
    view.unmount();
    mocks.stocktake.mockResolvedValue(recorded);
    mocks.access.mockReturnValue({ ...noAdminAccess, granted: new Set([adminCapabilities.consignmentView, adminCapabilities.consignmentStocktakeRecord]) });
    render(<ConsignmentPanel />);
    expect(await screen.findByText("Stocktake 30 Sep 2026")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close month" })).toBeNull();
    expect(screen.getByRole("button", { name: "Discard count" })).toBeTruthy();
  });

  it("shows a closed month as frozen", async () => {
    mocks.stocktake.mockResolvedValue({ ...recorded, status: "Approved", reviewMode: "Independent (Team)", approvedAt: "2026-10-01T02:00:00Z",
      warnings: [], lines: [{ ...line, frozen: true }] });
    window.history.replaceState(null, "", "/?tab=consignment&stocktake=count"); render(<ConsignmentPanel />);
    expect(await screen.findByText("This month is closed")).toBeTruthy();
    for (const name of ["Close month", "Discard count", "Edit count"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("resolves a discrepancy with an outcome, evidence and a reason", async () => {
    mocks.resolve.mockResolvedValue({ ...shortage, openQuantity: 1 });
    render(<ConsignmentPanel />); goTo(/^Stocktake & reconciliation/);
    expect(await screen.findByText("PAWSOME-LW · Missing from the shelf")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Record outcome" }));
    expect(within(dialog).getByText("Choose what happened.")).toBeTruthy(); expect(mocks.resolve).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("radio", { name: /Found at the shop/ }));
    fireEvent.change(within(dialog).getByLabelText("Quantity"), { target: { value: "1" } });
    fireEvent.change(within(dialog).getByLabelText("Evidence"), { target: { value: "Shop photo 3 Oct" } });
    fireEvent.change(within(dialog).getByLabelText("Explanation"), { target: { value: "Found behind the counter display" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record outcome" }));
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith(shortage, { outcome: "Found", quantity: 1,
      evidenceReference: "Shop photo 3 Oct", reason: "Found behind the counter display", relatedDiscrepancyId: null }));
  });

  it("shows each outcome's evidence, and withdrawn explanations, in the history", async () => {
    mocks.discrepancies.mockResolvedValue([{ ...shortage, resolutions: [
      { id: "r1", outcome: "ExplainedByLateReport", quantity: 2, evidenceReference: "POS receipts 20 and 28 Sep", reason: "Sold before the count",
        linkedSalesReportId: "v1", relatedDiscrepancyId: null, reviewMode: "Independent (Team)", actorAdminUserId: "a", recordedAt: "2026-10-02T01:00:00Z" },
      { id: "r2", outcome: "AllocationWithdrawn", quantity: 2, evidenceReference: "WA corrected report", reason: "Replaced by the corrected report",
        linkedSalesReportId: "v2", relatedDiscrepancyId: null, reviewMode: "Independent (Team)", actorAdminUserId: "a", recordedAt: "2026-10-03T01:00:00Z",
        reversesResolutionId: "r1" }] }]);
    render(<ConsignmentPanel />); goTo(/^Stocktake & reconciliation/);
    expect(await screen.findByText("Evidence: POS receipts 20 and 28 Sep")).toBeTruthy();
    expect(screen.getByText("Explanation withdrawn")).toBeTruthy();
    expect(screen.getByText(/\(open again\)/)).toBeTruthy();
  });

  it("never offers to certify damaged stock as returned", async () => {
    mocks.discrepancies.mockResolvedValue([{ ...shortage, id: "damaged", kind: "UnsellableFound", allowedOutcomes: ["ConfirmedDamaged", "RecountSellable"] }]);
    render(<ConsignmentPanel />); goTo(/^Stocktake & reconciliation/);
    fireEvent.click(await screen.findByRole("button", { name: "Resolve" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("radio")).toHaveLength(2);
    expect(within(dialog).queryByText(/returned/i)).toBeNull();
  });

  it("offers no resolve action without the resolve permission", async () => {
    mocks.access.mockReturnValue({ ...noAdminAccess, granted: new Set([adminCapabilities.consignmentView, adminCapabilities.consignmentPeriodsClose]) });
    render(<ConsignmentPanel />); goTo(/^Stocktake & reconciliation/);
    expect(await screen.findByText("PAWSOME-LW · Missing from the shelf")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Record stocktake" })).toBeNull();
  });
});
