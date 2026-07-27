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
    await getDeliveryQuote("KUL", "PUBLIC-KEY");
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/delivery/quote", expect.objectContaining({
      method: "POST",
      body: { stateCode: "KUL", productVariantKey: "PUBLIC-KEY", quantity: 1 },
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
