// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminCapabilities, type AdminAccessCapabilities } from "@/lib/adminCapabilities";
import type { Settlement, SettlementRecovery, SettlementSummary } from "@/services/adminConsignmentSettlementService";
import recoveryFrames from "../__fixtures__/recovery-identity-frames.json";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), list: vi.fn(), get: vi.fn(), record: vi.fn(), voidReceipt: vi.fn(), resolve: vi.fn(), recalc: vi.fn(),
  download: vi.fn(), salespersons: vi.fn(),
}));
vi.mock("@/services/authService", () => ({ getAdminCapabilities: mocks.access }));
vi.mock("@/services/adminConsignmentSettlementService", () => ({
  listSettlements: mocks.list, getSettlement: mocks.get, recordPartnerPayment: mocks.record, voidPartnerPayment: mocks.voidReceipt,
  resolveSettlementAttribution: mocks.resolve, recalculateSettlement: mocks.recalc, downloadSettlementStatement: mocks.download,
}));
vi.mock("@/services/adminMerchantSalesService", () => ({
  listSalespersons: mocks.salespersons,
  getMerchantSalesError: (_: unknown, fallback: string) => fallback,
}));

const { SettlementsView } = await import("./SettlementsView");

function access(...granted: string[]): AdminAccessCapabilities {
  return { isSuperAdmin: false, roles: [], granted: new Set([adminCapabilities.consignmentSettlementsView, ...granted]) };
}

const summary: SettlementSummary = {
  id: "settlement-1", settlementNumber: "MPL-CSET-260905-0001", merchantId: "merchant", merchantName: "Paws Corner",
  merchantBranchId: "branch", branchName: "Main branch", periodStart: "2026-08-01T00:00:00+08:00", periodEndExclusive: "2026-08-16T00:00:00+08:00",
  salesReportId: "report", salesReportVersion: 1, revision: 1, status: "PartiallyReceived",
  standardQuantity: 100, standardSales: 3990, promotionQuantity: 0, promotionSales: 0, refundQuantity: 0, refundAmount: 0,
  eligibleSales: 3990, merchantCommission: 1396.5, expectedRemittance: 2593.5, receivedAmount: 1000, outstanding: 1593.5, creditDue: 0,
  attributionStatus: "Resolved", attributionIssue: null, attributionSource: "ServicingAssignment", salespersonId: "rep",
  salespersonName: "Aina Rep", commissionPolicyCode: "v1.1", commissionPending: 450, commissionPayable: 0, commissionPaid: 0,
  commissionRecoveryRequired: 0, commissionNote: null, concurrencyToken: "settlement-token",
};

function settlement(overrides: Partial<SettlementSummary> = {}): Settlement {
  return {
    summary: { ...summary, ...overrides },
    agreementReference: "PAWS-CONS-2026-001", agreementVersion: 1,
    lines: [{ sourceReportLineId: "line", lineType: "Sale", sku: "PAWSOME-STD", priceKind: "Standard", unitPrice: 39.9, quantity: 100,
      amount: 3990, merchantCommissionPercentage: 35, refundOfPeriodStart: null, commissionSalespersonId: "rep", commissionUnitAmount: 4.5 }],
    revisions: [{ revision: 1, salesReportId: "report", salesReportVersion: 1, reason: "Sales report SHOP-A v1 verified", eligibleSales: 3990,
      merchantCommission: 1396.5, expectedRemittance: 2593.5, salesCommissionTarget: 450, commissionRecoveryRequired: 0, createdAt: "2026-09-05T02:00:00Z" }],
    receipts: [{ id: "receipt-1", receivedOn: "2026-09-02", amount: 1000, method: "BankTransfer", reference: "IBG 1", notes: null,
      recordedAt: "2026-09-05T02:00:00Z", voidedAt: null, voidReason: null, concurrencyToken: "receipt-token" }],
    commissions: [{ id: "commission", salespersonId: "rep", salespersonName: "Aina Rep", commissionType: "ConsignmentStandardPerUnit",
      qualifiedQuantity: 100, unitAmount: 4.5, commissionAmount: 450, status: "Pending", revision: 1, policyCode: "v1.1",
      calculatedAt: "2026-09-05T02:00:00Z", payableAt: null, paidAt: null, reversedAt: null, reversalReason: null, payoutNumber: null,
      payoutClaimState: "Unclaimed" }],
    attributionResolvedAt: null, attributionResolutionReason: null,
  };
}

