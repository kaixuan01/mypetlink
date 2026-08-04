// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderStatus, PetTag, TagOrder } from "@/types";

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/petService", () => ({ getPets: vi.fn(async () => ({ data: [] })) }));

const tagMocks = vi.hoisted(() => ({
  getOrders: vi.fn(),
  getAllTags: vi.fn(async () => ({ data: [] as PetTag[] })),
}));

vi.mock("@/services/tagService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tagService")>();
  return { ...actual, getOrders: tagMocks.getOrders, getAllTags: tagMocks.getAllTags };
});

const { OrdersList } = await import("./OrdersList");

function tag(overrides: Partial<PetTag> = {}): PetTag {
  return {
    id: "tag-1",
    tagCode: "MPL-9F3K-H7Q2",
    petId: "pet-1",
    hasNfc: false,
    variant: "Standard",
    status: "Preparing",
    ...overrides,
  };
}

function order(overrides: Partial<TagOrder> = {}): TagOrder {
  return {
    id: "order-1",
    orderNumber: "MPL-0001",
    petId: "pet-1",
    petName: "Mochi",
    tagId: "tag-1",
    tagType: "MyPetLink QR Pet Tag",
    variant: "Standard",
    delivery: {
      recipientName: "Aina",
      phone: "+60123456789",
      addressLine1: "1 Jalan Pet",
      addressLine2: "",
      postcode: "68000",
      city: "Ampang",
      state: "Kuala Lumpur",
      notes: "",
    },
    estimatedPrice: "RM29.90",
    status: "Shipped",
    orderedDate: "2026-07-20",
    ...overrides,
  } as TagOrder;
}

async function openDetails(value: TagOrder, tags: PetTag[]) {
  tagMocks.getOrders.mockResolvedValue({ data: [value] });
  tagMocks.getAllTags.mockResolvedValue({ data: tags });
  render(<OrdersList initialOrders={[value]} initialTags={tags} pets={[]} />);
  await waitFor(() => expect(screen.getByText("MPL-0001")).toBeTruthy());
  screen.getByRole("button", { name: "View Order" }).click();
  await waitFor(() =>
    expect(screen.getByText("Payment", { selector: "h3" })).toBeTruthy()
  );
}

function sectionFor(title: string) {
  return screen
    .getByText(title, { selector: "h3" })
    .closest("section") as HTMLElement;
}

/** Activation wording, per order line, in line order. */
function activationBlocks() {
  return screen.queryAllByTestId("line-tag-activation").map((node) =>
    Array.from(node.querySelectorAll("p"))
      .slice(1)
      .map((entry) => entry.textContent ?? "")
  );
}

function multiItemOrder(
  items: { petName: string; product: string; qty: number; tags: string[] }[]
) {
  return order({
    status: "Shipped",
    tagId: undefined,
    items: items.map((item, index) => ({
      id: `item-${index}`,
      petId: `pet-${index}`,
      petName: item.petName,
      sku: `MPL-SKU-${index}`,
      productName: item.product,
      variantName: "Standard",
      quantity: item.qty,
      unitBasePrice: 19.9,
      subtotal: 19.9 * item.qty,
      discountAmount: 0,
      finalUnitPrice: 19.9,
      finalAmount: 19.9 * item.qty,
      currency: "MYR",
      supportsQr: true,
      supportsNfc: false,
      assignedTags: item.tags.map((status, tagIndex) => ({
        id: `t-${index}-${tagIndex}`,
        tagCode: `MPL-TAG-${index}${tagIndex}`,
        petId: `pet-${index}`,
        petName: item.petName,
        status,
      })),
    })),
  });
}

beforeEach(() => {
  tagMocks.getOrders.mockReset();
  tagMocks.getAllTags.mockReset().mockResolvedValue({ data: [] });
});

afterEach(cleanup);

describe("expanded details keep one section per customer question", () => {
  it("has only order items, payment, and delivery & shipment", async () => {
    await openDetails(order({ status: "Shipped" }), [tag({ status: "Preparing" })]);

    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((node) => node.textContent);
    expect(headings).toEqual(["Order items", "Payment", "Delivery & shipment"]);
  });

  it("no longer renders the standalone Order section or its repeated fields", async () => {
    await openDetails(order({ status: "Shipped" }), [tag({ status: "Preparing" })]);

    expect(screen.queryByText("Order", { selector: "h3" })).toBeNull();
    expect(screen.queryByText("Pet")).toBeNull();
    expect(screen.queryByText("Option")).toBeNull();
    // Fulfilment status lives on the badge and Next update, not in here.
    expect(screen.queryByText("Fulfilment status")).toBeNull();
  });

  it("no longer renders a standalone Tag section", async () => {
    await openDetails(order({ status: "Shipped" }), [tag({ status: "Preparing" })]);

    expect(screen.queryByText("Tag", { selector: "h3" })).toBeNull();
    expect(screen.queryByText("Shipment", { selector: "h3" })).toBeNull();
    expect(screen.queryByText("Delivery", { selector: "h3" })).toBeNull();
  });

  it("names the pet and option once, inside the order line", async () => {
    await openDetails(order({ status: "Shipped" }), [tag({ status: "Preparing" })]);

    expect(screen.getAllByText("For Mochi")).toHaveLength(1);
    expect(screen.getAllByText("Standard")).toHaveLength(1);
  });
});

