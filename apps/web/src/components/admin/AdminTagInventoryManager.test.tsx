// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import { AdminTagInventoryManager } from "./AdminTagInventoryManager";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  listInventory: vi.fn(),
  listOptions: vi.fn(),
  listPresets: vi.fn(),
  bulk: vi.fn(),
  tableQuery: {
    page: 1, pageSize: 20, search: "", sortBy: "generatedAt", sortDir: "desc" as const,
    filters: {} as Record<string, string>,
  },
}));

vi.mock("@/components/admin/table/useAdminTableQuery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/admin/table/useAdminTableQuery")>();
  return { ...actual, useAdminTableQuery: () => ({
    query: mocks.tableQuery,
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
    hasActiveFilters: Object.keys(mocks.tableQuery.filters).length > 0,
  }) };
});

vi.mock("@/services/adminTagInventoryService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/adminTagInventoryService")>();
  return { ...actual, listTagInventory: mocks.listInventory, bulkUpdateTagInventory: mocks.bulk };
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

function success(quantity: number, currentInventoryCount = quantity + 20, stockPurpose: "Sale" | "Test" = "Sale") {
  return {
    data: {
      batchNo: "MPL-BAT-260910120000-1234",
      stockPurpose,
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
  mocks.bulk.mockReset().mockResolvedValue({ requestedCount: 300, updatedCount: 300, skippedCount: 0, failures: [] });
  mocks.tableQuery = { page: 1, pageSize: 20, search: "", sortBy: "generatedAt", sortDir: "desc", filters: {} };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The generation form's stock purpose (the filter bar has a field of the same name).
function choosePurpose(value: "" | "Sale" | "Test") {
  const select = screen.getAllByLabelText("Stock purpose").find(
    (element) => element.getAttribute("aria-describedby") === "tag-generation-purpose-help"
  );
  expect(select).toBeDefined();
  fireEvent.change(select!, { target: { value } });
}

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
    choosePurpose("Sale");
    const button = screen.getByRole("button", { name: "Generate Tag Codes" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith(300, productVariantId, "Sale");
    expect((screen.getByRole("button", { name: "Generating…" }) as HTMLButtonElement).disabled).toBe(true);

    resolveRequest?.(success(300, 320));
    expect(await screen.findByText(
      "300 new MYBOSS-LW-QR-NFC tag codes generated as commercial stock in batch MPL-BAT-260910120000-1234."
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
    choosePurpose("Sale");

    fireEvent.click(screen.getByRole("button", { name: "Generate Tag Codes" }));

    expect(await screen.findByText("Quantity must be a whole number from 1 to 500.")).toBeDefined();
  });

  it("never generates a batch until its stock purpose is chosen", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Generate Tag Codes" }));

    expect(await screen.findByText("Choose whether this batch is commercial stock or testing samples.")).toBeDefined();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("generates testing samples and says they are never sold", async () => {
    mocks.generate.mockResolvedValue(success(2, 22, "Test"));
    await renderReady();
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
    choosePurpose("Test");

    fireEvent.click(screen.getByRole("button", { name: "Generate Tag Codes" }));

    expect(mocks.generate).toHaveBeenCalledWith(2, productVariantId, "Test");
    expect(await screen.findByText(
      "2 new MYBOSS-LW-QR-NFC tag codes generated as testing samples in batch MPL-BAT-260910120000-1234. Testing samples are never sold."
    )).toBeDefined();
  });

  it("shows the server's stock purpose validation message", async () => {
    mocks.generate.mockRejectedValue(new ApiClientError(
      400,
      "validation_failed",
      "Please check the submitted fields.",
      { stockPurpose: ["Choose whether this batch is commercial stock or testing samples."] }
    ));
    await renderReady();
    choosePurpose("Sale");

    fireEvent.click(screen.getByRole("button", { name: "Generate Tag Codes" }));

    expect(await screen.findByText("Choose whether this batch is commercial stock or testing samples.")).toBeDefined();
  });
});

describe("AdminTagInventoryManager stock purpose", () => {
  it("labels every row with its stock purpose and offers the purpose filter", async () => {
    const row = (id: string, tagCode: string, stockPurpose?: "Sale" | "Test" | "Unclassified") => ({
      id, tagCode, stockPurpose, qaStatus: "Passed" as const, hasNfc: true, variant: "Lightweight",
      status: "Unassigned" as const, isArchived: false, fulfilment: "Printed" as const,
    });
    mocks.listInventory.mockResolvedValue({
      items: [row("t1", "MPL-SALE-0001", "Sale"), row("t2", "MPL-TEST-0001", "Test"), row("t3", "MPL-UNCL-0001", "Unclassified")],
      total: 3,
    });
    await renderReady();

    const rowOf = async (tagCode: string) => (await screen.findByText(tagCode)).closest("tr") as HTMLElement;
    expect(within(await rowOf("MPL-SALE-0001")).getByText("Commercial Stock")).toBeDefined();
    expect(within(await rowOf("MPL-TEST-0001")).getByText("Testing Sample")).toBeDefined();
    expect(within(await rowOf("MPL-UNCL-0001")).getByText("Unclassified")).toBeDefined();
    const filter = screen.getAllByLabelText("Stock purpose").find(
      (element) => element.getAttribute("aria-describedby") !== "tag-generation-purpose-help"
    ) as HTMLSelectElement;
    expect([...filter.options].map((option) => option.textContent)).toEqual(
      expect.arrayContaining(["Commercial Stock", "Testing Samples", "Unclassified"])
    );
  });
});

describe("AdminTagInventoryManager bulk selection", () => {
  const row = (index: number) => ({
    id: `tag-${index}`, tagCode: `MPL-SELECT-${index}`, qaStatus: "Passed" as const,
    stockPurpose: "Sale" as const, hasNfc: true, variant: "Lightweight" as const,
    status: "Unassigned" as const, isArchived: false, fulfilment: "Generated" as const,
  });

  it("keeps checked pages, selects all 300 by filter, and clears on filter change", async () => {
    mocks.listInventory.mockImplementation(async (params: { page: number; batch?: string }) => ({
      items: params.batch ? [] : Array.from({ length: 20 }, (_, index) => row((params.page - 1) * 20 + index)),
      total: params.batch ? 0 : 300,
    }));
    const view = render(<AdminTagInventoryManager />);
    await screen.findByText("MPL-SELECT-0");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows on this page" }));
    expect(screen.getByText("20 tags selected across pages.")).toBeDefined();

    mocks.tableQuery = { ...mocks.tableQuery, page: 2 };
    view.rerender(<AdminTagInventoryManager />);
    await screen.findByText("MPL-SELECT-20");
    expect(screen.getByText("20 tags selected across pages.")).toBeDefined();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows on this page" }));
    expect(screen.getByText("40 tags selected across pages.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Select all 300 tags matching current filters" }));
    expect(screen.getByText("All 300 tags matching the current filters selected.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Return to page-only selection" }));
    expect(screen.getByText("20 tags selected across pages.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Select all 300 tags matching current filters" }));

    fireEvent.click(screen.getByRole("button", { name: "Mark Printed" }));
    expect(screen.getByText(/Mark 300 tags as Printed/)).toBeDefined();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Mark Printed" }));
    await waitFor(() => expect(mocks.bulk).toHaveBeenCalledWith("mark-printed", {
      mode: "matching", expectedCount: 300,
      filters: expect.objectContaining({ page: 2, pageSize: 20 }),
    }));
    expect(await screen.findByText("Mark Printed: 300 successfully updated, 0 already Printed / skipped, 0 failed.")).toBeDefined();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows on this page" }));
    mocks.tableQuery = { ...mocks.tableQuery, page: 1, filters: { batch: "OTHER" } };
    view.rerender(<AdminTagInventoryManager />);
    expect(await screen.findByText("Filters changed. Selection cleared; choose tags again.")).toBeDefined();
  });
});