beforeEach(() => {
  mocks.list.mockResolvedValue({ items: [summary], total: 1 });
  mocks.get.mockResolvedValue(settlement());
  mocks.record.mockImplementation(async () => settlement({ status: "Settled", receivedAmount: 2593.5, outstanding: 0, commissionPending: 0, commissionPayable: 450 }));
  mocks.salespersons.mockResolvedValue({ items: [{ id: "rep-b", name: "Badrul Rep", salespersonCode: "MPL-SALES-0B" }], total: 1 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Consignment settlements", () => {
  it("shows what the partner owes, the agreed commission rounded once, and commission waiting for payment", async () => {
    mocks.access.mockReturnValue(access());
    render(<SettlementsView />);
    const row = (await screen.findByRole("button", { name: "MPL-CSET-260905-0001" })).closest("tr")!;
    expect(row.textContent).toMatch(/2,593\.50/);
    expect(row.textContent).toMatch(/1,593\.50/);
    expect(row.textContent).toContain("Partly paid");
    fireEvent.click(within(row).getByRole("button", { name: "MPL-CSET-260905-0001" }));
    await screen.findByRole("heading", { name: "Settlement MPL-CSET-260905-0001" });
    expect(screen.getByText("Partner commission (35%)")).toBeTruthy();
    expect(document.body.textContent).toContain("−MYR 1,396.50");
    expect(document.body.textContent).toContain("Waiting for partner payment");
    // A viewer can't record money or decide attribution.
    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/\b(API|backend|payload|mock)\b/i);
  });

  it("names one recovery once: owed on the report that caused it, history on the period where it was paid", async () => {
    mocks.access.mockReturnValue(access());
    const recovery = { recoveryId: "recovery-1", originSettlementId: "settlement-1", originSettlementNumber: "MPL-CSET-260905-0001", originPeriodStart: "2026-08-01T00:00:00+08:00",
      causedBySettlementId: "settlement-2", causedBySettlementNumber: "MPL-CSET-260920-0001", causedByPeriodStart: "2026-08-16T00:00:00+08:00",
      salespersonName: "Aina Rep", payoutNumber: "MPL-PAYOUT-260910-0001", quantity: 2, unitAmount: 4.5, amount: 9 };
    const origin = settlement({ status: "Settled", commissionPaid: 450, commissionRecoveryRequired: 0 });
    origin.revisions = [{ ...origin.revisions[0], revision: 2, reason: "Refunds in sales report SHOP-B v1", commissionRecoveryRequired: 9 }, origin.revisions[0]];
    origin.currentRecoveries = [recovery];
    mocks.get.mockResolvedValue(origin);
    render(<SettlementsView />);
    fireEvent.click(await screen.findByRole("button", { name: "MPL-CSET-260905-0001" }));
    await screen.findByRole("heading", { name: "Settlement MPL-CSET-260905-0001" });

    expect(screen.queryByText("Commission to recover because of this report")).toBeNull();
    expect(screen.getByText("Recovery counted on another report")).toBeTruthy();
    expect(document.body.textContent).toMatch(/MYR 9\.00 · 2 × MYR 4\.50 · Aina Rep · paid for MPL-CSET-260905-0001 .* in MPL-PAYOUT-260910-0001 · taken away by MPL-CSET-260920-0001/);
    expect(document.body.textContent).toContain("Already-paid commission this version no longer earns: MYR 9.00");
    expect(document.body.textContent).not.toMatch(/MYR 9\.00 to recover/);
    expect(document.body.textContent).toContain("Figures on earlier lines are history, not extra amounts owed");
  });

  it("shows the amount owed on the report that took the paid commission away", async () => {
    mocks.access.mockReturnValue(access());
    const cause = settlement({ id: "settlement-2", settlementNumber: "MPL-CSET-260920-0001", commissionRecoveryRequired: 9 });
    cause.currentRecoveries = [{ recoveryId: "recovery-1", originSettlementId: "settlement-1", originSettlementNumber: "MPL-CSET-260905-0001", originPeriodStart: "2026-08-01T00:00:00+08:00",
      causedBySettlementId: "settlement-2", causedBySettlementNumber: "MPL-CSET-260920-0001", causedByPeriodStart: "2026-08-16T00:00:00+08:00",
      salespersonName: "Aina Rep", payoutNumber: "MPL-PAYOUT-260910-0001", quantity: 2, unitAmount: 4.5, amount: 9 }];
    mocks.list.mockResolvedValue({ items: [cause.summary], total: 1 });
    mocks.get.mockResolvedValue(cause);
    render(<SettlementsView />);
    fireEvent.click(await screen.findByRole("button", { name: "MPL-CSET-260920-0001" }));
    await screen.findByRole("heading", { name: "Settlement MPL-CSET-260920-0001" });

    expect(screen.getByText("Commission to recover because of this report")).toBeTruthy();
    expect(screen.queryByText("Recovery counted on another report")).toBeNull();
    expect(document.body.textContent).toMatch(/isn.t deducted automatically/);
    expect(document.body.textContent).toContain("MYR 9.00 of commission was already paid");
  });

  it("records a partner payment once, never above what is outstanding", async () => {
    mocks.access.mockReturnValue(access(adminCapabilities.consignmentSettlementsRecordReceipt));
    render(<SettlementsView />);
    fireEvent.click(await screen.findByRole("button", { name: "MPL-CSET-260905-0001" }));
    const submit = await screen.findByRole("button", { name: "Record payment" });
    fireEvent.change(screen.getByLabelText(/Amount \(MYR\)/), { target: { value: "1593.51" } });
    fireEvent.change(screen.getByLabelText(/Bank or payment reference/), { target: { value: "IBG 2" } });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Amount \(MYR\)/), { target: { value: "1593.50" } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.record).toHaveBeenCalledTimes(1));
    const [id, input] = mocks.record.mock.calls[0];
    expect(id).toBe("settlement-1");
    expect(input).toMatchObject({ amount: 1593.5, method: "BankTransfer", reference: "IBG 2", notes: null });
    expect(input.idempotencyKey).toMatch(/^[0-9a-z]{8,}$/i);
    expect(await screen.findByText(/This period is settled and its sales commission is ready to pay/)).toBeTruthy();
  });

  it("asks an authorised operator to confirm who earns a period the system couldn't decide", async () => {
    mocks.access.mockReturnValue(access(adminCapabilities.consignmentSettlementsResolve));
    mocks.get.mockResolvedValue(settlement({ attributionStatus: "NeedsResolution", attributionSource: null, salespersonId: null, salespersonName: null,
      commissionPolicyCode: null, commissionPending: 0, attributionIssue: "The servicing representative changed during this period (Aina Rep, Badrul Rep)." }));
    mocks.resolve.mockResolvedValue(settlement());
    render(<SettlementsView />);
    fireEvent.click(await screen.findByRole("button", { name: "MPL-CSET-260905-0001" }));
    expect(await screen.findByText(/changed during this period/)).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Confirm salesperson" });
    await screen.findByRole("option", { name: "Badrul Rep · MPL-SALES-0B" });
    fireEvent.change(screen.getByLabelText(/Salesperson/), { target: { value: "rep-b" } });
    fireEvent.change(screen.getByLabelText(/How you decided/), { target: { value: "short" } });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/How you decided/), { target: { value: "Badrul serviced the shop from 18 August" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith(expect.objectContaining({ id: "settlement-1" }), "rep-b", "Badrul serviced the shop from 18 August"));
  });
});