describe("tag activation belongs to its order line", () => {
  it("shows a shipped order's unactivated tag as awaiting activation", async () => {
    await openDetails(order({ status: "Shipped" }), [tag({ status: "Preparing" })]);

    expect(activationBlocks()).toEqual([["Awaiting activation"]]);
  });

  it("shows a delivered order's unactivated tag as awaiting activation", async () => {
    await openDetails(order({ status: "Delivered" }), [tag({ status: "Delivered" })]);

    expect(activationBlocks()).toEqual([["Awaiting activation"]]);
  });

  it("shows an activated tag as active", async () => {
    await openDetails(order({ status: "Delivered" }), [
      tag({ status: "Active", activatedAt: "2026-07-26" }),
    ]);

    expect(activationBlocks()).toEqual([["Active"]]);
  });

  it("does not turn a fulfilment step into the activation wording", async () => {
    for (const status of ["Preparing", "Ready to Ship"] as TagOrder["status"][]) {
      await openDetails(order({ status }), [tag({ status: "Preparing" })]);
      expect(activationBlocks()).toEqual([["Awaiting activation"]]);
      cleanup();
    }
  });

  it("keeps lost, disabled, replaced and archived tags on their own state", async () => {
    for (const status of ["Lost", "Disabled", "Replaced", "Archived"] as PetTag["status"][]) {
      await openDetails(order({ status: "Delivered" }), [tag({ status })]);
      expect(activationBlocks()).toEqual([[status]]);
      cleanup();
    }
  });

  it("reports no assigned tag rather than borrowing the order's progress", async () => {
    await openDetails(order({ status: "Payment Confirmed", tagId: undefined }), []);

    expect(activationBlocks()).toEqual([["Not assigned yet"]]);
  });

  it("counts the tags on a line when they all agree", async () => {
    await openDetails(
      multiItemOrder([
        { petName: "Mochi", product: "MyPetLink QR Pet Tag", qty: 2, tags: ["Delivered", "Preparing"] },
      ]),
      []
    );

    expect(activationBlocks()).toEqual([["2 tags awaiting activation"]]);
  });

  it("breaks a line down when its tags disagree", async () => {
    await openDetails(
      multiItemOrder([
        { petName: "Mochi", product: "MyPetLink QR Pet Tag", qty: 2, tags: ["Active", "Delivered"] },
      ]),
      []
    );

    expect(activationBlocks()).toEqual([["1 Active", "1 Awaiting activation"]]);
  });

  it("keeps each item's activation with that item on a multi-item order", async () => {
    await openDetails(
      multiItemOrder([
        { petName: "Mochi", product: "MyPetLink QR Pet Tag", qty: 1, tags: ["Active"] },
        { petName: "Bibi", product: "MyPetLink QR + NFC Smart Tag", qty: 2, tags: ["Delivered", "Delivered"] },
      ]),
      []
    );

    // One block per line, in line order, never one answer for the whole order.
    expect(activationBlocks()).toEqual([
      ["Active"],
      ["2 tags awaiting activation"],
    ]);
    expect(screen.getByText("For Mochi")).toBeTruthy();
    expect(screen.getByText("For Bibi")).toBeTruthy();
  });

  it("never prints a tag code beside the priced item", async () => {
    await openDetails(
      multiItemOrder([
        { petName: "Mochi", product: "MyPetLink QR Pet Tag", qty: 1, tags: ["Active"] },
      ]),
      []
    );

    for (const block of screen.getAllByTestId("line-tag-activation")) {
      expect(block.textContent).not.toContain("MPL-TAG-");
    }
  });
});

