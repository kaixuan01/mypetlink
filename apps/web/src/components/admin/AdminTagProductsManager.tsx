"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminActionButton, AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { AdminListPagination } from "@/components/admin/table/AdminListPagination";
import { AdminSearchInput } from "@/components/admin/table/AdminSearchInput";
import { useAdminTableQuery } from "@/components/admin/table/useAdminTableQuery";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isAbortError, isApiClientError } from "@/services/apiClient";
import { uploadMediaFile } from "@/services/mediaService";
import {
  archiveAdminTagProduct,
  archiveAdminTagProductVariant,
  formatCatalogPrice,
  getAdminTagProduct,
  listAdminPromotions,
  listAdminTagCatalogOptions,
  listAdminTagProducts,
  listAdminTagVariantPresets,
  saveAdminPromotion,
  saveAdminTagProduct,
  saveAdminTagProductVariant,
  saveAdminTagVariantPreset,
  type AdminCatalogOptionProduct,
  type AdminCatalogOptionVariant,
  type AdminProductInput,
  type AdminPromotion,
  type AdminPromotionInput,
  type AdminTagProduct,
  type AdminTagProductListItem,
  type AdminTagProductVariant,
  type AdminTagVariantPreset,
  type AdminTagVariantPresetInput,
  type AdminVariantInput,
} from "@/services/tagCatalogService";

type CatalogTab = "products" | "promotions" | "settings";
type FieldErrors = Record<string, string>;
type CatalogEditorMode =
  | { kind: "none" }
  | { kind: "create-product" }
  | { kind: "edit-product"; productId: string }
  | { kind: "create-sku"; productId: string }
  | { kind: "edit-sku"; productId: string; skuId: string };

function catalogEditorMode(
  tab: CatalogTab,
  productId: string | null,
  skuId: string | null
): CatalogEditorMode {
  if (tab !== "products" || !productId) return { kind: "none" };
  if (productId === "new") return { kind: "create-product" };
  if (skuId === "new") return { kind: "create-sku", productId };
  if (skuId) return { kind: "edit-sku", productId, skuId };
  return { kind: "edit-product", productId };
}

const catalogTabs: { id: CatalogTab; label: string }[] = [
  { id: "products", label: "Products & SKUs" },
  { id: "promotions", label: "Promotions" },
  { id: "settings", label: "Catalog Settings" },
];

// URL-backed list filters shared by the Products and Promotions tabs. Absent
// values mean "no filter" except `archive`, whose absence means active-only.
// `promoStatus` only applies on the Promotions tab; switching tabs resets all
// list params (the tab links navigate to a clean ?tab=…), so no state leaks.
const CATALOG_FILTER_KEYS = [
  "publication",
  "archive",
  "capability",
  "purchasable",
  "promoStatus",
] as const;

const CATALOG_FILTER_VALUES: Record<string, readonly string[]> = {
  publication: ["published", "draft"],
  archive: ["archived", "all"],
  capability: ["qr", "nfc"],
  purchasable: ["yes", "no"],
  promoStatus: ["enabled", "disabled"],
};

function catalogTabHref(
  pathname: string,
  current: Pick<URLSearchParams, "toString">,
  nextTab: CatalogTab
) {
  const params = new URLSearchParams(current.toString());
  params.set("tab", nextTab);
  params.delete("product");
  params.delete("sku");
  params.delete("page");

  if (nextTab !== "products") {
    for (const key of ["publication", "archive", "capability", "purchasable"]) {
      params.delete(key);
    }
    params.delete("sort");
    params.delete("dir");
  }
  if (nextTab !== "promotions") params.delete("promoStatus");
  if (nextTab === "settings") {
    params.delete("q");
    params.delete("size");
  }

  return `${pathname}?${params.toString()}`;
}

const fieldClass =
  "min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400";
const textAreaClass = `${fieldClass} min-h-24 py-2`;

const productFieldIds = {
  name: "tag-product-name",
  slug: "tag-product-slug",
  shortDescription: "tag-product-short-description",
  sortOrder: "tag-product-sort-order",
  isPublished: "tag-product-published",
  media: "tag-product-media",
} as const;

const promotionFieldIds = {
  name: "promotion-name",
  discountType: "promotion-discount-type",
  discountValue: "promotion-discount-value",
  priority: "promotion-priority",
  startsAt: "promotion-starts-at",
  endsAt: "promotion-ends-at",
  productVariantIds: "promotion-product-variant-ids",
} as const;

const blankProduct: AdminProductInput = {
  name: "",
  slug: "",
  shortDescription: "",
  description: "",
  isPublished: false,
  sortOrder: 0,
  media: [],
};

const blankVariant: AdminVariantInput = {
  sku: "",
  displayName: "",
  supportsQr: true,
  supportsNfc: false,
  tagVariantPresetId: null,
  widthMm: null,
  heightMm: null,
  thicknessMm: null,
  weightGrams: null,
  material: "",
  shape: "",
  colour: "",
  packagingType: "",
  basePrice: 0,
  currency: "MYR",
  compareAtPrice: null,
  printTemplateCode: "",
  productionNotes: "",
  isActive: true,
  isPurchasable: false,
  sortOrder: 0,
};

const blankPromotion: AdminPromotionInput = {
  name: "",
  internalDescription: "",
  displayLabel: "",
  isActive: false,
  isAutomatic: true,
  discountType: "Percentage",
  discountValue: 10,
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  priority: 0,
  productVariantIds: [],
  concurrencyToken: null,
};

const blankPreset: AdminTagVariantPresetInput = {
  code: "",
  displayName: "",
  description: "",
  isActive: true,
  sortOrder: 0,
};

