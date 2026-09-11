// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { PetTag, TagOrder } from "@/types";

/**
 * A Smart Tag reaches an owner through one of several routes, and only one of
 * them is a MyPetLink customer order. The card must describe the route the
 * owner actually took: a tag bought from a pet shop never had an "Ordered
 * date" here, and is not waiting on a delivery MyPetLink will never make.
 */

const mocks = vi.hoisted(() => ({
  getAllTags: vi.fn(),
  getPetTags: vi.fn(),
  getOrders: vi.fn(),
  getPets: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/features", () => ({ smartTagOrderingEnabled: true }));
vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
}));
vi.mock("@/services/tagService", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/tagService")>();
  return {
    ...original,
    getAllTags: (...args: unknown[]) => mocks.getAllTags(...args),
    getPetTags: (...args: unknown[]) => mocks.getPetTags(...args),
    getOrders: (...args: unknown[]) => mocks.getOrders(...args),
  };
});

const { TagManagementPanel } = await import("./TagManagementPanel");

const pet = mockPets[0];

/** An activated tag. How it was acquired is decided by the order beside it. */
function activeTag(overrides: Partial<PetTag> = {}): PetTag {
  return {
    id: "tag_acq_1",
    tagCode: "MPL-ACQ-0001",
    petId: pet.id,
    ownerUserId: "owner_aina",
    hasNfc: true,
    variant: "Standard",
    status: "Active",
    // Always present: this is when the tag was manufactured into inventory,
    // which is never the owner's purchase date.
    generatedDate: "27 Jul 2026",
    activatedAt: "10 Sep 2026",
    lastScannedAt: "10 Sep 2026, 22:14",
    ...overrides,
  };
}

function directOrder(overrides: Partial<TagOrder> = {}): TagOrder {
  return {
    id: "order_acq_1",
    orderNumber: "MPL-ORD-2026-0042",
    petId: pet.id,
    tagType: "MyPetLink QR + NFC Smart Tag",
    variant: "Standard",
    estimatedPrice: "RM39.90",
    status: "Delivered",
    orderedDate: "01 Aug 2026",
    tagId: "tag_acq_1",
    delivery: {
      recipientName: "Aina Rahman",
      phone: "+60123456789",
      addressLine1: "Jalan SS 2/24",
      postcode: "47300",
      city: "Petaling Jaya",
      state: "Selangor",
    },
    ...overrides,
  } as TagOrder;
}

async function renderPanel(tags: PetTag[], orders: TagOrder[]) {
  // The panel refreshes from the services after mount, so the fixtures have to
  // be the answer there too or the refresh empties the list.
  mocks.getAllTags.mockResolvedValue({ data: tags });
  mocks.getPetTags.mockResolvedValue({ data: tags });
  mocks.getOrders.mockResolvedValue({ data: orders });

  render(
    <TagManagementPanel initialOrders={orders} initialTags={tags} pets={mockPets} />
  );
  await screen.findByText("MPL-ACQ-0001");
}

beforeEach(() => {
  mocks.getAllTags.mockResolvedValue({ data: [] });
  mocks.getPetTags.mockResolvedValue({ data: [] });
  mocks.getOrders.mockResolvedValue({ data: [] });
  mocks.getPets.mockResolvedValue({ data: mockPets });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Smart Tag card by acquisition route", () => {
  it("A — shows the customer's own order date for a direct MyPetLink order", async () => {
    await renderPanel([activeTag({ deliveredDate: "05 Aug 2026" })], [directOrder()]);

    expect(screen.getByText("Ordered date")).toBeTruthy();
    // The order's date, not the tag's generation date.
    expect(screen.getByText("01 Aug 2026")).toBeTruthy();
    expect(screen.queryByText("27 Jul 2026")).toBeNull();
    expect(screen.getByText("Delivered date")).toBeTruthy();
    expect(screen.getByText("05 Aug 2026")).toBeTruthy();
  });

  it("A — keeps a genuine pending delivery visible on a direct order", async () => {
    await renderPanel([activeTag()], [directOrder({ status: "Shipped" })]);

    expect(screen.getByText("Delivered date")).toBeTruthy();
    expect(screen.getByText("Not delivered yet")).toBeTruthy();
  });

  it("B — shows no order or delivery rows for a reseller-bought tag", async () => {
    // Bought in a pet shop and self-activated: MyPetLink has no order for it.
    await renderPanel([activeTag()], []);

    expect(screen.queryByText("Ordered date")).toBeNull();
    expect(screen.queryByText("Delivered date")).toBeNull();
    expect(screen.queryByText("Not delivered yet")).toBeNull();
    expect(screen.queryByText("Not ordered yet")).toBeNull();
    // The generation date must not leak under any label.
    expect(screen.queryByText("27 Jul 2026")).toBeNull();

    // What the owner does get is what actually happened to them.
    expect(screen.getByText("Linked pet")).toBeTruthy();
    expect(screen.getByText("Activated date")).toBeTruthy();
    expect(screen.getByText("10 Sep 2026")).toBeTruthy();
    expect(screen.getByText("Last scanned")).toBeTruthy();
    expect(screen.getByText("10 Sep 2026, 22:14")).toBeTruthy();
  });

  it("C — shows no commerce rows for an admin-assigned tag", async () => {
    await renderPanel([activeTag({ generatedDate: "27 Jul 2026" })], []);

    expect(screen.queryByText("Ordered date")).toBeNull();
    expect(screen.queryByText("Delivered date")).toBeNull();
    expect(screen.getByText("Activated date")).toBeTruthy();
  });

  it("D — a replacement issued operationally carries no order rows", async () => {
    await renderPanel(
      [activeTag({ replacementForTagId: "tag_old_1" })],
      []
    );

    expect(screen.queryByText("Ordered date")).toBeNull();
    expect(screen.queryByText("Delivered date")).toBeNull();
  });

  it("D — a replacement bought through an order keeps its order rows", async () => {
    await renderPanel(
      [activeTag({ replacementForTagId: "tag_old_1", deliveredDate: "05 Aug 2026" })],
      [directOrder({ replacementForTagId: "tag_old_1" })]
    );

    expect(screen.getByText("Ordered date")).toBeTruthy();
    expect(screen.getByText("01 Aug 2026")).toBeTruthy();
    expect(screen.getByText("Delivered date")).toBeTruthy();
  });

  it("E — never borrows another tag's order", async () => {
    // A legacy tag with no order of its own, beside an order for a different
    // tag. Matching must be by identity, not by proximity.
    await renderPanel(
      [activeTag()],
      [directOrder({ id: "order_other", tagId: "tag_someone_else" })]
    );

    expect(screen.queryByText("Ordered date")).toBeNull();
    expect(screen.queryByText("01 Aug 2026")).toBeNull();
  });

  it("F — omits rows with no value instead of rendering empty placeholders", async () => {
    await renderPanel(
      [activeTag({ activatedAt: undefined, lastScannedAt: undefined })],
      []
    );

    expect(screen.queryByText("Activated date")).toBeNull();
    expect(screen.queryByText("Ordered date")).toBeNull();
    expect(screen.queryByText("Delivered date")).toBeNull();
    // Scan state still has something true to say.
    expect(screen.getByText("Last scanned")).toBeTruthy();
    expect(screen.getByText("No scans yet")).toBeTruthy();
  });
});
