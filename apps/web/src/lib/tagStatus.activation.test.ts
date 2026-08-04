import { describe, expect, it } from "vitest";

import {
  findOrderLinkedTag,
  getOrderTagActivations,
  getSharedTagActivationState,
  getTagActivationState,
  getTagDisplayStatus,
} from "./tagStatus";
import type { OrderStatus, PetTag, TagOrder, TagStatus } from "@/types";

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

describe("physical tag activation state", () => {
  // The order has already shipped; the tag itself has not been tapped. The old
  // code showed the tag's fulfilment value ("Preparing") as its status.
  it("reports a shipped but unactivated tag as awaiting activation", () => {
    expect(getTagActivationState(tag({ status: "Preparing" }))).toBe(
      "Awaiting activation"
    );
  });

  it("reports a delivered but unactivated tag as awaiting activation", () => {
    expect(getTagActivationState(tag({ status: "Delivered" }))).toBe(
      "Awaiting activation"
    );
  });

  it("reports a reserved-but-unshipped tag as awaiting activation", () => {
    expect(getTagActivationState(tag({ status: "Pending" }))).toBe(
      "Awaiting activation"
    );
  });

  it("reports an activated tag as active", () => {
    expect(getTagActivationState(tag({ status: "Active" }))).toBe("Active");
  });

  it("trusts the activation timestamp recorded on the tag", () => {
    expect(
      getTagActivationState(
        tag({ status: "Delivered", activatedAt: "2026-07-26" })
      )
    ).toBe("Active");
  });

  it("keeps lost, disabled, replaced and archived states intact", () => {
    const cases: [TagStatus, string][] = [
      ["Lost", "Lost"],
      ["Disabled", "Disabled"],
      ["Replaced", "Replaced"],
      ["Archived", "Archived"],
    ];

    for (const [status, expected] of cases) {
      expect(getTagActivationState(tag({ status }))).toBe(expected);
      // A tag that was once activated still reports its later lifecycle state.
      expect(
        getTagActivationState(tag({ status, activatedAt: "2026-07-26" }))
      ).toBe(expected);
    }
  });

  it("treats an archived tag as archived whatever its stored status says", () => {
    expect(getTagActivationState(tag({ status: "Active", isArchived: true }))).toBe(
      "Archived"
    );
  });

  it("reports an unassigned tag as not assigned yet", () => {
    expect(getTagActivationState(tag({ status: "Unassigned" }))).toBe(
      "Not assigned yet"
    );
  });

  // The core separation: an order fulfilment value must never become the
  // activation answer, for any order state.
  it("never returns an order fulfilment word as the activation state", () => {
    const fulfilmentWords = [
      "Preparing",
      "Ready to ship",
      "Ready to Ship",
      "Shipped",
      "Delivered",
      "Pending",
      "Pending Payment",
      "Payment Confirmed",
    ];

    for (const status of ["Pending", "Preparing", "Delivered"] as TagStatus[]) {
      const state = getTagActivationState(tag({ status }));
      expect(fulfilmentWords).not.toContain(state);
      expect(state).toBe("Awaiting activation");
    }
  });
});

describe("Smart Tags card status", () => {
  it("does not show a preparing fulfilment step as the tag's own status", () => {
    const displayed = getTagDisplayStatus(
      tag({ status: "Preparing" }),
      order({ status: "Preparing" })
    );

    expect(displayed).toBe("Awaiting activation");
    expect(displayed).not.toBe("Preparing");
  });

  it("does not show a ready-to-ship fulfilment step as the tag's own status", () => {
    const displayed = getTagDisplayStatus(
      tag({ status: "Preparing" }),
      order({ status: "Ready to Ship" })
    );

    expect(displayed).toBe("Awaiting activation");
    expect(displayed).not.toBe("Ready to ship");
  });

  it("keeps a shipped order's tag on the activation axis", () => {
    expect(
      getTagDisplayStatus(tag({ status: "Preparing" }), order({ status: "Shipped" }))
    ).toBe("Awaiting activation");
  });

  it("still reports fulfilment progress before any tag is assigned", () => {
    // Nothing is reserved yet, so the order is the only meaningful answer.
    for (const status of ["Pending Payment", "Payment Confirmed"] as OrderStatus[]) {
      expect(
        getTagDisplayStatus(tag({ status: "Unassigned", petId: undefined }), order({ status }))
      ).not.toBe("Awaiting activation");
    }
  });

  it("shows activated and inactive lifecycle states unchanged", () => {
    expect(getTagDisplayStatus(tag({ status: "Active" }))).toBe("Active");
    expect(getTagDisplayStatus(tag({ status: "Lost" }))).toBe("Lost");
    expect(getTagDisplayStatus(tag({ status: "Disabled" }))).toBe("Disabled");
    expect(getTagDisplayStatus(tag({ status: "Replaced" }))).toBe("Replaced");
    expect(getTagDisplayStatus(tag({ isArchived: true }))).toBe("Archived");
  });

  it("never leaks a raw fulfilment enum when there is no linked order", () => {
    for (const status of ["Pending", "Preparing", "Delivered"] as TagStatus[]) {
      expect(getTagDisplayStatus(tag({ status }))).toBe("Awaiting activation");
    }
  });
});

