// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import {
  allocatedTag,
  allocationItem,
  allocationSummary,
  courierOption,
  deliveryOrder,
  eligibleTag,
  fulfilment,
  order,
} from "./merchantSalesFixtures";

const getAllocationSummary = vi.fn();
const listAllocatedTags = vi.fn();
const listEligibleInventory = vi.fn();
const allocateTags = vi.fn();
const autoAllocateTags = vi.fn();
const releaseAllocations = vi.fn();
const getMerchantOrderTimeline = vi.fn();
const getFulfilment = vi.fn();
const markReadyToShip = vi.fn();
const markShipped = vi.fn();
const markDelivered = vi.fn();
const issueDeliveryOrder = vi.fn();
const listShippingCourierOptions = vi.fn();

vi.mock("@/services/adminMerchantFulfilmentService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantFulfilmentService")
  >("@/services/adminMerchantFulfilmentService");
  return {
    ...actual,
    getAllocationSummary: (...a: unknown[]) => getAllocationSummary(...a),
    listAllocatedTags: (...a: unknown[]) => listAllocatedTags(...a),
    listEligibleInventory: (...a: unknown[]) => listEligibleInventory(...a),
    allocateTags: (...a: unknown[]) => allocateTags(...a),
    autoAllocateTags: (...a: unknown[]) => autoAllocateTags(...a),
    releaseAllocations: (...a: unknown[]) => releaseAllocations(...a),
    getFulfilment: (...a: unknown[]) => getFulfilment(...a),
    markReadyToShip: (...a: unknown[]) => markReadyToShip(...a),
    markShipped: (...a: unknown[]) => markShipped(...a),
    markDelivered: (...a: unknown[]) => markDelivered(...a),
    issueDeliveryOrder: (...a: unknown[]) => issueDeliveryOrder(...a),
  };
});

vi.mock("@/services/adminShippingFulfilmentService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminShippingFulfilmentService")
  >("@/services/adminShippingFulfilmentService");
  return {
    ...actual,
    listShippingCourierOptions: (...a: unknown[]) => listShippingCourierOptions(...a),
  };
});

vi.mock("@/services/adminMerchantSalesService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantSalesService")
  >("@/services/adminMerchantSalesService");
  return {
    ...actual,
    getMerchantOrderTimeline: (...a: unknown[]) => getMerchantOrderTimeline(...a),
  };
});

const { OrderInventorySection } = await import("./OrderInventorySection");

const paidOrder = order({ paymentStatus: "PaymentConfirmed" });

beforeEach(() => {
  vi.clearAllMocks();
  getAllocationSummary.mockResolvedValue(allocationSummary());
  listAllocatedTags.mockResolvedValue([]);
  listEligibleInventory.mockResolvedValue({ items: [], total: 0 });
  getMerchantOrderTimeline.mockResolvedValue([]);
  getFulfilment.mockResolvedValue(fulfilment());
  markReadyToShip.mockResolvedValue(fulfilment({ fulfilmentStatus: "ReadyToShip" }));
  markShipped.mockResolvedValue(fulfilment({ fulfilmentStatus: "Shipped" }));
  markDelivered.mockResolvedValue(fulfilment({ fulfilmentStatus: "Delivered" }));
  issueDeliveryOrder.mockResolvedValue(deliveryOrder());
  listShippingCourierOptions.mockResolvedValue([courierOption()]);
});
afterEach(cleanup);

const renderSection = () => render(<OrderInventorySection order={paidOrder} />);

/** Opens the drawer for the default single line. */
async function openDrawer() {
  renderSection();
  fireEvent.click(await screen.findByTestId("allocate-WS-QR-0001"));
  return screen.findByTestId("allocation-drawer");
}

const stateText = () => screen.getByTestId("allocation-state-message").textContent;

