// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminNavGroups } from "@/lib/adminNavigation";
import { adminRoutes } from "@/lib/routes";
import {
  EmailStatusBadge,
  addressLines,
  capabilityLabel,
  emailStatusDetail,
  money,
  orNotProvided,
  paymentTermLabel,
} from "./shared";
import { isMerchantSalesTab, merchantSalesTabHref, merchantSalesTabs } from "./tabs";

afterEach(cleanup);

describe("Merchant Sales navigation", () => {
  it("adds exactly one Commerce entry, alongside the existing ones", () => {
    const commerce = adminNavGroups.find((group) => group.label === "Commerce")!;

    expect(commerce.items.map((item) => item.label)).toEqual([
      "Retail Orders",
      "Payment Proofs",
      "Merchant Sales",
    ]);
    expect(
      commerce.items.find((item) => item.label === "Merchant Sales")!.href
    ).toBe(adminRoutes.merchantSales);
  });

  it("offers the six workspace sections", () => {
    expect(merchantSalesTabs.map((tab) => tab.id)).toEqual([
      "overview",
      "merchants",
      "salespersons",
      "quotations",
      "orders",
      "invoices",
    ]);
  });

  it("keeps the section in the URL so refresh and Back restore it", () => {
    expect(merchantSalesTabHref("/admin/merchant-sales", "invoices")).toBe(
      "/admin/merchant-sales?tab=invoices"
    );
    expect(
      merchantSalesTabHref("/admin/merchant-sales", "orders", {
        paymentStatus: "PaymentConfirmed",
      })
    ).toBe("/admin/merchant-sales?tab=orders&paymentStatus=PaymentConfirmed");
  });

  it("falls back to the overview for an unknown section", () => {
    expect(isMerchantSalesTab("quotations")).toBe(true);
    expect(isMerchantSalesTab("nonsense")).toBe(false);
    expect(isMerchantSalesTab(null)).toBe(false);
  });

  it("switching section drops the previous list state", () => {
    // The href is built fresh, so a merchant filter cannot leak into invoices.
    const href = merchantSalesTabHref("/admin/merchant-sales", "invoices");
    expect(href).not.toContain("merchantId");
    expect(href).not.toContain("page");
  });
});

describe("Merchant Sales presentation", () => {
  it("shows the term a merchant understands, not the internal one", () => {
    expect(paymentTermLabel("Prepaid")).toBe("Due on receipt");
  });

  it("states an absent optional value rather than leaving a blank", () => {
    expect(orNotProvided(null)).toBe("Not provided");
    expect(orNotProvided("   ")).toBe("Not provided");
    expect(orNotProvided("FT-1")).toBe("FT-1");
  });

  it("formats money with the currency and two decimals", () => {
    expect(money("MYR", 1535)).toBe("MYR 1,535.00");
    expect(money("MYR", 0)).toBe("MYR 0.00");
  });

  it("drops empty address lines and joins the locality", () => {
    expect(
      addressLines({
        addressLine1: "88 Jalan Perdana",
        addressLine2: null,
        postcode: "68000",
        city: "Ampang",
        state: "Selangor",
        country: "Malaysia",
      })
    ).toEqual(["88 Jalan Perdana", "68000 Ampang", "Selangor", "Malaysia"]);
  });

  it("names the tag capability from its own flags", () => {
    expect(capabilityLabel(true, true)).toBe("QR + NFC Smart Tag");
    expect(capabilityLabel(true, false)).toBe("QR Pet Tag");
  });
});

describe("Email status", () => {
  const base = {
    relatedId: "1",
    messageType: "MerchantInvoice" as const,
    recipientEmail: "orders@happypaws.example",
    sentAt: null,
    canRetry: false,
    suppressionReason: null,
  };

  it("never claims an email was delivered just because it was queued", () => {
    render(<EmailStatusBadge status={{ ...base, status: "Pending" }} />);

    expect(screen.getByText("Queued")).toBeTruthy();
    expect(emailStatusDetail({ ...base, status: "Pending" })).toContain(
      "Queued is not the same as delivered"
    );
  });

  it("explains a suppressed email and that enabling later will not release it", () => {
    const suppressed = {
      ...base,
      status: "Suppressed" as const,
      suppressionReason: "TemplateDisabled",
    };

    render(<EmailStatusBadge status={suppressed} />);

    // The state is carried by words, not only by colour.
    expect(screen.getByText("Held — template off")).toBeTruthy();
    expect(emailStatusDetail(suppressed)).toContain("will not release it");
  });

  it("distinguishes not-yet-queued from queued", () => {
    render(<EmailStatusBadge status={undefined} />);

    expect(screen.getByText("Not sent yet")).toBeTruthy();
    expect(emailStatusDetail(undefined)).toContain("No email has been queued");
  });

  it("reports a sent email with its recipient", () => {
    const sent = { ...base, status: "Sent" as const, sentAt: "2026-08-05T04:00:00Z" };

    expect(emailStatusDetail(sent)).toContain("orders@happypaws.example");
    expect(emailStatusDetail(sent)).toContain("Sent to");
  });
});

describe("Business identity blocking", () => {
  it("lists exactly what is missing and links to the settings page", async () => {
    const { BusinessIdentityBlockedNotice } = await import("./shared");

    render(
      <BusinessIdentityBlockedNotice message="Complete the business identity before issuing this document: Registered address." />
    );

    expect(
      screen.getByText("Business Identity is incomplete for Merchant documents.")
    ).toBeTruthy();
    expect(screen.getByText("Registered address")).toBeTruthy();

    const link = screen.getByRole("link", { name: "Complete Business Identity" });
    expect(link.getAttribute("href")).toBe(adminRoutes.businessIdentity);
  });
});

describe("Document download", () => {
  it("names each document rather than calling everything a PDF", async () => {
    const { DocumentDownloadButton } = await import("./shared");
    const onError = vi.fn();

    const { rerender } = render(
      <DocumentDownloadButton id="1" kind="quotation" onError={onError} />
    );
    expect(screen.getByText("Download Quotation")).toBeTruthy();

    rerender(<DocumentDownloadButton id="1" kind="invoice" onError={onError} />);
    expect(screen.getByText("Download Invoice")).toBeTruthy();

    rerender(<DocumentDownloadButton id="1" kind="receipt" onError={onError} />);
    expect(screen.getByText("Download Receipt")).toBeTruthy();
  });

  it("disables itself while preparing, so a second click cannot start another", async () => {
    const { DocumentDownloadButton } = await import("./shared");
    const onError = vi.fn();

    // A fetch that never settles keeps the button in its busy state.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:5281");

    render(<DocumentDownloadButton id="1" kind="invoice" onError={onError} />);
    const button = screen.getByTestId("download-invoice") as HTMLButtonElement;

    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(button.textContent).toContain("Preparing");

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