// F-A1: Standard and Promotion commission paid in one payout and refunded on one report are two obligations that
// match in origin, cause, salesperson and payout. Each row must keep its own identity when the open settlement is
// updated in place, or React can keep a stale row and show a recovery twice.
describe("Recovery rows keep their own identity when the open settlement updates", () => {
  const frames = recoveryFrames as unknown as { initialSettlement: Settlement; updatedSettlement: Settlement };
  let consoleErrors: unknown[][] = [];

  beforeEach(() => {
    consoleErrors = [];
    vi.spyOn(console, "error").mockImplementation((...args) => { consoleErrors.push(args); });
    mocks.access.mockReturnValue(access(adminCapabilities.consignmentSettlementsResolve));
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const recoveryRows = () => [...document.querySelectorAll("li")].filter((li) => /taken away by/.test(li.textContent ?? "")).map((li) => li.textContent ?? "");
  const shownTotal = (rows: string[]) => rows.reduce((sum, row) => sum + Number(row.match(/^MYR\s*([\d.,]+)/)?.[1]?.replaceAll(",", "") ?? Number.NaN), 0);
  const duplicateKeyWarnings = () => consoleErrors.filter((args) => args.some((arg) => typeof arg === "string" && /same key/.test(arg)));

  async function open(first: Settlement) {
    mocks.list.mockResolvedValue({ items: [first.summary], total: 1 });
    mocks.get.mockResolvedValue(first);
    render(<SettlementsView />);
    fireEvent.click(await screen.findByRole("button", { name: first.summary.settlementNumber }));
    return screen.findByRole("heading", { name: `Settlement ${first.summary.settlementNumber}` });
  }

  // Updates the settlement that is already open, the way any action on it does: no reload, no remount.
  async function updateInPlace(next: Settlement) {
    mocks.recalc.mockResolvedValueOnce(next);
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: "Partner sent a further refund report" } });
    fireEvent.click(screen.getByRole("button", { name: "Recalculate" }));
    await screen.findByText("Settlement recalculated.");
  }

  function recovery(id: string, cause: string, causeStart: string, quantity: number, unitAmount: number): SettlementRecovery {
    return { recoveryId: id, originSettlementId: "settlement-1", originSettlementNumber: "MPL-CSET-260905-0001", originPeriodStart: "2026-08-05T02:00:00+00:00",
      causedBySettlementId: `cause-${cause}`, causedBySettlementNumber: `MPL-CSET-261220-${cause}`, causedByPeriodStart: causeStart,
      salespersonName: "Recovery Rep", payoutNumber: "MPL-PAYOUT-260910-0001", quantity, unitAmount, amount: quantity * unitAmount };
  }
  const withRecoveries = (rows: SettlementRecovery[]) => ({ ...settlement({ status: "Settled", commissionPaid: 57 }), currentRecoveries: rows });
  const standard = recovery("recovery-standard", "0001", "2026-09-01T00:00:00+08:00", 2, 4.5);
  const promotion = recovery("recovery-promotion", "0001", "2026-09-01T00:00:00+08:00", 1, 4);
  const earlier = recovery("recovery-earlier", "0002", "2026-08-16T00:00:00+08:00", 1, 4.5);

  it("shows the three current recoveries once after a second refund report, using the real recorded responses", async () => {
    const { initialSettlement, updatedSettlement } = frames;
    const heading = await open(initialSettlement);
    expect(screen.getByText("Recovery counted on another report")).toBeTruthy();
    const before = recoveryRows();
    expect(before).toHaveLength(2);
    expect(shownTotal(before)).toBeCloseTo(13, 2);

    await updateInPlace(updatedSettlement);
    expect(heading.isConnected).toBe(true);
    const after = recoveryRows();
    expect(after).toHaveLength(3);
    expect(shownTotal(after)).toBeCloseTo(17.5, 2);
    expect(after.filter((row) => row.startsWith("MYR 4.00 "))).toHaveLength(1);
    const expected = updatedSettlement.currentRecoveries!;
    expect(expected.reduce((sum, row) => sum + row.amount, 0)).toBeCloseTo(17.5, 2);
    expected.forEach((row, index) => {
      expect(after[index]).toContain(`MYR ${row.amount.toFixed(2)} · ${row.quantity} × MYR ${row.unitAmount.toFixed(2)} · Recovery Rep`);
      expect(after[index]).toContain(`paid for ${row.originSettlementNumber}`);
      expect(after[index]).toContain(`in ${row.payoutNumber}`);
      expect(after[index]).toContain(`taken away by ${row.causedBySettlementNumber}`);
    });
    expect(duplicateKeyWarnings()).toEqual([]);
  });

  it("keeps Standard and Promotion recoveries apart when a new recovery arrives and when one stops applying", async () => {
    const heading = await open(withRecoveries([standard, promotion]));
    expect(recoveryRows()).toHaveLength(2);

    // A refund on an earlier report adds a third obligation; the two existing ones keep their keys.
    await updateInPlace(withRecoveries([earlier, promotion, standard]));
    let rows = recoveryRows();
    expect(rows).toHaveLength(3);
    expect(shownTotal(rows)).toBeCloseTo(17.5, 2);
    expect(rows[0]).toContain("MYR 4.50 · 1 × MYR 4.50 · Recovery Rep · paid for MPL-CSET-260905-0001");
    expect(rows[0]).toContain("taken away by MPL-CSET-261220-0002");
    expect(rows[1]).toMatch(/^MYR 4\.00 · 1 × MYR 4\.00 · .* in MPL-PAYOUT-260910-0001 · taken away by MPL-CSET-261220-0001/);
    expect(rows[2]).toMatch(/^MYR 9\.00 · 2 × MYR 4\.50 · .* in MPL-PAYOUT-260910-0001 · taken away by MPL-CSET-261220-0001/);

    // The Promotion obligation no longer applies; the Standard one with otherwise identical references stays, once.
    await updateInPlace(withRecoveries([earlier, standard]));
    rows = recoveryRows();
    expect(rows).toHaveLength(2);
    expect(shownTotal(rows)).toBeCloseTo(13.5, 2);
    expect(rows.some((row) => row.startsWith("MYR 4.00 "))).toBe(false);

    await updateInPlace(withRecoveries([]));
    expect(recoveryRows()).toEqual([]);
    expect(screen.queryByText("Recovery counted on another report")).toBeNull();
    expect(heading.isConnected).toBe(true);
    expect(duplicateKeyWarnings()).toEqual([]);
  });

  it("lists two recoveries that share every reference on the report that caused them, each once", async () => {
    const cause = (rows: SettlementRecovery[], owed: number): Settlement => ({
      ...settlement({ id: "cause-0001", settlementNumber: "MPL-CSET-261220-0001", commissionRecoveryRequired: owed }), currentRecoveries: rows });
    await open(cause([standard], 9));
    expect(screen.getByText("Commission to recover because of this report")).toBeTruthy();
    expect(recoveryRows()).toHaveLength(1);

    await updateInPlace(cause([standard, promotion], 13));
    const rows = recoveryRows();
    expect(rows).toHaveLength(2);
    expect(shownTotal(rows)).toBeCloseTo(13, 2);
    expect(document.body.textContent).toContain("MYR 13.00 of commission was already paid");
    expect(duplicateKeyWarnings()).toEqual([]);
  });
});
