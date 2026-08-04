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

beforeEach(() => {
  tagMocks.getOrders.mockReset();
  tagMocks.getAllTags.mockReset().mockResolvedValue({ data: [] });
});

afterEach(cleanup);

describe("order fulfilment and tag activation are separate", () => {
  it("shows a shipped order's unactivated tag as awaiting activation", async () => {
    await openDetails(order({ status: "Shipped" }), [tag({ status: "Preparing" })]);

    expect(within(sectionFor("Tag")).getByText("Awaiting activation")).toBeTruthy();
    expect(within(sectionFor("Order")).getByText("Shipped")).toBeTruthy();
    // The reported defect must not come back in any form.
    expect(screen.queryByText("Tag status")).toBeNull();
    expect(screen.queryByText("Tag Status")).toBeNull();
    expect(within(sectionFor("Tag")).queryByText("Preparing")).toBeNull();
  });

  it("shows a delivered order's unactivated tag as awaiting activation", async () => {
    await openDetails(order({ status: "Delivered" }), [tag({ status: "Delivered" })]);

    expect(within(sectionFor("Tag")).getByText("Awaiting activation")).toBeTruthy();
    expect(within(sectionFor("Order")).getByText("Delivered")).toBeTruthy();
  });

  it("shows an activated tag as active", async () => {
    await openDetails(order({ status: "Delivered" }), [
      tag({ status: "Active", activatedAt: "2026-07-26" }),
    ]);

    expect(within(sectionFor("Tag")).getByText("Active")).toBeTruthy();
  });

  it("does not turn a preparing fulfilment step into the tag activation label", async () => {
    await openDetails(order({ status: "Preparing" }), [tag({ status: "Preparing" })]);

    const tagSection = sectionFor("Tag");
    expect(within(tagSection).getByText("Awaiting activation")).toBeTruthy();
    expect(within(tagSection).queryByText("Preparing")).toBeNull();
    expect(within(tagSection).queryByText("Preparing Tag")).toBeNull();
    expect(within(sectionFor("Order")).getByText("Preparing Tag")).toBeTruthy();
  });

  it("does not turn a ready-to-ship fulfilment step into the tag activation label", async () => {
    await openDetails(order({ status: "Ready to Ship" }), [tag({ status: "Preparing" })]);

    const tagSection = sectionFor("Tag");
    expect(within(tagSection).getByText("Awaiting activation")).toBeTruthy();
    expect(within(tagSection).queryByText("Ready to ship")).toBeNull();
  });

  it("keeps lost, disabled, replaced and archived tags on their own state", async () => {
    const cases: [PetTag["status"], string][] = [
      ["Lost", "Lost"],
      ["Disabled", "Disabled"],
      ["Replaced", "Replaced"],
      ["Archived", "Archived"],
    ];

    for (const [status, expected] of cases) {
      await openDetails(order({ status: "Delivered" }), [tag({ status })]);
      expect(within(sectionFor("Tag")).getByText(expected)).toBeTruthy();
      cleanup();
    }
  });

  it("reports no assigned tag rather than borrowing the order's progress", async () => {
    await openDetails(order({ status: "Payment Confirmed", tagId: undefined }), []);

    expect(within(sectionFor("Tag")).getByText("Not assigned yet")).toBeTruthy();
    expect(within(sectionFor("Order")).getByText("Payment Confirmed")).toBeTruthy();
  });

  it("lists each tag separately when a multi-item order's tags differ", async () => {
    const multi = order({
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
    });

    await openDetails(multi, []);

    const tagSection = sectionFor("Tag");
    expect(within(tagSection).getByText(/MPL-AAAA-1111/)).toBeTruthy();
    expect(within(tagSection).getByText(/MPL-BBBB-2222/)).toBeTruthy();
    expect(within(tagSection).getByText(/^Active \(Mochi\)$/)).toBeTruthy();
    expect(
      within(tagSection).getByText(/^Awaiting activation \(Bibi\)$/)
    ).toBeTruthy();
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
