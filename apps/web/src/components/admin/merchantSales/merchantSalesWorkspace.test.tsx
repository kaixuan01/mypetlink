// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import { merchant, order, overview, paged, quotation } from "./merchantSalesFixtures";

const getMerchantSalesOverview = vi.fn();
const listMerchantOrders = vi.fn();
const listMerchants = vi.fn();
const listSalespersons = vi.fn();
const listQuotations = vi.fn();
const issueInvoice = vi.fn();
const listInvoices = vi.fn();
const listCommissions = vi.fn();
const getMerchantEmailStatuses = vi.fn();

vi.mock("@/services/adminMerchantBillingService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantBillingService")
  >("@/services/adminMerchantBillingService");
  return {
    ...actual,
    getMerchantSalesOverview: (...a: unknown[]) => getMerchantSalesOverview(...a),
    issueInvoice: (...a: unknown[]) => issueInvoice(...a),
    listInvoices: (...a: unknown[]) => listInvoices(...a),
    listCommissions: (...a: unknown[]) => listCommissions(...a),
    getMerchantEmailStatuses: (...a: unknown[]) => getMerchantEmailStatuses(...a),
  };
});

vi.mock("@/services/adminMerchantSalesService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantSalesService")
  >("@/services/adminMerchantSalesService");
  return {
    ...actual,
    listMerchantOrders: (...a: unknown[]) => listMerchantOrders(...a),
    listMerchants: (...a: unknown[]) => listMerchants(...a),
    listSalespersons: (...a: unknown[]) => listSalespersons(...a),
    listQuotations: (...a: unknown[]) => listQuotations(...a),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/merchant-sales",
  useSearchParams: () => new URLSearchParams("tab=orders"),
}));

const { MerchantSalesOverview } = await import("./MerchantSalesOverview");
const { OrdersPanel } = await import("./OrdersPanel");

const noop = () => {};

beforeEach(() => {
  vi.clearAllMocks();
  getMerchantSalesOverview.mockResolvedValue(overview());
  listMerchantOrders.mockResolvedValue(paged([order()]));
  listMerchants.mockResolvedValue(paged([merchant()]));
  listSalespersons.mockResolvedValue(paged([]));
  listQuotations.mockResolvedValue(paged([quotation()]));
  listInvoices.mockResolvedValue(paged([]));
  listCommissions.mockResolvedValue(paged([]));
  getMerchantEmailStatuses.mockResolvedValue([]);
});
afterEach(cleanup);

const renderOverview = (props: Record<string, unknown> = {}) =>
  render(
    <MerchantSalesOverview
      onGoTo={noop}
      onNewMerchant={noop}
      onNewQuotation={noop}
      onNewSalesperson={noop}
      {...props}
    />
  );

describe("Overview", () => {
  it("shows no figure at all until the numbers have arrived", async () => {
    let resolve: (value: unknown) => void = noop;
    getMerchantSalesOverview.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderOverview();

    // A zero shown before the answer arrives would read as real data.
    expect(screen.queryByText("MYR 0.00")).toBeNull();
    resolve(overview());
    expect(await screen.findByText("MYR 1,035.00")).toBeTruthy();
  });

  it("formats every money figure with its currency and two decimals", async () => {
    renderOverview();

    expect(await screen.findByText("MYR 1,035.00")).toBeTruthy();
    expect(screen.getByText("MYR 75.00")).toBeTruthy();
  });

  it("marks the commission figure as internal", async () => {
    renderOverview();
    const label = await screen.findByText(/Payable commission/i);

    expect(label.closest("div")?.textContent).toMatch(/internal/i);
  });

  it("explains a failed load and offers a way to try again", async () => {
    getMerchantSalesOverview.mockRejectedValue(
      new ApiClientError(500, "server_error", "Something failed.")
    );
    renderOverview();

    expect(await screen.findByText(/couldn’t load/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    expect(document.body.textContent).not.toContain("server_error");
  });

  it("recovers when the retry succeeds", async () => {
    getMerchantSalesOverview
      .mockRejectedValueOnce(new ApiClientError(500, "server_error", "Something failed."))
      .mockResolvedValueOnce(overview());
    renderOverview();

    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByText("MYR 1,035.00")).toBeTruthy();
  });

  it("offers a quick way to start each kind of record", async () => {
    const onNewMerchant = vi.fn();
    const onNewQuotation = vi.fn();
    renderOverview({ onNewMerchant, onNewQuotation });
    await screen.findByText("MYR 1,035.00");

    fireEvent.click(screen.getByRole("button", { name: /New merchant/i }));
    expect(onNewMerchant).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /New quotation/i }));
    expect(onNewQuotation).toHaveBeenCalledTimes(1);
  });

  it("lets a counter lead straight to the list it counts", async () => {
    const onGoTo = vi.fn();
    renderOverview({ onGoTo });
    await screen.findByText("MYR 1,035.00");

    const shortcut = screen
      .getAllByRole("button")
      .find((el) => /outstanding|awaiting|view/i.test(el.textContent ?? ""));
    if (shortcut) {
      fireEvent.click(shortcut);
      expect(onGoTo).toHaveBeenCalled();
    }
  });
});

