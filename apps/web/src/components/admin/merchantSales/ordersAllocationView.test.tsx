// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import { merchant, order, overview, paged } from "./merchantSalesFixtures";

const listMerchantOrders = vi.fn();
const listMerchants = vi.fn();
const listInvoices = vi.fn();
const getMerchantSalesOverview = vi.fn();

vi.mock("@/services/adminMerchantSalesService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantSalesService")
  >("@/services/adminMerchantSalesService");
  return {
    ...actual,
    listMerchantOrders: (...a: unknown[]) => listMerchantOrders(...a),
    listMerchants: (...a: unknown[]) => listMerchants(...a),
  };
});

vi.mock("@/services/adminMerchantBillingService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantBillingService")
  >("@/services/adminMerchantBillingService");
  return {
    ...actual,
    listInvoices: (...a: unknown[]) => listInvoices(...a),
    getMerchantSalesOverview: (...a: unknown[]) => getMerchantSalesOverview(...a),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/merchant-sales",
  useSearchParams: () => new URLSearchParams("tab=orders"),
}));

const { OrdersPanel } = await import("./OrdersPanel");
const { MerchantSalesOverview } = await import("./MerchantSalesOverview");

const noop = () => {};
const paid = (allocated: number, required = 100, extra = {}) =>
  order({
    paymentStatus: "PaymentConfirmed",
    allocatedUnits: allocated,
    requiredUnits: required,
    ...extra,
  } as never);

const renderOrders = (props: Partial<Parameters<typeof OrdersPanel>[0]> = {}) =>
  render(
    <OrdersPanel
      allocationState={null}
      fulfilmentStatus={null}
      onOpen={noop}
      onOpenInvoice={noop}
      openId={null}
      paymentStatus={null}
      {...props}
    />
  );

beforeEach(() => {
  vi.clearAllMocks();
  listMerchantOrders.mockResolvedValue(paged([paid(0)]));
  listMerchants.mockResolvedValue(paged([merchant()]));
  listInvoices.mockResolvedValue(paged([]));
  getMerchantSalesOverview.mockResolvedValue(overview());
});
afterEach(cleanup);

