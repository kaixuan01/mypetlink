// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import { commission, invoice, merchant, paged } from "./merchantSalesFixtures";

const listInvoices = vi.fn();
const getInvoice = vi.fn();
const recordPayment = vi.fn();
const cancelInvoice = vi.fn();
const listCommissions = vi.fn();
const markCommissionPaid = vi.fn();
const getMerchantEmailStatuses = vi.fn();
const sendInvoiceEmail = vi.fn();
const listMerchants = vi.fn();

vi.mock("@/services/adminMerchantBillingService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantBillingService")
  >("@/services/adminMerchantBillingService");
  return {
    ...actual,
    listInvoices: (...a: unknown[]) => listInvoices(...a),
    getInvoice: (...a: unknown[]) => getInvoice(...a),
    recordPayment: (...a: unknown[]) => recordPayment(...a),
    cancelInvoice: (...a: unknown[]) => cancelInvoice(...a),
    listCommissions: (...a: unknown[]) => listCommissions(...a),
    markCommissionPaid: (...a: unknown[]) => markCommissionPaid(...a),
    getMerchantEmailStatuses: (...a: unknown[]) => getMerchantEmailStatuses(...a),
    sendInvoiceEmail: (...a: unknown[]) => sendInvoiceEmail(...a),
  };
});

vi.mock("@/services/adminMerchantSalesService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantSalesService")
  >("@/services/adminMerchantSalesService");
  return { ...actual, listMerchants: (...a: unknown[]) => listMerchants(...a) };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/merchant-sales",
  useSearchParams: () => new URLSearchParams("tab=invoices"),
}));

const { InvoicesPanel } = await import("./InvoicesPanel");

const noop = () => {};
const renderPanel = (props: Partial<Parameters<typeof InvoicesPanel>[0]> = {}) =>
  render(
    <InvoicesPanel
      onOpen={noop}
      onOpenOrder={noop}
      openId={null}
      status={null}
      {...props}
    />
  );

const paid = () =>
  invoice({
    status: "Paid",
    paidAt: "2026-08-06T03:00:00Z",
    payment: {
      id: "payment-1",
      merchantInvoiceId: "invoice-1",
      merchantOrderId: "order-1",
      paymentDate: "2026-08-06T03:00:00Z",
      amountReceived: 1535,
      currency: "MYR",
      method: "BankTransfer",
      transactionReference: null,
      internalNote: null,
      paymentProofMediaFileId: null,
      recordedBy: "Pass C Admin",
      recordedAt: "2026-08-06T03:00:00Z",
    },
    receipt: {
      id: "receipt-1",
      receiptNumber: "MPL-RCP-B2B-260806-0001",
      paymentDate: "2026-08-06T03:00:00Z",
      paymentMethod: "BankTransfer",
      transactionReference: null,
      amountPaid: 1535,
      currency: "MYR",
      issuedAt: "2026-08-06T03:00:00Z",
    },
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  listInvoices.mockResolvedValue(paged([invoice()]));
  getInvoice.mockResolvedValue(invoice());
  listCommissions.mockResolvedValue(paged([]));
  getMerchantEmailStatuses.mockResolvedValue([]);
  listMerchants.mockResolvedValue(paged([merchant()]));
});
afterEach(cleanup);