describe("Order inventory detail", () => {
  it("says nothing is allocated yet once payment is confirmed", async () => {
    renderSection();

    expect(await screen.findByTestId("allocation-state-message")).toBeTruthy();
    expect(stateText()).toBe("Payment confirmed. Inventory has not been allocated yet.");
  });

  it("counts partial progress in the exact approved wording", async () => {
    getAllocationSummary.mockResolvedValue(
      allocationSummary({ allocatedUnits: 75, remainingUnits: 25 })
    );
    renderSection();

    expect((await screen.findByTestId("allocation-state-message")).textContent).toBe(
      "75 of 100 tags allocated. 25 remaining."
    );
  });

  it("stops at fully allocated without claiming the order is ready to ship", async () => {
    getAllocationSummary.mockResolvedValue(
      allocationSummary({
        allocatedUnits: 100,
        remainingUnits: 0,
        isFullyAllocated: true,
        canMarkReadyToShip: true,
        items: [
          allocationItem({ allocatedUnits: 100, remainingUnits: 0, isFullyAllocated: true }),
        ],
      })
    );
    renderSection();

    expect((await screen.findByTestId("allocation-state-message")).textContent).toBe(
      "All required tags are allocated. This order is ready for the fulfilment step."
    );
    expect(screen.getByText("This item is fully allocated.")).toBeTruthy();
    expect(screen.queryByTestId("allocate-WS-QR-0001")).toBeNull();

    // Full allocation offers the next step; it never takes it. The order must
    // still read Preparing until an admin confirms readiness themselves.
    expect(await screen.findByTestId("mark-ready-to-ship")).toBeTruthy();
    expect(markReadyToShip).not.toHaveBeenCalled();
    expect(screen.getByTestId("fulfilment-status").textContent).toBe("Preparing");
  });

  it("offers no allocation controls before payment is confirmed", async () => {
    getAllocationSummary.mockResolvedValue(
      allocationSummary({
        paymentStatus: "AwaitingPayment",
        allocationAllowed: false,
        allocationBlockedReason: "Payment must be confirmed before inventory is allocated.",
      })
    );
    renderSection();

    expect((await screen.findByTestId("allocation-state-message")).textContent).toBe(
      "Inventory allocation is available after full payment is confirmed."
    );
    expect(screen.queryByTestId("allocate-WS-QR-0001")).toBeNull();
  });

  it("locks allocation once the order has shipped", async () => {
    getAllocationSummary.mockResolvedValue(
      allocationSummary({
        fulfilmentStatus: "Shipped",
        allocatedUnits: 100,
        remainingUnits: 0,
        isFullyAllocated: true,
        items: [
          allocationItem({ allocatedUnits: 100, remainingUnits: 0, isFullyAllocated: true }),
        ],
      })
    );
    renderSection();

    expect((await screen.findByTestId("allocation-state-message")).textContent).toBe(
      "Inventory allocation is locked after shipment."
    );
  });

  it("shows each line's own figures and batch summary", async () => {
    getAllocationSummary.mockResolvedValue(
      allocationSummary({
        allocatedUnits: 30,
        remainingUnits: 70,
        items: [
          allocationItem({
            allocatedUnits: 30,
            remainingUnits: 70,
            batches: [{ batchId: "batch-1", batchNo: "BATCH-2026-01", quantity: 30 }],
          }),
        ],
      })
    );
    renderSection();

    const card = await screen.findByTestId("inventory-item-card");
    expect(within(card).getByText("SKU WS-QR-0001 · Lightweight")).toBeTruthy();
    expect(within(card).getByText("BATCH-2026-01 × 30")).toBeTruthy();
  });

  it("keeps the section usable when the summary cannot be loaded", async () => {
    getAllocationSummary.mockRejectedValue(new ApiClientError(500, "server_error", ""));
    renderSection();

    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
    getAllocationSummary.mockResolvedValue(allocationSummary());
    fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0]);

    expect(await screen.findByTestId("allocation-state-message")).toBeTruthy();
  });
});