describe("activation across the tags on one order", () => {
  function assigned(id: string, status: string, petName: string) {
    return { id, tagCode: `MPL-${id}`, petId: "pet-1", petName, status };
  }

  function itemsOrder(statuses: [string, string][]) {
    return order({
      items: [
        {
          id: "item-1",
          petId: "pet-1",
          petName: "Mochi",
          sku: "MPL-QR-STD",
          productName: "MyPetLink QR Pet Tag",
          variantName: "Standard",
          quantity: statuses.length,
          unitBasePrice: 19.9,
          subtotal: 19.9 * statuses.length,
          discountAmount: 0,
          finalUnitPrice: 19.9,
          finalAmount: 19.9 * statuses.length,
          currency: "MYR",
          supportsQr: true,
          supportsNfc: false,
          assignedTags: statuses.map(([id, status], index) =>
            assigned(id, status, index === 0 ? "Mochi" : "Bibi")
          ),
        },
      ],
    });
  }

  it("collapses to one answer when every tag agrees", () => {
    const activations = getOrderTagActivations(
      itemsOrder([
        ["a", "Preparing"],
        ["b", "Delivered"],
      ])
    );

    expect(activations).toHaveLength(2);
    expect(getSharedTagActivationState(activations)).toBe("Awaiting activation");
  });

  it("refuses one aggregate answer when the tags differ", () => {
    const activations = getOrderTagActivations(
      itemsOrder([
        ["a", "Active"],
        ["b", "Preparing"],
      ])
    );

    expect(activations.map((entry) => entry.state)).toEqual([
      "Active",
      "Awaiting activation",
    ]);
    expect(getSharedTagActivationState(activations)).toBeUndefined();
  });

  it("falls back to the owner's linked tag for a single-item order", () => {
    const activations = getOrderTagActivations(
      order({ petName: "Mochi" }),
      tag({ status: "Delivered" })
    );

    expect(activations).toHaveLength(1);
    expect(activations[0].state).toBe("Awaiting activation");
    expect(activations[0].tagCode).toBe("MPL-9F3K-H7Q2");
  });

  it("reports no tag as not assigned yet", () => {
    expect(getSharedTagActivationState(getOrderTagActivations(order()))).toBe(
      "Not assigned yet"
    );
  });
});

describe("finding the tag reserved for an order", () => {
  it("matches on the order's own tag id when it has one", () => {
    const linked = tag({ id: "tag-9" });
    expect(
      findOrderLinkedTag({ id: "order-1", tagId: "tag-9" }, [linked])?.id
    ).toBe("tag-9");
  });

  // Before shipment the order withholds its assigned tags, so the link has to
  // come from the tag. Without this a reserved tag looked unassigned.
  it("matches on the tag's order id before the order lists its tags", () => {
    const reserved = tag({ id: "tag-9", orderId: "order-1", status: "Preparing" });
    const found = findOrderLinkedTag({ id: "order-1", tagId: undefined }, [reserved]);

    expect(found?.id).toBe("tag-9");
    expect(getTagActivationState(found!)).toBe("Awaiting activation");
  });

  it("does not borrow another order's tag", () => {
    const other = tag({ id: "tag-9", orderId: "order-2" });
    expect(findOrderLinkedTag({ id: "order-1", tagId: undefined }, [other])).toBeUndefined();
  });
});