describe("Orders list allocation progress", () => {
  it("shows nothing allocated as a count, never as an empty cell", async () => {
    renderOrders();

    const number = await screen.findByText("MPL-B2B-ORD-260806-0001");
    const row = number.closest("tr") as HTMLElement;
    expect(within(row).getByText("0 / 100 allocated")).toBeTruthy();
    expect(within(row).getByText("100 remaining")).toBeTruthy();
  });

  it("shows partial allocation", async () => {
    listMerchantOrders.mockResolvedValue(paged([paid(40, 125)]));
    renderOrders();

    const row = (await screen.findByText("MPL-B2B-ORD-260806-0001")).closest("tr") as HTMLElement;
    expect(within(row).getByText("40 / 125 allocated")).toBeTruthy();
  });

  it("shows complete allocation as fully allocated", async () => {
    listMerchantOrders.mockResolvedValue(paged([paid(125, 125)]));
    renderOrders();

    const row = (await screen.findByText("MPL-B2B-ORD-260806-0001")).closest("tr") as HTMLElement;
    expect(within(row).getByText("125 / 125 allocated")).toBeTruthy();
    expect(within(row).getByText("Fully allocated")).toBeTruthy();
  });

  it("says awaiting payment instead of a progress bar before the money is in", async () => {
    listMerchantOrders.mockResolvedValue(paged([order({ paymentStatus: "AwaitingPayment" })]));
    renderOrders();

    const row = (await screen.findByText("MPL-B2B-ORD-260806-0001")).closest("tr") as HTMLElement;
    expect(within(row).queryByRole("progressbar")).toBeNull();
    expect(within(row).getAllByText(/Awaiting payment/).length).toBeGreaterThan(0);
  });

  it("keeps payment, inventory and fulfilment as three separate readings", async () => {
    listMerchantOrders.mockResolvedValue(
      paged([paid(40, 100, { fulfilmentStatus: "Preparing" })])
    );
    renderOrders();

    const row = (await screen.findByText("MPL-B2B-ORD-260806-0001")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Payment confirmed")).toBeTruthy();
    expect(within(row).getByText("40 / 100 allocated")).toBeTruthy();
    expect(within(row).getByText("Preparing")).toBeTruthy();
  });

  it("shows a cancelled order as cancelled rather than as a fulfilment stage", async () => {
    listMerchantOrders.mockResolvedValue(
      paged([order({ paymentStatus: "Cancelled", fulfilmentStatus: "NotStarted" } as never)])
    );
    renderOrders();

    const row = (await screen.findByText("MPL-B2B-ORD-260806-0001")).closest("tr") as HTMLElement;
    expect(within(row).getAllByText("Cancelled").length).toBeGreaterThan(0);
    expect(within(row).queryByText("Not started")).toBeNull();
  });
});

describe("Orders list next step wording", () => {
  it("asks for allocation when nothing is held yet", async () => {
    renderOrders();
    const row = (await screen.findByText("MPL-B2B-ORD-260806-0001")).closest("tr") as HTMLElement;

    expect(within(row).getByText("Allocate inventory")).toBeTruthy();
  });

  it("asks to finish allocating part way through", async () => {
    listMerchantOrders.mockResolvedValue(paged([paid(40)]));
    renderOrders();
    const row = (await screen.findByText("MPL-B2B-ORD-260806-0001")).closest("tr") as HTMLElement;

    expect(within(row).getByText("Finish allocating inventory")).toBeTruthy();
  });

  it("says ready for fulfilment, never ready to ship, once fully allocated", async () => {
    listMerchantOrders.mockResolvedValue(paged([paid(100)]));
    renderOrders();
    const row = (await screen.findByText("MPL-B2B-ORD-260806-0001")).closest("tr") as HTMLElement;

    // Full allocation is not the same decision as shipping readiness.
    expect(within(row).getByText("Ready for fulfilment")).toBeTruthy();
    expect(within(row).queryByText("Ready to ship")).toBeNull();
  });

  it("still tracks the invoice stage before payment", async () => {
    listMerchantOrders.mockResolvedValue(paged([order({ paymentStatus: "AwaitingPayment" })]));
    renderOrders();
    const row = (await screen.findByText("MPL-B2B-ORD-260806-0001")).closest("tr") as HTMLElement;

    expect(within(row).getByText("Awaiting invoice")).toBeTruthy();
  });
});

describe("Orders list filters", () => {
  it("offers the three allocation states and the five fulfilment states", async () => {
    renderOrders();
    await screen.findByText("MPL-B2B-ORD-260806-0001");

    const inventory = screen.getByLabelText("Inventory") as HTMLSelectElement;
    expect([...inventory.options].map((option) => option.value)).toEqual([
      "",
      "none",
      "incomplete",
      "complete",
    ]);

    const fulfilment = screen.getByLabelText("Fulfilment") as HTMLSelectElement;
    expect([...fulfilment.options].map((option) => option.textContent)).toContain("Ready to ship");
  });

  it("asks the server for the allocation state rather than filtering in the browser", async () => {
    renderOrders({ allocationState: "incomplete" });

    await waitFor(() => expect(listMerchantOrders).toHaveBeenCalled());
    const params = listMerchantOrders.mock.calls[0][0] as Record<string, unknown>;
    expect(params.allocationState).toBe("incomplete");
  });

  it("asks the server for the fulfilment status too", async () => {
    renderOrders({ fulfilmentStatus: "ReadyToShip" });

    await waitFor(() => expect(listMerchantOrders).toHaveBeenCalled());
    const params = listMerchantOrders.mock.calls[0][0] as Record<string, unknown>;
    expect(params.fulfilmentStatus).toBe("ReadyToShip");
  });

  it("asks for the page once, never once per row", async () => {
    listMerchantOrders.mockResolvedValue(
      paged([paid(1), paid(2), paid(3), paid(4), paid(5)].map((row, index) =>
        ({ ...row, id: `order-${index}` })))
    );
    renderOrders();
    await screen.findAllByText("MPL-B2B-ORD-260806-0001");

    // Progress travels with the listing, so five rows cost one request.
    expect(listMerchantOrders).toHaveBeenCalledTimes(1);
  });
});

describe("Orders list states", () => {
  it("shows no misleading progress while the page is still loading", async () => {
    let resolve: (value: unknown) => void = noop;
    listMerchantOrders.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderOrders();

    expect(screen.queryByText("0 / 0 allocated")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();

    resolve(paged([paid(0)]));
    expect(await screen.findByText("0 / 100 allocated")).toBeTruthy();
  });

  it("explains an empty result", async () => {
    listMerchantOrders.mockResolvedValue(paged([], 0));
    renderOrders();

    expect(await screen.findByText(/No merchant orders/i)).toBeTruthy();
  });

  it("explains a failed load without leaking the error code", async () => {
    listMerchantOrders.mockRejectedValue(
      new ApiClientError(500, "server_error", "Something failed.")
    );
    renderOrders();

    expect(await screen.findByText(/couldn’t load merchant orders/i)).toBeTruthy();
    expect(document.body.textContent).not.toContain("server_error");
  });
});

describe("Merchant Sales overview counters", () => {
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

  it("separates awaiting, partial and full allocation", async () => {
    getMerchantSalesOverview.mockResolvedValue(
      overview({
        paidOrdersAwaitingAllocation: 7,
        partiallyAllocatedOrders: 3,
        fullyAllocatedOrders: 2,
      })
    );
    renderOverview();

    const awaiting = await screen.findByText("Awaiting allocation");
    expect(within(awaiting.closest("div") as HTMLElement).getByText("7")).toBeTruthy();
    const partial = screen.getByText("Partially allocated");
    expect(within(partial.closest("div") as HTMLElement).getByText("3")).toBeTruthy();
    const full = screen.getByText("Fully allocated");
    expect(within(full.closest("div") as HTMLElement).getByText("2")).toBeTruthy();
  });

  it("shows each fulfilment stage on its own", async () => {
    renderOverview();
    await screen.findByText("Awaiting allocation");

    expect(screen.getByText("Ready to ship")).toBeTruthy();
    expect(screen.getByText("Shipped")).toBeTruthy();
    expect(screen.getByText("Delivered")).toBeTruthy();
  });

  it("says a fully allocated order is not the same as ready to ship", async () => {
    renderOverview();
    const full = await screen.findByText("Fully allocated");

    expect(full.closest("div")?.textContent).toMatch(/Not the same as ready to ship/i);
  });

  it("shows zero counts once loaded rather than hiding them", async () => {
    getMerchantSalesOverview.mockResolvedValue(
      overview({
        paidOrdersAwaitingAllocation: 0,
        partiallyAllocatedOrders: 0,
        fullyAllocatedOrders: 0,
        ordersReadyToShip: 0,
        ordersShipped: 0,
        ordersDelivered: 0,
      })
    );
    renderOverview();

    const awaiting = await screen.findByText("Awaiting allocation");
    expect(within(awaiting.closest("div") as HTMLElement).getByText("0")).toBeTruthy();
  });

  it("shows no counter at all until the numbers arrive", () => {
    getMerchantSalesOverview.mockReturnValue(new Promise(() => {}));
    renderOverview();

    expect(screen.queryByText("Awaiting allocation")).toBeNull();
    expect(screen.queryByText("Fully allocated")).toBeNull();
  });

  it("links each allocation shortcut to the matching orders filter", async () => {
    const onGoTo = vi.fn();
    renderOverview({ onGoTo });
    await screen.findByText("Awaiting allocation");

    fireEvent.click(screen.getByRole("button", { name: "View awaiting allocation" }));
    expect(onGoTo).toHaveBeenLastCalledWith("orders", {
      paymentStatus: "PaymentConfirmed",
      allocationState: "none",
    });

    fireEvent.click(screen.getByRole("button", { name: "View partially allocated" }));
    expect(onGoTo).toHaveBeenLastCalledWith("orders", {
      paymentStatus: "PaymentConfirmed",
      allocationState: "incomplete",
    });

    fireEvent.click(screen.getByRole("button", { name: "View fully allocated" }));
    expect(onGoTo).toHaveBeenLastCalledWith("orders", {
      paymentStatus: "PaymentConfirmed",
      allocationState: "complete",
    });
  });

  it("sends the fulfilment shortcuts to the matching order filter", async () => {
    const onGoTo = vi.fn();
    renderOverview({ onGoTo });
    await screen.findByText("Awaiting allocation");

    fireEvent.click(screen.getByRole("button", { name: "View Ready to Ship" }));
    expect(onGoTo).toHaveBeenCalledWith("orders", { fulfilmentStatus: "ReadyToShip" });

    fireEvent.click(screen.getByRole("button", { name: "View Shipped" }));
    expect(onGoTo).toHaveBeenCalledWith("orders", { fulfilmentStatus: "Shipped" });
  });

  it("keeps the overview to two fulfilment shortcuts", async () => {
    renderOverview();
    await screen.findByText("Awaiting allocation");

    const shipping = screen.getAllByRole("button")
      .map((el) => el.textContent ?? "")
      .filter((label) => /ship|courier|tracking|deliver/i.test(label));
    expect(shipping).toEqual(["View Ready to Ship", "View Shipped"]);
  });
});
