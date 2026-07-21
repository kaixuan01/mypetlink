// @vitest-environment jsdom

import { useSyncExternalStore } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import type {
  AdminPromotion,
  AdminTagProduct,
  AdminTagProductListItem,
  AdminTagVariantPreset,
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
  listPresets: vi.fn(),
  savePreset: vi.fn(),
  listOptions: vi.fn(),
  uploadMedia: vi.fn(),
}));

// Reactive navigation mock: router.push updates a shared store that
// useSearchParams subscribes to, so URL-driven screens re-render exactly like
// the real app router.
const navState = vi.hoisted(() => ({
  pathname: "/admin/tag-products",
  search: "",
  listeners: new Set<() => void>(),
}));

function navigate(url: string) {
  navState.search = url.split("?")[1] ?? "";
  navState.listeners.forEach((listener) => listener());
}

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({ push: navigate, replace: navigate }),
  useSearchParams: () => {
    const search = useSyncExternalStore(
      (callback) => {
        navState.listeners.add(callback);
        return () => navState.listeners.delete(callback);
      },
      () => navState.search,
      () => navState.search
    );
    return new URLSearchParams(search);
  },
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
    listAdminTagVariantPresets: mocks.listPresets,
    saveAdminTagVariantPreset: mocks.savePreset,
    listAdminTagCatalogOptions: mocks.listOptions,
  };
});

vi.mock("@/services/mediaService", () => ({ uploadMediaFile: mocks.uploadMedia }));

const standardPreset: AdminTagVariantPreset = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  code: "STANDARD",
  displayName: "Standard",
  description: null,
  isActive: true,
  sortOrder: 0,
  skuCount: 1,
  updatedAt: "2026-07-20T08:00:00Z",
  concurrencyToken: "AQ==",
};

const collarSlidePreset: AdminTagVariantPreset = {
  ...standardPreset,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  code: "COLLAR-SLIDE",
  displayName: "Collar Slide",
  skuCount: 0,
  sortOrder: 1,
};

const inactivePreset: AdminTagVariantPreset = {
  ...standardPreset,
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  code: "RETIRED",
  displayName: "Retired Shape",
  isActive: false,
  skuCount: 2,
  sortOrder: 2,
};

const listProduct: AdminTagProductListItem = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "MyPetLink Pet Tag",
  slug: "mypetlink-pet-tag",
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
    tagVariantPresetId: standardPreset.id,
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

const catalogOption = {
  id: listProduct.id,
  name: listProduct.name,
  isPublished: true,
  variants: [{
    id: productDetail.variants[0].id,
    sku: "MPL-QR-STANDARD-V1",
    displayName: "Standard QR Tag",
    supportsQr: true,
    supportsNfc: false,
    tagVariant: "Standard",
    widthMm: 32,
    heightMm: 32,
    thicknessMm: 2,
    material: "Steel",
    printTemplateCode: "TPL-QR",
    basePrice: 29.9,
    currency: "MYR",
    isActive: true,
    isPurchasable: true,
    inventoryCount: 0,
  }],
};

