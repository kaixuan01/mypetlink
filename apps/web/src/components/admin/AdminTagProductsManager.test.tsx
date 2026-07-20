// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import type {
  AdminPromotion,
  AdminTagProduct,
  AdminTagProductListItem,
} from "@/services/tagCatalogService";
import { AdminTagProductsManager } from "./AdminTagProductsManager";

const mocks = vi.hoisted(() => ({
  listProducts: vi.fn(),
  getProduct: vi.fn(),
  saveProduct: vi.fn(),
  archiveProduct: vi.fn(),
  saveVariant: vi.fn(),
  archiveVariant: vi.fn(),
  listPromotions: vi.fn(),
  savePromotion: vi.fn(),
  uploadMedia: vi.fn(),
}));

vi.mock("@/services/tagCatalogService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tagCatalogService")>();
  return {
    ...actual,
    listAdminTagProducts: mocks.listProducts,
    getAdminTagProduct: mocks.getProduct,
    saveAdminTagProduct: mocks.saveProduct,
    archiveAdminTagProduct: mocks.archiveProduct,
    saveAdminTagProductVariant: mocks.saveVariant,
    archiveAdminTagProductVariant: mocks.archiveVariant,
    listAdminPromotions: mocks.listPromotions,
    saveAdminPromotion: mocks.savePromotion,
  };
});

vi.mock("@/services/mediaService", () => ({ uploadMediaFile: mocks.uploadMedia }));

const listProduct: AdminTagProductListItem = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "QR Pet Tag",
  slug: "qr-pet-tag",
  isPublished: true,
  isArchived: false,
  variantCount: 1,
  purchasableVariantCount: 1,
  updatedAt: "2026-07-20T08:00:00Z",
  concurrencyToken: "AQ==",
};

const productDetail: AdminTagProduct = {
  id: listProduct.id,
  name: listProduct.name,
  slug: listProduct.slug,
  shortDescription: "A safer way home.",
  description: null,
  isPublished: true,
  isArchived: false,
  sortOrder: 0,
  media: [],
  variants: [{
    id: "22222222-2222-4222-8222-222222222222",
    productId: listProduct.id,
    publicKey: "PUBLICKEY1234567",
    sku: "MPL-QR-STANDARD-V1",
    displayName: "Standard QR Tag",
    supportsQr: true,
    supportsNfc: false,
    tagVariant: "Standard",
    widthMm: 32,
    heightMm: 32,
    thicknessMm: 2,
    weightGrams: 8,
    material: "Steel",
    shape: "Round",
    colour: "Silver",
    packagingType: "Sleeve",
    basePrice: 29.9,
    currency: "MYR",
    compareAtPrice: null,
    printTemplateCode: "TPL-QR",
    productionNotes: null,
    isActive: true,
    isPurchasable: true,
    isArchived: false,
    productionFieldsLocked: false,
    inventoryCount: 0,
    sortOrder: 0,
    updatedAt: "2026-07-20T08:00:00Z",
    concurrencyToken: "Ag==",
  }],
  createdAt: "2026-07-20T08:00:00Z",
  updatedAt: "2026-07-20T08:00:00Z",
  concurrencyToken: "AQ==",
};

const promotion: AdminPromotion = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Launch offer",
  internalDescription: null,
  displayLabel: "Launch offer",
  isActive: false,
  isAutomatic: true,
  discountType: "Percentage",
  discountValue: 10,
  startsAt: "2026-07-20T08:00:00Z",
  endsAt: "2026-07-27T08:00:00Z",
  priority: 0,
  productVariantIds: [productDetail.variants[0].id],
  updatedAt: "2026-07-20T08:00:00Z",
  concurrencyToken: "Aw==",
};

