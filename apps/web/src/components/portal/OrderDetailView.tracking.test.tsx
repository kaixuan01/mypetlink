// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TagOrder } from "@/types";

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/petService", () => ({ getPets: vi.fn(async () => ({ data: [] })) }));

const tagMocks = vi.hoisted(() => ({
  getOrder: vi.fn(),
  getAllTags: vi.fn(async () => ({ data: [] })),
}));

vi.mock("@/services/tagService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tagService")>();
  return { ...actual, getOrder: tagMocks.getOrder, getAllTags: tagMocks.getAllTags };
});

const { OrderDetailView } = await import("./OrderDetailView");

const missingLinkText =
  "Tracking link is not available. Use this number on the courier’s website.";

function order(overrides: Partial<TagOrder>): TagOrder {
  return {
    id: "order-1",
    orderNumber: "MPL-0001",
    petId: "pet-1",
    tagType: "MyPetLink QR Pet Tag",
    variant: "Standard",
    delivery: {
      recipientName: "Aina",
      phone: "+60123456789",
      addressLine1: "6934, Taman Gemencheh Baru",
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

function renderDetail(value: TagOrder) {
  tagMocks.getOrder.mockResolvedValue({ data: value });
  return render(
    <OrderDetailView initialOrder={value} initialTags={[]} orderKey="MPL-0001" pets={[]} />
  );
}

beforeEach(() => {
  tagMocks.getOrder.mockReset();
  tagMocks.getAllTags.mockReset().mockResolvedValue({ data: [] });
});

afterEach(cleanup);

describe("order detail shipment section", () => {
  it("shows courier, tracking number and shipped date without a tracking link", async () => {
    renderDetail(
      order({
        courierProvider: "J&T Express",
        trackingNumber: "JT123456789MY",
        shippedDate: "2026-07-24",
      })
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Shipment" })).toBeTruthy()
    );
    // Scoped to the shipment card: the timeline legitimately repeats the
    // shipped date as a milestone.
    const section = screen
      .getByRole("heading", { name: "Shipment" })
      .closest("section") as HTMLElement;
    expect(within(section).getByText("J&T Express")).toBeTruthy();
    expect(within(section).getByText("JT123456789MY")).toBeTruthy();
    expect(within(section).getByText("2026-07-24")).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy tracking number/i })).toBeTruthy();
    expect(screen.getByText(missingLinkText)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /track parcel/i })).toBeNull();
    // The old "Not available yet" placeholders are gone.
    expect(document.body.textContent).not.toContain("Not available yet");
  });

  it("offers Track Parcel alongside the number when a link exists", async () => {
    renderDetail(
      order({
        courierProvider: "J&T Express",
        trackingNumber: "JT123456789MY",
        trackingUrl: "https://www.jtexpress.my/track?no=JT123456789MY",
      })
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Shipment" })).toBeTruthy()
    );
    expect(screen.getByRole("link", { name: /track parcel/i })).toBeTruthy();
    expect(screen.queryByText(missingLinkText)).toBeNull();
  });

  it("explains a shipped order whose tracking number is not recorded yet", async () => {
    renderDetail(order({ courierProvider: "J&T Express", shippedDate: "2026-07-24" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Shipment" })).toBeTruthy()
    );
    expect(screen.getByText("Tracking number has not been added yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /copy tracking number/i })).toBeNull();
  });

  it("hides the whole shipment section and its data before handover", async () => {
    renderDetail(
      order({
        status: "Ready to Ship",
        courierProvider: "J&T Express",
        trackingNumber: "JT123456789MY",
      })
    );

    await waitFor(() => expect(screen.getByText("Delivery details")).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Shipment" })).toBeNull();
    expect(screen.queryByText("JT123456789MY")).toBeNull();
    expect(screen.queryByText("J&T Express")).toBeNull();
  });

  it("keeps the delivery address in one place only", async () => {
    const { container } = renderDetail(order({}));

    await waitFor(() => expect(screen.getByText("Delivery details")).toBeTruthy());
    const matches = Array.from(container.querySelectorAll("p")).filter((node) =>
      (node.textContent ?? "").includes("6934, Taman Gemencheh Baru")
    );
    expect(matches).toHaveLength(1);
  });
});