beforeEach(() => {
  navState.pathname = "/admin/tag-products";
  navState.search = "";
  navState.listeners.clear();
  mocks.listProducts.mockReset().mockResolvedValue({ items: [], total: 0 });
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
  mocks.archiveProduct.mockReset().mockResolvedValue({ ...productDetail, isArchived: true, isPublished: false });
  mocks.saveVariant.mockReset().mockResolvedValue(productDetail.variants[0]);
  mocks.archiveVariant.mockReset();
  mocks.listPromotions.mockReset().mockResolvedValue({ items: [], total: 0 });
  mocks.savePromotion.mockReset().mockResolvedValue(promotion);
  mocks.listPresets.mockReset().mockResolvedValue([standardPreset, collarSlidePreset, inactivePreset]);
  mocks.savePreset.mockReset().mockResolvedValue(collarSlidePreset);
  mocks.listOptions.mockReset().mockResolvedValue([catalogOption]);
  mocks.uploadMedia.mockReset();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function waitForProductLoad() {
  await screen.findByText("No tag products found.");
}

async function openNewProduct() {
  render(<AdminTagProductsManager />);
  await waitForProductLoad();
  fireEvent.click(screen.getByRole("button", { name: "New Product" }));
  await screen.findByText("Create product");
}

function fillDraftProduct(name = "MyPetLink Pet Tag") {
  fireEvent.change(screen.getByLabelText("Product name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Stable product link"), { target: { value: "mypetlink-pet-tag" } });
}

async function openExistingProduct() {
  mocks.listProducts.mockResolvedValue({ items: [listProduct], total: 1 });
  render(<AdminTagProductsManager />);
  const item = await screen.findByText("MyPetLink Pet Tag");
  fireEvent.click(item);
  await screen.findByText(`Edit ${productDetail.name}`);
}

describe("AdminTagProductsManager navigation and mobile flow", () => {
  it("renders the three tab links with deep-linkable hrefs and marks the active tab", async () => {
    render(<AdminTagProductsManager />);
    await waitForProductLoad();

    const products = screen.getByRole("link", { name: "Products & SKUs" });
    const promotions = screen.getByRole("link", { name: "Promotions" });
    const settings = screen.getByRole("link", { name: "Catalog Settings" });
    expect(products.getAttribute("href")).toBe("/admin/tag-products?tab=products");
    expect(promotions.getAttribute("href")).toBe("/admin/tag-products?tab=promotions");
    expect(settings.getAttribute("href")).toBe("/admin/tag-products?tab=settings");
    expect(products.getAttribute("aria-current")).toBe("page");
    expect(promotions.getAttribute("aria-current")).toBeNull();

    // Honest, keyboard-accessible links — no incomplete ARIA tab roles.
    for (const link of [products, promotions, settings]) {
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("role")).toBeNull();
      link.focus();
      expect(document.activeElement).toBe(link);
    }
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("opens the Promotions tab from the URL used by the sidebar", async () => {
    navState.search = "tab=promotions";
    mocks.listProducts.mockResolvedValue({ items: [listProduct], total: 1 });
    render(<AdminTagProductsManager />);

    await screen.findByText("No promotions created.");
    expect(screen.getByRole("link", { name: "Promotions" }).getAttribute("aria-current")).toBe("page");
  });

  it("opens Catalog Settings from the URL and lists Tag Types", async () => {
    navState.search = "tab=settings";
    render(<AdminTagProductsManager />);

    await screen.findByText("Tag Types");
    expect(await screen.findByText("Collar Slide")).toBeDefined();
    expect(screen.getByText("Retired Shape")).toBeDefined();
  });

  it("does not render the product editor until a product is opened, and steps the list aside on narrow screens", async () => {
    await openExistingProduct();

    // The editor is now open; the list panel is hidden on narrow screens and
    // only re-shown from xl upward (master/detail, one context on mobile).
    expect(screen.getByTestId("product-list-panel").className).toContain("hidden");
    expect(screen.getByTestId("product-list-panel").className).toContain("xl:block");
  });

  it("returns to the product list with Back and keeps the URL in sync", async () => {
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: /Back to All products/ }));

    await waitFor(() =>
      expect(screen.getByTestId("product-list-panel").className).not.toContain("hidden")
    );
    // Back clears the open product (an absent tab param is the products tab).
    expect(navState.search).not.toContain("product=");
    expect(navState.search).not.toContain("tab=promotions");
  });

  it("opens the SKU editor only after explicitly choosing New SKU", async () => {
    await openExistingProduct();

    // Product detail shows the SKU list but no editing form yet.
    expect(screen.queryByText("Tag Type")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New SKU" }));

    await screen.findByText(`New SKU for ${productDetail.name}`);
    expect(screen.getByText("Tag Type")).toBeDefined();
    // On mobile the product editor has stepped aside: only the SKU context.
    expect(screen.queryByLabelText("Product name")).toBeNull();
  });

  it("protects unsaved product changes when navigating back", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    await openExistingProduct();
    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Edited name" } });
    fireEvent.click(screen.getByRole("button", { name: /Back to All products/ }));

    expect(confirmSpy).toHaveBeenCalled();
    // Declined: the editor stays with the edited value.
    expect((screen.getByLabelText("Product name") as HTMLInputElement).value).toBe("Edited name");
  });
});

