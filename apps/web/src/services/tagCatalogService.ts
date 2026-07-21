import { apiRequest } from "@/services/apiClient";

export type TagProductPrice = {
  basePrice: number;
  discountAmount: number;
  finalPrice: number;
  currency: string;
  promotionName?: string | null;
  promotionLabel?: string | null;
  promotionEndsAt?: string | null;
};

export type TagProductMedia = {
  url: string;
  altText: string;
  sortOrder: number;
};

export type TagProductVariant = {
  key: string;
  sku: string;
  name: string;
  supportsQr: boolean;
  supportsNfc: boolean;
  tagVariant: string;
  widthMm?: number | null;
  heightMm?: number | null;
  thicknessMm?: number | null;
  weightGrams?: number | null;
  material?: string | null;
  shape?: string | null;
  colour?: string | null;
  packagingType?: string | null;
  price: TagProductPrice;
  inStock: boolean;
  media: TagProductMedia[];
};

export type TagProduct = {
  slug: string;
  name: string;
  shortDescription?: string | null;
  description?: string | null;
  media: TagProductMedia[];
  variants: TagProductVariant[];
};

export type AdminTagProductListItem = {
  id: string;
  name: string;
  slug: string;
  isPublished: boolean;
  isArchived: boolean;
  variantCount: number;
  purchasableVariantCount: number;
  updatedAt: string;
  concurrencyToken: string;
};

export type AdminTagProductVariant = {
  id: string;
  productId: string;
  publicKey: string;
  sku: string;
  displayName: string;
  supportsQr: boolean;
  supportsNfc: boolean;
  tagVariantPresetId?: string | null;
  tagVariant: string;
  widthMm?: number | null;
  heightMm?: number | null;
  thicknessMm?: number | null;
  weightGrams?: number | null;
  material?: string | null;
  shape?: string | null;
  colour?: string | null;
  packagingType?: string | null;
  basePrice: number;
  currency: string;
  compareAtPrice?: number | null;
  printTemplateCode?: string | null;
  productionNotes?: string | null;
  isActive: boolean;
  isPurchasable: boolean;
  isArchived: boolean;
  productionFieldsLocked: boolean;
  inventoryCount: number;
  sortOrder: number;
  updatedAt: string;
  concurrencyToken: string;
};

export type AdminTagProduct = {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  isPublished: boolean;
  isArchived: boolean;
  sortOrder: number;
  media: {
    id: string;
    mediaFileId: string;
    productVariantId?: string | null;
    sortOrder: number;
    altText: string;
    url?: string | null;
  }[];
  variants: AdminTagProductVariant[];
  createdAt: string;
  updatedAt: string;
  concurrencyToken: string;
};

export type AdminProductInput = {
  name: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  isPublished: boolean;
  sortOrder: number;
  media: { mediaFileId: string; productVariantId?: string | null; sortOrder: number; altText: string }[];
  concurrencyToken?: string | null;
};

export type AdminVariantInput = {
  sku: string;
  displayName: string;
  supportsQr: boolean;
  supportsNfc: boolean;
  tagVariantPresetId?: string | null;
  widthMm?: number | null;
  heightMm?: number | null;
  thicknessMm?: number | null;
  weightGrams?: number | null;
  material?: string | null;
  shape?: string | null;
  colour?: string | null;
  packagingType?: string | null;
  basePrice: number;
  currency: string;
  compareAtPrice?: number | null;
  printTemplateCode?: string | null;
  productionNotes?: string | null;
  isActive: boolean;
  isPurchasable: boolean;
  sortOrder: number;
  concurrencyToken?: string | null;
};

export type AdminPromotion = {
  id: string;
  name: string;
  internalDescription?: string | null;
  displayLabel?: string | null;
  isActive: boolean;
  isAutomatic: boolean;
  discountType: "FixedAmount" | "Percentage";
  discountValue: number;
  startsAt: string;
  endsAt: string;
  priority: number;
  productVariantIds: string[];
  updatedAt: string;
  concurrencyToken: string;
};

