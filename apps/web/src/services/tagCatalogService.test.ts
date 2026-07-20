import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock("@/services/apiClient", () => ({ apiRequest }));

const { listAdminTagProducts, listTagProducts } = await import("./tagCatalogService");

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

  it("sends every Admin catalog filter to the server", async () => {
    apiRequest.mockResolvedValue({ data: [] });

    await listAdminTagProducts({
      search: "nfc standard",
      published: true,
      archived: false,
      supportsQr: true,
      supportsNfc: true,
      purchasable: true,
    });

    const [path] = apiRequest.mock.calls[0];
    const query = new URLSearchParams(String(path).split("?")[1]);
    expect(Object.fromEntries(query)).toMatchObject({
      page: "1",
      pageSize: "100",
      search: "nfc standard",
      published: "true",
      archived: "false",
      supportsQr: "true",
      supportsNfc: "true",
      purchasable: "true",
    });
  });
});
