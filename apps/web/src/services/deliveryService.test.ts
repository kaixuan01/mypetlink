import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/services/apiClient", () => ({ apiRequest }));

const { getDeliveryQuote, listMalaysiaStates, resolveLegacyStateCode } =
  await import("./deliveryService");

const states = [
  { code: "KUL", name: "Kuala Lumpur", zoneCode: "PEN", zoneName: "Peninsular", aliases: ["KL", "Kuala Lumpur W.P."] },
  { code: "PNG", name: "Pulau Pinang", zoneCode: "PEN", zoneName: "Peninsular", aliases: ["Penang"] },
  { code: "MLK", name: "Melaka", zoneCode: "PEN", zoneName: "Peninsular", aliases: ["Malacca"] },
];

describe("deliveryService", () => {
  beforeEach(() => apiRequest.mockReset());

  it("loads canonical states from the API", async () => {
    apiRequest.mockResolvedValue({ data: states });
    await expect(listMalaysiaStates()).resolves.toEqual(states);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/delivery/states");
  });

  it("requests a server-owned quote without a client fee, zone, or total", async () => {
    apiRequest.mockResolvedValue({ data: { stateCode: "KUL", deliveryFee: 8, total: 47 } });
    await getDeliveryQuote("KUL", [
      { productVariantKey: "PUBLIC-KEY", quantity: 2 },
      { productVariantKey: "OTHER-KEY", quantity: 1 },
    ]);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/delivery/quote", expect.objectContaining({
      method: "POST",
      body: {
        stateCode: "KUL",
        items: [
          { productVariantKey: "PUBLIC-KEY", quantity: 2 },
          { productVariantKey: "OTHER-KEY", quantity: 1 },
        ],
      },
    }));
    expect(apiRequest.mock.calls[0][1].body).not.toHaveProperty("deliveryFee");
    expect(apiRequest.mock.calls[0][1].body).not.toHaveProperty("zoneCode");
    expect(apiRequest.mock.calls[0][1].body).not.toHaveProperty("total");
  });

  it.each([
    ["KL", "KUL"],
    ["Kuala Lumpur W.P.", "KUL"],
    ["Penang", "PNG"],
    ["Malacca", "MLK"],
  ])("normalizes only an approved exact alias: %s", (value, expected) => {
    expect(resolveLegacyStateCode(value, states)).toBe(expected);
  });

  it.each(["WP", "Kuala Lumpur, Malaysia", "Selang", "123"])(
    "requires reselection for ambiguous or unsupported saved value: %s",
    (value) => expect(resolveLegacyStateCode(value, states)).toBe("")
  );
});

describe("legacy delivery snapshots reaching the owner portal", () => {
  it("re-words the label without altering the fee or total", async () => {
    const { mapBackendOrder } = await import("@/services/tagService");

    const legacy = mapBackendOrder({
      id: "order-1",
      orderNumber: "MPL-0001",
      petId: "pet-1",
      tagType: "QrPetTag",
      variant: "Standard",
      amount: 39.9,
      deliveryFee: 8,
      totalAmount: 47.9,
      currency: "MYR",
      status: "Delivered",
      createdAt: "2026-07-20T00:00:00Z",
      delivery: {
        recipientName: "Aina",
        phoneE164: "+60123456789",
        addressLine1: "1 Jalan Pet",
        postcode: "68000",
        city: "Ampang",
        state: "Selangor",
        stateCode: "SGR",
        country: "Malaysia",
        zoneName: "Peninsular",
        deliveryMethod: "Peninsular Standard Delivery",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(legacy.delivery.deliveryMethod).toBe("Standard Delivery — West Malaysia");
    expect(legacy.delivery.zoneName).toBe("West Malaysia");
    // The historical money is exactly as it was snapshotted.
    expect(legacy.deliveryFee).toBe(8);
    expect(legacy.totalAmount).toBe(47.9);
  });

  it("leaves a merchant's own delivery label alone", async () => {
    const { mapBackendOrder } = await import("@/services/tagService");

    const custom = mapBackendOrder({
      id: "order-2",
      orderNumber: "MPL-0002",
      petId: "pet-1",
      tagType: "QrPetTag",
      variant: "Standard",
      amount: 39.9,
      deliveryFee: 12,
      totalAmount: 51.9,
      currency: "MYR",
      status: "Delivered",
      createdAt: "2026-07-20T00:00:00Z",
      delivery: {
        recipientName: "Aina",
        phoneE164: "+60123456789",
        addressLine1: "1 Jalan Pet",
        postcode: "68000",
        city: "Ampang",
        state: "Selangor",
        stateCode: "SGR",
        country: "Malaysia",
        zoneName: "Peninsular",
        deliveryMethod: "Weekend Express (Klang Valley)",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(custom.delivery.deliveryMethod).toBe("Weekend Express (Klang Valley)");
    expect(custom.deliveryFee).toBe(12);
  });
});