describe("Invoice list", () => {
  it("shows the invoice number, merchant and exact total", async () => {
    renderPanel();

    const number = await screen.findByText("MPL-INV-260806-0001");
    const row = number.closest("tr") as HTMLElement;
    expect(within(row).getByText(/Happy Paws/)).toBeTruthy();
    expect(within(row).getByText("MYR 1,535.00")).toBeTruthy();
  });

  it("states the payment term in words a merchant understands", async () => {
    renderPanel({ openId: "invoice-1" });

    expect(await screen.findByText("Due on receipt")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Prepaid");
  });

  it("keeps the invoice number on one line so it cannot be misread", async () => {
    renderPanel();
    const number = await screen.findByText("MPL-INV-260806-0001");

    expect(number.className).toMatch(/whitespace-nowrap|font-mono/);
  });

  it("explains an empty list rather than showing a blank table", async () => {
    listInvoices.mockResolvedValue(paged([], 0));
    renderPanel();

    expect(await screen.findByText(/No invoices/i)).toBeTruthy();
  });
});

describe("Recording a payment", () => {
  const openPaymentForm = async () => {
    renderPanel({ openId: "invoice-1" });
    fireEvent.click(await screen.findByTestId("open-record-payment"));
    return screen.findByTestId("record-payment-form");
  };

  it("pre-fills the exact invoice total", async () => {
    const form = await openPaymentForm();

    expect((within(form).getByTestId("payment-amount") as HTMLInputElement).value).toBe(
      "1535.00"
    );
  });

  it("says plainly that the invoice must be settled in full", async () => {
    const form = await openPaymentForm();

    expect(form.textContent).toMatch(/full payment only/i);
  });

  it("refuses an underpayment and names the outstanding amount", async () => {
    const form = await openPaymentForm();

    fireEvent.change(within(form).getByTestId("payment-amount"), {
      target: { value: "500" },
    });
    fireEvent.click(within(form).getByTestId("submit-payment"));

    expect(await screen.findByText(/settled in full/i)).toBeTruthy();
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it("refuses an overpayment", async () => {
    const form = await openPaymentForm();

    fireEvent.change(within(form).getByTestId("payment-amount"), {
      target: { value: "2000" },
    });
    fireEvent.click(within(form).getByTestId("submit-payment"));

    await waitFor(() => expect(recordPayment).not.toHaveBeenCalled());
  });

  it("refuses more than two decimal places", async () => {
    const form = await openPaymentForm();

    fireEvent.change(within(form).getByTestId("payment-amount"), {
      target: { value: "1535.001" },
    });
    fireEvent.click(within(form).getByTestId("submit-payment"));

    expect(
      await screen.findByText("Enter an amount with at most two decimal places.")
    ).toBeTruthy();
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it("confirms first, and warns the step cannot be undone", async () => {
    const form = await openPaymentForm();

    fireEvent.click(within(form).getByTestId("submit-payment"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/cannot be undone/i)).toBeTruthy();
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it("treats the transaction reference as optional", async () => {
    const form = await openPaymentForm();

    expect(form.textContent).toMatch(/optional/i);
  });

  it("explains a conflicting payment without asking for a pointless reload", async () => {
    recordPayment.mockRejectedValue(
      new ApiClientError(
        409,
        "merchant_invoice_paid",
        "This payment was already recorded. Receipt MPL-RCP-B2B-260806-0001 was issued."
      )
    );
    const form = await openPaymentForm();
    fireEvent.click(within(form).getByTestId("submit-payment"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Record payment/i }));

    expect(await screen.findByText(/already been paid|already recorded/i)).toBeTruthy();
    expect(document.body.textContent).not.toContain("RowVersion");
  });
});

describe("A paid invoice", () => {
  beforeEach(() => {
    listInvoices.mockResolvedValue(paged([paid()]));
    getInvoice.mockResolvedValue(paid());
  });

  it("offers no way to record a second payment", async () => {
    renderPanel({ openId: "invoice-1" });
    await screen.findAllByText("MPL-INV-260806-0001");

    expect(screen.queryByTestId("open-record-payment")).toBeNull();
  });

  it("shows the receipt it produced", async () => {
    renderPanel({ openId: "invoice-1" });

    const receipt = await screen.findByTestId("invoice-receipt");
    expect(within(receipt).getByText("MPL-RCP-B2B-260806-0001")).toBeTruthy();
  });

  it("offers no cancellation once it has been paid", async () => {
    renderPanel();
    fireEvent.click(
      await screen.findByRole("button", { name: "Actions for MPL-INV-260806-0001" })
    );
    const labels = within(await screen.findByRole("menu"))
      .getAllByRole("menuitem")
      .map((el) => el.textContent);

    expect(labels).not.toContain("Cancel invoice");
  });

  it("says an absent transaction reference is not provided rather than leaving a gap", async () => {
    renderPanel({ openId: "invoice-1" });

    expect(await screen.findByText("Not provided")).toBeTruthy();
  });
});

describe("Commission", () => {
  it("shows the percentage, the base and that delivery is excluded", async () => {
    listCommissions.mockResolvedValue(paged([commission()]));
    listInvoices.mockResolvedValue(paged([paid()]));
    getInvoice.mockResolvedValue(paid());
    renderPanel({ openId: "invoice-1" });

    const block = await screen.findByTestId("invoice-commission");
    expect(block.textContent).toContain("5%");
    expect(block.textContent).toContain("MYR 1,500.00");
    expect(block.textContent).toMatch(/delivery excluded/i);
  });

  it("marks commission as Admin-only, never for a merchant", async () => {
    listCommissions.mockResolvedValue(paged([commission()]));
    listInvoices.mockResolvedValue(paged([paid()]));
    getInvoice.mockResolvedValue(paid());
    renderPanel({ openId: "invoice-1" });

    const block = await screen.findByTestId("invoice-commission");
    expect(block.textContent).toMatch(/never on a merchant document or email/i);
  });

  it("offers Mark paid only while the commission is payable", async () => {
    listCommissions.mockResolvedValue(paged([commission({ status: "Paid", paidAt: "2026-08-06T04:00:00Z" })]));
    listInvoices.mockResolvedValue(paged([paid()]));
    getInvoice.mockResolvedValue(paid());
    renderPanel({ openId: "invoice-1" });

    await screen.findByTestId("invoice-commission");
    expect(screen.queryByTestId("mark-commission-paid")).toBeNull();
  });

  it("shows nothing to pay when the order had no salesperson", async () => {
    listCommissions.mockResolvedValue(paged([], 0));
    listInvoices.mockResolvedValue(paged([paid()]));
    getInvoice.mockResolvedValue(paid());
    renderPanel({ openId: "invoice-1" });

    await screen.findAllByText("MPL-INV-260806-0001");
    expect(screen.queryByTestId("invoice-commission")).toBeNull();
    expect(screen.queryByTestId("mark-commission-paid")).toBeNull();
  });
});