export type AdminPromotionInput = Omit<
  AdminPromotion,
  "id" | "updatedAt" | "concurrencyToken"
> & {
  concurrencyToken?: string | null;
};

// Lightweight Product/SKU options for admin selectors. Loaded in one request
// (no per-product detail fetch) and shared by the Tag Inventory generation
// form and the Promotion picker.
export type AdminCatalogOptionVariant = {
  id: string;
  sku: string;
  displayName: string;
  supportsQr: boolean;
  supportsNfc: boolean;
  tagVariant: string;
  widthMm?: number | null;
  heightMm?: number | null;
  thicknessMm?: number | null;
  material?: string | null;
  printTemplateCode?: string | null;
  basePrice: number;
  currency: string;
  isActive: boolean;
  isPurchasable: boolean;
  inventoryCount: number;
};

export type AdminCatalogOptionProduct = {
  id: string;
  name: string;
  isPublished: boolean;
  variants: AdminCatalogOptionVariant[];
};

// Admin-configurable Tag Type (a reusable SKU classification) managed in
// Catalog Settings. Tag Types referenced by SKUs are deactivated, never deleted.
export type AdminTagVariantPreset = {
  id: string;
  code: string;
  displayName: string;
  description?: string | null;
  isActive: boolean;
  sortOrder: number;
  skuCount: number;
  updatedAt: string;
  concurrencyToken: string;
};

export type AdminTagVariantPresetInput = {
  code: string;
  displayName: string;
  description?: string | null;
  isActive: boolean;
  sortOrder: number;
  concurrencyToken?: string | null;
};

export async function listTagProducts(signal?: AbortSignal) {
  const response = await apiRequest<TagProduct[]>("/api/v1/tag-products", {
    auth: false,
    signal,
  });
  return response.data ?? [];
}

export type AdminTagProductFilters = {
  search?: string;
  published?: boolean;
  archived?: boolean;
  supportsQr?: boolean;
  supportsNfc?: boolean;
  purchasable?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: string;
};

export type AdminListPage<T> = { items: T[]; total: number };

// Server-paginated product listing. The caller passes the page/size from the
// shared table query; there is no client-side row cap.
export async function listAdminTagProducts(
  filters: AdminTagProductFilters = {},
  signal?: AbortSignal
): Promise<AdminListPage<AdminTagProductListItem>> {
  const query = new URLSearchParams({
    page: String(filters.page ?? 1),
    pageSize: String(filters.pageSize ?? 20),
  });
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  if (filters.published !== undefined) query.set("published", String(filters.published));
  if (filters.archived !== undefined) query.set("archived", String(filters.archived));
  if (filters.supportsQr !== undefined) query.set("supportsQr", String(filters.supportsQr));
  if (filters.supportsNfc !== undefined) query.set("supportsNfc", String(filters.supportsNfc));
  if (filters.purchasable !== undefined) query.set("purchasable", String(filters.purchasable));
  if (filters.sortBy) query.set("sortBy", filters.sortBy);
  if (filters.sortDir) query.set("sortDir", filters.sortDir);
  const response = await apiRequest<AdminTagProductListItem[]>(
    `/api/v1/admin/tag-products?${query.toString()}`,
    { signal }
  );
  return { items: response.data ?? [], total: response.meta?.total ?? response.data?.length ?? 0 };
}

export async function getAdminTagProduct(productId: string, signal?: AbortSignal) {
  const response = await apiRequest<AdminTagProduct>(
    `/api/v1/admin/tag-products/${encodeURIComponent(productId)}`,
    { signal }
  );
  if (!response.data) throw new Error("Product details are unavailable.");
  return response.data;
}