// Tag Products workspace. The tab, the open product, and the open SKU editor
// all live in the URL (?tab=&product=&sku=) so the sidebar can deep-link to a
// tab, browser Back walks the mobile master/detail flow, and refresh restores
// the same screen. On narrow screens only one context renders at a time:
// product list -> product detail -> SKU editor.
export function AdminTagProductsManager() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const tab: CatalogTab =
    tabParam === "promotions" || tabParam === "settings" ? tabParam : "products";
  const productParam = searchParams.get("product");
  const skuParam = searchParams.get("sku");
  const editorMode = catalogEditorMode(tab, productParam, skuParam);

  const [products, setProducts] = useState<AdminTagProductListItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<AdminTagProduct | null>(null);
  const [productForm, setProductForm] = useState<AdminProductInput>(blankProduct);
  const [productBaseline, setProductBaseline] = useState(() => JSON.stringify(blankProduct));
  const [variantForm, setVariantForm] = useState<AdminVariantInput>(blankVariant);
  const [variantBaseline, setVariantBaseline] = useState(() => JSON.stringify(blankVariant));
  const [presets, setPresets] = useState<AdminTagVariantPreset[]>([]);
  const [presetForm, setPresetForm] = useState<AdminTagVariantPresetInput>(blankPreset);
  const [selectedPresetId, setSelectedPresetId] = useState<string>();
  const [productsTotal, setProductsTotal] = useState(0);
  const [promotionsTotal, setPromotionsTotal] = useState(0);
  const [productsLoading, setProductsLoading] = useState(true);
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [productLoadError, setProductLoadError] = useState("");
  const [productDetailError, setProductDetailError] = useState<{ productId: string; message: string } | null>(null);
  const [productDetailRetry, setProductDetailRetry] = useState(0);
  const [promotionLoadError, setPromotionLoadError] = useState("");
  const [productFormError, setProductFormError] = useState("");
  const [variantFormError, setVariantFormError] = useState("");
  const [presetFormError, setPresetFormError] = useState("");
  const [promotionFormError, setPromotionFormError] = useState("");
  const [productFieldErrors, setProductFieldErrors] = useState<FieldErrors>({});
  const [promotionFieldErrors, setPromotionFieldErrors] = useState<FieldErrors>({});
  const [promotions, setPromotions] = useState<AdminPromotion[]>([]);
  const [promotionForm, setPromotionForm] = useState<AdminPromotionInput>(blankPromotion);
  const [selectedPromotionId, setSelectedPromotionId] = useState<string>();
  const [catalogOptions, setCatalogOptions] = useState<AdminCatalogOptionProduct[]>([]);
  const [pendingArchive, setPendingArchive] = useState<"product" | "sku" | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const submitLock = useRef(false);
  const productListRequest = useRef(0);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);

  const productDirty = JSON.stringify(productForm) !== productBaseline;
  const variantDirty = JSON.stringify(variantForm) !== variantBaseline;

  // Shared admin listing state (search / filters / page / sort) lives in the
  // URL alongside the master/detail keys (tab / product / sku). The hook's
  // navigation preserves every other param, so paginating or filtering never
  // loses the open product, and opening a product never loses the list state.
  const { query, actions } = useAdminTableQuery({
    filterKeys: CATALOG_FILTER_KEYS,
    defaultSortBy: "updated",
    defaultSortDir: "desc",
    allowedSortIds: ["updated", "name"],
    allowedFilterValues: CATALOG_FILTER_VALUES,
  });

  // Master/detail navigation. setExtraParams keeps the current tab and list
  // state; opening a record pushes one history entry, closing/switching
  // replaces it (no stale detail IDs, minimal Back steps).
  const navigate = useCallback(
    (next: { product?: string | null; sku?: string | null }) => {
      const updates: Record<string, string | null> = {};
      if (next.product !== undefined) updates.product = next.product;
      if (next.sku !== undefined) updates.sku = next.sku;
      const opening = next.product != null && !productParam;
      actions.setExtraParams(updates, opening ? "push" : "replace");
    },
    [actions, productParam]
  );

  // Internal master/detail and tab changes use one visible guard. The action is
  // retained until the admin explicitly keeps, saves, or discards the edits;
  // a click is never silently swallowed.
  const requestNavigation = useCallback((action: () => void) => {
    if (!productDirty && !variantDirty) {
      action();
      return;
    }
    setPendingNavigation(() => action);
  }, [productDirty, variantDirty]);

  const focusDetailPanel = useCallback(() => {
    const panel = detailPanelRef.current;
    if (!panel) return;
    panel.focus({ preventScroll: true });
    panel.scrollIntoView({ block: "start", behavior: "auto" });
  }, []);

  useEffect(() => {
    if (tab !== "products" || !productParam) return undefined;
    const timer = window.setTimeout(focusDetailPanel, 0);
    return () => window.clearTimeout(timer);
  }, [focusDetailPanel, productParam, skuParam, tab]);

  const retryProductDetail = useCallback(() => {
    setProductDetailError(null);
    setProductDetailRetry((value) => value + 1);
  }, []);

  function openNewProduct() {
    if (productParam === "new" && !skuParam) {
      focusDetailPanel();
      return;
    }
    requestNavigation(() => {
      setActionError("");
      setMessage("");
      navigate({ product: "new", sku: null });
    });
  }

  function openProduct(productId: string) {
    if (productParam === productId && !skuParam) {
      if (productDetailError?.productId === productId) retryProductDetail();
      focusDetailPanel();
      return;
    }
    requestNavigation(() => {
      setActionError("");
      setMessage("");
      navigate({ product: productId, sku: null });
    });
  }

  // Map the URL filter values to the list request. Absent `archive` means
  // active-only; every other absent filter means "no filter".
  const productListParams = useMemo(() => {
    const filters = query.filters;
    return {
      search: query.search || undefined,
      published:
        filters.publication === undefined ? undefined : filters.publication === "published",
      archived:
        filters.archive === "all" ? undefined : filters.archive === "archived",
      supportsQr: filters.capability === "qr" ? true : undefined,
      supportsNfc: filters.capability === "nfc" ? true : undefined,
      purchasable:
        filters.purchasable === undefined ? undefined : filters.purchasable === "yes",
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    };
  }, [query]);
  const productListKey = JSON.stringify(productListParams);

  const refreshProducts = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++productListRequest.current;
    setProductsLoading(true);
    setProductLoadError("");
    try {
      const result = await listAdminTagProducts(JSON.parse(productListKey), signal);
      if (signal?.aborted || requestId !== productListRequest.current) return;
      setProducts(result.items);
      setProductsTotal(result.total);
      setProductLoadError("");
    } catch (caught) {
      if (signal?.aborted || isAbortError(caught) || requestId !== productListRequest.current) return;
      setProductLoadError(loadError(caught, "Tag Products"));
    } finally {
      if (!signal?.aborted && requestId === productListRequest.current) {
        setProductsLoading(false);
      }
    }
  }, [productListKey]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refreshProducts(controller.signal), 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [refreshProducts]);

  const refreshPresets = useCallback(async () => {
    try {
      setPresets(await listAdminTagVariantPresets());
    } catch (caught) {
      setActionError(loadError(caught, "Tag Types"));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshPresets(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshPresets]);

  // The open product follows the URL (deep link, refresh, Back button).
  // Leaving/creating resets the form during render — the sanctioned
  // derived-state pattern — while fetching an opened product stays async.
  const [productScope, setProductScope] = useState(productParam ?? "");
  if ((productParam ?? "") !== productScope) {
    setProductScope(productParam ?? "");
    setSelectedProduct(null);
    setProductDetailError(null);
    if (!productParam || productParam === "new") {
      setProductForm(blankProduct);
      setProductBaseline(JSON.stringify(blankProduct));
    }
  }

  useEffect(() => {
    if (!productParam || productParam === "new") return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      getAdminTagProduct(productParam, controller.signal)
        .then((detail) => {
          if (controller.signal.aborted) return;
          setSelectedProduct(detail);
          setProductDetailError(null);
          const input = productInput(detail);
          setProductForm(input);
          setProductBaseline(JSON.stringify(input));
        })
        .catch((caught) => {
          if (controller.signal.aborted || isAbortError(caught)) return;
          setProductDetailError({
            productId: productParam,
            message: loadError(caught, "this product"),
          });
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [productParam, productDetailRetry]);

  // The SKU editor follows the URL and the loaded product (render-phase sync).
  const variantScopeTarget = `${skuParam ?? ""}|${selectedProduct?.id ?? ""}`;
  const [variantScope, setVariantScope] = useState(variantScopeTarget);
  if (variantScope !== variantScopeTarget) {
    setVariantScope(variantScopeTarget);
    const variant =
      skuParam && skuParam !== "new"
        ? selectedProduct?.variants.find((item) => item.id === skuParam)
        : undefined;
    const input = variant ? variantInput(variant) : blankVariant;
    setVariantForm(input);
    setVariantBaseline(JSON.stringify(input));
  }

  const promotionListParams = useMemo(
    () => ({
      search: query.search || undefined,
      active:
        query.filters.promoStatus === undefined
          ? undefined
          : query.filters.promoStatus === "enabled",
      page: query.page,
      pageSize: query.pageSize,
    }),
    [query]
  );
  const promotionListKey = JSON.stringify(promotionListParams);

  const openPromotions = useCallback(async () => {
    setPromotionsLoading(true);
    setPromotionLoadError("");
    try {
      // Both requests are flat: the paginated promotion list and one
      // catalog-options call — no per-product detail fan-out.
      const [promotionResult, options] = await Promise.all([
        listAdminPromotions(JSON.parse(promotionListKey)),
        listAdminTagCatalogOptions(),
      ]);
      setPromotions(promotionResult.items);
      setPromotionsTotal(promotionResult.total);
      setCatalogOptions(options);
      setPromotionLoadError("");
    } catch (caught) {
      setPromotionLoadError(loadError(caught, "Promotions"));
    } finally {
      setPromotionsLoading(false);
    }
  }, [promotionListKey]);

  useEffect(() => {
    if (tab !== "promotions") return undefined;
    const timer = window.setTimeout(() => void openPromotions(), 0);
    return () => window.clearTimeout(timer);
  }, [tab, openPromotions]);

  async function submitProduct({ navigateAfterSave = true } = {}) {
    if (busy || submitLock.current) return false;
    const validationErrors = validateProductForm(productForm, selectedProduct);
    if (Object.keys(validationErrors).length > 0) {
      setProductFieldErrors(validationErrors);
      setProductFormError("");
      focusFirstInvalidField(validationErrors, productFieldIds);
      return false;
    }

    submitLock.current = true;
    setBusy(true);
    setActionError("");
    setProductFormError("");
    setProductFieldErrors({});
    try {
      const saved = await saveAdminTagProduct(
        { ...productForm, concurrencyToken: selectedProduct?.concurrencyToken },
        selectedProduct?.id
      );
      setSelectedProduct(saved);
      const input = productInput(saved);
      setProductForm(input);
      setProductBaseline(JSON.stringify(input));
      setMessage(`${saved.name} saved.`);
      await refreshProducts();
      if (productParam === "new" && navigateAfterSave) navigate({ product: saved.id });
      return true;
    } catch (caught) {
      const fieldErrors = apiFieldErrors(caught, Object.keys(productFieldIds));
      if (Object.keys(fieldErrors).length > 0) {
        setProductFieldErrors(fieldErrors);
        focusFirstInvalidField(fieldErrors, productFieldIds);
      } else {
        setProductFormError(saveError(caught, "product"));
      }
      return false;
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }

  async function uploadProductImage(file: File) {
    const imageError = validateProductImage(file);
    if (imageError) {
      setProductFieldErrors({ media: imageError });
      setProductFormError("");
      focusFirstInvalidField({ media: imageError }, productFieldIds);
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      const uploaded = await uploadMediaFile({ file, category: "TagProductImage" });
      setProductForm((current) => ({
        ...current,
        media: [
          ...current.media,
          {
            mediaFileId: uploaded.mediaId,
            altText: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
            sortOrder: current.media.length,
          },
        ],
      }));
      setMessage("Product image uploaded. Save the product to publish this change.");
    } catch (caught) {
      setProductFormError(saveError(caught, "product image"));
    } finally {
      setBusy(false);
    }
  }

  async function archiveProduct() {
    if (!selectedProduct || busy || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setActionError("");
    try {
      const saved = await archiveAdminTagProduct(
        selectedProduct.id,
        selectedProduct.concurrencyToken
      );
      setSelectedProduct(saved);
      const input = productInput(saved);
      setProductForm(input);
      setProductBaseline(JSON.stringify(input));
      setMessage(`${saved.name} archived.`);
      await refreshProducts();
    } catch (caught) {
      setActionError(friendlyError(caught));
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }

  async function submitVariant({ navigateAfterSave = true } = {}) {
    if (!selectedProduct || busy || submitLock.current) return false;
    submitLock.current = true;
    setBusy(true);
    setActionError("");
    setVariantFormError("");
    try {
      const editingId = skuParam && skuParam !== "new" ? skuParam : undefined;
      await saveAdminTagProductVariant(
        selectedProduct.id,
        { ...variantForm, concurrencyToken: editingId ? variantForm.concurrencyToken : null },
        editingId
      );
      const detail = await getAdminTagProduct(selectedProduct.id);
      setSelectedProduct(detail);
      setMessage(`SKU ${variantForm.sku.toUpperCase()} saved.`);
      setVariantBaseline(JSON.stringify(variantForm));
      if (navigateAfterSave) navigate({ sku: null });
      return true;
    } catch (caught) {
      setVariantFormError(saveError(caught, "SKU"));
      return false;
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }

  async function saveBeforeNavigation() {
    const action = pendingNavigation;
    if (!action) return;
    setPendingNavigation(null);

    const saved = variantDirty
      ? await submitVariant({ navigateAfterSave: false })
      : productDirty
        ? await submitProduct({ navigateAfterSave: false })
        : true;

    if (saved) action();
  }

  async function archiveVariant() {
    if (!selectedProduct || !skuParam || skuParam === "new" || !variantForm.concurrencyToken) return;
    if (busy || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    try {
      await archiveAdminTagProductVariant(skuParam, variantForm.concurrencyToken);
      const detail = await getAdminTagProduct(selectedProduct.id);
      setSelectedProduct(detail);
      setMessage("SKU archived. Existing inventory and orders remain unchanged.");
      setVariantBaseline(JSON.stringify(variantForm));
      navigate({ sku: null });
    } catch (caught) {
      setActionError(friendlyError(caught));
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }

  function editPromotion(promotion: AdminPromotion) {
    setSelectedPromotionId(promotion.id);
    setPromotionForm({ ...promotion });
    setMessage("");
    setPromotionFormError("");
    setPromotionFieldErrors({});
  }

  async function submitPromotion() {
    if (busy || submitLock.current) return;
    const eligibleIds = new Set(
      catalogOptions.flatMap((product) =>
        product.variants
          .filter((variant) =>
            // Catalog options already exclude archived products and variants.
            product.isPublished &&
            variant.isActive &&
            variant.isPurchasable
          )
          .map((variant) => variant.id)
      )
    );
    const validationErrors = validatePromotionForm(promotionForm, eligibleIds);
    if (Object.keys(validationErrors).length > 0) {
      setPromotionFieldErrors(validationErrors);
      setPromotionFormError("");
      focusFirstInvalidField(validationErrors, promotionFieldIds);
      return;
    }

    submitLock.current = true;
    setBusy(true);
    setActionError("");
    setPromotionFormError("");
    setPromotionFieldErrors({});
    try {
      const saved = await saveAdminPromotion(promotionForm, selectedPromotionId);
      const refreshed = await listAdminPromotions(JSON.parse(promotionListKey));
      setPromotions(refreshed.items);
      setPromotionsTotal(refreshed.total);
      setSelectedPromotionId(saved.id);
      setPromotionForm({ ...saved });
      setMessage(`${saved.name} saved. Base prices were not changed.`);
    } catch (caught) {
      const fieldErrors = apiFieldErrors(caught, Object.keys(promotionFieldIds));
      if (Object.keys(fieldErrors).length > 0) {
        setPromotionFieldErrors(fieldErrors);
        focusFirstInvalidField(fieldErrors, promotionFieldIds);
      } else {
        setPromotionFormError(saveError(caught, "promotion"));
      }
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }

  async function submitPreset() {
    if (busy || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setPresetFormError("");
    try {
      const saved = await saveAdminTagVariantPreset(presetForm, selectedPresetId);
      await refreshPresets();
      setSelectedPresetId(saved.id);
      setPresetForm(presetInput(saved));
      setMessage(`Tag Type ${saved.displayName} saved.`);
    } catch (caught) {
      setPresetFormError(saveError(caught, "Tag Type"));
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }

  const promotionVariants = useMemo(
    () =>
      catalogOptions.flatMap((product) =>
        product.variants.map((variant) => ({
          ...variant,
          productName: product.name,
          productPublished: product.isPublished,
        }))
      ),
    [catalogOptions]
  );

  const showingProductDetail = editorMode.kind !== "none";
  const showingSkuEditor = editorMode.kind === "create-sku" || editorMode.kind === "edit-sku";
  const editingVariant =
    skuParam && skuParam !== "new"
      ? selectedProduct?.variants.find((item) => item.id === skuParam)
      : undefined;
  // A creatable ("new") or resolved SKU can open the editor. Anything else
  // (an unknown, archived, or replaced id in the URL) must not.
  const skuResolved = skuParam === "new" || Boolean(editingVariant);
  // Only trust "not found" once the matching product has actually loaded —
  // during the async product fetch the variant list is not available yet.
  const productLoaded = Boolean(selectedProduct) && selectedProduct?.id === productParam;
  const skuMissing = showingSkuEditor && productLoaded && !skuResolved;
  const currentProductDetailError =
    productParam && productDetailError?.productId === productParam
      ? productDetailError.message
      : "";

  // Fail safe: a stale/archived/invalid SKU id in the URL (deep link, bookmark,
  // Back button, or a SKU archived or replaced in another tab) returns the
  // admin to the product with a clear notice instead of a blank editor. The
  // redirect is deferred (matching the other effects here) so state updates
  // never run synchronously inside the effect body.
  useEffect(() => {
    if (!skuMissing) return undefined;
    const timer = window.setTimeout(() => {
      setActionError("That SKU is no longer available. It may have been archived or replaced. Returning you to the product.");
      navigate({ sku: null });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [skuMissing, navigate]);

  return (
    <div className="grid gap-4">
      <nav aria-label="Tag product sections" className="flex flex-wrap gap-2">
        {catalogTabs.map((item) => (
          <Link
            aria-current={tab === item.id ? "page" : undefined}
            className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-extrabold ${
              tab === item.id
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            href={catalogTabHref(pathname, searchParams, item.id)}
            key={item.id}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              const href = event.currentTarget.getAttribute("href");
              if (!href) return;
              requestNavigation(() => {
                if (`${window.location.pathname}${window.location.search}` !== href) {
                  window.history.pushState(null, "", href);
                }
              });
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {message ? <AdminNotice>{message}</AdminNotice> : null}
      {actionError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800" role="alert">
          {actionError}
        </div>
      ) : null}

      {tab === "products" ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.6fr)]">
          {/* Product list: on narrow screens it steps aside once a product or
              SKU context is open; on xl+ it stays as the master column. */}
          <div className={showingProductDetail ? "hidden min-w-0 xl:block" : "min-w-0"} data-testid="product-list-panel">
            <AdminSection
              title="Products"
              description="A product is the customer-facing item shown in the Owner Portal. Sizes, capabilities, materials, and prices live on its SKUs."
              action={
                <AdminActionButton
                  onClick={openNewProduct}
                  tone="primary"
                >
                  New Product
                </AdminActionButton>
              }
            >
              <div className="grid gap-3 border-b border-slate-100 p-4">
                <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">
                  Search product or SKU
                  <AdminSearchInput onChange={actions.setSearch} placeholder="Name or SKU" value={query.search} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <FilterSelect
                    label="Publication"
                    value={query.filters.publication ?? "all"}
                    onChange={(value) => actions.setFilter("publication", value === "all" ? null : value)}
                    options={[["all", "All"], ["published", "Published"], ["draft", "Draft"]]}
                  />
                  <FilterSelect
                    label="Archive"
                    value={query.filters.archive ?? "active"}
                    onChange={(value) => actions.setFilter("archive", value === "active" ? null : value)}
                    options={[["active", "Active"], ["archived", "Archived"], ["all", "All"]]}
                  />
                  <FilterSelect
                    label="Capability"
                    value={query.filters.capability ?? "all"}
                    onChange={(value) => actions.setFilter("capability", value === "all" ? null : value)}
                    options={[["all", "All"], ["qr", "QR"], ["nfc", "NFC"]]}
                  />
                  <FilterSelect
                    label="Purchasable"
                    value={query.filters.purchasable ?? "all"}
                    onChange={(value) => actions.setFilter("purchasable", value === "all" ? null : value)}
                    options={[["all", "All"], ["yes", "Yes"], ["no", "No"]]}
                  />
                </div>
              </div>
              <div className="max-h-[38rem] overflow-y-auto p-2">
                {productsLoading ? <StatusLine>Loading tag products...</StatusLine> : null}
                {!productsLoading && productLoadError ? (
                  <LoadFailure message={productLoadError} onRetry={() => void refreshProducts()} />
                ) : null}
                {!productsLoading && !productLoadError && products.length === 0 ? (
                  <StatusLine>No tag products found.</StatusLine>
                ) : null}
                {!productLoadError ? products.map((product) => (
                  <button
                    className={`mb-2 w-full rounded-xl border p-3 text-left transition ${productParam === product.id ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:bg-slate-50"}`}
                    key={product.id}
                    onClick={() => openProduct(product.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-black text-slate-950">{product.name}</span>
                      <Badge tone={product.isArchived ? "soft" : product.isPublished ? "mint" : "warm"}>
                        {product.isArchived ? "Archived" : product.isPublished ? "Published" : "Draft"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {product.variantCount} SKU{product.variantCount === 1 ? "" : "s"} · {product.purchasableVariantCount} purchasable
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Updated {formatDate(product.updatedAt)}</p>
                  </button>
                )) : null}
              </div>
              <AdminListPagination
                loading={productsLoading}
                onPageChange={actions.setPage}
                onPageSizeChange={actions.setPageSize}
                page={query.page}
                pageSize={query.pageSize}
                total={productsTotal}
              />
            </AdminSection>
          </div>

          <div
            aria-label="Product editor"
            className="grid min-w-0 scroll-mt-20 content-start gap-4 outline-none"
            data-testid="product-detail-panel"
            ref={detailPanelRef}
            tabIndex={-1}
          >
            {!showingProductDetail ? (
              <div className="hidden rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500 xl:block">
                Select a product to edit it, or create a new product.
              </div>
            ) : null}

            {showingProductDetail && !showingSkuEditor ? (
              <>
                <BackBar
                  label="All products"
                  onBack={() => {
                    requestNavigation(() => navigate({ product: null, sku: null }));
                  }}
                />
                {productParam === "new" ? (
                  <ProductEditor
                    busy={busy}
                    errors={productFieldErrors}
                    form={productForm}
                    formError={productFormError}
                    isNew
                    onArchive={() => setPendingArchive("product")}
                    onChange={(value) => {
                      setProductForm(value);
                      setProductFieldErrors({});
                      setProductFormError("");
                    }}
                    onImageUpload={(file) => void uploadProductImage(file)}
                    onSave={() => void submitProduct()}
                    product={null}
                  />
                ) : currentProductDetailError ? (
                  <LoadFailure message={currentProductDetailError} onRetry={retryProductDetail} />
                ) : selectedProduct ? (
                  <>
                    <ProductEditor
                      busy={busy}
                      errors={productFieldErrors}
                      form={productForm}
                      formError={productFormError}
                      isNew={false}
                      onArchive={() => setPendingArchive("product")}
                      onChange={(value) => {
                        setProductForm(value);
                        setProductFieldErrors({});
                        setProductFormError("");
                      }}
                      onImageUpload={(file) => void uploadProductImage(file)}
                      onSave={() => void submitProduct()}
                      product={selectedProduct}
                    />
                    <SkuListSection
                      onAddSku={() => {
                        requestNavigation(() => navigate({ sku: "new" }));
                      }}
                      onOpenSku={(variantId) => {
                        requestNavigation(() => navigate({ sku: variantId }));
                      }}
                      product={selectedProduct}
                    />
                  </>
                ) : (
                  <EditorStatus>Opening product...</EditorStatus>
                )}
              </>
            ) : null}

            {showingSkuEditor && selectedProduct && skuResolved ? (
              <>
                <BackBar
                  label={selectedProduct.name}
                  onBack={() => {
                    requestNavigation(() => navigate({ sku: null }));
                  }}
                />
                <VariantEditor
                  busy={busy}
                  editing={editingVariant}
                  form={variantForm}
                  formError={variantFormError}
                  isNew={skuParam === "new"}
                  onArchive={() => setPendingArchive("sku")}
                  onChange={(value) => {
                    setVariantForm(value);
                    setVariantFormError("");
                  }}
                  onSave={() => void submitVariant()}
                  presets={presets}
                  product={selectedProduct}
                  settingsHref={catalogTabHref(pathname, searchParams, "settings")}
                />
              </>
            ) : showingSkuEditor && currentProductDetailError ? (
              <>
                <BackBar
                  label="All products"
                  onBack={() => navigate({ product: null, sku: null })}
                />
                <LoadFailure message={currentProductDetailError} onRetry={retryProductDetail} />
              </>
            ) : showingSkuEditor && !skuResolved ? (
              // The product/SKU is still loading, or an invalid id is being
              // redirected away — never a blank editable form.
              <EditorStatus>Opening SKU...</EditorStatus>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "promotions" ? (
        <PromotionsEditor
          busy={busy}
          errors={promotionFieldErrors}
          form={promotionForm}
          formError={promotionFormError}
          loadError={promotionLoadError}
          loading={promotionsLoading}
          onChange={(value) => {
            setPromotionForm(value);
            setPromotionFieldErrors({});
            setPromotionFormError("");
          }}
          onEdit={editPromotion}
          onNew={() => {
            setSelectedPromotionId(undefined);
            setPromotionForm(blankPromotion);
            setPromotionFieldErrors({});
            setPromotionFormError("");
          }}
          onRetry={() => void openPromotions()}
          onSave={() => void submitPromotion()}
          onSearch={actions.setSearch}
          onStatusFilterChange={(value) => actions.setFilter("promoStatus", value === "all" ? null : value)}
          onPageChange={actions.setPage}
          onPageSizeChange={actions.setPageSize}
          page={query.page}
          pageSize={query.pageSize}
          promotions={promotions}
          search={query.search}
          selectedId={selectedPromotionId}
          statusFilter={query.filters.promoStatus ?? "all"}
          total={promotionsTotal}
          variants={promotionVariants}
        />
      ) : null}

      {tab === "settings" ? (
        <VariantPresetsSettings
          busy={busy}
          form={presetForm}
          formError={presetFormError}
          onChange={(value) => {
            setPresetForm(value);
            setPresetFormError("");
          }}
          onEdit={(preset) => {
            setSelectedPresetId(preset.id);
            setPresetForm(presetInput(preset));
            setPresetFormError("");
            setMessage("");
          }}
          onNew={() => {
            setSelectedPresetId(undefined);
            setPresetForm(blankPreset);
            setPresetFormError("");
          }}
          onSave={() => void submitPreset()}
          presets={presets}
          selectedId={selectedPresetId}
        />
      ) : null}

      <ConfirmDialog
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        message="You have unsaved changes on this screen. Save them before continuing, discard them, or keep editing."
        onCancel={() => setPendingNavigation(null)}
        onConfirm={() => {
          const action = pendingNavigation;
          setPendingNavigation(null);
          action?.();
        }}
        open={pendingNavigation !== null}
        title="Leave this editor?"
      >
        <button
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy}
          onClick={() => void saveBeforeNavigation()}
          type="button"
        >
          {busy ? "Saving..." : "Save and continue"}
        </button>
      </ConfirmDialog>

      <ConfirmDialog
        cancelLabel="Keep"
        confirmLabel={pendingArchive === "product" ? "Archive Product" : "Archive SKU"}
        destructive
        message={
          pendingArchive === "product"
            ? `Archiving the product “${selectedProduct?.name ?? "this product"}” unpublishes it and makes every SKU under it unavailable for new purchases. Archiving cannot be undone from this portal; existing orders and inventory keep their history.`
            : `Archiving the SKU “${variantForm.sku || "this SKU"}” makes it unavailable for new purchases. Archiving cannot be undone from this portal; existing inventory and orders keep their history.`
        }
        onCancel={() => setPendingArchive(null)}
        onConfirm={() => {
          const target = pendingArchive;
          setPendingArchive(null);
          if (target === "product") void archiveProduct();
          if (target === "sku") void archiveVariant();
        }}
        open={pendingArchive !== null}
        title={pendingArchive === "product" ? "Archive this product?" : "Archive this SKU?"}
      />
    </div>
  );
}

function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50 xl:hidden"
      onClick={onBack}
      type="button"
    >
      <span aria-hidden="true">←</span> Back to {label}
    </button>
  );
}

function ProductEditor({ product, form, isNew, busy, errors, formError, onChange, onImageUpload, onSave, onArchive }: {
  product: AdminTagProduct | null;
  form: AdminProductInput;
  isNew: boolean;
  busy: boolean;
  errors: FieldErrors;
  formError: string;
  onChange: (value: AdminProductInput) => void;
  onImageUpload: (file: File) => void;
  onSave: () => void;
  onArchive: () => void;
}) {
  return (
    <AdminSection
      title={isNew ? "Create product" : `Edit ${product?.name ?? "product"}`}
      description="A product is the customer-facing item shown in the Owner Portal. Each of its SKUs is one exact sellable and manufacturable configuration."
    >
      <div className="grid gap-5 p-4 sm:p-5">
        <FormGroup title="Basic information">
          <Field
            error={errors.name}
            errorId={`${productFieldIds.name}-error`}
            helper={'Use the main product name, such as "MyPetLink Pet Tag". Specific sizes, capabilities, and materials belong to SKUs.'}
            label="Product name"
          >
            <input {...invalidFieldProps(productFieldIds.name, errors.name)} className={fieldClass} id={productFieldIds.name} value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} />
          </Field>
          <Field
            error={errors.slug}
            errorId={`${productFieldIds.slug}-error`}
            helper="Forms the product's public link. Keep it stable once shared."
            label="Stable product link"
          >
            <input {...invalidFieldProps(productFieldIds.slug, errors.slug)} className={fieldClass} id={productFieldIds.slug} value={form.slug} onChange={(event) => onChange({ ...form, slug: event.target.value.toLowerCase().replace(/\s+/g, "-") })} placeholder="mypetlink-pet-tag" />
          </Field>
          <Field
            error={errors.shortDescription}
            errorId={`${productFieldIds.shortDescription}-error`}
            helper="One sentence shown on product cards. Required before publishing."
            label="Short description"
          >
            <input {...invalidFieldProps(productFieldIds.shortDescription, errors.shortDescription)} className={fieldClass} id={productFieldIds.shortDescription} value={form.shortDescription ?? ""} onChange={(event) => onChange({ ...form, shortDescription: event.target.value })} />
          </Field>
          <Field helper="Full customer-facing description shown on the product page." label="Full description" wide>
            <textarea className={textAreaClass} value={form.description ?? ""} onChange={(event) => onChange({ ...form, description: event.target.value })} />
          </Field>
        </FormGroup>
        <FormGroup title="Images">
          {form.media.map((media, index) => (
            <div className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:col-span-2 sm:grid-cols-[minmax(8rem,0.65fr)_minmax(0,1fr)_auto]" key={`${media.mediaFileId}-${index}`}>
              <div className="grid min-h-10 place-items-center overflow-hidden rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
                {product?.media.find((item) => item.mediaFileId === media.mediaFileId)?.url
                  ? <Image alt="" className="h-16 w-full object-cover" height={128} src={product.media.find((item) => item.mediaFileId === media.mediaFileId)?.url ?? ""} unoptimized width={240} />
                  : `Product image ${index + 1}`}
              </div>
              <input aria-label={`Image ${index + 1} alt text`} className={fieldClass} placeholder="Useful image description" value={media.altText} onChange={(event) => onChange({ ...form, media: form.media.map((item, itemIndex) => itemIndex === index ? { ...item, altText: event.target.value } : item) })} />
              <AdminActionButton onClick={() => onChange({ ...form, media: form.media.filter((_, itemIndex) => itemIndex !== index) })} tone="danger">Remove</AdminActionButton>
            </div>
          ))}
          <label className="sm:col-span-2 grid cursor-pointer gap-1 rounded-xl border border-dashed border-slate-300 p-4 text-sm font-bold text-slate-700" htmlFor={productFieldIds.media}>
            Upload product image
            <span className="text-xs font-medium text-slate-500">JPEG, PNG, or WebP, up to 10 MB. Add useful alternative text after upload.</span>
            <input {...invalidFieldProps(productFieldIds.media, errors.media)} accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" disabled={busy || form.media.length >= 12} id={productFieldIds.media} onChange={(event) => { const file = event.target.files?.[0]; if (file) onImageUpload(file); event.target.value = ""; }} type="file" />
            {errors.media ? <InlineFieldError id={`${productFieldIds.media}-error`}>{errors.media}</InlineFieldError> : null}
          </label>
        </FormGroup>
        <FormGroup title="Publication">
          <Field error={errors.sortOrder} errorId={`${productFieldIds.sortOrder}-error`} label="Display order">
            <input {...invalidFieldProps(productFieldIds.sortOrder, errors.sortOrder)} className={fieldClass} id={productFieldIds.sortOrder} min={0} type="number" value={form.sortOrder} onChange={(event) => onChange({ ...form, sortOrder: numberValue(event.target.value) })} />
          </Field>
          <Toggle checked={form.isPublished} error={errors.isPublished} id={productFieldIds.isPublished} label="Published for customers" onChange={(checked) => onChange({ ...form, isPublished: checked })} />
        </FormGroup>
        {formError ? <InlineFormError>{formError}</InlineFormError> : null}
        <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:m-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          {!isNew && !product?.isArchived ? <AdminActionButton disabled={busy} onClick={onArchive} tone="danger">Archive Product</AdminActionButton> : null}
          <AdminActionButton disabled={busy || product?.isArchived} onClick={onSave} tone="primary">{busy ? "Saving..." : "Save Product"}</AdminActionButton>
        </div>
      </div>
    </AdminSection>
  );
}

function SkuListSection({ product, onAddSku, onOpenSku }: {
  product: AdminTagProduct;
  onAddSku: () => void;
  onOpenSku: (variantId: string) => void;
}) {
  return (
    <AdminSection
      title="SKUs"
      description="Each SKU is one exact sellable and manufacturable configuration, including capabilities, physical specifications, price, and production settings."
      action={<AdminActionButton onClick={onAddSku} tone="primary">New SKU</AdminActionButton>}
    >
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {product.variants.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-600 md:col-span-2">
            This product does not have any sellable configurations yet. Add an
            SKU to configure its capabilities, specifications, price, and
            production details.
          </p>
        ) : null}
        {product.variants.map((variant) => (
          <button aria-label={`Edit SKU ${variant.sku}`} className="cursor-pointer rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1" key={variant.id} onClick={() => onOpenSku(variant.id)} type="button">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-sm font-black text-slate-950">{variant.sku}</span>
              <SkuStatusBadge variant={variant} />
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-700">{variant.displayName} · {variant.tagVariant}</p>
            <p className="mt-1 text-xs text-slate-500">{formatCatalogPrice(variant.basePrice, variant.currency)} · {variant.inventoryCount} inventory</p>
            {skuStatusExplanation(variant) ? (
              <p className="mt-1 text-xs font-semibold text-amber-700">{skuStatusExplanation(variant)}</p>
            ) : null}
          </button>
        ))}
      </div>
    </AdminSection>
  );
}

// SKU status must never be an unexplained combination: Archived wins, then
// Purchasable, then Active-but-not-purchasable, then Inactive.
function SkuStatusBadge({ variant }: { variant: AdminTagProductVariant }) {
  if (variant.isArchived) return <Badge tone="soft">Archived</Badge>;
  if (variant.isPurchasable) return <Badge tone="mint">Purchasable</Badge>;
  if (variant.isActive) return <Badge tone="warm">Active · not purchasable</Badge>;
  return <Badge tone="soft">Inactive</Badge>;
}

function skuStatusExplanation(variant: AdminTagProductVariant) {
  if (variant.isArchived || variant.isPurchasable) return "";
  if (variant.isActive) return "Hidden from the store until it is marked purchasable.";
  return "Inactive SKUs cannot be purchased or used for new inventory.";
}

function VariantEditor({ product, editing, form, isNew, busy, formError, presets, settingsHref, onChange, onSave, onArchive }: {
  product: AdminTagProduct;
  editing?: AdminTagProductVariant;
  form: AdminVariantInput;
  isNew: boolean;
  busy: boolean;
  formError: string;
  presets: AdminTagVariantPreset[];
  settingsHref: string;
  onChange: (value: AdminVariantInput) => void;
  onSave: () => void;
  onArchive: () => void;
}) {
  const locked = editing?.productionFieldsLocked ?? false;
  // Active presets are offered for selection; an inactive preset stays listed
  // only while this SKU already uses it.
  const selectablePresets = presets.filter(
    (preset) => preset.isActive || preset.id === form.tagVariantPresetId
  );

  return (
    <AdminSection
      title={isNew ? `New SKU for ${product.name}` : `Edit SKU ${editing?.sku ?? ""}`}
      description="Each SKU is one exact sellable and manufacturable configuration, including capabilities, physical specifications, price, and production settings."
    >
      <div className="grid gap-4 p-4 sm:p-5">
        {locked ? <AdminNotice>Production specifications are locked because this SKU has inventory or order history. Create a new versioned SKU to change them.</AdminNotice> : null}

        <CollapsibleFormGroup title="General" defaultOpen>
          <Field label="SKU code"><input className={fieldClass} disabled={locked} value={form.sku} onChange={(event) => onChange({ ...form, sku: event.target.value.toUpperCase() })} placeholder="PAW-LW-QR" /></Field>
          <Field label="Display name"><input className={fieldClass} value={form.displayName} onChange={(event) => onChange({ ...form, displayName: event.target.value })} /></Field>
          <Field
            helper="A reusable classification only (for example Lightweight, Standard, Collar Slide). It never sets this SKU's price, capabilities, specifications, or inventory."
            label="Tag Type"
          >
            {selectablePresets.length > 0 ? (
              <select
                className={fieldClass}
                disabled={locked}
                value={form.tagVariantPresetId ?? ""}
                onChange={(event) => onChange({ ...form, tagVariantPresetId: event.target.value || null })}
              >
                <option value="">Choose a Tag Type…</option>
                {selectablePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.displayName}
                    {preset.isActive ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
            ) : (
              <span className="block rounded-xl border border-dashed border-slate-300 p-3 text-xs font-semibold normal-case text-slate-600">
                No active Tag Types exist yet.{" "}
                <Link className="font-extrabold text-slate-900 underline" href={settingsHref}>
                  Add one in Catalog Settings
                </Link>{" "}
                before creating this SKU.
              </span>
            )}
          </Field>
          <Field label="Display order"><input className={fieldClass} min={0} type="number" value={form.sortOrder} onChange={(event) => onChange({ ...form, sortOrder: numberValue(event.target.value) })} /></Field>
          <Toggle checked={form.supportsQr} disabled={locked} label="QR scanning" onChange={(checked) => onChange({ ...form, supportsQr: checked })} />
          <Toggle checked={form.supportsNfc} disabled={locked} label="NFC tapping" onChange={(checked) => onChange({ ...form, supportsNfc: checked })} />
          {!isNew && editing && editing.tagVariant ? (
            <Field helper="What this SKU is currently labelled as. Renaming a Tag Type never changes saved SKUs." label="Saved Tag Type" wide>
              <input className={fieldClass} disabled value={editing.tagVariant} />
            </Field>
          ) : null}
        </CollapsibleFormGroup>

        <CollapsibleFormGroup title="Specifications" subtitle="size, weight, materials">
          <NumberField label="Width (mm)" value={form.widthMm} disabled={locked} onChange={(value) => onChange({ ...form, widthMm: value })} />
          <NumberField label="Height (mm)" value={form.heightMm} disabled={locked} onChange={(value) => onChange({ ...form, heightMm: value })} />
          <NumberField label="Thickness (mm)" value={form.thicknessMm} disabled={locked} onChange={(value) => onChange({ ...form, thicknessMm: value })} />
          <NumberField label="Weight (g)" value={form.weightGrams} disabled={locked} onChange={(value) => onChange({ ...form, weightGrams: value })} />
          {(["material", "shape", "colour", "packagingType"] as const).map((key) => <Field key={key} label={key === "packagingType" ? "Packaging" : titleCase(key)}><input className={fieldClass} disabled={locked} value={form[key] ?? ""} onChange={(event) => onChange({ ...form, [key]: event.target.value })} /></Field>)}
        </CollapsibleFormGroup>

        <CollapsibleFormGroup title="Pricing & Availability" defaultOpen>
          <NumberField label="Base price" value={form.basePrice} onChange={(value) => onChange({ ...form, basePrice: value ?? 0 })} />
          <Field label="Currency"><input className={fieldClass} disabled value="MYR" /></Field>
          <NumberField label="Compare-at price (optional)" value={form.compareAtPrice} onChange={(value) => onChange({ ...form, compareAtPrice: value })} />
          <Toggle
            checked={form.isActive}
            label="Active"
            onChange={(checked) => onChange({
              ...form,
              isActive: checked,
              // Availability requires an active SKU, so deactivating also
              // withdraws it from purchase.
              isPurchasable: checked ? form.isPurchasable : false,
            })}
          />
          <Toggle
            checked={form.isPurchasable}
            disabled={!form.isActive}
            label="Available for purchase"
            onChange={(checked) => onChange({ ...form, isPurchasable: checked })}
          />
          <p className="text-xs font-medium normal-case text-slate-500 sm:col-span-2">
            <strong className="font-black">Active</strong> keeps the SKU usable in administration and production.
            {" "}<strong className="font-black">Available for purchase</strong> lets customers select it in new orders — only possible while the SKU is active and its product is published. Inactive or archived items keep their history but cannot be ordered.
          </p>
        </CollapsibleFormGroup>

        <CollapsibleFormGroup title="Production" subtitle="print template, notes">
          <Field label="Print template"><input className={fieldClass} disabled={locked} value={form.printTemplateCode ?? ""} onChange={(event) => onChange({ ...form, printTemplateCode: event.target.value })} /></Field>
          <Field label="Production notes" wide><textarea className={textAreaClass} value={form.productionNotes ?? ""} onChange={(event) => onChange({ ...form, productionNotes: event.target.value })} /></Field>
        </CollapsibleFormGroup>

        {formError ? <InlineFormError>{formError}</InlineFormError> : null}
        <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:m-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          {!isNew && editing && !editing.isArchived ? <AdminActionButton disabled={busy} onClick={onArchive} tone="danger">Archive SKU</AdminActionButton> : null}
          <AdminActionButton disabled={busy || editing?.isArchived || product.isArchived} onClick={onSave} tone="primary">{busy ? "Saving..." : isNew ? "Create SKU" : "Save SKU"}</AdminActionButton>
        </div>
      </div>
    </AdminSection>
  );
}

function VariantPresetsSettings({ presets, form, selectedId, busy, formError, onChange, onEdit, onNew, onSave }: {
  presets: AdminTagVariantPreset[];
  form: AdminTagVariantPresetInput;
  selectedId?: string;
  busy: boolean;
  formError: string;
  onChange: (value: AdminTagVariantPresetInput) => void;
  onEdit: (preset: AdminTagVariantPreset) => void;
  onNew: () => void;
  onSave: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.6fr)]">
      <AdminSection
        title="Tag Types"
        description="Reusable classifications only, such as Lightweight or Standard. They organise similar SKUs but never set price, capabilities, specifications, or inventory. New values (for example Collar Slide or Silicone) can be added here without a release."
        action={<AdminActionButton onClick={onNew} tone="primary">New Tag Type</AdminActionButton>}
      >
        <div className="p-2">
          {presets.length === 0 ? <StatusLine>No Tag Types yet.</StatusLine> : null}
          {presets.map((preset) => (
            <button
              className={`mb-2 w-full rounded-xl border p-3 text-left transition ${selectedId === preset.id ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:bg-slate-50"}`}
              key={preset.id}
              onClick={() => onEdit(preset)}
              type="button"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-black text-slate-950">{preset.displayName}</span>
                <Badge tone={preset.isActive ? "mint" : "soft"}>{preset.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {preset.code} · used by {preset.skuCount} SKU{preset.skuCount === 1 ? "" : "s"}
              </p>
            </button>
          ))}
        </div>
      </AdminSection>
      <AdminSection
        title={selectedId ? "Edit Tag Type" : "Create Tag Type"}
        description="A Tag Type is only a classification label. Physical specifications, capabilities, prices, and production settings stay on each SKU. Tag Types used by SKUs can be deactivated but not deleted, and renaming one never changes saved SKUs or past orders."
      >
        <div className="grid gap-5 p-4 sm:p-5">
          <FormGroup title="Tag Type details">
            <Field helper="Stable internal code, e.g. COLLAR-SLIDE." label="Code">
              <input className={fieldClass} value={form.code} onChange={(event) => onChange({ ...form, code: event.target.value.toUpperCase() })} placeholder="COLLAR-SLIDE" />
            </Field>
            <Field helper="Shown to Admins when classifying SKUs." label="Display name">
              <input className={fieldClass} value={form.displayName} onChange={(event) => onChange({ ...form, displayName: event.target.value })} placeholder="Collar Slide" />
            </Field>
            <Field label="Description" wide>
              <textarea className={textAreaClass} value={form.description ?? ""} onChange={(event) => onChange({ ...form, description: event.target.value })} />
            </Field>
            <Field label="Sort order">
              <input className={fieldClass} min={0} type="number" value={form.sortOrder} onChange={(event) => onChange({ ...form, sortOrder: numberValue(event.target.value) })} />
            </Field>
            <Toggle checked={form.isActive} label="Active (selectable for new SKUs)" onChange={(checked) => onChange({ ...form, isActive: checked })} />
          </FormGroup>
          {formError ? <InlineFormError>{formError}</InlineFormError> : null}
          <div className="flex justify-end">
            <AdminActionButton disabled={busy} onClick={onSave} tone="primary">{busy ? "Saving..." : selectedId ? "Save Tag Type" : "Create Tag Type"}</AdminActionButton>
          </div>
        </div>
      </AdminSection>
    </div>
  );
}

function PromotionsEditor({ promotions, variants, form, selectedId, loading, busy, loadError, errors, formError, search, statusFilter, page, pageSize, total, onChange, onEdit, onNew, onRetry, onSave, onSearch, onStatusFilterChange, onPageChange, onPageSizeChange }: {
  promotions: AdminPromotion[];
  variants: (AdminCatalogOptionVariant & { productName: string; productPublished: boolean })[];
  form: AdminPromotionInput;
  selectedId?: string;
  loading: boolean;
  busy: boolean;
  loadError: string;
  errors: FieldErrors;
  formError: string;
  search: string;
  statusFilter: string;
  page: number;
  pageSize: number;
  total: number;
  onChange: (value: AdminPromotionInput) => void;
  onEdit: (promotion: AdminPromotion) => void;
  onNew: () => void;
  onRetry: () => void;
  onSave: () => void;
  onSearch: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const eligibleVariants = variants.filter((variant) =>
    variant.isActive &&
    variant.isPurchasable &&
    variant.productPublished
  );
  const noEligibleVariants = eligibleVariants.length === 0;
  const previewVariant = variants.find((variant) => form.productVariantIds.includes(variant.id));
  const previewDiscount = previewVariant
    ? form.discountType === "Percentage"
      ? previewVariant.basePrice * form.discountValue / 100
      : form.discountValue
    : 0;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.6fr)]">
      <AdminSection title="Promotions" description="One automatic promotion applies per SKU; priority wins, then the greatest discount." action={<AdminActionButton disabled={noEligibleVariants} onClick={onNew} tone="primary">New Promotion</AdminActionButton>}>
        <div className="grid gap-3 border-b border-slate-100 p-4">
          <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">
            Search promotions
            <AdminSearchInput onChange={onSearch} placeholder="Promotion name" value={search} />
          </label>
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={onStatusFilterChange}
            options={[["all", "All"], ["enabled", "Enabled"], ["disabled", "Disabled"]]}
          />
        </div>
        <div className="p-2">
          {loading ? <StatusLine>Loading promotions...</StatusLine> : null}
          {!loading && loadError ? <LoadFailure message={loadError} onRetry={onRetry} /> : null}
          {!loading && !loadError && promotions.length === 0 ? <StatusLine>No promotions created.</StatusLine> : null}
          {!loadError ? promotions.map((promotion) => <button className={`mb-2 w-full rounded-xl border p-3 text-left ${selectedId === promotion.id ? "border-slate-900 bg-slate-50" : "border-slate-200"}`} key={promotion.id} onClick={() => onEdit(promotion)} type="button"><div className="flex justify-between gap-2"><span className="font-black text-slate-950">{promotion.name}</span><Badge tone={promotion.isActive ? "mint" : "soft"}>{promotion.isActive ? "Enabled" : "Disabled"}</Badge></div><p className="mt-1 text-xs text-slate-500">{promotion.discountType === "Percentage" ? `${promotion.discountValue}%` : formatCatalogPrice(promotion.discountValue)} · Priority {promotion.priority}</p></button>) : null}
        </div>
        <AdminListPagination
          loading={loading}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          page={page}
          pageSize={pageSize}
          total={total}
        />
      </AdminSection>
      <AdminSection title={selectedId ? "Edit promotion" : "Create promotion"} description="Promotions change effective prices without overwriting the SKU base price.">
        <div className="grid gap-5 p-4 sm:p-5">
          {noEligibleVariants ? <AdminNotice>Create and publish an eligible product variant before adding a promotion.</AdminNotice> : null}
          <FormGroup title="Promotion details">
            <Field error={errors.name} errorId={`${promotionFieldIds.name}-error`} label="Promotion name"><input {...invalidFieldProps(promotionFieldIds.name, errors.name)} className={fieldClass} id={promotionFieldIds.name} value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} /></Field>
            <Field label="Customer label"><input className={fieldClass} value={form.displayLabel ?? ""} onChange={(event) => onChange({ ...form, displayLabel: event.target.value })} /></Field>
            <Field label="Internal description" wide><textarea className={textAreaClass} value={form.internalDescription ?? ""} onChange={(event) => onChange({ ...form, internalDescription: event.target.value })} /></Field>
          </FormGroup>
          <FormGroup title="Discount and priority">
            <Field error={errors.discountType} errorId={`${promotionFieldIds.discountType}-error`} label="Discount type"><select {...invalidFieldProps(promotionFieldIds.discountType, errors.discountType)} className={fieldClass} id={promotionFieldIds.discountType} value={form.discountType} onChange={(event) => onChange({ ...form, discountType: event.target.value as AdminPromotionInput["discountType"] })}><option value="Percentage">Percentage</option><option value="FixedAmount">Fixed amount</option></select></Field>
            <NumberField error={errors.discountValue} id={promotionFieldIds.discountValue} label="Discount value" value={form.discountValue} onChange={(value) => onChange({ ...form, discountValue: value ?? 0 })} />
            <NumberField error={errors.priority} id={promotionFieldIds.priority} label="Priority" value={form.priority} onChange={(value) => onChange({ ...form, priority: value ?? 0 })} />
          </FormGroup>
          <FormGroup title="Schedule">
            <Field error={errors.startsAt} errorId={`${promotionFieldIds.startsAt}-error`} label="Starts"><input {...invalidFieldProps(promotionFieldIds.startsAt, errors.startsAt)} className={fieldClass} id={promotionFieldIds.startsAt} type="datetime-local" value={toLocalInput(form.startsAt)} onChange={(event) => onChange({ ...form, startsAt: fromLocalInput(event.target.value) })} /></Field>
            <Field error={errors.endsAt} errorId={`${promotionFieldIds.endsAt}-error`} label="Ends"><input {...invalidFieldProps(promotionFieldIds.endsAt, errors.endsAt)} className={fieldClass} id={promotionFieldIds.endsAt} type="datetime-local" value={toLocalInput(form.endsAt)} onChange={(event) => onChange({ ...form, endsAt: fromLocalInput(event.target.value) })} /></Field>
          </FormGroup>
          <FormGroup title="Applicable SKUs">
            <div {...invalidFieldProps(promotionFieldIds.productVariantIds, errors.productVariantIds)} className="grid gap-2 sm:col-span-2" id={promotionFieldIds.productVariantIds} tabIndex={-1}>
              {variants.length === 0 ? <StatusLine>No product variants are available.</StatusLine> : null}
              {variants.map((variant) => <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm font-semibold" key={variant.id}><input checked={form.productVariantIds.includes(variant.id)} disabled={!variant.isActive || !variant.isPurchasable || !variant.productPublished} onChange={(event) => onChange({ ...form, productVariantIds: event.target.checked ? [...form.productVariantIds, variant.id] : form.productVariantIds.filter((id) => id !== variant.id) })} type="checkbox" /><span><strong>{variant.sku}</strong> · {variant.productName} · {formatCatalogPrice(variant.basePrice, variant.currency)}</span></label>)}
              {errors.productVariantIds ? <InlineFieldError id={`${promotionFieldIds.productVariantIds}-error`}>{errors.productVariantIds}</InlineFieldError> : null}
            </div>
          </FormGroup>
          <FormGroup title="Availability">
            <Toggle checked={form.isAutomatic} label="Apply automatically" onChange={(checked) => onChange({ ...form, isAutomatic: checked })} />
            <Toggle checked={form.isActive} label="Promotion enabled" onChange={(checked) => onChange({ ...form, isActive: checked })} />
          </FormGroup>
          {previewVariant ? <AdminNotice>Price preview for {previewVariant.sku}: {formatCatalogPrice(previewVariant.basePrice, previewVariant.currency)} → {formatCatalogPrice(Math.max(0, previewVariant.basePrice - previewDiscount), previewVariant.currency)}</AdminNotice> : null}
          {formError ? <InlineFormError>{formError}</InlineFormError> : null}
          <div className="flex justify-end"><AdminActionButton disabled={busy || noEligibleVariants} onClick={onSave} tone="primary">{busy ? "Saving..." : "Save Promotion"}</AdminActionButton></div>
        </div>
      </AdminSection>
    </div>
  );
}

function FormGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2"><legend className="px-2 text-sm font-black text-slate-900">{title}</legend>{children}</fieldset>;
}
// Collapsible section (native <details> for keyboard accessibility) used to
// keep the long SKU form scannable. General and Pricing & Availability stay
// open by default; Specifications and Production collapse.
function CollapsibleFormGroup({ title, subtitle, defaultOpen = false, children }: { title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-slate-200 [&_summary::-webkit-details-marker]:hidden" open={defaultOpen}>
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-black text-slate-900">
        <span>{title}{subtitle ? <span className="ml-2 text-xs font-medium text-slate-400">{subtitle}</span> : null}</span>
        <span aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2">{children}</div>
    </details>
  );
}
function Field({ label, wide, error, errorId, helper, children }: { label: string; wide?: boolean; error?: string; errorId?: string; helper?: string; children: React.ReactNode }) {
  return <div className={`grid gap-1 text-xs font-extrabold uppercase text-slate-500 ${wide ? "sm:col-span-2" : ""}`}><label className="grid gap-1">{label}{children}</label>{helper ? <span className="text-xs font-medium normal-case text-slate-500">{helper}</span> : null}{error ? <InlineFieldError id={errorId}>{error}</InlineFieldError> : null}</div>;
}
function NumberField({ label, value, disabled, id, error, onChange }: { label: string; value?: number | null; disabled?: boolean; id?: string; error?: string; onChange: (value: number | null) => void }) {
  return <Field error={error} errorId={id ? `${id}-error` : undefined} label={label}><input {...(id ? invalidFieldProps(id, error) : {})} className={fieldClass} disabled={disabled} id={id} min={0} step="0.01" type="number" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} /></Field>;
}
function Toggle({ label, checked, disabled, id, error, onChange }: { label: string; checked: boolean; disabled?: boolean; id?: string; error?: string; onChange: (checked: boolean) => void }) {
  return <div className="grid gap-1"><label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-800"><input {...(id ? invalidFieldProps(id, error) : {})} checked={checked} disabled={disabled} id={id} onChange={(event) => onChange(event.target.checked)} type="checkbox" />{label}</label>{error ? <InlineFieldError id={id ? `${id}-error` : undefined}>{error}</InlineFieldError> : null}</div>;
}
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">{label}<select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
function StatusLine({ children }: { children: React.ReactNode }) { return <p className="p-4 text-sm font-semibold text-slate-500">{children}</p>; }
function EditorStatus({ children }: { children: React.ReactNode }) { return <div aria-live="polite" className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">{children}</div>; }
function LoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="grid gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert"><p>{message}</p><div><AdminActionButton onClick={onRetry}>Retry</AdminActionButton></div></div>; }
function InlineFieldError({ id, children }: { id?: string; children: React.ReactNode }) { return <span className="normal-case text-xs font-bold text-red-700" id={id}>{children}</span>; }
function InlineFormError({ children }: { children: React.ReactNode }) { return <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800" role="alert">{children}</div>; }
function productInput(product: AdminTagProduct): AdminProductInput { return { name: product.name, slug: product.slug, shortDescription: product.shortDescription, description: product.description, isPublished: product.isPublished, sortOrder: product.sortOrder, media: product.media.map((item) => ({ mediaFileId: item.mediaFileId, productVariantId: item.productVariantId, sortOrder: item.sortOrder, altText: item.altText })), concurrencyToken: product.concurrencyToken }; }
function variantInput(variant: AdminTagProductVariant): AdminVariantInput { return { sku: variant.sku, displayName: variant.displayName, supportsQr: variant.supportsQr, supportsNfc: variant.supportsNfc, tagVariantPresetId: variant.tagVariantPresetId ?? null, widthMm: variant.widthMm, heightMm: variant.heightMm, thicknessMm: variant.thicknessMm, weightGrams: variant.weightGrams, material: variant.material, shape: variant.shape, colour: variant.colour, packagingType: variant.packagingType, basePrice: variant.basePrice, currency: variant.currency, compareAtPrice: variant.compareAtPrice, printTemplateCode: variant.printTemplateCode, productionNotes: variant.productionNotes, isActive: variant.isActive, isPurchasable: variant.isPurchasable, sortOrder: variant.sortOrder, concurrencyToken: variant.concurrencyToken }; }
function presetInput(preset: AdminTagVariantPreset): AdminTagVariantPresetInput { return { code: preset.code, displayName: preset.displayName, description: preset.description ?? "", isActive: preset.isActive, sortOrder: preset.sortOrder, concurrencyToken: preset.concurrencyToken }; }
function validateProductForm(form: AdminProductInput, product: AdminTagProduct | null): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = "Product name is required.";
  if (!form.slug.trim()) errors.slug = "Product link is required.";
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) errors.slug = "Use lowercase letters, numbers, and single hyphens.";
  if (!Number.isInteger(form.sortOrder) || form.sortOrder < 0) errors.sortOrder = "Display order cannot be negative.";
  else if (form.sortOrder > 10_000) errors.sortOrder = "Display order cannot exceed 10,000.";
  if (form.media.length > 12) errors.media = "Add no more than 12 product images.";
  else if (form.media.some((item) => !item.altText.trim())) errors.media = "Add useful alternative text for every product image.";
  if (form.isPublished) {
    if (!form.shortDescription?.trim()) errors.shortDescription = "A short description is required before publishing.";
    if (!product?.variants.some((variant) => !variant.isArchived && variant.isActive && variant.isPurchasable)) {
      errors.isPublished = "Add at least one active purchasable SKU before publishing this product.";
    }
  }
  return errors;
}
function validatePromotionForm(form: AdminPromotionInput, eligibleIds: Set<string>): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = "Promotion name is required.";
  if (form.discountType !== "Percentage" && form.discountType !== "FixedAmount") errors.discountType = "Choose a discount type.";
  if (!Number.isFinite(form.discountValue) || form.discountValue <= 0) errors.discountValue = "Discount value must be greater than zero.";
  else if (form.discountType === "Percentage" && form.discountValue > 100) errors.discountValue = "Percentage discount cannot exceed 100%.";
  if (!Number.isInteger(form.priority) || form.priority < 0 || form.priority > 10_000) errors.priority = "Priority must be a whole number between 0 and 10,000.";
  const startsAt = Date.parse(form.startsAt);
  const endsAt = Date.parse(form.endsAt);
  if (!Number.isFinite(startsAt)) errors.startsAt = "Choose a valid start time.";
  if (!Number.isFinite(endsAt)) errors.endsAt = "Choose a valid end time.";
  else if (Number.isFinite(startsAt) && endsAt <= startsAt) errors.endsAt = "Promotion end time must be after its start time.";
  if (form.productVariantIds.length === 0) errors.productVariantIds = "Choose at least one eligible SKU.";
  else if (form.productVariantIds.some((id) => !eligibleIds.has(id))) errors.productVariantIds = "Choose only published, active, purchasable SKUs.";
  return errors;
}
function validateProductImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Choose a JPEG, PNG, or WebP image.";
  if (file.size > 10 * 1024 * 1024) return "Choose an image no larger than 10 MB.";
  return "";
}
function apiFieldErrors(error: unknown, allowedFields: string[]): FieldErrors {
  if (!isApiClientError(error) || !error.details) return {};
  const allowed = new Map(allowedFields.map((field) => [field.toLowerCase(), field]));
  const result: FieldErrors = {};
  for (const [key, messages] of Object.entries(error.details)) {
    const root = key.replace(/^\$\./, "").split(/[.[]/, 1)[0]?.toLowerCase();
    const field = root ? allowed.get(root) : undefined;
    if (field && messages[0]) result[field] = messages[0];
  }
  return result;
}
function focusFirstInvalidField(errors: FieldErrors, fieldIds: Record<string, string>) {
  const firstField = Object.keys(fieldIds).find((field) => errors[field]);
  if (!firstField) return;
  window.setTimeout(() => {
    const element = document.getElementById(fieldIds[firstField]);
    element?.focus();
    element?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, 0);
}
function invalidFieldProps(id: string, error?: string) {
  return { "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined };
}
function requestReference(error: unknown) { return isApiClientError(error) && error.requestId ? ` Reference: ${error.requestId}` : ""; }
function loadError(error: unknown, subject: string) {
  if (isApiClientError(error) && error.status >= 500) return `We couldn’t load ${subject}. Please try again.${requestReference(error)}`;
  if (isApiClientError(error) && error.status === 403) return `You don’t have permission to view ${subject}.`;
  return `${friendlyError(error)}${requestReference(error)}`;
}
function saveError(error: unknown, subject: string) {
  if (isApiClientError(error) && error.status >= 500) return `We couldn’t save this ${subject}. Please try again.${requestReference(error)}`;
  return `${friendlyError(error)}${requestReference(error)}`;
}
function friendlyError(error: unknown) { if (isApiClientError(error)) return Object.values(error.details ?? {}).flat()[0] ?? error.message; return error instanceof Error ? error.message : "This change could not be saved. Please try again."; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-MY", { dateStyle: "medium" }).format(new Date(value)); }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function numberValue(value: string) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function toLocalInput(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function fromLocalInput(value: string) { return value ? new Date(value).toISOString() : ""; }