describe("AdminTagProductsManager terminology and status", () => {
  it("explains Product vs SKU and shows the guided empty SKU state", async () => {
    await openExistingProduct();

    expect(
      screen.getAllByText(/A product is the customer-facing item shown in the Owner Portal/).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Each SKU is one exact sellable and manufacturable configuration/).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/Specific sizes, capabilities, and materials belong to SKUs/)
    ).toBeDefined();

    // Empty SKU state.
    mocks.getProduct.mockResolvedValue({ ...productDetail, variants: [] });
    fireEvent.click(screen.getByRole("button", { name: /Back to All products/ }));
    fireEvent.click(await screen.findByText("MyPetLink Pet Tag"));
    await screen.findByText(/does not have any sellable configurations yet/);
  });

  it("labels SKU availability without ambiguous combinations", async () => {
    mocks.getProduct.mockResolvedValue({
      ...productDetail,
      variants: [
        productDetail.variants[0],
        { ...productDetail.variants[0], id: "55555555-5555-4555-8555-555555555555", sku: "MPL-QR-B", isPurchasable: false },
        { ...productDetail.variants[0], id: "66666666-6666-4666-8666-666666666666", sku: "MPL-QR-C", isActive: false, isPurchasable: false },
      ],
    });
    await openExistingProduct();

    expect(screen.getAllByText("Purchasable").length).toBeGreaterThan(0);
    expect(screen.getByText("Active · not purchasable")).toBeDefined();
    expect(screen.getAllByText("Inactive").length).toBeGreaterThan(0);
    expect(screen.getByText("Hidden from the store until it is marked purchasable.")).toBeDefined();
  });

  it("opens a confirmation dialog before archiving a product, explaining the impact", async () => {
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "Archive Product" }));

    // Dialog opened, nothing archived yet.
    expect(mocks.archiveProduct).not.toHaveBeenCalled();
    await screen.findByRole("dialog");
    expect(screen.getByText(/unavailable for new purchases/)).toBeDefined();
    expect(screen.getByText(/cannot be undone from this portal/)).toBeDefined();
  });

  it("cancelling the archive dialog performs no API request", async () => {
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "Archive Product" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));

    expect(mocks.archiveProduct).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("confirming performs exactly one product archive request", async () => {
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "Archive Product" }));
    await screen.findByRole("dialog");
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "Archive Product" });
    fireEvent.click(confirm);

    await waitFor(() => expect(mocks.archiveProduct).toHaveBeenCalledTimes(1));
    expect(mocks.archiveProduct).toHaveBeenCalledWith(productDetail.id, productDetail.concurrencyToken);
  });

  it("does not submit twice when the confirm button is double-clicked", async () => {
    let resolveArchive: ((value: AdminTagProduct) => void) | undefined;
    mocks.archiveProduct.mockReturnValueOnce(new Promise((resolve) => { resolveArchive = resolve; }));
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "Archive Product" }));
    await screen.findByRole("dialog");
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "Archive Product" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(mocks.archiveProduct).toHaveBeenCalledTimes(1);
    resolveArchive?.({ ...productDetail, isArchived: true, isPublished: false });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("requires confirmation before archiving an SKU, then archives exactly once", async () => {
    await openExistingProduct();
    fireEvent.click(screen.getByText("MPL-QR-STANDARD-V1"));
    await screen.findByText(/Edit SKU/);
    fireEvent.click(screen.getByRole("button", { name: "Archive SKU" }));

    expect(mocks.archiveVariant).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/unavailable for new purchases/)).toBeDefined();
    fireEvent.click(within(dialog).getByRole("button", { name: "Archive SKU" }));

    await waitFor(() => expect(mocks.archiveVariant).toHaveBeenCalledTimes(1));
    expect(mocks.archiveVariant).toHaveBeenCalledWith(
      productDetail.variants[0].id,
      productDetail.variants[0].concurrencyToken
    );
  });
});