// One request returning every selectable product/SKU for admin selectors,
// replacing the old "list products, then fetch each product's detail" fan-out.
export async function listAdminTagCatalogOptions(signal?: AbortSignal) {
  const response = await apiRequest<AdminCatalogOptionProduct[]>(
    "/api/v1/admin/tag-products/options",
    { signal }
  );
  return response.data ?? [];
}

export async function saveAdminTagProduct(input: AdminProductInput, productId?: string) {
  const response = await apiRequest<AdminTagProduct>(
    productId
      ? `/api/v1/admin/tag-products/${encodeURIComponent(productId)}`
      : "/api/v1/admin/tag-products",
    { method: productId ? "PUT" : "POST", body: input }
  );
  if (!response.data) throw new Error("Product could not be saved.");
  return response.data;
}

export async function archiveAdminTagProduct(productId: string, concurrencyToken: string) {
  const response = await apiRequest<AdminTagProduct>(
    `/api/v1/admin/tag-products/${encodeURIComponent(productId)}/archive`,
    { method: "POST", body: { concurrencyToken } }
  );
  if (!response.data) throw new Error("Product could not be archived.");
  return response.data;
}

export async function saveAdminTagProductVariant(
  productId: string,
  input: AdminVariantInput,
  variantId?: string
) {
  const response = await apiRequest<AdminTagProductVariant>(
    variantId
      ? `/api/v1/admin/tag-products/variants/${encodeURIComponent(variantId)}`
      : `/api/v1/admin/tag-products/${encodeURIComponent(productId)}/variants`,
    { method: variantId ? "PUT" : "POST", body: input }
  );
  if (!response.data) throw new Error("SKU could not be saved.");
  return response.data;
}

export async function archiveAdminTagProductVariant(variantId: string, concurrencyToken: string) {
  const response = await apiRequest<AdminTagProductVariant>(
    `/api/v1/admin/tag-products/variants/${encodeURIComponent(variantId)}/archive`,
    { method: "POST", body: { concurrencyToken } }
  );
  if (!response.data) throw new Error("SKU could not be archived.");
  return response.data;
}

export type AdminPromotionFilters = {
  search?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
};

export async function listAdminPromotions(
  filters: AdminPromotionFilters = {}
): Promise<AdminListPage<AdminPromotion>> {
  const query = new URLSearchParams({
    page: String(filters.page ?? 1),
    pageSize: String(filters.pageSize ?? 20),
  });
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  if (filters.active !== undefined) query.set("active", String(filters.active));
  const response = await apiRequest<AdminPromotion[]>(
    `/api/v1/admin/promotions?${query.toString()}`
  );
  return { items: response.data ?? [], total: response.meta?.total ?? response.data?.length ?? 0 };
}

export async function saveAdminPromotion(input: AdminPromotionInput, promotionId?: string) {
  const response = await apiRequest<AdminPromotion>(
    promotionId
      ? `/api/v1/admin/promotions/${encodeURIComponent(promotionId)}`
      : "/api/v1/admin/promotions",
    { method: promotionId ? "PUT" : "POST", body: input }
  );
  if (!response.data) throw new Error("Promotion could not be saved.");
  return response.data;
}

export async function listAdminTagVariantPresets() {
  const response = await apiRequest<AdminTagVariantPreset[]>(
    "/api/v1/admin/tag-products/variant-presets"
  );
  return response.data ?? [];
}

export async function saveAdminTagVariantPreset(
  input: AdminTagVariantPresetInput,
  presetId?: string
) {
  const response = await apiRequest<AdminTagVariantPreset>(
    presetId
      ? `/api/v1/admin/tag-products/variant-presets/${encodeURIComponent(presetId)}`
      : "/api/v1/admin/tag-products/variant-presets",
    { method: presetId ? "PUT" : "POST", body: input }
  );
  if (!response.data) throw new Error("Tag Type could not be saved.");
  return response.data;
}

export function formatCatalogPrice(amount: number, currency = "MYR") {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}
