// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminCapabilities } from "@/lib/adminCapabilities";

const mocks = vi.hoisted(() => ({ access: vi.fn(), list: vi.fn(), record: vi.fn(), end: vi.fn() }));
vi.mock("@/services/authService", () => ({ getAdminCapabilities: mocks.access }));
vi.mock("@/services/adminConsignmentSettlementService", () => ({
  listCommissionTerms: mocks.list, recordCommissionTerms: mocks.record, endCommissionTerms: mocks.end,
}));
vi.mock("@/services/adminMerchantSalesService", () => ({ getMerchantSalesError: (_: unknown, fallback: string) => fallback }));

const { SalespersonCommissionTerms } = await import("./SalespersonCommissionTerms");
const access = (...granted: string[]) => ({ isSuperAdmin: false, roles: [], granted: new Set(granted) });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Salesperson commission terms", () => {
  it("keeps a salesperson on existing terms until v1.1 acceptance is recorded, never before the acceptance", async () => {
    mocks.access.mockReturnValue(access(adminCapabilities.salesCommissionRulesManage));
    mocks.list.mockResolvedValue([]);
    mocks.record.mockImplementation(async (_id: string, input: { acceptedAt: string; effectiveFrom: string }) => ({
      id: "t1", salespersonId: "rep", policyCode: "v1.1", acceptedAt: input.acceptedAt, effectiveFrom: input.effectiveFrom,
      effectiveToExclusive: null, agreementReference: "Signed letter", notes: null, createdAt: input.acceptedAt, endedAt: null, endReason: null, concurrencyToken: "x",
    }));
    render(<SalespersonCommissionTerms salespersonId="rep" />);
    expect(await screen.findByText(/earn no consignment commission until v1\.1 terms are recorded/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Record v1.1 terms" }));
    fireEvent.change(screen.getByLabelText("Accepted on"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Takes effect on"), { target: { value: "2026-10-19" } });
    fireEvent.change(screen.getByLabelText("Where they accepted it"), { target: { value: "Signed letter" } });
    const submit = screen.getByRole("button", { name: "Record terms" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Takes effect on"), { target: { value: "2026-11-01" } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.record).toHaveBeenCalledWith("rep", {
      policyCode: "v1.1", acceptedAt: "2026-10-20T00:00:00+08:00", effectiveFrom: "2026-11-01T00:00:00+08:00",
      agreementReference: "Signed letter", notes: null,
    }));
  });

  it("shows terms read-only to someone who can't change commission rules", async () => {
    mocks.access.mockReturnValue(access(adminCapabilities.salesCommissionsView));
    mocks.list.mockResolvedValue([]);
    render(<SalespersonCommissionTerms salespersonId="rep" />);
    await screen.findByText(/existing terms/);
    expect(screen.queryByRole("button", { name: "Record v1.1 terms" })).toBeNull();
  });
});
