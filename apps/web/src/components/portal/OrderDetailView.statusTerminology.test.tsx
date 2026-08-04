// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PetTag, TagOrder } from "@/types";

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/petService", () => ({ getPets: vi.fn(async () => ({ data: [] })) }));

const tagMocks = vi.hoisted(() => ({
  getOrder: vi.fn(),
  getAllTags: vi.fn(async () => ({ data: [] as PetTag[] })),
}));

vi.mock("@/services/tagService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tagService")>();
  return { ...actual, getOrder: tagMocks.getOrder, getAllTags: tagMocks.getAllTags };
});

const { OrderDetailView } = await import("./OrderDetailView");

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

async function renderDetail(value: TagOrder, tags: PetTag[] = []) {
  tagMocks.getOrder.mockResolvedValue({ data: value });
  tagMocks.getAllTags.mockResolvedValue({ data: tags });
  const result = render(
    <OrderDetailView initialOrder={value} initialTags={tags} orderKey="MPL-0001" pets={[]} />
  );
  await waitFor(() => expect(screen.getByText("Order summary")).toBeTruthy());
  return result;
}

function valueFor(label: string) {
  const node = screen.getByText(label).parentElement as HTMLElement;
  return node.querySelector("p:last-child") as HTMLElement;
}

beforeEach(() => {
  tagMocks.getOrder.mockReset();
  tagMocks.getAllTags.mockReset().mockResolvedValue({ data: [] });
});

afterEach(cleanup);