describe("optional transaction ID wording", () => {
  it("shows Not provided when the owner omitted the reference", async () => {
    await openDetails(
      order({ status: "Delivered", paymentReference: undefined }),
      [tag({ status: "Active" })]
    );

    const payment = sectionFor("Payment");
    expect(within(payment).getByText("Not provided")).toBeTruthy();
    expect(within(payment).queryByText("Not submitted yet")).toBeNull();
    expect(within(payment).queryByText("Missing")).toBeNull();
    expect(within(payment).queryByText("Pending")).toBeNull();
  });

  it("treats an empty reference the same as an absent one", async () => {
    await openDetails(order({ status: "Delivered", paymentReference: "" }), []);

    expect(within(sectionFor("Payment")).getByText("Not provided")).toBeTruthy();
  });

  it("shows the full reference when the owner provided one", async () => {
    const reference = "DUITNOW-8827461003-MY-2026-07-24-000915";
    await openDetails(order({ status: "Delivered", paymentReference: reference }), []);

    const value = within(sectionFor("Payment")).getByText(reference);
    expect(value).toBeTruthy();
    // Long references must wrap rather than be clipped.
    expect(value.className).toContain("break-words");
    expect(value.className).not.toContain("truncate");
  });

  it("does not style a missing reference as an error", async () => {
    await openDetails(order({ status: "Delivered", paymentReference: undefined }), []);

    const value = within(sectionFor("Payment")).getByText("Not provided");
    expect(value.className).not.toMatch(/text-\[#a63c2e\]|text-pet-coral|danger/);
    expect(value.closest("[role='alert']")).toBeNull();
  });

  it("never shows Not submitted yet on a payment-confirmed order", async () => {
    const settled: OrderStatus[] = [
      "Payment Confirmed",
      "Preparing",
      "Ready to Ship",
      "Shipped",
      "Delivered",
    ];

    for (const status of settled) {
      await openDetails(order({ status, paymentReference: undefined }), []);
      expect(screen.queryByText("Not submitted yet")).toBeNull();
      cleanup();
    }
  });

  it("keeps the transaction ID optional after a rejected proof", async () => {
    await openDetails(
      order({
        status: "Pending Payment",
        paymentReference: undefined,
        paymentRejectionReason: "Please upload a clearer payment proof.",
      } as Partial<TagOrder>),
      []
    );

    const payment = sectionFor("Payment");
    expect(within(payment).getByText("Not provided")).toBeTruthy();
    // The proof itself is genuinely still owed, so it keeps its own wording.
    expect(within(payment).getByText("Not submitted yet")).toBeTruthy();
  });
});

describe("expanded details stay readable and safe", () => {
  const longName = "MyPetLink Extra Reflective Waterproof Engraved Smart Pet Tag Deluxe";
  const longPet = "Sir Reginald Fluffington The Third Of Ampang Jaya";
  const longFile = "duitnow-transfer-receipt-2026-07-24-1042-final-copy-for-mypetlink.png";
  const longReference = "DUITNOW-8827461003-MY-2026-07-24-000915-REF-0099887766554433";
  const longAddress =
    "6934, Taman Gemencheh Baru, Jalan Seri Gemencheh Utama 12A, Blok C-12-08, Residensi Pangsapuri Damai Impian";

  async function openLongOrder() {
    const value = order({
      status: "Delivered",
      paymentReference: longReference,
      paymentProofName: longFile,
      courierProvider: "J&T Express",
      trackingNumber: "JT8827461003MY",
      items: [
        {
          id: "item-1",
          petId: "pet-1",
          petName: longPet,
          sku: "MPL-QR-LW",
          productName: longName,
          variantName: "Lightweight",
          quantity: 1,
          unitBasePrice: 19.9,
          subtotal: 19.9,
          discountAmount: 0,
          finalUnitPrice: 19.9,
          finalAmount: 19.9,
          currency: "MYR",
          supportsQr: true,
          supportsNfc: false,
          assignedTags: [
            { id: "t1", tagCode: "MPL-AAAA-1111", petId: "pet-1", petName: longPet, status: "Delivered" },
          ],
        },
      ],
    });
    value.delivery.addressLine1 = longAddress;
    await openDetails(value, []);
    return value;
  }

  it("wraps long filenames, references, names and addresses instead of clipping", async () => {
    await openLongOrder();

    const wrapped = [
      screen.getByText(longName),
      screen.getByText(`For ${longPet}`),
      screen.getByText(longReference),
      screen.getByText(longFile),
      Array.from(document.querySelectorAll("dd")).find((node) =>
        (node.textContent ?? "").includes(longAddress)
      ) as HTMLElement,
    ];

    expect(wrapped.every(Boolean)).toBe(true);

    for (const node of wrapped) {
      expect(node.className).not.toContain("truncate");
      expect(node.className).toMatch(/break-words|overflow-wrap/);
    }
  });

  it("shows the delivery address exactly once", async () => {
    await openLongOrder();

    const matches = Array.from(document.querySelectorAll("dd, p")).filter((node) =>
      (node.textContent ?? "").includes(longAddress)
    );
    expect(matches).toHaveLength(1);
  });

  it("keeps every expanded value inside the viewport at 320px", async () => {
    await openLongOrder();

    // jsdom has no layout, so the guarantee is structural: nothing in the panel
    // opts out of wrapping or forces a minimum width.
    const panel = screen
      .getByText("Order items", { selector: "h3" })
      .closest("div") as HTMLElement;
    for (const node of Array.from(panel.querySelectorAll("*"))) {
      expect(node.className).not.toMatch(/\bw-\[\d{3,}px\]|\bmin-w-\[\d{3,}px\]|whitespace-nowrap/);
    }
  });

  it("exposes no owner-inappropriate internal fields", async () => {
    await openLongOrder();

    const body = document.body.textContent ?? "";
    for (const internal of [
      "RowVersion",
      "OrderItemId",
      "ProductVariantId",
      "Snapshot",
      "Courier cost",
      "ActualCourierCost",
      "Shipping notes",
      "storageKey",
      "blob",
      "Unclaimed",
    ]) {
      expect(body).not.toContain(internal);
    }
  });
});
