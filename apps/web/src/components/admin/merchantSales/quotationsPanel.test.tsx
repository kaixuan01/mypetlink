// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import { merchant, paged, quotation, salesperson } from "./merchantSalesFixtures";

const listQuotations = vi.fn();
const listMerchants = vi.fn();
const listSalespersons = vi.fn();
const createQuotation = vi.fn();
const updateQuotation = vi.fn();
const transitionQuotation = vi.fn();
const convertQuotation = vi.fn();
const listAdminTagCatalogOptions = vi.fn();
const getMerchantEmailStatuses = vi.fn();
const sendQuotationEmail = vi.fn();

vi.mock("@/services/adminMerchantSalesService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantSalesService")
  >("@/services/adminMerchantSalesService");
  return {
    ...actual,
    listQuotations: (...a: unknown[]) => listQuotations(...a),
    listMerchants: (...a: unknown[]) => listMerchants(...a),
    listSalespersons: (...a: unknown[]) => listSalespersons(...a),
    createQuotation: (...a: unknown[]) => createQuotation(...a),
    updateQuotation: (...a: unknown[]) => updateQuotation(...a),
    transitionQuotation: (...a: unknown[]) => transitionQuotation(...a),
    convertQuotation: (...a: unknown[]) => convertQuotation(...a),
  };
});

vi.mock("@/services/adminMerchantBillingService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantBillingService")
  >("@/services/adminMerchantBillingService");
  return {
    ...actual,
    getMerchantEmailStatuses: (...a: unknown[]) => getMerchantEmailStatuses(...a),
    sendQuotationEmail: (...a: unknown[]) => sendQuotationEmail(...a),
  };
});

vi.mock("@/services/tagCatalogService", () => ({
  listAdminTagCatalogOptions: (...a: unknown[]) => listAdminTagCatalogOptions(...a),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/merchant-sales",
  useSearchParams: () => new URLSearchParams("tab=quotations"),
}));

const { QuotationsPanel } = await import("./QuotationsPanel");

const noop = () => {};
const renderPanel = (props: Partial<Parameters<typeof QuotationsPanel>[0]> = {}) =>
  render(
    <QuotationsPanel
      editing={false}
      onCloseEditor={noop}
      onEdit={noop}
      onOpen={noop}
      onOpenOrder={noop}
      openId={null}
      {...props}
    />
  );

beforeEach(() => {
  vi.clearAllMocks();
  listQuotations.mockResolvedValue(paged([quotation()]));
  listMerchants.mockResolvedValue(paged([merchant()]));
  listSalespersons.mockResolvedValue(paged([salesperson()]));
  getMerchantEmailStatuses.mockResolvedValue([]);
  listAdminTagCatalogOptions.mockResolvedValue([
    {
      id: "product-1",
      name: "Wholesale Smart Tag",
      variants: [
        {
          id: "variant-1",
          sku: "WS-QR-0001",
          displayName: "Lightweight",
          isActive: true,
          basePrice: 39.9,
          currency: "MYR",
        },
      ],
    },
  ]);
});
afterEach(cleanup);

const openEditor = async () => {
  renderPanel({ editing: true, openId: "new" });
  return screen.findByTestId("quotation-editor");
};

