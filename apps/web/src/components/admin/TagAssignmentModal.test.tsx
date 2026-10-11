// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminOrderFulfilmentItem } from "@/services/adminOrderService";
import type { AdminAssignableTag, AdminAssignableTagsResult } from "@/services/tagService";
import type { TagOrder } from "@/types";
import { TagAssignmentModal, type AssignableTagLoader } from "./TagAssignmentModal";

const order: TagOrder = {
  id: "order-1",
  orderNumber: "MPL-ORD-1001",
  petId: "pet-1",
  petName: "Topu",
  tagType: "MyPetLink QR + NFC Smart Tag",
  variant: "Lightweight",
  delivery: {
    recipientName: "Aina Owner",
    phone: "+60123456789",
    addressLine1: "1 Jalan Ampang",
    addressLine2: "",
    postcode: "50450",
    city: "Kuala Lumpur",
    state: "Kuala Lumpur",
    notes: "",
  },
  estimatedPrice: "RM39",
  status: "Payment Confirmed",
  orderedDate: "2026-10-01T02:00:00Z",
};

const line: AdminOrderFulfilmentItem = {
  orderItemId: "item-1",
  productVariantId: "variant-1",
  sku: "MPL-QRNFC-LW",
  productName: "QR + NFC Smart Tag",
  variantName: "Lightweight",
  petId: "pet-1",
  petName: "Topu",
  quantity: 2,
  assignedTags: [],
};

function tag(index: number): AdminAssignableTag {
  const code = `MPL-PASS-${String(index).padStart(4, "0")}`;
  return { id: `tag-${index}`, tagCode: code, batchNo: "BATCH-202610-0001", productVariantId: "variant-1", hasNfc: true, variant: "Lightweight", qaInspectedAt: "2026-10-05T03:00:00Z" };
}

function page(items: AdminAssignableTag[], total: number, awaitingInspection: number, pageNumber = 1): AdminAssignableTagsResult {
  return { items, total, page: pageNumber, pageSize: 20, awaitingInspection };
}

function renderModal(loadTags: AssignableTagLoader, onSubmit = vi.fn()) {
  render(
    <TagAssignmentModal
      busy={false}
      fulfilmentItems={[line]}
      loadTags={loadTags}
      mode="assign"
      onCancel={vi.fn()}
      onSubmit={onSubmit}
      order={order}
      ownerName="Aina Owner"
      petName="Topu"
    />
  );
  return onSubmit;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TagAssignmentModal", () => {
  it("asks for inspected tags of the order line and assigns the chosen one", async () => {
    const loadTags = vi.fn<AssignableTagLoader>().mockResolvedValue(page([tag(1), tag(2)], 2, 0));
    const onSubmit = renderModal(loadTags);

    await screen.findByText("MPL-PASS-0001");
    expect(loadTags).toHaveBeenCalledWith("order-1", expect.objectContaining({ orderItemId: "item-1", search: "", page: 1 }), expect.anything());
    expect(screen.getAllByText(/QA passed/).length).toBe(2);

    const submit = screen.getByRole("button", { name: "Assign selected tag" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByText("MPL-PASS-0002"));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tagId: "tag-2", orderItemId: "item-1" }));
  });

  it("searches on the server instead of filtering the first page", async () => {
    const loadTags = vi.fn<AssignableTagLoader>().mockImplementation(async (_orderId, options) =>
      options.search ? page([tag(140)], 1, 0) : page([tag(1)], 140, 0)
    );
    renderModal(loadTags);

    await screen.findByText("MPL-PASS-0001");
    fireEvent.change(screen.getByLabelText("Search tag code or batch"), { target: { value: "0140" } });

    await screen.findByText("MPL-PASS-0140");
    expect(loadTags).toHaveBeenLastCalledWith("order-1", expect.objectContaining({ search: "0140", page: 1 }), expect.anything());
    expect(screen.queryByText("MPL-PASS-0001")).toBeNull();
  });

  it("pages through every inspected tag with Show more", async () => {
    const loadTags = vi.fn<AssignableTagLoader>().mockImplementation(async (_orderId, options) =>
      options.page === 2 ? page([tag(21)], 21, 0, 2) : page(Array.from({ length: 20 }, (_, index) => tag(index + 1)), 21, 0)
    );
    renderModal(loadTags);

    await screen.findByText("Showing 20 of 21");
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));

    await screen.findByText("MPL-PASS-0021");
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("explains that the order is awaiting Physical QA when only uninspected stock exists", async () => {
    renderModal(vi.fn<AssignableTagLoader>().mockResolvedValue(page([], 0, 3)));

    await screen.findByText("Awaiting Physical QA");
    expect(screen.getByText(/2 units on this order line still need an inspected tag\. 3 received QR \+ NFC Smart Tag tags are waiting for inspection\./)).toBeTruthy();
    expect(screen.getByText(/No QR \+ NFC Smart Tag tag has passed physical QA yet/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Assign selected tag" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("tells the admin to keep the order on hold when no stock is left at all", async () => {
    renderModal(vi.fn<AssignableTagLoader>().mockResolvedValue(page([], 0, 0)));

    await screen.findByText(/Keep this order on hold and contact the customer/);
    expect(screen.queryByText("Awaiting Physical QA")).toBeNull();
  });

  it("offers a retry when inspected tags cannot be loaded", async () => {
    const loadTags = vi.fn<AssignableTagLoader>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(page([tag(1)], 1, 0));
    renderModal(loadTags);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("MPL-PASS-0001")).toBeTruthy());
  });
});
