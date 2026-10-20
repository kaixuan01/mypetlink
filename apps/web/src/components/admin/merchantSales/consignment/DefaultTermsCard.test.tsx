// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as api from "@/services/adminConsignmentService";
import type { ConsignmentContext, ConsignmentPermissions } from "./context";
import { applyDefaultTerms, differsFromDefaults, normalizePrefix, prefixProblem, suggestedEndIso } from "./defaultTerms";
import { DefaultTermsCard, validateDefaultTerms } from "./DefaultTermsCard";
import { dateInputValue, emptyAgreement } from "./model";
import { useConsignmentActions } from "./useConsignmentActions";

const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock("@/services/adminConsignmentService", () => ({ getDefaultTerms: mocks.get, saveDefaultTerms: mocks.save }));

// Synthetic values only.
const complete: api.DefaultTermsValues = {
  partnerCommissionPercentage: 35, trialDurationDays: 60, durationTerms: "Synthetic trial", settlementFrequency: "Synthetic monthly",
  paymentDeadlineDays: 7, discountTerms: "Synthetic approved prices", returnTerms: "Synthetic carry forward", lossTerms: "Synthetic evidence",
};
const suggested: api.DefaultTerms = {
  revision: 1, isActive: false, terms: complete, missing: [], updatedAt: null, updatedByName: null, concurrencyToken: "token-1",
  history: [{ revision: 1, isActive: false, terms: complete, recordedAt: "2026-10-19T00:00:00Z", recordedByName: null }],
};

function Harness({ approve = true }: { approve?: boolean }) {
  const { actions, dialog } = useConsignmentActions(() => undefined);
  const context = { can: { approve } as ConsignmentPermissions, actions, reloadKey: 0 } as unknown as ConsignmentContext;
  return (
    <>
      <DefaultTermsCard context={context} />
      {dialog}
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(suggested);
});
afterEach(cleanup);

describe("Default agreement terms", () => {
  it("shows suggested terms as unconfirmed and puts them in use only after confirmation", async () => {
    mocks.save.mockResolvedValue({ ...suggested, revision: 2, isActive: true, updatedAt: "2026-10-19T03:00:00Z", updatedByName: "Synthetic Admin" });
    render(<Harness />);
    expect(await screen.findByText("Suggested terms awaiting confirmation")).toBeTruthy();
    expect(screen.getByText("Not in use")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Partner commission (%)"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Put in use for new agreements" }));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByText(/existing drafts, approved agreements, issued PDFs and signed copies don’t change/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use for new agreements" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ ...complete, partnerCommissionPercentage: 30 }, true, "token-1"));
    expect(await screen.findByText("In use · revision 2")).toBeTruthy();
  });

  it("refuses to put incomplete defaults in use", async () => {
    mocks.get.mockResolvedValue({ ...suggested, terms: { ...complete, lossTerms: null } });
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Put in use for new agreements" }));
    expect(screen.getByText("Enter the default loss and damage.")).toBeTruthy();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("is read-only without approval permission", async () => {
    render(<Harness approve={false} />);
    expect(await screen.findByText(/needs permission to approve agreements/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Put in use for new agreements" })).toBeNull();
    expect((screen.getByLabelText("Partner commission (%)") as HTMLInputElement).disabled).toBe(true);
  });
});

describe("default term rules", () => {
  it("validates like the server", () => {
    expect(validateDefaultTerms(complete, true)).toEqual({});
    expect(validateDefaultTerms({ ...complete, trialDurationDays: 0, paymentDeadlineDays: 366, partnerCommissionPercentage: 35.555 }, false))
      .toEqual(expect.objectContaining({ trialDurationDays: expect.any(String), paymentDeadlineDays: expect.any(String), partnerCommissionPercentage: expect.any(String) }));
    expect(validateDefaultTerms({ ...complete, durationTerms: null }, false)).toEqual({});
  });

  it("fills only commercial fields and spots edits", () => {
    const filled = applyDefaultTerms({ ...emptyAgreement, merchantId: "m", effectiveFrom: "2026-11-01T00:00:00Z", signedAgreementReference: "KEEP" }, complete);
    expect(filled).toEqual(expect.objectContaining({ partnerCommissionPercentage: 35, lossTerms: "Synthetic evidence", merchantId: "m", signedAgreementReference: "KEEP" }));
    expect(differsFromDefaults(filled, complete)).toBe(false);
    expect(differsFromDefaults({ ...filled, returnTerms: "Negotiated" }, complete)).toBe(true);
  });

  it("counts the start day as day 1 of the trial", () => {
    const start = new Date(2026, 10, 1).toISOString();
    expect(dateInputValue(suggestedEndIso(start, 60))).toBe("2026-12-30");
    expect(dateInputValue(suggestedEndIso(start, 1))).toBe("2026-11-01");
    expect(suggestedEndIso(null, 60)).toBeNull();
    expect(suggestedEndIso(start, null)).toBeNull();
  });

  it("normalises prefixes the way the server stores them", () => {
    expect(normalizePrefix("Ank pets!")).toBe("ANKPETS");
    expect(prefixProblem("A")).toBeTruthy();
    expect(prefixProblem("1PAWS")).toBe("Start with a letter.");
    expect(prefixProblem("ANKPETS")).toBeNull();
  });
});