describe("AdminTagProductsManager Tag Types", () => {
  it("sources Tag Type options from the API, not a hardcoded list", async () => {
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "New SKU" }));
    await screen.findByText("Tag Type");

    const options = Array.from(
      screen.getByRole("combobox", { name: "Tag Type" }).querySelectorAll("option")
    ).map((option) => option.textContent);
    expect(options).toContain("Standard");
    expect(options).toContain("Collar Slide");
    // Inactive Tag Types are excluded for a NEW SKU.
    expect(options?.join("|")).not.toContain("Retired Shape");
    expect(mocks.listPresets).toHaveBeenCalled();
  });

  it("keeps an inactive Tag Type selectable on the SKU that already uses it", async () => {
    mocks.getProduct.mockResolvedValue({
      ...productDetail,
      variants: [{ ...productDetail.variants[0], tagVariantPresetId: inactivePreset.id, tagVariant: "Retired Shape" }],
    });
    await openExistingProduct();
    fireEvent.click(screen.getByText("MPL-QR-STANDARD-V1"));
    await screen.findByText(/Edit SKU/);

    const options = Array.from(
      screen.getByRole("combobox", { name: "Tag Type" }).querySelectorAll("option")
    ).map((option) => option.textContent);
    expect(options).toContain("Retired Shape (inactive)");
  });

  it("points to Catalog Settings instead of falling back to hardcoded values when no Tag Types exist", async () => {
    mocks.listPresets.mockResolvedValue([]);
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "New SKU" }));

    await screen.findByText(/No active Tag Types exist yet/);
    const settingsLink = screen.getByRole("link", { name: "Add one in Catalog Settings" });
    expect(settingsLink.getAttribute("href")).toBe("/admin/tag-products?tab=settings");
    expect(screen.queryByRole("combobox", { name: "Tag Type" })).toBeNull();
  });

  it("creates a Tag Type from Catalog Settings", async () => {
    navState.search = "tab=settings";
    render(<AdminTagProductsManager />);
    await screen.findByText("Tag Types");

    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "collar-slide" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Collar Slide" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Tag Type" }));

    await waitFor(() => expect(mocks.savePreset).toHaveBeenCalledTimes(1));
    expect(mocks.savePreset).toHaveBeenCalledWith(
      expect.objectContaining({ code: "COLLAR-SLIDE", displayName: "Collar Slide", isActive: true }),
      undefined
    );
  });

  it("surfaces duplicate-Tag-Type errors from the backend", async () => {
    mocks.savePreset.mockRejectedValueOnce(new ApiClientError(
      400,
      "validation_failed",
      "Please check the submitted fields.",
      { code: ["A Tag Type with this code or display name already exists."] }
    ));
    navState.search = "tab=settings";
    render(<AdminTagProductsManager />);
    await screen.findByText("Tag Types");

    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "STANDARD" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Standard" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Tag Type" }));

    await screen.findByText("A Tag Type with this code or display name already exists.");
  });

  it("submits the selected Tag Type id when saving an SKU", async () => {
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "New SKU" }));
    await screen.findByText("Tag Type");

    fireEvent.change(screen.getByRole("combobox", { name: "Tag Type" }), { target: { value: collarSlidePreset.id } });
    fireEvent.change(screen.getByLabelText("SKU code"), { target: { value: "MPL-COLLAR-V1" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Collar Slide Tag" } });
    fireEvent.click(screen.getByRole("button", { name: "Create SKU" }));

    await waitFor(() => expect(mocks.saveVariant).toHaveBeenCalledTimes(1));
    expect(mocks.saveVariant).toHaveBeenCalledWith(
      productDetail.id,
      expect.objectContaining({
        sku: "MPL-COLLAR-V1",
        tagVariantPresetId: collarSlidePreset.id,
        concurrencyToken: null,
      }),
      undefined
    );
  });
});

