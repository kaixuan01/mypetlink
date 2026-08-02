// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockOrders } from "@/data/mockOrders";

vi.mock("@/services/apiConfig", () => ({ canUseApi: () => false }));
vi.mock("@/services/tagService", () => ({
  getFriendlyTagErrorMessage: () => "Payment proof could not be submitted.",
  submitOrderPayment: vi.fn(),
}));

const { ManualPaymentPanel } = await import("./ManualPaymentPanel");

const pendingOrder = {
  ...mockOrders[0],
  status: "Pending Payment" as const,
  orderNumber: "MPL-ORD-2026-0001-EXTRA-LONG-CUSTOMER-REFERENCE",
  totalAmount: 27.9,
  deliveryFee: 8,
};

describe("ManualPaymentPanel", () => {
  afterEach(cleanup);

  it("renders the approved merchant QR, exact amount and accessible receipt control", () => {
    render(<ManualPaymentPanel onSubmitted={vi.fn()} order={pendingOrder} petName="Milo" />);

    const qr = screen.getByAltText("GBB Software Solutions DuitNow merchant QR code");
    fireEvent.load(qr);
    expect(qr.getAttribute("src")).toBe("/payment-qr/merchant_duitnow_qr.jpg");
    expect(screen.getByRole("link", { name: /larger view/i }).getAttribute("href")).toBe(
      "/payment-qr/merchant_duitnow_qr.jpg"
    );
    expect((screen.getByLabelText(/Payment amount/i) as HTMLInputElement).value).toBe("27.90");
    expect(screen.getByText("Select Receipt")).toBeDefined();
    expect(screen.getByText(/JPEG, PNG, WebP, or PDF/i)).toBeDefined();
    expect((screen.getByLabelText("Payment Reference") as HTMLInputElement).value).toBe(pendingOrder.orderNumber);
    expect(screen.getAllByText("MYR 27.90").length).toBeGreaterThan(0);
    expect(screen.getByText("DuitNow QR is ready to scan.")).toBeDefined();
    expect((screen.getByRole("button", { name: /Submit Payment Proof/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("fails closed, retries, and clears the stale error after the QR loads", () => {
    render(<ManualPaymentPanel onSubmitted={vi.fn()} order={pendingOrder} petName="Milo" />);
    fireEvent.error(screen.getByAltText("GBB Software Solutions DuitNow merchant QR code"));

    expect(screen.getByRole("alert").textContent).toContain("temporarily unavailable");
    expect(screen.getByText(/submission is unavailable until/i)).toBeDefined();
    expect((screen.getByRole("button", { name: /Submit Payment Proof/i }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Try QR again" }));
    const retriedQr = screen.getByAltText("GBB Software Solutions DuitNow merchant QR code");
    expect(retriedQr.getAttribute("src")).toBe("/payment-qr/merchant_duitnow_qr.jpg?retry=1");
    expect((screen.getByRole("button", { name: /Submit Payment Proof/i }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.load(retriedQr);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/submission is unavailable until/i)).toBeNull();
    expect(screen.getByText("DuitNow QR is ready to scan.")).toBeDefined();
    expect((screen.getByRole("button", { name: /Submit Payment Proof/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});