beforeEach(() => {
  mocks.listProducts.mockReset().mockResolvedValue([]);
  mocks.getProduct.mockReset().mockResolvedValue(productDetail);
  mocks.saveProduct.mockReset().mockImplementation(async (input) => ({
    ...productDetail,
    id: "44444444-4444-4444-8444-444444444444",
    name: input.name,
    slug: input.slug,
    shortDescription: input.shortDescription,
    description: input.description,
    isPublished: input.isPublished,
    sortOrder: input.sortOrder,
    variants: [],
  }));
  mocks.archiveProduct.mockReset();
  mocks.saveVariant.mockReset();
  mocks.archiveVariant.mockReset();
  mocks.listPromotions.mockReset().mockResolvedValue([]);
  mocks.savePromotion.mockReset().mockResolvedValue(promotion);
  mocks.uploadMedia.mockReset();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function waitForProductLoad() {
  await screen.findByText("No tag products found.");
}

function fillDraftProduct(name = "Lightweight QR Tag") {
  fireEvent.change(screen.getByLabelText("Product name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Stable product link"), { target: { value: "lightweight-qr-tag" } });
}

async function openPromotionsWithEligibleVariant() {
  mocks.listProducts
    .mockReset()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([listProduct]);
  mocks.getProduct.mockResolvedValue(productDetail);
  render(<AdminTagProductsManager />);
  await waitForProductLoad();
  fireEvent.click(screen.getByRole("tab", { name: "Promotions" }));
  await screen.findByText("No promotions created.");
}

describe("AdminTagProductsManager products", () => {
  it("shows a true empty state only after a successful zero-result load", async () => {
    render(<AdminTagProductsManager />);
    await waitForProductLoad();
    expect(mocks.listProducts).toHaveBeenCalled();
  });

  it("shows a request reference and Retry after load failure, never the empty state", async () => {
    mocks.listProducts
      .mockRejectedValueOnce(new ApiClientError(500, "server_error", "Internal", null, undefined, "req-products"))
      .mockResolvedValueOnce([]);
    render(<AdminTagProductsManager />);

    await screen.findByText("We couldn’t load Tag Products. Please try again. Reference: req-products");
    expect(screen.queryByText("No tag products found.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByText("No tag products found.");
    expect(screen.queryByText(/req-products/)).toBeNull();
  });

  it("blocks an empty product locally and focuses required fields", async () => {
    render(<AdminTagProductsManager />);
    await waitForProductLoad();
    fireEvent.click(screen.getByRole("button", { name: "Save Product" }));

    expect(await screen.findByText("Product name is required.")).toBeDefined();
    expect(screen.getByText("Product link is required.")).toBeDefined();
    expect(screen.getByLabelText("Product name").getAttribute("aria-invalid")).toBe("true");
    expect(mocks.saveProduct).not.toHaveBeenCalled();
  });

  it("creates a valid draft with the backend DTO and selects the saved product", async () => {
    render(<AdminTagProductsManager />);
    await waitForProductLoad();
    fillDraftProduct();
    fireEvent.click(screen.getByRole("button", { name: "Save Product" }));

    await waitFor(() => expect(mocks.saveProduct).toHaveBeenCalledTimes(1));
    expect(mocks.saveProduct).toHaveBeenCalledWith({
      name: "Lightweight QR Tag",
      slug: "lightweight-qr-tag",
      shortDescription: "",
      description: "",
      isPublished: false,
      sortOrder: 0,
      media: [],
      concurrencyToken: undefined,
    }, undefined);
    await screen.findByText("Lightweight QR Tag saved.");
    expect(screen.getByText("Edit Lightweight QR Tag")).toBeDefined();
  });

  it("rejects publication without an eligible SKU before sending", async () => {
    render(<AdminTagProductsManager />);
    await waitForProductLoad();
    fillDraftProduct();
    fireEvent.change(screen.getByLabelText("Short description"), { target: { value: "Small and safe" } });
    fireEvent.click(screen.getByLabelText("Published for customers"));
    fireEvent.click(screen.getByRole("button", { name: "Save Product" }));

    await screen.findByText("Add at least one active purchasable SKU before publishing this product.");
    expect(mocks.saveProduct).not.toHaveBeenCalled();
  });

  it("maps duplicate-link conflicts to the field and preserves form values", async () => {
    mocks.saveProduct.mockRejectedValueOnce(new ApiClientError(
      409,
      "duplicate_value",
      "This product link is already in use.",
      { slug: ["This product link is already in use."] }
    ));
    render(<AdminTagProductsManager />);
    await waitForProductLoad();
    fillDraftProduct("Duplicate name");
    fireEvent.click(screen.getByRole("button", { name: "Save Product" }));

    await screen.findByText("This product link is already in use.");
    expect((screen.getByLabelText("Product name") as HTMLInputElement).value).toBe("Duplicate name");
  });

  it("keeps entered values and shows a safe reference for unexpected save failure", async () => {
    mocks.saveProduct.mockRejectedValueOnce(new ApiClientError(500, "server_error", "Internal", null, undefined, "req-save"));
    render(<AdminTagProductsManager />);
    await waitForProductLoad();
    fillDraftProduct("Preserved name");
    fireEvent.click(screen.getByRole("button", { name: "Save Product" }));

    await screen.findByText("We couldn’t save this product. Please try again. Reference: req-save");
    expect((screen.getByLabelText("Product name") as HTMLInputElement).value).toBe("Preserved name");
  });

  it("prevents duplicate submissions while the first save is pending", async () => {
    let resolveSave: ((value: AdminTagProduct) => void) | undefined;
    mocks.saveProduct.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve; }));
    render(<AdminTagProductsManager />);
    await waitForProductLoad();
    fillDraftProduct();
    const save = screen.getByRole("button", { name: "Save Product" });
    fireEvent.click(save);
    fireEvent.click(save);

    expect(mocks.saveProduct).toHaveBeenCalledTimes(1);
    resolveSave?.({ ...productDetail, name: "Lightweight QR Tag", slug: "lightweight-qr-tag", isPublished: false, variants: [] });
    await screen.findByText("Lightweight QR Tag saved.");
  });
});

describe("AdminTagProductsManager promotions", () => {
  it("loads an empty tab and explains the eligible-SKU prerequisite", async () => {
    render(<AdminTagProductsManager />);
    await waitForProductLoad();
    fireEvent.click(screen.getByRole("tab", { name: "Promotions" }));

    await screen.findByText("No promotions created.");
    expect(screen.getByText("Create and publish an eligible product variant before adding a promotion.")).toBeDefined();
    expect((screen.getByRole("button", { name: "New Promotion" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a retryable Promotions failure instead of its empty state", async () => {
    mocks.listPromotions
      .mockRejectedValueOnce(new ApiClientError(500, "server_error", "Internal", null, undefined, "req-promotions"))
      .mockResolvedValueOnce([]);
    render(<AdminTagProductsManager />);
    await waitForProductLoad();
    fireEvent.click(screen.getByRole("tab", { name: "Promotions" }));

    await screen.findByText("We couldn’t load Promotions. Please try again. Reference: req-promotions");
    expect(screen.queryByText("No promotions created.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("No promotions created.");
  });

  it("blocks invalid promotion values and submits the accepted DTO", async () => {
    await openPromotionsWithEligibleVariant();
    fireEvent.click(screen.getByRole("button", { name: "Save Promotion" }));
    expect(await screen.findByText("Promotion name is required.")).toBeDefined();
    expect(screen.getByText("Choose at least one eligible SKU.")).toBeDefined();
    expect(mocks.savePromotion).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Promotion name"), { target: { value: "Launch offer" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /MPL-QR-STANDARD-V1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Promotion" }));

    await waitFor(() => expect(mocks.savePromotion).toHaveBeenCalledTimes(1));
    expect(mocks.savePromotion).toHaveBeenCalledWith(expect.objectContaining({
      name: "Launch offer",
      discountType: "Percentage",
      discountValue: 10,
      priority: 0,
      productVariantIds: [productDetail.variants[0].id],
    }), undefined);
  });

  it("maps backend promotion validation and preserves the editor", async () => {
    mocks.savePromotion.mockRejectedValueOnce(new ApiClientError(
      400,
      "validation_failed",
      "Please check the submitted fields.",
      { DiscountValue: ["Percentage discount cannot exceed 100%."] }
    ));
    await openPromotionsWithEligibleVariant();
    fireEvent.change(screen.getByLabelText("Promotion name"), { target: { value: "Preserved offer" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /MPL-QR-STANDARD-V1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Promotion" }));

    await screen.findByText("Percentage discount cannot exceed 100%.");
    expect((screen.getByLabelText("Promotion name") as HTMLInputElement).value).toBe("Preserved offer");
  });
});