describe("AdminTagProductsManager SKU availability", () => {
  it("organises the SKU form into General and Pricing & Availability sections open by default", async () => {
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "New SKU" }));
    await screen.findByText(`New SKU for ${productDetail.name}`);

    // General and Pricing & Availability are the two expanded sections.
    const general = screen.getByText("General").closest("details");
    const pricing = screen.getByText("Pricing & Availability").closest("details");
    const specifications = screen.getByText("Specifications").closest("details");
    const production = screen.getByText("Production").closest("details");
    expect(general?.open).toBe(true);
    expect(pricing?.open).toBe(true);
    expect(specifications?.open).toBe(false);
    expect(production?.open).toBe(false);
  });

  it("renames the purchase toggle and explains Active versus Available for purchase", async () => {
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "New SKU" }));
    await screen.findByText(`New SKU for ${productDetail.name}`);

    expect(screen.getByRole("checkbox", { name: "Active" })).toBeDefined();
    expect(screen.getByRole("checkbox", { name: "Available for purchase" })).toBeDefined();
    // The old developer-flavoured wording is gone.
    expect(screen.queryByRole("checkbox", { name: "Active SKU" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Purchasable by customers" })).toBeNull();
    expect(
      screen.getByText(/lets customers select it in new orders — only possible while the SKU is active/)
    ).toBeDefined();
  });

  it("cannot be available for purchase while inactive, and deactivating withdraws it", async () => {
    // Open an existing purchasable, active SKU.
    await openExistingProduct();
    fireEvent.click(screen.getByText("MPL-QR-STANDARD-V1"));
    await screen.findByText(/Edit SKU/);

    const active = screen.getByRole("checkbox", { name: "Active" }) as HTMLInputElement;
    const purchasable = screen.getByRole("checkbox", { name: "Available for purchase" }) as HTMLInputElement;
    expect(active.checked).toBe(true);
    expect(purchasable.checked).toBe(true);
    expect(purchasable.disabled).toBe(false);

    // Deactivating the SKU withdraws it from purchase and locks the toggle.
    fireEvent.click(active);
    expect((screen.getByRole("checkbox", { name: "Available for purchase" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Available for purchase" }) as HTMLInputElement).disabled).toBe(true);
  });
});

describe("AdminTagProductsManager SKU editor open and edit flow", () => {
  const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
  const VARIANT_ID = "22222222-2222-4222-8222-222222222222";

  it("exposes each SKU as an accessible, keyboard-activatable Edit control", async () => {
    await openExistingProduct();

    const card = screen.getByRole("button", { name: "Edit SKU MPL-QR-STANDARD-V1" });
    // A real button (not a div) — the platform gives it keyboard activation.
    expect(card.tagName).toBe("BUTTON");
    card.focus();
    expect(document.activeElement).toBe(card);
  });

  it("opens the create form for the selected product when New SKU is chosen", async () => {
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "New SKU" }));

    await screen.findByText(`New SKU for ${productDetail.name}`);
    // Blank defaults, not another product's SKU.
    expect((screen.getByLabelText("SKU code") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Create SKU" })).toBeDefined();
    expect(navState.search).toContain("sku=new");
    expect(navState.search).toContain(`product=${PRODUCT_ID}`);
  });

  it("opens the editor with the correct data when an existing SKU is activated", async () => {
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "Edit SKU MPL-QR-STANDARD-V1" }));

    await screen.findByText("Edit SKU MPL-QR-STANDARD-V1");
    expect((screen.getByLabelText("SKU code") as HTMLInputElement).value).toBe("MPL-QR-STANDARD-V1");
    // The product editor stepped aside — this is clearly SKU editing.
    expect(screen.queryByLabelText("Product name")).toBeNull();
    expect(navState.search).toContain(`sku=${VARIANT_ID}`);
  });

  it("saves a new SKU with the create API exactly once, associated with the product", async () => {
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "New SKU" }));
    await screen.findByText(`New SKU for ${productDetail.name}`);

    fireEvent.change(screen.getByRole("combobox", { name: "Tag Type" }), { target: { value: standardPreset.id } });
    fireEvent.change(screen.getByLabelText("SKU code"), { target: { value: "MPL-NEW-V1" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "New Tag" } });
    fireEvent.click(screen.getByRole("button", { name: "Create SKU" }));

    await waitFor(() => expect(mocks.saveVariant).toHaveBeenCalledTimes(1));
    expect(mocks.saveVariant).toHaveBeenCalledWith(
      PRODUCT_ID,
      expect.objectContaining({ sku: "MPL-NEW-V1", concurrencyToken: null }),
      undefined
    );
  });

  it("saves an existing SKU with the update API exactly once, passing the SKU id", async () => {
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "Edit SKU MPL-QR-STANDARD-V1" }));
    await screen.findByText("Edit SKU MPL-QR-STANDARD-V1");

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Renamed Tag" } });
    fireEvent.click(screen.getByRole("button", { name: "Save SKU" }));

    await waitFor(() => expect(mocks.saveVariant).toHaveBeenCalledTimes(1));
    expect(mocks.saveVariant).toHaveBeenCalledWith(
      PRODUCT_ID,
      expect.objectContaining({ displayName: "Renamed Tag" }),
      VARIANT_ID
    );
  });

  it("cancels SKU creation with Back and performs no save", async () => {
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "New SKU" }));
    await screen.findByText(`New SKU for ${productDetail.name}`);

    fireEvent.click(screen.getByRole("button", { name: `Back to ${productDetail.name}` }));

    await screen.findByText(`Edit ${productDetail.name}`);
    expect(mocks.saveVariant).not.toHaveBeenCalled();
    expect(navState.search).not.toContain("sku=");
  });

  it("restores the SKU editor when refreshing a URL with a product and SKU", async () => {
    navState.search = `tab=products&product=${PRODUCT_ID}&sku=${VARIANT_ID}`;
    mocks.listProducts.mockResolvedValue({ items: [listProduct], total: 1 });
    render(<AdminTagProductsManager />);

    await screen.findByText("Edit SKU MPL-QR-STANDARD-V1");
    expect((screen.getByLabelText("SKU code") as HTMLInputElement).value).toBe("MPL-QR-STANDARD-V1");
  });

  it("fails safely for an invalid SKU id: notice, no blank editor, back to the product", async () => {
    navState.search = `tab=products&product=${PRODUCT_ID}&sku=99999999-9999-4999-8999-999999999999`;
    mocks.listProducts.mockResolvedValue({ items: [listProduct], total: 1 });
    render(<AdminTagProductsManager />);

    await screen.findByText(/That SKU is no longer available/);
    // The URL is cleaned and the product editor is shown, never a blank SKU form.
    expect(navState.search).not.toContain("sku=");
    await screen.findByText(`Edit ${productDetail.name}`);
    expect(screen.queryByRole("button", { name: "Save SKU" })).toBeNull();
  });

  it("clears an open SKU selection when a product is selected from the list", async () => {
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "Edit SKU MPL-QR-STANDARD-V1" }));
    await screen.findByText("Edit SKU MPL-QR-STANDARD-V1");

    // Selecting the product again (list stays mounted) closes the SKU editor.
    fireEvent.click(screen.getByText("MyPetLink Pet Tag"));

    await screen.findByText(`Edit ${productDetail.name}`);
    expect(navState.search).not.toContain("sku=");
  });

  it("keeps the SKU form open and shows an error when saving fails", async () => {
    mocks.saveVariant.mockRejectedValueOnce(new ApiClientError(400, "validation_failed", "Please check the submitted fields."));
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "New SKU" }));
    await screen.findByText(`New SKU for ${productDetail.name}`);

    fireEvent.change(screen.getByRole("combobox", { name: "Tag Type" }), { target: { value: standardPreset.id } });
    fireEvent.change(screen.getByLabelText("SKU code"), { target: { value: "MPL-NEW-V1" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "New Tag" } });
    fireEvent.click(screen.getByRole("button", { name: "Create SKU" }));

    await screen.findByText(/Please check the submitted fields|couldn.t save/i);
    // Editor stays open with the entered values preserved.
    expect(screen.getByText(`New SKU for ${productDetail.name}`)).toBeDefined();
    expect((screen.getByLabelText("SKU code") as HTMLInputElement).value).toBe("MPL-NEW-V1");
  });

  it("does not submit a new SKU twice when Create is double-clicked", async () => {
    let resolveSave: ((value: unknown) => void) | undefined;
    mocks.saveVariant.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve; }));
    await openExistingProduct();
    fireEvent.click(screen.getByRole("button", { name: "New SKU" }));
    await screen.findByText(`New SKU for ${productDetail.name}`);

    fireEvent.change(screen.getByRole("combobox", { name: "Tag Type" }), { target: { value: standardPreset.id } });
    fireEvent.change(screen.getByLabelText("SKU code"), { target: { value: "MPL-NEW-V1" } });
    const create = screen.getByRole("button", { name: "Create SKU" });
    fireEvent.click(create);
    fireEvent.click(create);

    expect(mocks.saveVariant).toHaveBeenCalledTimes(1);
    resolveSave?.(productDetail.variants[0]);
    await waitFor(() => expect(mocks.getProduct).toHaveBeenCalled());
  });
});