describe("Allocation timeline", () => {
  it("renders the sentences the server produced, newest entries included", async () => {
    getMerchantOrderTimeline.mockResolvedValue([
      {
        action: "Allocated",
        summary: "25 tags allocated from BATCH-2026-01.",
        occurredAt: "2026-08-07T03:00:00Z",
        actorName: "Nur Aisyah",
      },
    ]);
    renderSection();

    const timeline = await screen.findByTestId("allocation-timeline");
    expect(within(timeline).getByText("25 tags allocated from BATCH-2026-01.")).toBeTruthy();
    expect(timeline.textContent).toContain("Nur Aisyah");
  });

  it("says plainly when nothing has happened yet", async () => {
    renderSection();

    expect(
      await screen.findByText("Nothing has happened to this order's inventory yet.")
    ).toBeTruthy();
  });
});

describe("Eligible inventory browser", () => {
  it("asks only for tags eligible for the line the admin opened", async () => {
    await openDrawer();

    expect(listEligibleInventory).toHaveBeenCalled();
    const [orderId, query] = listEligibleInventory.mock.calls[0];
    expect(orderId).toBe("order-1");
    expect(query.merchantOrderItemId).toBe("line-1");
    expect(query.page).toBe(1);
  });

  it("re-queries from the first page when the search changes", async () => {
    listEligibleInventory.mockResolvedValue({ items: [eligibleTag()], total: 60 });
    await openDrawer();
    await screen.findByText("MPL-TAG-000001");

    fireEvent.click(screen.getByLabelText("Next page"));
    await screen.findByText(/Page 2 of/);

    fireEvent.change(screen.getByPlaceholderText("Search tag code"), {
      target: { value: "000123" },
    });

    const last = listEligibleInventory.mock.calls.at(-1)?.[1];
    expect(last.search).toBe("000123");
    expect(last.page).toBe(1);
  });

  it("keeps a selection made on an earlier page", async () => {
    listEligibleInventory.mockResolvedValueOnce({
      items: [eligibleTag()],
      total: 40,
    });
    listEligibleInventory.mockResolvedValue({
      items: [eligibleTag({ smartTagId: "tag-2", tagCode: "MPL-TAG-000002" })],
      total: 40,
    });
    await openDrawer();

    fireEvent.click(await screen.findByLabelText("Select row tag-1"));
    expect(screen.getByTestId("selection-summary").textContent).toContain("1 selected");

    fireEvent.click(screen.getByLabelText("Next page"));
    await screen.findByText("MPL-TAG-000002");

    expect(screen.getByTestId("selection-summary").textContent).toContain("1 selected");
    expect(screen.getByTestId("selection-summary").textContent).toContain("1 on other pages");
  });
});