describe("Quotation editor lines", () => {
  it("starts with one line and adds another on request", async () => {
    const editor = await openEditor();

    expect(editor.querySelectorAll('[data-testid^="quotation-line-"]').length).toBe(1);
    fireEvent.click(within(editor).getByRole("button", { name: "Add line" }));
    expect(editor.querySelectorAll('[data-testid^="quotation-line-"]').length).toBe(2);
  });

  it("removes a line again", async () => {
    const editor = await openEditor();
    fireEvent.click(within(editor).getByRole("button", { name: "Add line" }));

    fireEvent.click(within(editor).getAllByRole("button", { name: "Remove line" })[1]);
    expect(editor.querySelectorAll('[data-testid^="quotation-line-"]').length).toBe(1);
  });

  it("asks for a line while no product option has been chosen anywhere", async () => {
    const editor = await openEditor();
    fireEvent.change(editor.querySelectorAll("select")[0], { target: { value: "merchant-1" } });

    fireEvent.click(within(editor).getByTestId("save-quotation"));

    expect(await screen.findByText("Add at least one product line.")).toBeTruthy();
    expect(screen.queryByText(/unfinished product line/)).toBeNull();
  });

  it("names the unfinished line instead of claiming none was added", async () => {
    const editor = await openEditor();
    fireEvent.change(editor.querySelectorAll("select")[0], { target: { value: "merchant-1" } });

    // One complete line, then a second that was never filled in.
    const line = editor.querySelector('[data-testid="quotation-line-0"]') as HTMLElement;
    fireEvent.change(line.querySelector("select") as HTMLSelectElement, {
      target: { value: "variant-1" },
    });
    fireEvent.change(line.querySelectorAll('input[type="number"]')[0], {
      target: { value: "10" },
    });
    fireEvent.change(line.querySelectorAll('input[type="number"]')[1], {
      target: { value: "12.50" },
    });
    fireEvent.click(within(editor).getByRole("button", { name: "Add line" }));
    fireEvent.click(within(editor).getByTestId("save-quotation"));

    expect(
      await screen.findByText("Complete or remove the unfinished product line.")
    ).toBeTruthy();
    expect(screen.queryByText("Add at least one product line.")).toBeNull();
    expect(createQuotation).not.toHaveBeenCalled();
  });

  it("points the unfinished-line message at the line it means", async () => {
    const editor = await openEditor();
    fireEvent.change(editor.querySelectorAll("select")[0], { target: { value: "merchant-1" } });
    const line = editor.querySelector('[data-testid="quotation-line-0"]') as HTMLElement;
    fireEvent.change(line.querySelector("select") as HTMLSelectElement, {
      target: { value: "variant-1" },
    });
    fireEvent.change(line.querySelectorAll('input[type="number"]')[0], { target: { value: "1" } });
    fireEvent.change(line.querySelectorAll('input[type="number"]')[1], { target: { value: "1" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Add line" }));
    fireEvent.click(within(editor).getByTestId("save-quotation"));

    const second = await screen.findByTestId("quotation-line-1");
    expect(
      within(second).getByText("Choose a product option for this line, or remove it.")
    ).toBeTruthy();
  });

  it("refuses a quantity that is not a whole number of at least one", async () => {
    const editor = await openEditor();
    fireEvent.change(editor.querySelectorAll("select")[0], { target: { value: "merchant-1" } });
    const line = editor.querySelector('[data-testid="quotation-line-0"]') as HTMLElement;
    fireEvent.change(line.querySelector("select") as HTMLSelectElement, {
      target: { value: "variant-1" },
    });
    fireEvent.change(line.querySelectorAll('input[type="number"]')[0], {
      target: { value: "2.5" },
    });
    fireEvent.click(within(editor).getByTestId("save-quotation"));

    expect(await screen.findByText(/whole number of at least 1/i)).toBeTruthy();
    expect(createQuotation).not.toHaveBeenCalled();
  });

  it("shows an indexed server message on the line it belongs to", async () => {
    createQuotation.mockRejectedValue(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        "items[0].lineDiscount": ["A line discount cannot exceed the line amount."],
      })
    );
    const editor = await openEditor();
    fireEvent.change(editor.querySelectorAll("select")[0], { target: { value: "merchant-1" } });
    const line = editor.querySelector('[data-testid="quotation-line-0"]') as HTMLElement;
    fireEvent.change(line.querySelector("select") as HTMLSelectElement, {
      target: { value: "variant-1" },
    });
    fireEvent.change(line.querySelectorAll('input[type="number"]')[0], { target: { value: "10" } });
    fireEvent.change(line.querySelectorAll('input[type="number"]')[1], { target: { value: "5" } });
    fireEvent.click(within(editor).getByTestId("save-quotation"));

    const first = await screen.findByTestId("quotation-line-0");
    expect(
      within(first).getByText("A line discount cannot exceed the line amount.")
    ).toBeTruthy();
  });

  it("shows an order discount message beside the order discount field", async () => {
    createQuotation.mockRejectedValue(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        discountTotal: ["An order discount cannot exceed the merchandise subtotal."],
      })
    );
    const editor = await openEditor();
    fireEvent.change(editor.querySelectorAll("select")[0], { target: { value: "merchant-1" } });
    const line = editor.querySelector('[data-testid="quotation-line-0"]') as HTMLElement;
    fireEvent.change(line.querySelector("select") as HTMLSelectElement, {
      target: { value: "variant-1" },
    });
    fireEvent.change(line.querySelectorAll('input[type="number"]')[0], { target: { value: "1" } });
    fireEvent.change(line.querySelectorAll('input[type="number"]')[1], { target: { value: "1" } });
    fireEvent.click(within(editor).getByTestId("save-quotation"));

    expect(
      await screen.findByText("An order discount cannot exceed the merchandise subtotal.")
    ).toBeTruthy();
  });

  it("keeps the entered figures after a rejected save", async () => {
    createQuotation.mockRejectedValue(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        deliveryFee: ["A delivery fee cannot be negative."],
      })
    );
    const editor = await openEditor();
    fireEvent.change(editor.querySelectorAll("select")[0], { target: { value: "merchant-1" } });
    const line = editor.querySelector('[data-testid="quotation-line-0"]') as HTMLElement;
    fireEvent.change(line.querySelector("select") as HTMLSelectElement, {
      target: { value: "variant-1" },
    });
    fireEvent.change(line.querySelectorAll('input[type="number"]')[0], { target: { value: "42" } });
    fireEvent.change(line.querySelectorAll('input[type="number"]')[1], { target: { value: "9.5" } });
    fireEvent.click(within(editor).getByTestId("save-quotation"));
    await screen.findByText("A delivery fee cannot be negative.");

    expect((line.querySelectorAll('input[type="number"]')[0] as HTMLInputElement).value).toBe("42");
    expect((line.querySelectorAll('input[type="number"]')[1] as HTMLInputElement).value).toBe("9.5");
  });

  it("warns that a quotation does not reserve inventory", async () => {
    const editor = await openEditor();

    expect(
      within(editor).getByTestId("quotation-stock-warning").textContent
    ).toContain("Inventory is not reserved by this quotation");
  });

  it("sends only the figures the server needs, never a computed total", async () => {
    createQuotation.mockResolvedValue(quotation());
    const editor = await openEditor();
    fireEvent.change(editor.querySelectorAll("select")[0], { target: { value: "merchant-1" } });
    const line = editor.querySelector('[data-testid="quotation-line-0"]') as HTMLElement;
    fireEvent.change(line.querySelector("select") as HTMLSelectElement, {
      target: { value: "variant-1" },
    });
    fireEvent.change(line.querySelectorAll('input[type="number"]')[0], { target: { value: "10" } });
    fireEvent.change(line.querySelectorAll('input[type="number"]')[1], { target: { value: "12.5" } });
    fireEvent.click(within(editor).getByTestId("save-quotation"));

    await waitFor(() => expect(createQuotation).toHaveBeenCalled());
    const sent = createQuotation.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("grandTotal");
    expect(sent).not.toHaveProperty("merchandiseSubtotal");
    expect((sent.items as unknown[]).length).toBe(1);
  });
});