describe("AdminTagProductsManager products", () => {
  it("shows a true empty state only after a successful zero-result load", async () => {
    render(<AdminTagProductsManager />);
    await waitForProductLoad();
    expect(mocks.listProducts).toHaveBeenCalled();
  });

  it("shows a request reference and Retry after load failure, never the empty state", async () => {
    mocks.listProducts
      .mockRejectedValueOnce(new ApiClientError(500, "server_error", "Internal", null, undefined, "req-products"))
      .mockResolvedValueOnce({ items: [], total: 0 });
    render(<AdminTagProductsManager />);

    await screen.findByText("We couldn’t load Tag Products. Please try again. Reference: req-products");
    expect(screen.queryByText("No tag products found.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByText("No tag products found.");
    expect(screen.queryByText(/req-products/)).toBeNull();
  });

  it("blocks an empty product locally and focuses required fields", async () => {
    await openNewProduct();
    fireEvent.click(screen.getByRole("button", { name: "Save Product" }));

    expect(await screen.findByText("Product name is required.")).toBeDefined();
    expect(screen.getByText("Product link is required.")).toBeDefined();
    expect(screen.getByLabelText("Product name").getAttribute("aria-invalid")).toBe("true");
    expect(mocks.saveProduct).not.toHaveBeenCalled();
  });

  it("creates a valid draft with the backend DTO and selects the saved product", async () => {
    await openNewProduct();
    fillDraftProduct();
    fireEvent.click(screen.getByRole("button", { name: "Save Product" }));

    await waitFor(() => expect(mocks.saveProduct).toHaveBeenCalledTimes(1));
    expect(mocks.saveProduct).toHaveBeenCalledWith({
      name: "MyPetLink Pet Tag",
      slug: "mypetlink-pet-tag",
      shortDescription: "",
      description: "",
      isPublished: false,
      sortOrder: 0,
      media: [],
      concurrencyToken: undefined,
    }, undefined);
    await screen.findByText("MyPetLink Pet Tag saved.");
  });

  it("rejects publication without an eligible SKU before sending", async () => {
    await openNewProduct();
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
    await openNewProduct();
    fillDraftProduct("Duplicate name");
    fireEvent.click(screen.getByRole("button", { name: "Save Product" }));

    await screen.findByText("This product link is already in use.");
    expect((screen.getByLabelText("Product name") as HTMLInputElement).value).toBe("Duplicate name");
  });

  it("prevents duplicate submissions while the first save is pending", async () => {
    let resolveSave: ((value: AdminTagProduct) => void) | undefined;
    mocks.saveProduct.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve; }));
    await openNewProduct();
    fillDraftProduct();
    const save = screen.getByRole("button", { name: "Save Product" });
    fireEvent.click(save);
    fireEvent.click(save);

    expect(mocks.saveProduct).toHaveBeenCalledTimes(1);
    resolveSave?.({ ...productDetail, name: "MyPetLink Pet Tag", slug: "mypetlink-pet-tag", isPublished: false, variants: [] });
    await screen.findByText("MyPetLink Pet Tag saved.");
  });
});