describe("Manual allocation", () => {
  it("confirms with the order, SKU and remaining figures before allocating", async () => {
    listEligibleInventory.mockResolvedValue({ items: [eligibleTag()], total: 1 });
    allocateTags.mockResolvedValue(
      allocationSummary({
        allocatedUnits: 1,
        remainingUnits: 99,
        items: [allocationItem({ allocatedUnits: 1, remainingUnits: 99 })],
      })
    );
    await openDrawer();

    fireEvent.click(await screen.findByLabelText("Select row tag-1"));
    fireEvent.click(screen.getByTestId("allocate-selected"));

    expect(screen.getByText("Allocate 1 tag(s)?")).toBeTruthy();
    expect(screen.getByText(/Remaining before: 100\. Remaining after: 99\./)).toBeTruthy();
    expect(screen.getByText(/Selected batches: BATCH-2026-01 × 1\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Allocate tags" }));

    expect(await screen.findByText(/1 tag\(s\) allocated\. 99 remaining on this line\./))
      .toBeTruthy();
    expect(allocateTags).toHaveBeenCalledWith("order-1", {
      merchantOrderItemId: "line-1",
      smartTagIds: ["tag-1"],
      concurrencyToken: null,
    });
  });

  it("cancelling the confirmation allocates nothing", async () => {
    listEligibleInventory.mockResolvedValue({ items: [eligibleTag()], total: 1 });
    await openDrawer();

    fireEvent.click(await screen.findByLabelText("Select row tag-1"));
    fireEvent.click(screen.getByTestId("allocate-selected"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(allocateTags).not.toHaveBeenCalled();
    expect(screen.queryByText("Allocate 1 tag(s)?")).toBeNull();
  });

  it("refuses to send more tags than the line still needs", async () => {
    getAllocationSummary.mockResolvedValue(
      allocationSummary({
        allocatedUnits: 99,
        remainingUnits: 1,
        items: [allocationItem({ allocatedUnits: 99, remainingUnits: 1 })],
      })
    );
    listEligibleInventory.mockResolvedValue({
      items: [eligibleTag(), eligibleTag({ smartTagId: "tag-2", tagCode: "MPL-TAG-000002" })],
      total: 2,
    });
    await openDrawer();

    fireEvent.click(await screen.findByLabelText("Select all rows on this page"));

    expect(screen.getByText(/Deselect 1 tag\(s\)/)).toBeTruthy();
    expect(screen.getByTestId("allocate-selected").hasAttribute("disabled")).toBe(true);
  });

  it("cannot allocate with nothing selected", async () => {
    await openDrawer();

    expect(screen.getByTestId("allocate-selected").hasAttribute("disabled")).toBe(true);
  });
});

describe("Automatic allocation", () => {
  const openAuto = async () => {
    await openDrawer();
    fireEvent.click(screen.getByRole("tab", { name: "Auto allocate" }));
    return screen.findByTestId("auto-allocate-form");
  };

  it("explains the batch order it will use", async () => {
    await openAuto();

    expect(screen.getByText("Tags are selected from the oldest printed batches first."))
      .toBeTruthy();
  });

  it("defaults to what the line can actually be filled with", async () => {
    await openAuto();

    // 100 still required but only 40 eligible in stock.
    expect((screen.getByTestId("auto-quantity") as HTMLInputElement).value).toBe("40");
  });

  it("rejects a quantity larger than the line still needs", async () => {
    await openAuto();

    fireEvent.change(screen.getByTestId("auto-quantity"), { target: { value: "150" } });
    fireEvent.click(screen.getByTestId("auto-allocate"));

    expect(screen.getByText("Only 100 more tag(s) are needed on this line.")).toBeTruthy();
    expect(autoAllocateTags).not.toHaveBeenCalled();
  });

  it("rejects a quantity below one", async () => {
    await openAuto();

    fireEvent.change(screen.getByTestId("auto-quantity"), { target: { value: "0" } });
    fireEvent.click(screen.getByTestId("auto-allocate"));

    expect(screen.getByText("Enter a whole number of at least 1.")).toBeTruthy();
    expect(autoAllocateTags).not.toHaveBeenCalled();
  });

  it("warns when stock is short of the requested quantity", async () => {
    await openAuto();

    fireEvent.change(screen.getByTestId("auto-quantity"), { target: { value: "60" } });

    expect(screen.getByText("Only 40 eligible tag(s) are in stock right now.")).toBeTruthy();
  });

  it("names the batches it drew from after allocating", async () => {
    autoAllocateTags.mockResolvedValue(
      allocationSummary({
        allocatedUnits: 40,
        remainingUnits: 60,
        items: [
          allocationItem({
            allocatedUnits: 40,
            remainingUnits: 60,
            batches: [{ batchId: "batch-1", batchNo: "BATCH-2026-01", quantity: 40 }],
          }),
        ],
      })
    );
    await openAuto();

    fireEvent.click(screen.getByTestId("auto-allocate"));
    expect(screen.getByText("Allocate 40 tag(s) automatically?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Allocate" }));

    expect(
      await screen.findByText(
        "40 tag(s) allocated from BATCH-2026-01 × 40. 60 remaining on this line."
      )
    ).toBeTruthy();
    expect(autoAllocateTags).toHaveBeenCalledWith("order-1", {
      merchantOrderItemId: "line-1",
      quantity: 40,
      concurrencyToken: null,
    });
  });
});

describe("Active allocations and release", () => {
  const openActive = async () => {
    listAllocatedTags.mockResolvedValue([allocatedTag()]);
    await openDrawer();
    fireEvent.click(screen.getByRole("tab", { name: /Active allocations/ }));
    return screen.findByTestId("active-allocations");
  };

  it("lists only the allocations belonging to this line", async () => {
    listAllocatedTags.mockResolvedValue([
      allocatedTag(),
      allocatedTag({ id: "allocation-2", merchantOrderItemId: "line-2", tagCode: "MPL-TAG-000009" }),
    ]);
    await openDrawer();
    fireEvent.click(screen.getByRole("tab", { name: /Active allocations/ }));

    expect(await screen.findByText("MPL-TAG-000001")).toBeTruthy();
    expect(screen.queryByText("MPL-TAG-000009")).toBeNull();
  });

  it("shows how each tag was allocated", async () => {
    listAllocatedTags.mockResolvedValue([allocatedTag({ wasAutomatic: true })]);
    await openDrawer();
    fireEvent.click(screen.getByRole("tab", { name: /Active allocations/ }));

    expect(await screen.findByText("Automatic")).toBeTruthy();
  });

  it("requires a reason before releasing anything", async () => {
    await openActive();

    fireEvent.click(await screen.findByLabelText("Select row allocation-1"));
    fireEvent.click(screen.getByTestId("release-selected"));

    expect(screen.getByText("Give the reason these tags are being released.")).toBeTruthy();
    expect(releaseAllocations).not.toHaveBeenCalled();
  });

  it("marks the reason as internal only", async () => {
    await openActive();

    expect(
      screen.getByText("Internal release reason — Admin only, never shown to the merchant")
    ).toBeTruthy();
  });

  it("releases the selected tags with the reason and reports the effect", async () => {
    releaseAllocations.mockResolvedValue(allocationSummary());
    await openActive();

    fireEvent.click(await screen.findByLabelText("Select row allocation-1"));
    fireEvent.change(screen.getByTestId("release-reason"), {
      target: { value: "Damaged in packing." },
    });
    fireEvent.click(screen.getByTestId("release-selected"));

    expect(screen.getByText("Release 1 allocated tag(s)?")).toBeTruthy();
    expect(screen.getByText(/will return to available inventory/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Release tags" }));

    expect(
      await screen.findByText("1 tag(s) released back to available inventory.")
    ).toBeTruthy();
    expect(releaseAllocations).toHaveBeenCalledWith("order-1", {
      allocationIds: ["allocation-1"],
      reason: "Damaged in packing.",
      concurrencyToken: null,
    });
  });
});

describe("Stale inventory", () => {
  it("reloads and clears the selection rather than retrying behind the admin", async () => {
    listEligibleInventory.mockResolvedValue({ items: [eligibleTag()], total: 1 });
    allocateTags.mockRejectedValue(
      new ApiClientError(409, "concurrency_conflict", "Conflict.")
    );
    await openDrawer();

    fireEvent.click(await screen.findByLabelText("Select row tag-1"));
    fireEvent.click(screen.getByTestId("allocate-selected"));
    fireEvent.click(screen.getByRole("button", { name: "Allocate tags" }));

    expect(
      await screen.findByText(
        "Inventory changed while you were working. The latest availability has been loaded."
      )
    ).toBeTruthy();
    expect(screen.getByTestId("selection-summary").textContent).toContain("0 selected");
    expect(allocateTags).toHaveBeenCalledTimes(1);
  });

  it("takes the order's figures from the server after a refused allocation", async () => {
    listEligibleInventory.mockResolvedValue({ items: [eligibleTag()], total: 1 });
    allocateTags.mockRejectedValue(
      new ApiClientError(409, "inventory_already_allocated", "Taken.")
    );
    // Someone else allocated while this drawer was open.
    getAllocationSummary.mockResolvedValueOnce(allocationSummary()).mockResolvedValue(
      allocationSummary({
        allocatedUnits: 12,
        remainingUnits: 88,
        items: [allocationItem({ allocatedUnits: 12, remainingUnits: 88 })],
      })
    );
    await openDrawer();

    fireEvent.click(await screen.findByLabelText("Select row tag-1"));
    fireEvent.click(screen.getByTestId("allocate-selected"));
    fireEvent.click(screen.getByRole("button", { name: "Allocate tags" }));

    // The figures shown must be the server's, not the ones the drawer opened with.
    expect(await screen.findByText("12 of 100 tags allocated. 88 remaining.")).toBeTruthy();
  });
});

describe("Batch filter", () => {
  it("offers the batches this SKU's stock is actually in", async () => {
    listEligibleInventory.mockResolvedValue({
      items: [
        eligibleTag(),
        eligibleTag({ smartTagId: "tag-2", tagCode: "MPL-TAG-000002", batchId: "batch-2", batchNo: "BATCH-2026-02" }),
      ],
      total: 2,
    });
    await openDrawer();

    await screen.findByText("MPL-TAG-000002");
    const options = [...screen.getByRole("combobox").querySelectorAll("option")].map(
      (option) => option.textContent
    );
    expect(options).toEqual(["All batches", "BATCH-2026-01", "BATCH-2026-02"]);
  });

  it("still lists a batch after its last eligible unit is gone", async () => {
    getAllocationSummary.mockResolvedValue(
      allocationSummary({
        items: [
          allocationItem({
            batches: [{ batchId: "batch-9", batchNo: "BATCH-2025-09", quantity: 4 }],
          }),
        ],
      })
    );
    listEligibleInventory.mockResolvedValue({ items: [eligibleTag()], total: 1 });
    await openDrawer();

    await screen.findByText("MPL-TAG-000001");
    const options = [...screen.getByRole("combobox").querySelectorAll("option")].map(
      (option) => option.textContent
    );
    // The batch it already holds stays selectable even with no stock left in it.
    expect(options).toContain("BATCH-2025-09");
  });

  it("asks the server for the chosen batch and returns to the first page", async () => {
    listEligibleInventory.mockResolvedValue({ items: [eligibleTag()], total: 60 });
    await openDrawer();
    await screen.findByText("MPL-TAG-000001");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "batch-1" } });

    const last = listEligibleInventory.mock.calls.at(-1)?.[1];
    expect(last.batchId).toBe("batch-1");
    expect(last.page).toBe(1);
  });
});

describe("Accessibility", () => {
  it("presents the drawer as a labelled modal dialog", async () => {
    const drawer = await openDrawer();

    expect(drawer.getAttribute("aria-modal")).toBe("true");
    const labelId = drawer.getAttribute("aria-labelledby");
    expect(document.getElementById(labelId ?? "")?.textContent).toContain(
      "Allocate tags — Wholesale Smart Tag"
    );
  });

  it("closes on Escape and returns focus to the button that opened it", async () => {
    renderSection();
    const opener = await screen.findByTestId("allocate-WS-QR-0001");
    opener.focus();
    fireEvent.click(opener);
    await screen.findByTestId("allocation-drawer");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("allocation-drawer")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("allocate-WS-QR-0001"));
  });

  it("names the progress bar per line so two SKUs are never confused", async () => {
    renderSection();

    const bar = await screen.findByLabelText(
      "WS-QR-0001 allocation: 0 of 100 tags allocated"
    );
    expect(bar).toBeTruthy();
  });

  it("announces the selection count as it changes", async () => {
    listEligibleInventory.mockResolvedValue({ items: [eligibleTag()], total: 1 });
    await openDrawer();

    expect(screen.getByTestId("selection-summary").getAttribute("aria-live")).toBe("polite");
  });

  it("ties the quantity error to the field it belongs to", async () => {
    await openDrawer();
    fireEvent.click(screen.getByRole("tab", { name: "Auto allocate" }));
    fireEvent.change(screen.getByTestId("auto-quantity"), { target: { value: "500" } });
    fireEvent.click(screen.getByTestId("auto-allocate"));

    const field = screen.getByTestId("auto-quantity");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const describedBy = field.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(
      "Only 100 more tag(s) are needed on this line."
    );
  });
});