describe("order detail status terminology", () => {
  it("separates the order's fulfilment status from the tag's activation", async () => {
    await renderDetail(order({ status: "Shipped" }), [tag({ status: "Preparing" })]);

    expect(valueFor("Fulfilment status").textContent).toBe("Shipped");
    expect(valueFor("Tag activation").textContent).toBe("Awaiting activation");
    expect(screen.queryByText("Tag status")).toBeNull();
  });

  it("shows a delivered but unactivated tag as awaiting activation", async () => {
    await renderDetail(order({ status: "Delivered" }), [tag({ status: "Delivered" })]);

    expect(valueFor("Tag activation").textContent).toBe("Awaiting activation");
    expect(valueFor("Fulfilment status").textContent).toBe("Delivered");
  });

  it("shows an activated tag as active", async () => {
    await renderDetail(order({ status: "Delivered" }), [
      tag({ status: "Active", activatedAt: "2026-07-26" }),
    ]);

    expect(valueFor("Tag activation").textContent).toBe("Active");
  });

  it("never renders a fulfilment word as the tag activation value", async () => {
    for (const status of ["Preparing", "Ready to Ship"] as TagOrder["status"][]) {
      await renderDetail(order({ status }), [tag({ status: "Preparing" })]);
      const activation = valueFor("Tag activation").textContent;
      expect(activation).toBe("Awaiting activation");
      expect(["Preparing", "Preparing Tag", "Ready to Ship"]).not.toContain(activation);
      cleanup();
    }
  });

  it("keeps lost, disabled, replaced and archived tags on their own state", async () => {
    for (const status of ["Lost", "Disabled", "Replaced", "Archived"] as PetTag["status"][]) {
      await renderDetail(order({ status: "Delivered" }), [tag({ status })]);
      expect(valueFor("Tag activation").textContent).toBe(status);
      cleanup();
    }
  });

  it("shows per-tag activation when a multi-item order's tags differ", async () => {
    await renderDetail(
      order({
        status: "Shipped",
        tagId: undefined,
        items: [
          {
            id: "item-1",
            petId: "pet-1",
            petName: "Mochi",
            sku: "MPL-QR-STD",
            productName: "MyPetLink QR Pet Tag",
            variantName: "Standard",
            quantity: 2,
            unitBasePrice: 19.9,
            subtotal: 39.8,
            discountAmount: 0,
            finalUnitPrice: 19.9,
            finalAmount: 39.8,
            currency: "MYR",
            supportsQr: true,
            supportsNfc: false,
            assignedTags: [
              { id: "t1", tagCode: "MPL-AAAA-1111", petId: "pet-1", petName: "Mochi", status: "Active" },
              { id: "t2", tagCode: "MPL-BBBB-2222", petId: "pet-2", petName: "Bibi", status: "Delivered" },
            ],
          },
        ],
      })
    );

    // No single aggregate answer, so the per-tag list carries the detail.
    expect(screen.queryByText("Tag activation")).toBeNull();
    expect(screen.getByText("Physical tags in this shipment")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Awaiting activation")).toBeTruthy();
  });
});

describe("order detail optional payment reference", () => {
  it("shows Not provided rather than an outstanding-task placeholder", async () => {
    await renderDetail(order({ status: "Delivered", paymentReference: undefined }));

    expect(valueFor("Bank/eWallet transaction ID").textContent).toBe("Not provided");
    expect(screen.queryByText("Not submitted yet")).toBeNull();
  });

  it("shows the full reference and lets it wrap", async () => {
    const reference = "DUITNOW-8827461003-MY-2026-07-24-000915";
    await renderDetail(order({ status: "Delivered", paymentReference: reference }));

    const value = valueFor("Bank/eWallet transaction ID");
    expect(value.textContent).toBe(reference);
    expect(value.className).toContain("break-words");
    expect(value.className).not.toContain("truncate");
  });

  it("does not style a missing reference as an error", async () => {
    await renderDetail(order({ status: "Delivered", paymentReference: undefined }));

    const value = valueFor("Bank/eWallet transaction ID");
    expect(value.className).not.toMatch(/text-\[#a63c2e\]|text-pet-coral/);
    expect(value.closest("[role='alert']")).toBeNull();
  });
});

describe("owner order payload stays free of internal fields", () => {
  it("never renders inventory, cost, note or concurrency internals", async () => {
    await renderDetail(
      order({
        status: "Shipped",
        courierProvider: "J&T Express",
        trackingNumber: "JT8827461003MY",
      }),
      [tag({ status: "Preparing" })]
    );

    const body = document.body.textContent ?? "";
    for (const internal of [
      "RowVersion",
      "ActualCourierCost",
      "Courier cost",
      "ShippingNotes",
      "Shipping notes",
      "Admin note",
      "Reservation",
      "OrderItemId",
      "Unclaimed",
    ]) {
      expect(body).not.toContain(internal);
    }
  });
});

describe("a reserved tag does not reveal itself early", () => {
  it("reports activation without exposing the tag code before the order lists it", async () => {
    // The order withholds its assigned tags until shipment; the tag is only
    // known here because the owner's own tag list carries it.
    await renderDetail(order({ status: "Preparing", tagId: undefined }), [
      tag({ id: "tag-1", orderId: "order-1", status: "Preparing" }),
    ]);

    expect(valueFor("Tag activation").textContent).toBe("Awaiting activation");
    expect(document.body.textContent).not.toContain("MPL-9F3K-H7Q2");
    expect(
      screen.getByText("No tag code is shown until our team assigns inventory to this order.")
    ).toBeTruthy();
  });

  it("shows the tag code once the order itself discloses the tag", async () => {
    await renderDetail(order({ status: "Delivered", tagId: "tag-1" }), [
      tag({ id: "tag-1", orderId: "order-1", status: "Delivered" }),
    ]);

    expect(document.body.textContent).toContain("MPL-9F3K-H7Q2");
    expect(valueFor("Tag activation").textContent).toBe("Awaiting activation");
  });
});

describe("tag disclosure messages do not contradict each other", () => {
  it("drops the no-tag-code note once the order lists its tag codes", async () => {
    await renderDetail(
      order({
        status: "Shipped",
        tagId: undefined,
        items: [
          {
            id: "item-1",
            petId: "pet-1",
            petName: "Mochi",
            sku: "MPL-QR-STD",
            productName: "MyPetLink QR Pet Tag",
            variantName: "Standard",
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
              { id: "t1", tagCode: "MPL-AAAA-1111", petId: "pet-1", petName: "Mochi", status: "Delivered" },
            ],
          },
        ],
      })
    );

    expect(screen.getByText("MPL-AAAA-1111")).toBeTruthy();
    expect(
      screen.queryByText(/No tag code is shown until our team assigns inventory/)
    ).toBeNull();
  });
});