describe("AdminTagProductsManager listing (shared table query)", () => {
  it("restores search, filter, and page from the URL and sends them server-side", async () => {
    navState.search = "q=milo&publication=published&page=3";
    render(<AdminTagProductsManager />);

    await waitFor(() =>
      expect(mocks.listProducts).toHaveBeenCalledWith(
        expect.objectContaining({ search: "milo", published: true, page: 3 })
      )
    );
  });

  it("paginates beyond the first 100 rows via server-side page state", async () => {
    mocks.listProducts.mockResolvedValue({ items: [listProduct], total: 150 });
    navState.search = "page=2";
    render(<AdminTagProductsManager />);

    await screen.findByText("MyPetLink Pet Tag");
    expect(mocks.listProducts).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    // Real total is surfaced, not capped at 100.
    expect(screen.getByText(/of 150/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(navState.search).toContain("page=3");
  });

  it("resets the page when a filter changes", async () => {
    mocks.listProducts.mockResolvedValue({ items: [listProduct], total: 150 });
    navState.search = "page=4";
    render(<AdminTagProductsManager />);
    await screen.findByText("MyPetLink Pet Tag");

    fireEvent.change(screen.getByLabelText("Publication"), { target: { value: "draft" } });

    expect(navState.search).toContain("publication=draft");
    expect(navState.search).not.toContain("page=4");
  });

  it("falls back safely for invalid URL sort, size, and filter values", async () => {
    navState.search = "sort=hacker&size=999&publication=bogus";
    render(<AdminTagProductsManager />);

    // Invalid sort falls back to the default, invalid size to 20, and the
    // out-of-allow-list publication value is dropped (undefined = no filter).
    await waitFor(() => expect(mocks.listProducts).toHaveBeenCalled());
    const params = mocks.listProducts.mock.calls[0][0];
    expect(params.sortBy).toBe("updated");
    expect(params.pageSize).toBe(20);
    expect(params.published).toBeUndefined();
  });

  it("does not leak product filters into the Promotions tab link", async () => {
    mocks.listProducts.mockResolvedValue({ items: [listProduct], total: 1 });
    navState.search = "publication=published&page=2&q=milo";
    render(<AdminTagProductsManager />);
    await screen.findByText("MyPetLink Pet Tag");

    // Switching tabs starts from a clean query, so promotions never inherits
    // product-only filters.
    expect(
      screen.getByRole("link", { name: "Promotions" }).getAttribute("href")
    ).toBe("/admin/tag-products?tab=promotions");
  });
});

describe("AdminTagProductsManager promotions", () => {
  it("loads an empty tab and explains the eligible-SKU prerequisite", async () => {
    mocks.listOptions.mockResolvedValue([]);
    navState.search = "tab=promotions";
    render(<AdminTagProductsManager />);

    await screen.findByText("No promotions created.");
    expect(screen.getByText("Create and publish an eligible product variant before adding a promotion.")).toBeDefined();
    expect((screen.getByRole("button", { name: "New Promotion" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("loads promotion SKU options through a single catalog-options request", async () => {
    navState.search = "tab=promotions";
    render(<AdminTagProductsManager />);
    await screen.findByRole("checkbox", { name: /MPL-QR-STANDARD-V1/ });

    // One options request; never a per-product detail fan-out.
    expect(mocks.listOptions).toHaveBeenCalledTimes(1);
    expect(mocks.getProduct).not.toHaveBeenCalled();
  });

  it("blocks invalid promotion values and submits the accepted DTO", async () => {
    navState.search = "tab=promotions";
    render(<AdminTagProductsManager />);
    await screen.findByText("No promotions created.");
    await screen.findByRole("checkbox", { name: /MPL-QR-STANDARD-V1/ });

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
    navState.search = "tab=promotions";
    render(<AdminTagProductsManager />);
    await screen.findByRole("checkbox", { name: /MPL-QR-STANDARD-V1/ });

    fireEvent.change(screen.getByLabelText("Promotion name"), { target: { value: "Preserved offer" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /MPL-QR-STANDARD-V1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Promotion" }));

    await screen.findByText("Percentage discount cannot exceed 100%.");
    expect((screen.getByLabelText("Promotion name") as HTMLInputElement).value).toBe("Preserved offer");
  });
});
