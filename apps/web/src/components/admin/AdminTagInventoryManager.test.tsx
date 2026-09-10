// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import { AdminTagInventoryManager } from "./AdminTagInventoryManager";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  listInventory: vi.fn(),
  listOptions: vi.fn(),
  listPresets: vi.fn(),
}));

vi.mock("@/components/admin/table/useAdminTableQuery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/admin/table/useAdminTableQuery")>();
  return { ...actual, useAdminTableQuery: () => ({
    query: {
      page: 1,
      pageSize: 20,
      search: "",
      sortBy: "generatedAt",
      sortDir: "desc",
      filters: {},
    },
    actions: {
      clearAllFilters: vi.fn(),
      getExtraParam: () => "",
      setExtraParam: vi.fn(),
      setFilter: vi.fn(),
      setFilters: vi.fn(),
      setPage: vi.fn(),
      setPageSize: vi.fn(),
      setSearch: vi.fn(),
      setSort: vi.fn(),
    },
    hasActiveFilters: false,
  }) };
});

vi.mock("@/services/adminTagInventoryService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/adminTagInventoryService")>();
  return { ...actual, listTagInventory: mocks.listInventory };
});

vi.mock("@/services/tagCatalogService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tagCatalogService")>();
  return {
    ...actual,
    listAdminTagCatalogOptions: mocks.listOptions,
    listAdminTagVariantPresets: mocks.listPresets,
  };
});

vi.mock("@/services/tagService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tagService")>();
  return { ...actual, adminGenerateRetailTags: mocks.generate };
});

const productVariantId = "22222222-2222-4222-8222-222222222222";
const catalog = [{
  id: "11111111-1111-4111-8111-111111111111",
  name: "MyPetLink My Boss Pet Tag",
  isPublished: true,
  variants: [{
    id: productVariantId,
    sku: "MYBOSS-LW-QR-NFC",
    displayName: "Lightweight",
    supportsQr: true,
    supportsNfc: true,
    tagVariant: "Lightweight",
    widthMm: 25,
    heightMm: 25,
    thicknessMm: 2,
    weightGrams: 5,
    material: "Stainless steel",
    shape: "Round",
    colour: "Silver",
    packagingType: "Retail card",
    printTemplateCode: "TPL-MYBOSS-LW",
    basePrice: 39.9,
    currency: "MYR",
    isActive: true,
    isPurchasable: true,
    inventoryCount: 20,
  }],
}];

function success(quantity: number, currentInventoryCount = quantity + 20) {
  return {
    data: {
      batchNo: "MPL-BAT-260910120000-1234",
      requestedQuantity: quantity,
      generatedQuantity: quantity,
      productVariantId,
      sku: "MYBOSS-LW-QR-NFC",
      productName: "MyPetLink My Boss Pet Tag",
      variantName: "Lightweight",
      currentInventoryCount,
      tags: [],
    },
    meta: { requestId: "request-1", source: "api" as const },
  };
}

beforeEach(() => {
  mocks.generate.mockReset();
  mocks.listInventory.mockReset().mockResolvedValue({ items: [], total: 0 });
  mocks.listOptions.mockReset().mockResolvedValue(catalog);
  mocks.listPresets.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderReady() {
  render(<AdminTagInventoryManager />);
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Generate Tag Codes" }) as HTMLButtonElement).disabled).toBe(false)
  );
}

describe("AdminTagInventoryManager generation", () => {
  it("sends 300 unchanged, prevents double submission, and shows the confirmed batch/count", async () => {
    let resolveRequest: ((value: ReturnType<typeof success>) => void) | undefined;
    mocks.generate.mockImplementation(
      () => new Promise<ReturnType<typeof success>>((resolve) => { resolveRequest = resolve; })
    );
    await renderReady();

    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "300" } });
    const button = screen.getByRole("button", { name: "Generate Tag Codes" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith(300, productVariantId);
    expect((screen.getByRole("button", { name: "Generating…" }) as HTMLButtonElement).disabled).toBe(true);

    resolveRequest?.(success(300, 320));
    expect(await screen.findByText(
      "300 new MYBOSS-LW-QR-NFC tag codes generated as unclaimed stock in batch MPL-BAT-260910120000-1234."
    )).toBeDefined();
    await waitFor(() => expect(screen.getByText("320 tags")).toBeDefined());
  });

  it.each(["", "abc", "0", "-1", "1.5", "501"])(
    "rejects invalid input %j without calling generation",
    async (value) => {
      await renderReady();
      fireEvent.change(screen.getByLabelText("Quantity"), { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Generate Tag Codes" }));

      expect(await screen.findByText("Enter a whole-number quantity from 1 to 500.")).toBeDefined();
      expect(mocks.generate).not.toHaveBeenCalled();
    }
  );

  it("shows an explicit server quantity validation error", async () => {
    mocks.generate.mockRejectedValue(new ApiClientError(
      400,
      "validation_failed",
      "Please check the submitted fields.",
      { quantity: ["Quantity must be a whole number from 1 to 500."] }
    ));
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Generate Tag Codes" }));

    expect(await screen.findByText("Quantity must be a whole number from 1 to 500.")).toBeDefined();
  });
});