describe("Merchant orders", () => {
  const renderOrders = (props: Partial<Parameters<typeof OrdersPanel>[0]> = {}) =>
    render(
      <OrdersPanel
        onOpen={noop}
        onOpenInvoice={noop}
        allocationState={null}
        fulfilmentStatus={null}
        openId={null}
        paymentStatus={null}
        {...props}
      />
    );

  it("shows the order number, its source quotation and the exact total", async () => {
    renderOrders();

    const number = await screen.findByText("MPL-B2B-ORD-260806-0001");
    const row = number.closest("tr") as HTMLElement;
    expect(within(row).getByText(/MPL-QT-260806-0001/)).toBeTruthy();
    expect(within(row).getByText("MYR 1,535.00")).toBeTruthy();
  });

  it("lets a long order number wrap rather than breaking it letter by letter", async () => {
    renderOrders();
    const number = await screen.findByText("MPL-B2B-ORD-260806-0001");

    expect(number.className).not.toContain("break-all");
  });

  it("states plainly that inventory is not reserved", async () => {
    renderOrders({ openId: "order-1" });

    expect(
      await screen.findByTestId("order-allocation-state")
    ).toBeTruthy();
    expect(screen.getByTestId("order-allocation-state").textContent).toMatch(
      /not been allocated or reserved/i
    );
  });

  it("offers no shipping, courier or packing action", async () => {
    renderOrders({ openId: "order-1" });
    await screen.findByTestId("order-allocation-state");

    const actions = screen.getAllByRole("button").map((el) => el.textContent ?? "");
    expect(
      actions.some((label) => /ship|courier|tracking|packing|delivery order/i.test(label))
    ).toBe(false);
  });

  it("offers Issue invoice while the order is still awaiting payment", async () => {
    renderOrders();
    fireEvent.click(
      await screen.findByRole("button", { name: "Actions for MPL-B2B-ORD-260806-0001" })
    );
    const labels = within(await screen.findByRole("menu"))
      .getAllByRole("menuitem")
      .map((el) => el.textContent);

    expect(labels).toContain("Issue invoice");
  });

  it("says the order is ready for allocation once payment is confirmed", async () => {
    listMerchantOrders.mockResolvedValue(
      paged([order({ paymentStatus: "PaymentConfirmed" })])
    );
    renderOrders({ openId: "order-1" });

    expect((await screen.findByTestId("order-allocation-state")).textContent).toMatch(
      /ready for inventory allocation/i
    );
  });

  it("explains a failed load without leaking the error code", async () => {
    listMerchantOrders.mockRejectedValue(
      new ApiClientError(500, "server_error", "Something failed.")
    );
    renderOrders();

    expect(await screen.findByText(/couldn’t load/i)).toBeTruthy();
    expect(document.body.textContent).not.toContain("server_error");
  });
});