describe("Quotation lifecycle", () => {
  const openList = async (status: string, extra = {}) => {
    listQuotations.mockResolvedValue(
      paged([quotation({ status: status as never, ...extra })])
    );
    renderPanel();
    const trigger = await screen.findByRole("button", {
      name: "Actions for MPL-QT-260806-0001",
    });
    fireEvent.click(trigger);
    return screen.findByRole("menu");
  };

  it("offers Send on a draft, and nothing that skips ahead", async () => {
    const menu = await openList("Draft");
    const labels = within(menu).getAllByRole("menuitem").map((el) => el.textContent);

    expect(labels).toContain("Mark sent");
    expect(labels).not.toContain("Convert to order");
    expect(labels).not.toContain("Accept");
  });

  it("offers Accept, Reject and Cancel once sent", async () => {
    const menu = await openList("Sent");
    const labels = within(menu).getAllByRole("menuitem").map((el) => el.textContent);

    expect(labels).toContain("Accept");
    expect(labels).toContain("Reject");
    expect(labels).toContain("Cancel quotation");
    expect(labels).not.toContain("Mark sent");
  });

  it("offers Convert only once accepted", async () => {
    const menu = await openList("Accepted");
    const labels = within(menu).getAllByRole("menuitem").map((el) => el.textContent);

    expect(labels).toContain("Convert to order");
  });

  it("offers no lifecycle action on a cancelled quotation", async () => {
    const menu = await openList("Cancelled");
    const labels = within(menu).getAllByRole("menuitem").map((el) => el.textContent);

    expect(labels).not.toContain("Accept");
    expect(labels).not.toContain("Convert to order");
    expect(labels).not.toContain("Mark sent");
  });

  it("offers no second conversion once converted, and links to the order", async () => {
    const menu = await openList("Converted", {
      convertedMerchantOrderId: "order-1",
      convertedMerchantOrderNumber: "MPL-B2B-ORD-260806-0001",
    });
    const labels = within(menu).getAllByRole("menuitem").map((el) => el.textContent);

    expect(labels).not.toContain("Convert to order");
    expect(labels).toContain("Open merchant order");
  });

  it("offers no email action before the quotation is sent", async () => {
    const menu = await openList("Draft");
    const labels = within(menu).getAllByRole("menuitem").map((el) => el.textContent);

    expect(labels.join(" ")).not.toMatch(/email/i);
  });

  it("explains an invalid transition instead of asking for a reload", async () => {
    transitionQuotation.mockRejectedValue(
      new ApiClientError(
        409,
        "invalid_quotation_transition",
        "A draft quotation cannot become accepted."
      )
    );
    const menu = await openList("Sent");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Accept" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText(/not available for this quotation any more/i)).toBeTruthy();
  });
});

describe("Quotation immutability", () => {
  it("locks the money on a sent quotation and says why", async () => {
    listQuotations.mockResolvedValue(paged([quotation({ status: "Sent" })]));
    renderPanel({ editing: true, openId: "quotation-1" });

    const editor = await screen.findByTestId("quotation-editor");
    expect(
      within(editor).getByText(/sent, so its money can no longer be changed/i)
    ).toBeTruthy();
    expect(
      (within(editor).getByTestId("save-quotation") as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
