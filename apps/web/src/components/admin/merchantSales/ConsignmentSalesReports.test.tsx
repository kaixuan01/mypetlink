// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsignmentPanel } from "./ConsignmentPanel";
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
  getAgreementDocument: vi.fn(() => new Promise(() => {})),
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

describe("Sales reports workspace", () => {
  it("shows shelf stock, provisional stock and the custody check without inventing sales", async () => {
    render(<ConsignmentPanel />); goTo(/^Sales reports/);
    const table = await screen.findByRole("table", { name: /Paws Corner stock by SKU/ });
    const row = within(table).getByText("PAWSOME-LW").closest("tr")!;
    expect(row.textContent).toContain("40"); expect(row.textContent).toContain("32"); expect(within(row).getByText("Balanced")).toBeTruthy();
    expect(screen.getByText(/Recording a report changes nothing financial/)).toBeTruthy();
    expect(screen.getByText(/fixed amount per eligible sold tag/)).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Open sales report 2026-10-A/ })).toBeTruthy();
  });

  it("brings earlier deliveries into tracking only with a recorded reason", async () => {
    mocks.positions.mockResolvedValue([{ ...position, skus: [{ ...position.skus[0], untrackedUnits: 40, sellable: 0, tieOutBalanced: false }] }]);
    mocks.startTracking.mockResolvedValue(position);
    render(<ConsignmentPanel />); goTo(/^Sales reports/);
    fireEvent.click(await screen.findByRole("button", { name: "Bring into stock tracking" }));
    const dialog = screen.getByRole("dialog"); const confirm = within(dialog).getByRole("button", { name: "Start tracking" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Delivered before sales reporting" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.startTracking).toHaveBeenCalledWith("branch", "Delivered before sales reporting"));
  });

  it("blocks verification while issues remain and keeps disputes reasoned", async () => {
    mocks.salesReport.mockResolvedValue({ ...report, issues: ["PAWSOME-LW: RM35.00 isn't an approved price."] });
    mocks.reportAction.mockResolvedValue({ ...report, status: "Disputed" });
    window.history.replaceState(null, "", "/?tab=consignment&report=report"); render(<ConsignmentPanel />);
    expect(await screen.findByText(/RM35.00 isn't an approved price/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Verify report" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Dispute report" }));
    const dialog = screen.getByRole("dialog"); const confirm = within(dialog).getByRole("button", { name: "Dispute report" }) as HTMLButtonElement;
    fireEvent.change(within(dialog).getByLabelText("What needs correcting"), { target: { value: "Too short" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("What needs correcting"), { target: { value: "Shop sold below the approved price" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.reportAction).toHaveBeenCalledWith(expect.objectContaining({ id: "report" }), "dispute", { reason: "Shop sold below the approved price" }));
  });

  it("verifies under Solo only after warnings are acknowledged, with the report's evidence", async () => {
    mocks.salesReport.mockResolvedValue({ ...report, warnings: ["PAWSOME-LW: 9 tags at this partner have been activated by customers, but only 8 sales would be recorded."] });
    mocks.reportAction.mockResolvedValue({ ...report, status: "Verified" });
    window.history.replaceState(null, "", "/?tab=consignment&report=report"); render(<ConsignmentPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Verify report" }));
    const dialog = screen.getByRole("dialog"); const confirm = within(dialog).getByRole("button", { name: "Verify report" }) as HTMLButtonElement;
    expect(within(dialog).getByText(/marks no Tag Code as sold/)).toBeTruthy();
    expect(confirm.disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /checked these points/ }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /This is my own work/ }));
    expect((within(dialog).getByLabelText("Self-review external evidence reference") as HTMLInputElement).value).toBe("WA 16 Oct from owner");
    fireEvent.change(within(dialog).getByLabelText("Self-review reason"), { target: { value: "Checked the owner's WhatsApp summary" } });
    expect(confirm.disabled).toBe(false); fireEvent.click(confirm);
    await waitFor(() => expect(mocks.reportAction).toHaveBeenCalledWith(expect.objectContaining({ id: "report" }), "verify", {
      selfReview: { confirmed: true, reason: "Checked the owner's WhatsApp summary", externalEvidenceReference: "WA 16 Oct from owner" }, acknowledgeWarnings: true }));
  });

  it("links a late report to what the count found only as the reviewer chooses, with evidence", async () => {
    mocks.policy.mockResolvedValue({ ...soloPolicy, mode: "Team", canSelfReview: false });
    const late = { ...report, warnings: ["PAWSOME-LW: the stocktake of 15 Oct 2026 already closed this period."],
      lateReport: { closedByStocktakeId: "count", closedCountDate: "2026-10-15", closedCutoffAt: "2026-10-15T16:00:00Z",
        skus: [{ productVariantId: "plw", sku: "PAWSOME-LW", lateShelfChange: -8, explainsKind: "Shortage" as const, capacity: 8, withdrawn: [],
          candidates: [{ discrepancyId: "short", kind: "Shortage" as const, originStocktakeId: "count", originCountDate: "2026-10-15",
            originCutoffAt: "2026-10-15T16:00:00Z", quantity: 2, openQuantity: 2 }] }] } };
    mocks.salesReport.mockResolvedValue(late);
    mocks.reportAction.mockResolvedValue({ ...report, status: "Verified" });
    window.history.replaceState(null, "", "/?tab=consignment&report=report"); render(<ConsignmentPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Verify report" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("The stocktake of 15 Oct 2026 already closed this period")).toBeTruthy();
    expect(within(dialog).getByText(/Missing from the shelf · count of 15 Oct 2026 · 2 of 2 open/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /checked these points/ }));
    fireEvent.change(within(dialog).getByLabelText("Link to this shortage"), { target: { value: "3" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Verify report" }));
    expect(within(dialog).getByText("PAWSOME-LW: only 2 of that finding is open.")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Link to this shortage"), { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Verify report" }));
    expect(within(dialog).getByText(/record the evidence that links this report/)).toBeTruthy();
    expect(mocks.reportAction).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Link evidence"), { target: { value: "POS receipts 3 and 9 Oct" } });
    fireEvent.change(within(dialog).getByLabelText("Why this report accounts for it"), { target: { value: "Both sold before the count" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Verify report" }));
    await waitFor(() => expect(mocks.reportAction).toHaveBeenCalledWith(expect.objectContaining({ id: "report" }), "verify", {
      selfReview: undefined, acknowledgeWarnings: true,
      allocations: [{ discrepancyId: "short", quantity: 2, evidenceReference: "POS receipts 3 and 9 Oct", explanation: "Both sold before the count" }] }));
  });

  it("verifies a late report without links unless the reviewer adds them", async () => {
    mocks.policy.mockResolvedValue({ ...soloPolicy, mode: "Team", canSelfReview: false });
    mocks.salesReport.mockResolvedValue({ ...report, lateReport: { closedByStocktakeId: "count", closedCountDate: "2026-10-15",
      closedCutoffAt: "2026-10-15T16:00:00Z", skus: [{ productVariantId: "plw", sku: "PAWSOME-LW", lateShelfChange: -8, explainsKind: "Shortage",
        capacity: 8, candidates: [], withdrawn: [{ resolutionId: "r1", discrepancyId: "short", kind: "Shortage", salesReportId: "v1", quantity: 2 }] }] } });
    mocks.reportAction.mockResolvedValue({ ...report, status: "Verified" });
    window.history.replaceState(null, "", "/?tab=consignment&report=report"); render(<ConsignmentPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Verify report" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/explained 2 of what the count found/)).toBeTruthy();
    expect(within(dialog).getByText("Nothing open from that count can be linked to this report.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Verify report" }));
    await waitFor(() => expect(mocks.reportAction).toHaveBeenCalledWith(expect.objectContaining({ id: "report" }), "verify",
      { selfReview: undefined, acknowledgeWarnings: false }));
  });

  it("offers only the actions that fit each report status", async () => {
    mocks.salesReport.mockResolvedValue({ ...report, status: "Verified", reviewMode: "Self-reviewed (Solo)" });
    window.history.replaceState(null, "", "/?tab=consignment&report=report"); const view = render(<ConsignmentPanel />);
    expect(await screen.findByRole("button", { name: "Correct report" })).toBeTruthy();
    for (const name of ["Verify report", "Dispute report", "Record as unverified", "Edit draft"]) expect(screen.queryByRole("button", { name })).toBeNull();
    view.unmount();
    mocks.access.mockReturnValue({ ...noAdminAccess, granted: new Set([adminCapabilities.consignmentView]) });
    mocks.salesReport.mockResolvedValue(report);
    render(<ConsignmentPanel />);
    expect(await screen.findByText("2026-10-A · version 1 · PAWS-1 v1")).toBeTruthy();
    for (const name of ["Verify report", "Dispute report", "Correct report"]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.queryByRole("button", { name: "Record sales report" })).toBeNull();
  });

  it("records a report as reported, approved prices filled from the agreement and other prices flagged", async () => {
    mocks.saveReport.mockImplementation(async () => ({ ...report, status: "Draft" }));
    mocks.reportAction.mockResolvedValue(report);
    render(<ConsignmentPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Record sales report" }));
    await screen.findByRole("option", { name: "Main branch" });
    fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "branch" } });
    fireEvent.change(screen.getByLabelText("Sales month"), { target: { value: "2026-10" } });
    fireEvent.click(screen.getByRole("radio", { name: "1st – 15th" }));
    fireEvent.change(screen.getByLabelText("Partner report reference"), { target: { value: "2026-10-A" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert").textContent).toContain("Choose the tag option");
    fireEvent.change(screen.getByLabelText("Tag option (line 1)"), { target: { value: "plw" } });
    fireEvent.change(screen.getByLabelText("Price (line 1)"), { target: { value: "std" } });
    expect((screen.getByLabelText("Unit price RM (line 1)") as HTMLInputElement).value).toBe("39.90");
    expect((screen.getByLabelText("Unit price RM (line 1)") as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Sold (line 1)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add sale line" }));
    fireEvent.change(screen.getByLabelText("Tag option (line 2)"), { target: { value: "plw" } });
    fireEvent.change(screen.getByLabelText("Price (line 2)"), { target: { value: "other" } });
    fireEvent.change(screen.getByLabelText("Unit price RM (line 2)"), { target: { value: "35" } });
    fireEvent.change(screen.getByLabelText("Sold (line 2)"), { target: { value: "2" } });
    expect(screen.getByText(/This price isn’t approved/)).toBeTruthy();
    expect(screen.getByText(/7 sold · 0 refunded · net RM269.50/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Record as unverified" }));
    expect(screen.getByText(/Describe where the report came from/)).toBeTruthy(); expect(mocks.saveReport).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Evidence reference"), { target: { value: "WA 16 Oct from owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Record as unverified" }));
    await waitFor(() => expect(mocks.reportAction).toHaveBeenCalledWith(expect.anything(), "record"));
    const input = mocks.saveReport.mock.calls[0][0];
    expect(input).toMatchObject({ agreementId: "agreement", merchantBranchId: "branch", periodMonth: "2026-10", half: 1, partnerReference: "2026-10-A",
      evidenceLevel: "Summary", evidenceKind: "WhatsApp summary", evidenceReference: "WA 16 Oct from owner" });
    expect(input.lines).toEqual([
      expect.objectContaining({ productVariantId: "plw", lineType: "Sale", priceTermId: "std", unitNetPrice: 39.9, quantity: 5 }),
      expect.objectContaining({ productVariantId: "plw", lineType: "Sale", priceTermId: null, unitNetPrice: 35, quantity: 2 }),
    ]);
    expect(new URLSearchParams(window.location.search).get("report")).toBe("report");
  });

  it("keeps the agreement's prices when the same agreement is chosen again", async () => {
    render(<ConsignmentPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Record sales report" }));
    await screen.findByRole("option", { name: "Main branch" });
    fireEvent.change(screen.getByLabelText("Agreement"), { target: { value: "agreement" } });
    fireEvent.change(screen.getByLabelText("Partner report reference"), { target: { value: "2026-10-A" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Tag option (line 1)"), { target: { value: "plw" } });
    expect(within(screen.getByLabelText("Price (line 1)")).getByRole("option", { name: "Standard · RM39.90" })).toBeTruthy();
    expect(mocks.priceTerms).toHaveBeenCalledTimes(1);
  });

  it("keeps entries and the period through steps, and locks the period on a correction", async () => {
    mocks.salesReport.mockResolvedValue({ ...report, status: "Disputed", disputeReason: "Wrong count" });
    const draft = { ...report, id: "v2", version: 2, status: "Draft" as const, supersedesReportId: "report", concurrencyToken: "v2-token" };
    mocks.reportAction.mockResolvedValue(draft);
    window.history.replaceState(null, "", "/?tab=consignment&report=report"); render(<ConsignmentPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Correct report" }));
    const correctDialog = screen.getByRole("dialog");
    const start = within(correctDialog).getByRole("button", { name: "Start correction" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.change(within(correctDialog).getByLabelText("Why it needs correcting"), { target: { value: "Partner sent corrected figures" } });
    fireEvent.click(start);
    await waitFor(() => expect(mocks.reportAction).toHaveBeenCalledWith(expect.objectContaining({ id: "report" }), "correct", { reason: "Partner sent corrected figures" }));
    expect(await screen.findByText(/Correct 2026-10-A \(version 2\)/)).toBeTruthy();
    expect((screen.getByLabelText("Partner report reference") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Sales month") as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((screen.getByLabelText("Sold (line 1)") as HTMLInputElement).value).toBe("8");
    fireEvent.change(screen.getByLabelText("Sold (line 1)"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Back" })); fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((screen.getByLabelText("Sold (line 1)") as HTMLInputElement).value).toBe("7");
  });

  it("switching section closes an open report", async () => {
    window.history.replaceState(null, "", "/?tab=consignment&report=report"); render(<ConsignmentPanel />);
    await screen.findByRole("button", { name: "Verify report" });
    goTo(/^Agreements/);
    expect(new URLSearchParams(window.location.search).get("report")).toBeNull();
    expect(new URLSearchParams(window.location.search).get("view")).toBe("agreements");
  });
});

describe("Approved selling prices", () => {
  it("approves a draft price under Solo with its acceptance evidence, and saves new prices as drafts", async () => {
    mocks.priceAction.mockResolvedValue({ ...promo, status: "Approved" }); mocks.savePrice.mockResolvedValue(promo);
    mocks.catalog.mockResolvedValue([{ name: "Pawsome", variants: [{ id: "plw", sku: "PAWSOME-LW", displayName: "Lightweight", isActive: true, supportsQr: true, supportsNfc: true }] }]);
    window.history.replaceState(null, "", "/?tab=consignment&agreement=agreement"); render(<ConsignmentPanel />);
    const card = (await screen.findByText("Approved selling prices")).closest("section")!;
    expect(await within(card).findByText("Promotion · Opening week")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Approve" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /This is my own work/ }));
    expect((within(dialog).getByLabelText("Self-review external evidence reference") as HTMLInputElement).value).toBe("WA promo ok");
    fireEvent.change(within(dialog).getByLabelText("Self-review reason"), { target: { value: "Partner confirmed the opening-week price" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve price" }));
    await waitFor(() => expect(mocks.priceAction).toHaveBeenCalledWith(promo, "approve", expect.objectContaining({ selfReview: expect.objectContaining({ externalEvidenceReference: "WA promo ok" }) })));

    const refreshed = (await screen.findByText("Approved selling prices")).closest("section")!;
    fireEvent.click(await within(refreshed).findByRole("button", { name: "Add price" }));
    fireEvent.click(screen.getByRole("radio", { name: "Promotion" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft price" }));
    expect(screen.getByText("Name the promotion.")).toBeTruthy(); expect(mocks.savePrice).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Tag option"), { target: { value: "plw" } });
    fireEvent.change(screen.getByLabelText("Promotion name"), { target: { value: "Raya week" } });
    fireEvent.change(screen.getByLabelText("Selling price (RM)"), { target: { value: "33.90" } });
    fireEvent.change(screen.getByLabelText("First day"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Last day"), { target: { value: "2026-10-26" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft price" }));
    await waitFor(() => expect(mocks.savePrice).toHaveBeenCalled());
    const [input] = mocks.savePrice.mock.calls[0];
    expect(input).toMatchObject({ agreementId: "agreement", productVariantId: "plw", kind: "Promotion", name: "Raya week", unitNetPrice: 33.9 });
    expect(Date.parse(input.validToExclusive) - Date.parse(input.validFrom)).toBe(7 * 86400000);
  });

  it("can't approve a price without the partner's acceptance recorded", async () => {
    mocks.priceTerms.mockResolvedValue([{ ...promo, approvalEvidenceReference: null }]);
    window.history.replaceState(null, "", "/?tab=consignment&agreement=agreement"); render(<ConsignmentPanel />);
    const card = (await screen.findByText("Approved selling prices")).closest("section")!;
    await within(card).findByText("Promotion · Opening week");
    expect((within(card).getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Identified handovers on tracked partners", () => {
  const units = [{ id: "unit", unitReference: "CU-UNIT", receivingState: "Good", tagCode: null, sku: "PAWSOME-LW", productName: "Pawsome", variant: "Lightweight",
    batch: "B-1", status: "Received", qaStatus: "Passed", isActivated: true, externalReference: null, currentHandoverRecordId: null }];
  const received = { id: "dispatch", agreementId: "agreement", dispatchNumber: "MPL-CS-1", merchantName: "Paws Corner", agreementReference: "PAWS-1",
    agreementVersion: 1, commissionPercentage: 35, destination: "Main branch", status: "Received", externalTrackerReference: "TRACKER", dispatchedAt: "2026-10-01T00:00:00Z",
    receivedAt: "2026-10-01T00:00:00Z", shipmentReference: "SHIP", receiptAcknowledgment: "RX", reserved: 0, partnerHeld: 1, returnedQuarantine: 0, released: 0,
    externalHandovers: 0, writtenOff: 0, activatedWithoutExternalReference: 1, units, history: [], concurrencyToken: "d-token", merchantBranchId: "branch",
    hasOpenDiscrepancy: false, hasIssuedDocument: true, recipientName: "Lead", partnerReceivedAt: "2026-10-01T00:00:00Z", receivedQuantity: 1,
    reconciliation: [], stockTracked: true } as ConsignmentDispatch;

  it("asks what happened to the tag instead of a price, and sends the attribution", async () => {
    mocks.get.mockResolvedValue(received); mocks.act.mockResolvedValue(received);
    window.history.replaceState(null, "", "/?tab=consignment&dispatch=dispatch"); render(<ConsignmentPanel />);
    fireEvent.click(await screen.findByRole("radio", { name: /Record customer handover/ }));
    expect(screen.queryByRole("checkbox", { name: /externally reported sale/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select CU-UNIT" }));
    fireEvent.change(screen.getByLabelText("Reason or tracker entry reference"), { target: { value: "Support case 12" } });
    fireEvent.change(screen.getByLabelText("Unique external event reference"), { target: { value: "H-1" } });
    fireEvent.change(screen.getByLabelText("Actual handover / correction date"), { target: { value: "2026-10-10T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Record external customer handover" }));
    expect(screen.getByRole("alert").textContent).toContain("reported sales");
    fireEvent.click(screen.getByRole("radio", { name: /one of the partner’s reported sales/ }));
    fireEvent.click(screen.getByRole("button", { name: "Record external customer handover" }));
    fireEvent.click(screen.getByRole("button", { name: /^Confirm$/ }));
    await waitFor(() => expect(mocks.act).toHaveBeenCalledWith(received, "external-handover", "Support case 12", ["unit"],
      { handover: expect.objectContaining({ attribution: "AggregateSale", isReportedSale: false, sellingPrice: null }) }));
  });

  it("sends where a returned package was counted", async () => {
    const shelf = { ...received, units: [{ ...units[0], isActivated: false }] } as ConsignmentDispatch;
    mocks.get.mockResolvedValue(shelf); mocks.act.mockResolvedValue(shelf);
    window.history.replaceState(null, "", "/?tab=consignment&dispatch=dispatch"); render(<ConsignmentPanel />);
    fireEvent.click(await screen.findByRole("radio", { name: /Receive returned tags/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select CU-UNIT" }));
    fireEvent.change(screen.getByLabelText("Returned from"), { target: { value: "Unsellable" } });
    fireEvent.change(screen.getByLabelText("Reason or tracker entry reference"), { target: { value: "Damaged box collected" } });
    fireEvent.click(screen.getByRole("button", { name: "Receive selected returns" }));
    fireEvent.click(screen.getByRole("button", { name: /^Confirm$/ }));
    await waitFor(() => expect(mocks.act).toHaveBeenCalledWith(shelf, "return", "Damaged box collected", ["unit"], { returnFromBucket: "Unsellable" }));
  });
});

// A saved report holding exactly what the wizard sent, as the server would return it.
const asSaved = (input: SalesReportInput, status: SalesReport["status"], id = "saved"): SalesReport => ({
  ...report, id, status, concurrencyToken: `${id}-${status}`, agreementId: input.agreementId, merchantBranchId: input.merchantBranchId,
  periodStart: `${input.periodMonth}-${input.half === 1 ? "01" : "16"}T00:00:00+08:00`, partnerReference: input.partnerReference.toUpperCase(),
  reportReceivedAt: input.reportReceivedAt, evidenceLevel: input.evidenceLevel, evidenceKind: input.evidenceKind,
  evidenceReference: input.evidenceReference ?? "", notes: input.notes,
  lines: input.lines.map((l, i) => ({ ...report.lines[0], id: `line-${i}`, productVariantId: l.productVariantId, lineType: l.lineType,
    priceTermId: l.priceTermId, unitNetPrice: l.unitNetPrice, quantity: l.quantity, refundOfPeriodStart: l.refundOfPeriodStart ?? null,
    restockableQuantity: l.restockableQuantity ?? 0, unsellableReturnedQuantity: l.unsellableReturnedQuantity ?? 0, notes: l.notes ?? null,
    sealedReturnConfirmed: Boolean(l.sealedReturnConfirmed), sealedReturnEvidence: l.sealedReturnEvidence ?? null })),
});

async function openWizardWithSale(sold: string, half: "1st – 15th" | "16th – month end" = "1st – 15th") {
  render(<ConsignmentPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Record sales report" }));
  await screen.findByRole("option", { name: "Main branch" });
  fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "branch" } });
  fireEvent.change(screen.getByLabelText("Sales month"), { target: { value: "2026-10" } });
  fireEvent.click(screen.getByRole("radio", { name: half }));
  fireEvent.change(screen.getByLabelText("Partner report reference"), { target: { value: "2026-10-A" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.change(screen.getByLabelText("Tag option (line 1)"), { target: { value: "plw" } });
  fireEvent.change(screen.getByLabelText("Price (line 1)"), { target: { value: "std" } });
  fireEvent.change(screen.getByLabelText("Sold (line 1)"), { target: { value: sold } });
}
const toEvidence = () => {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.change(screen.getByLabelText("Evidence reference"), { target: { value: "WA 16 Oct from owner" } });
};
const changeSold = (sold: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.change(screen.getByLabelText("Sold (line 1)"), { target: { value: sold } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
};
const recordIt = () => fireEvent.click(screen.getByRole("button", { name: "Record as unverified" }));

describe("Retrying a sales report after a failure", () => {
  it("retries a lost create with the same submission reference and the changed values", async () => {
    mocks.saveReport.mockRejectedValueOnce(new Error("We couldn't connect right now.")).mockImplementation(async (input: SalesReportInput) => asSaved(input, "Draft"));
    mocks.reportAction.mockImplementation(async (r: SalesReport) => ({ ...r, status: "Recorded" }));
    await openWizardWithSale("3"); toEvidence(); recordIt();
    expect(await screen.findByText(/couldn't connect right now\. Your entries are kept\./)).toBeTruthy();
    changeSold("7"); recordIt();
    await waitFor(() => expect(mocks.reportAction).toHaveBeenCalledTimes(1));
    const [first, second] = mocks.saveReport.mock.calls;
    expect(first[0].idempotencyKey).toBeTruthy();
    expect(second[0].idempotencyKey).toBe(first[0].idempotencyKey);
    expect(second[1]).toBeUndefined();
    expect(second[0].lines[0].quantity).toBe(7);
    expect(mocks.reportAction.mock.calls[0][0].lines[0].quantity).toBe(7);
  });

  it("updates the saved draft before recording when recording failed", async () => {
    mocks.saveReport.mockImplementation(async (input: SalesReportInput) => asSaved(input, "Draft"));
    mocks.reportAction.mockRejectedValueOnce(new Error("We couldn't connect right now.")).mockImplementation(async (r: SalesReport) => ({ ...r, status: "Recorded" }));
    mocks.salesReport.mockImplementation(async (id: string) => (id === "saved" ? asSaved(mocks.saveReport.mock.calls.at(-1)![0], "Draft") : report));
    await openWizardWithSale("3"); toEvidence(); recordIt();
    expect(await screen.findByText(/couldn't connect right now/)).toBeTruthy();
    changeSold("4"); recordIt();
    await waitFor(() => expect(mocks.reportAction).toHaveBeenCalledTimes(2));
    expect(mocks.saveReport).toHaveBeenCalledTimes(2);
    expect(mocks.saveReport.mock.calls[1][1]).toMatchObject({ id: "saved", status: "Draft" });
    expect(mocks.saveReport.mock.calls[1][0].lines[0].quantity).toBe(4);
    expect(mocks.reportAction.mock.calls[1][0].lines[0].quantity).toBe(4);
  });

  it("treats an identical retry of a recording whose reply was lost as done, without recording again", async () => {
    let recorded: SalesReport | null = null;
    mocks.saveReport.mockImplementation(async (input: SalesReportInput) => asSaved(input, "Draft"));
    mocks.reportAction.mockImplementationOnce(async (r: SalesReport) => {
      recorded = { ...r, status: "Recorded" };
      throw new Error("We couldn't connect right now.");
    });
    mocks.salesReport.mockImplementation(async (id: string) => (id === "saved" && recorded ? recorded : report));
    await openWizardWithSale("3"); toEvidence(); recordIt();
    expect(await screen.findByText(/couldn't connect right now/)).toBeTruthy();
    recordIt();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Record as unverified" })).toBeNull());
    expect(mocks.reportAction).toHaveBeenCalledTimes(1);
    expect(mocks.saveReport).toHaveBeenCalledTimes(1);
  });

  it("never records earlier values in silence when the retry differs from what was recorded", async () => {
    let recorded: SalesReport | null = null;
    mocks.saveReport.mockImplementation(async (input: SalesReportInput) => asSaved(input, "Draft"));
    mocks.reportAction.mockImplementationOnce(async (r: SalesReport) => {
      recorded = { ...r, status: "Recorded" };
      throw new Error("We couldn't connect right now.");
    });
    mocks.salesReport.mockImplementation(async (id: string) => (id === "saved" && recorded ? recorded : report));
    await openWizardWithSale("3"); toEvidence(); recordIt();
    expect(await screen.findByText(/couldn't connect right now/)).toBeTruthy();
    changeSold("5"); recordIt();
    expect(await screen.findByText(/already recorded with different values/)).toBeTruthy();
    expect(mocks.reportAction).toHaveBeenCalledTimes(1);
    expect(mocks.saveReport).toHaveBeenCalledTimes(1);
  });
});

describe("Refund lines", () => {
  it("refers to a real report period and needs a sealed-return confirmation to restock", async () => {
    mocks.saveReport.mockImplementation(async (input: SalesReportInput) => asSaved(input, "Draft"));
    mocks.reportAction.mockImplementation(async (r: SalesReport) => ({ ...r, status: "Recorded" }));
    await openWizardWithSale("2", "16th – month end");
    fireEvent.click(screen.getByRole("button", { name: "+ Add refund line" }));
    fireEvent.change(screen.getByLabelText("Tag option (line 2)"), { target: { value: "plw" } });
    const origin = screen.getByLabelText("Original sale period (line 2)");
    expect(within(origin).getByRole("option", { name: /This report’s period \(16–31 Oct 2026\)/ })).toBeTruthy();
    expect(within(origin).getByRole("option", { name: "1–15 Oct 2026 · 2026-10-A" })).toBeTruthy();
    fireEvent.change(origin, { target: { value: report.periodStart } });
    fireEvent.change(screen.getByLabelText("Price (line 2)"), { target: { value: "std" } });
    fireEvent.change(screen.getByLabelText("Refunded (line 2)"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Restockable (line 2)"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert").textContent).toContain("came back sealed");
    fireEvent.click(screen.getByRole("checkbox", { name: /restocked package came back sealed and unopened/ }));
    fireEvent.change(screen.getByLabelText("How you know (line 2)"), { target: { value: "Shop photo of the intact seal" } });
    toEvidence(); recordIt();
    await waitFor(() => expect(mocks.reportAction).toHaveBeenCalled());
    expect(mocks.saveReport.mock.calls[0][0].lines[1]).toMatchObject({ lineType: "Refund", priceTermId: "std", refundOfPeriodStart: report.periodStart,
      restockableQuantity: 1, sealedReturnConfirmed: true, sealedReturnEvidence: "Shop photo of the intact seal" });
  });
});

describe("Starting a correction", () => {
  it("needs the verify permission: recording alone can't reopen reviewed figures", async () => {
    mocks.salesReport.mockResolvedValue({ ...report, status: "Verified" });
    mocks.access.mockReturnValue({ ...noAdminAccess, granted: new Set([adminCapabilities.consignmentView, adminCapabilities.consignmentSalesReportsRecord]) });
    window.history.replaceState(null, "", "/?tab=consignment&report=report"); const view = render(<ConsignmentPanel />);
    expect(await screen.findByText("2026-10-A · version 1 · PAWS-1 v1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Correct report" })).toBeNull();
    view.unmount();
    mocks.access.mockReturnValue({ ...noAdminAccess, granted: new Set([adminCapabilities.consignmentView, adminCapabilities.consignmentSalesReportsVerify]) });
    render(<ConsignmentPanel />);
    expect(await screen.findByRole("button", { name: "Correct report" })).toBeTruthy();
  });
});

describe("Partner stock that can't be loaded", () => {
  it("shows an error with a working retry, never an empty stock list", async () => {
    mocks.positions.mockRejectedValueOnce(new Error("We couldn't connect right now.")).mockResolvedValue([position]);
    render(<ConsignmentPanel />); goTo(/^Sales reports/);
    expect(await screen.findByText("Partner stock couldn’t be loaded")).toBeTruthy();
    expect(screen.queryByText("No partner stock yet")).toBeNull();
    expect(screen.queryByRole("table", { name: /stock by SKU/ })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0]);
    expect(await screen.findByRole("table", { name: /Paws Corner stock by SKU/ })).toBeTruthy();
    expect(screen.queryByText("Partner stock couldn’t be loaded")).toBeNull();
  });

  it("says when access is missing, without offering a retry", async () => {
    mocks.positions.mockRejectedValue(new ApiClientError(403, "forbidden", "Admin access is required."));
    render(<ConsignmentPanel />); goTo(/^Sales reports/);
    expect(await screen.findByText("You don’t have access to partner stock.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByText("No partner stock yet")).toBeNull();
  });

  it("keeps earlier figures, labelled as possibly out of date, when a refresh fails", async () => {
    mocks.positions.mockResolvedValueOnce([{ ...position, skus: [{ ...position.skus[0], untrackedUnits: 40, sellable: 0, tieOutBalanced: false }] }])
      .mockRejectedValueOnce(new Error("We couldn't connect right now."));
    mocks.startTracking.mockResolvedValue(position);
    render(<ConsignmentPanel />); goTo(/^Sales reports/);
    fireEvent.click(await screen.findByRole("button", { name: "Bring into stock tracking" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Delivered before sales reporting" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Start tracking" }));
    expect(await screen.findByText("These figures may be out of date")).toBeTruthy();
    expect(screen.getByRole("table", { name: /Paws Corner stock by SKU/ })).toBeTruthy();
  });

  it("flags unavailable sales work on the overview instead of showing it as clear", async () => {
    mocks.positions.mockRejectedValue(new Error("We couldn't connect right now."));
    render(<ConsignmentPanel />);
    expect(await screen.findByText("Sales report and partner stock work is unavailable")).toBeTruthy();
  });
});

describe("Mixed tracking within one delivery", () => {
  it("asks for an attribution only for a tracked unit, and a price only for an earlier one", async () => {
    const base = { id: "unit", unitReference: "CU-UNIT", receivingState: "Good", tagCode: null, sku: "PAWSOME-LW", productName: "Pawsome", variant: "Lightweight",
      batch: "B-1", status: "Received", qaStatus: "Passed", isActivated: false, externalReference: null, currentHandoverRecordId: null };
    const mixed = { id: "dispatch", agreementId: "agreement", dispatchNumber: "MPL-CS-2", merchantName: "Paws Corner", agreementReference: "PAWS-1",
      agreementVersion: 1, commissionPercentage: 35, destination: "Main branch", status: "Received", externalTrackerReference: "TRACKER", dispatchedAt: "2026-10-01T00:00:00Z",
      receivedAt: "2026-10-01T00:00:00Z", shipmentReference: "SHIP", receiptAcknowledgment: "RX", reserved: 0, partnerHeld: 2, returnedQuarantine: 0, released: 0,
      externalHandovers: 0, writtenOff: 0, activatedWithoutExternalReference: 0, history: [], concurrencyToken: "d-token", merchantBranchId: "branch",
      hasOpenDiscrepancy: false, hasIssuedDocument: true, recipientName: "Lead", partnerReceivedAt: "2026-10-01T00:00:00Z", receivedQuantity: 2,
      reconciliation: [], stockTracked: true,
      units: [{ ...base, id: "legacy", unitReference: "CU-LEGACY", stockTracked: false }, { ...base, id: "tracked", unitReference: "CU-TRACKED", stockTracked: true }] } as ConsignmentDispatch;
    mocks.get.mockResolvedValue(mixed);
    window.history.replaceState(null, "", "/?tab=consignment&dispatch=dispatch"); render(<ConsignmentPanel />);
    fireEvent.click(await screen.findByRole("radio", { name: /Record customer handover/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select CU-LEGACY" }));
    expect(screen.getByRole("checkbox", { name: /externally reported sale/ })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /one of the partner’s reported sales/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select CU-LEGACY" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select CU-TRACKED" }));
    expect(screen.getByRole("radio", { name: /one of the partner’s reported sales/ })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /externally reported sale/ })).toBeNull();
  });
});

describe("Records whose earlier edits weren't recorded", () => {
  it("offers re-entry from evidence instead of a correction, with a reason, and opens an empty draft", async () => {
    mocks.salesReport.mockResolvedValue({ ...report, status: "Verified", contributorHistoryComplete: false });
    const fresh = { ...report, id: "v2", version: 2, status: "Draft" as const, supersedesReportId: "report", lines: [], concurrencyToken: "v2-token" };
    mocks.reportAction.mockResolvedValue(fresh);
    window.history.replaceState(null, "", "/?tab=consignment&report=report"); render(<ConsignmentPanel />);
    expect(await screen.findByText("Earlier edits weren’t recorded")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Correct report" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Re-enter from evidence" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Why it’s being re-entered"), { target: { value: "Editors before tracking are unknown" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Re-enter report" }));
    await waitFor(() => expect(mocks.reportAction).toHaveBeenCalledWith(expect.objectContaining({ id: "report" }), "re-enter", { reason: "Editors before tracking are unknown" }));
    expect(await screen.findByText(/Correct 2026-10-A \(version 2\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((screen.getByLabelText("Sold (line 1)") as HTMLInputElement).value).toBe("");
  });

  it("explains an unknown-history draft price", async () => {
    mocks.priceTerms.mockResolvedValue([{ ...promo, contributorHistoryComplete: false }]);
    window.history.replaceState(null, "", "/?tab=consignment&agreement=agreement"); render(<ConsignmentPanel />);
    expect(await screen.findByText(/Earlier edits weren’t recorded\. Withdraw it and add the price again/)).toBeTruthy();
  });
});
