// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminBusinessIdentity } from "@/services/adminBusinessIdentityService";
import { ApiClientError } from "@/services/apiClient";
import { AdminBusinessIdentityManager } from "./AdminBusinessIdentityManager";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  states: vi.fn(),
}));

vi.mock("@/services/adminBusinessIdentityService", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/services/adminBusinessIdentityService")
  >();
  return {
    ...actual,
    getBusinessIdentity: mocks.get,
    updateBusinessIdentity: mocks.update,
  };
});

vi.mock("@/services/deliveryService", () => ({
  listMalaysiaStates: mocks.states,
}));

function identity(overrides: Partial<AdminBusinessIdentity> = {}): AdminBusinessIdentity {
  return {
    brandName: "MyPetLink",
    legalBusinessName: "GBB Software Solutions",
    businessRegistrationNumber: "202603141718 (AS0515813-P)",
    taxIdentificationNumber: null,
    sstRegistrationNumber: null,
    registeredAddressLine1: "",
    registeredAddressLine2: null,
    registeredPostcode: "",
    registeredCity: "",
    registeredState: "",
    registeredCountry: "Malaysia",
    supportEmail: "support@mypetlink.com.my",
    businessPhone: null,
    businessWebsite: "mypetlink.com.my",
    paymentInstructions: null,
    bankAccountName: null,
    bankName: null,
    bankAccountNumber: null,
    duitNowDisplayName: null,
    updatedAt: "2026-01-01T00:00:00Z",
    updatedBy: "QA Admin",
    completeness: {
      readyForRetailDocuments: true,
      readyForMerchantQuotation: false,
      readyForMerchantInvoice: false,
      missingForMerchantInvoice: ["Registered address"],
    },
    concurrencyToken: "AQ==",
    ...overrides,
  };
}

describe("AdminBusinessIdentityManager", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.update.mockReset();
    mocks.states.mockReset();
    mocks.states.mockResolvedValue([{ code: "KUL", name: "Kuala Lumpur" }]);
  });

  afterEach(cleanup);

  it("separates what receipts need from what business invoices need", async () => {
    mocks.get.mockResolvedValue({ data: identity() });

    render(<AdminBusinessIdentityManager />);

    expect(await screen.findByText("Ready for customer receipts")).toBeTruthy();
    expect(screen.getByText("Business invoices incomplete")).toBeTruthy();
    expect(
      screen.getByText(/Add the following before issuing a business quotation or invoice: Registered address\./)
    ).toBeTruthy();
  });

  it("cannot be saved until something has actually changed", async () => {
    mocks.get.mockResolvedValue({ data: identity() });

    render(<AdminBusinessIdentityManager />);

    const save = (await screen.findByTestId("business-identity-save")) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Business phone/), {
      target: { value: "03-1234 5678" },
    });
    expect(save.disabled).toBe(false);
  });

  it("sends blanked optional fields as empty rather than as whitespace", async () => {
    mocks.get.mockResolvedValue({ data: identity() });
    mocks.update.mockResolvedValue({
      data: identity({ businessPhone: "03-1234 5678" }),
    });

    render(<AdminBusinessIdentityManager />);

    fireEvent.change(await screen.findByLabelText(/Business phone/), {
      target: { value: "  03-1234 5678  " },
    });
    fireEvent.change(screen.getByLabelText(/Account number/), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByTestId("business-identity-save"));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update.mock.calls[0][0]).toMatchObject({
      businessPhone: "03-1234 5678",
      bankAccountNumber: null,
      concurrencyToken: "AQ==",
    });
  });

  it("reloads the current values when another administrator saved first", async () => {
    mocks.get
      .mockResolvedValueOnce({ data: identity() })
      .mockResolvedValueOnce({ data: identity({ brandName: "MyPetLink Malaysia" }) });
    mocks.update.mockRejectedValue(
      new ApiClientError(409, "concurrency_conflict", "Conflict.")
    );

    render(<AdminBusinessIdentityManager />);

    fireEvent.change(await screen.findByLabelText(/Brand name/), {
      target: { value: "Changed" },
    });
    fireEvent.click(screen.getByTestId("business-identity-save"));

    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(
      screen.getByText(/These details were changed by another administrator/)
    ).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByLabelText(/Brand name/) as HTMLInputElement).value).toBe(
        "MyPetLink Malaysia"
      )
    );
  });

  it("shows the server's message against the field it belongs to", async () => {
    mocks.get.mockResolvedValue({ data: identity() });
    mocks.update.mockRejectedValue(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        registeredAddressLine1: [
          "Complete the whole registered address, or leave all of it empty for now.",
        ],
      })
    );

    render(<AdminBusinessIdentityManager />);

    fireEvent.change(await screen.findByLabelText(/Address line 1/), {
      target: { value: "12 Jalan Satu" },
    });
    fireEvent.click(screen.getByTestId("business-identity-save"));

    expect(
      await screen.findByText(
        "Complete the whole registered address, or leave all of it empty for now."
      )
    ).toBeTruthy();
  });
});
