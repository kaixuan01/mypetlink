import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock("@/services/apiClient", () => ({ apiRequest }));

const {
  listAdminPromotions,
  listAdminTagCatalogOptions,
  listAdminTagProducts,
  saveAdminPromotion,
  saveAdminTagProduct,
  listTagProducts,
} = await import("./tagCatalogService");

describe("tagCatalogService", () => {
  beforeEach(() => apiRequest.mockReset());

  it("loads the customer catalog without authentication", async () => {
    const products = [{ slug: "tag", name: "Tag", media: [], variants: [] }];
    apiRequest.mockResolvedValue({ data: products });

    await expect(listTagProducts()).resolves.toEqual(products);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/tag-products", {
      auth: false,
      signal: undefined,
    });
  });

  it("sends every Admin catalog filter, pagination, and sort to the server and returns the total", async () => {
    apiRequest.mockResolvedValue({ data: [{ id: "p1" }], meta: { total: 137 } });

    const result = await listAdminTagProducts({
      search: "nfc standard",
      published: true,
      archived: false,
      supportsQr: true,
      supportsNfc: true,
      purchasable: true,
      page: 2,
      pageSize: 50,
      sortBy: "name",
      sortDir: "asc",
    });

    const [path] = apiRequest.mock.calls[0];
    const query = new URLSearchParams(String(path).split("?")[1]);
    expect(Object.fromEntries(query)).toMatchObject({
      page: "2",
      pageSize: "50",
      search: "nfc standard",
      published: "true",
      archived: "false",
      supportsQr: "true",
      supportsNfc: "true",
      purchasable: "true",
      sortBy: "name",
      sortDir: "asc",
    });
    // No 100-row cap; the server total is surfaced to the caller.
    expect(result.total).toBe(137);
    expect(result.items).toEqual([{ id: "p1" }]);
  });

  it("loads all Product/SKU selector options in one request", async () => {
    apiRequest.mockResolvedValue({ data: [] });

    await listAdminTagCatalogOptions();

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/admin/tag-products/options", {
      signal: undefined,
    });
  });

  it("sends the product create DTO to the matching Admin route", async () => {
    const input = {
      name: "QR Pet Tag",
      slug: "qr-pet-tag",
      shortDescription: null,
      description: null,
      isPublished: false,
      sortOrder: 0,
      media: [],
      concurrencyToken: null,
    };
    apiRequest.mockResolvedValue({ data: { id: "product-1" } });

    await saveAdminTagProduct(input);

    expect(apiRequest).toHaveBeenCalledWith("/api/v1/admin/tag-products", {
      method: "POST",
      body: input,
    });
  });

  it("uses the Promotions routes and preserves enum, decimal, and ISO date values", async () => {
    apiRequest
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { id: "promotion-1" } });
    const input = {
      name: "Launch offer",
      internalDescription: null,
      displayLabel: "Launch",
      isActive: true,
      isAutomatic: true,
      discountType: "FixedAmount" as const,
      discountValue: 12.5,
      startsAt: "2026-07-20T08:00:00.000Z",
      endsAt: "2026-07-27T08:00:00.000Z",
      priority: 2,
      productVariantIds: ["variant-1"],
      concurrencyToken: null,
    };

    await listAdminPromotions({ search: "launch", active: true, page: 2, pageSize: 50 });
    await saveAdminPromotion(input);

    const [listPath] = apiRequest.mock.calls[0];
    const listQuery = new URLSearchParams(String(listPath).split("?")[1]);
    expect(Object.fromEntries(listQuery)).toMatchObject({
      page: "2",
      pageSize: "50",
      search: "launch",
      active: "true",
    });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/api/v1/admin/promotions", {
      method: "POST",
      body: input,
    });
  });
});
