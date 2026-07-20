"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AdminActionButton, AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { Badge } from "@/components/ui/Badge";
import { isApiClientError } from "@/services/apiClient";
import { uploadMediaFile } from "@/services/mediaService";
import {
  archiveAdminTagProduct,
  archiveAdminTagProductVariant,
  formatCatalogPrice,
  getAdminTagProduct,
  listAdminPromotions,
  listAdminTagProducts,
  saveAdminPromotion,
  saveAdminTagProduct,
  saveAdminTagProductVariant,
  type AdminProductInput,
  type AdminPromotion,
  type AdminPromotionInput,
  type AdminTagProduct,
  type AdminTagProductListItem,
  type AdminTagProductVariant,
  type AdminVariantInput,
} from "@/services/tagCatalogService";

type CatalogTab = "products" | "promotions";

const fieldClass =
  "min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400";
const textAreaClass = `${fieldClass} min-h-24 py-2`;

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
  tagVariant: "Standard",
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

export function AdminTagProductsManager() {
  const [tab, setTab] = useState<CatalogTab>("products");
  const [products, setProducts] = useState<AdminTagProductListItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<AdminTagProduct | null>(null);
  const [productForm, setProductForm] = useState<AdminProductInput>(blankProduct);
  const [variantForm, setVariantForm] = useState<AdminVariantInput>(blankVariant);
  const [selectedVariantId, setSelectedVariantId] = useState<string>();
  const [search, setSearch] = useState("");
  const [publicationFilter, setPublicationFilter] = useState("all");
  const [archiveFilter, setArchiveFilter] = useState("active");
  const [capabilityFilter, setCapabilityFilter] = useState("all");
  const [purchasableFilter, setPurchasableFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [promotions, setPromotions] = useState<AdminPromotion[]>([]);
  const [promotionForm, setPromotionForm] = useState<AdminPromotionInput>(blankPromotion);
  const [selectedPromotionId, setSelectedPromotionId] = useState<string>();
  const [allProductDetails, setAllProductDetails] = useState<AdminTagProduct[]>([]);

  const refreshProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listAdminTagProducts({
        search,
        published: publicationFilter === "all" ? undefined : publicationFilter === "published",
        archived: archiveFilter === "all" ? undefined : archiveFilter === "archived",
        supportsQr: capabilityFilter === "qr" ? true : undefined,
        supportsNfc: capabilityFilter === "nfc" ? true : undefined,
        purchasable: purchasableFilter === "all" ? undefined : purchasableFilter === "yes",
      });
      setProducts(rows);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setLoading(false);
    }
  }, [archiveFilter, capabilityFilter, publicationFilter, purchasableFilter, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshProducts(), 200);
    return () => window.clearTimeout(timer);
  }, [refreshProducts]);

  async function openProduct(productId: string) {
    setBusy(true);
    setError("");
    try {
      const detail = await getAdminTagProduct(productId);
      setSelectedProduct(detail);
      setProductForm(productInput(detail));
      clearVariant();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  }

  function createProduct() {
    setSelectedProduct(null);
    setProductForm(blankProduct);
    clearVariant();
    setMessage("");
    setError("");
  }

  async function submitProduct() {
    setBusy(true);
    setError("");
    try {
      const saved = await saveAdminTagProduct(
        { ...productForm, concurrencyToken: selectedProduct?.concurrencyToken },
        selectedProduct?.id
      );
      setSelectedProduct(saved);
      setProductForm(productInput(saved));
      setMessage(`${saved.name} saved.`);
      await refreshProducts();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function uploadProductImage(file: File) {
    setBusy(true);
    setError("");
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
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function archiveProduct() {
    if (!selectedProduct) return;
    setBusy(true);
    setError("");
    try {
      const saved = await archiveAdminTagProduct(
        selectedProduct.id,
        selectedProduct.concurrencyToken
      );
      setSelectedProduct(saved);
      setProductForm(productInput(saved));
      setMessage(`${saved.name} archived.`);
      await refreshProducts();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  }

  function editVariant(variant: AdminTagProductVariant) {
    setSelectedVariantId(variant.id);
    setVariantForm(variantInput(variant));
    setMessage("");
    setError("");
  }

  function clearVariant() {
    setSelectedVariantId(undefined);
    setVariantForm(blankVariant);
  }

  async function submitVariant() {
    if (!selectedProduct) return;
    setBusy(true);
    setError("");
    try {
      await saveAdminTagProductVariant(
        selectedProduct.id,
        { ...variantForm, concurrencyToken: selectedVariantId ? variantForm.concurrencyToken : null },
        selectedVariantId
      );
      await openProduct(selectedProduct.id);
      setMessage(`SKU ${variantForm.sku.toUpperCase()} saved.`);
      clearVariant();
    } catch (caught) {
      setError(friendlyError(caught));
      setBusy(false);
    }
  }

  async function archiveVariant() {
    if (!selectedProduct || !selectedVariantId || !variantForm.concurrencyToken) return;
    setBusy(true);
    try {
      await archiveAdminTagProductVariant(selectedVariantId, variantForm.concurrencyToken);
      await openProduct(selectedProduct.id);
      clearVariant();
      setMessage("SKU archived. Existing inventory and orders remain unchanged.");
    } catch (caught) {
      setError(friendlyError(caught));
      setBusy(false);
    }
  }

  async function openPromotions() {
    setTab("promotions");
    setLoading(true);
    setError("");
    try {
      const [promotionRows, productRows] = await Promise.all([
        listAdminPromotions(),
        listAdminTagProducts({}),
      ]);
      const details = await Promise.all(productRows.map((product) => getAdminTagProduct(product.id)));
      setPromotions(promotionRows);
      setAllProductDetails(details);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setLoading(false);
    }
  }

  function editPromotion(promotion: AdminPromotion) {
    setSelectedPromotionId(promotion.id);
    setPromotionForm({ ...promotion });
    setMessage("");
  }

  async function submitPromotion() {
    setBusy(true);
    setError("");
    try {
      const saved = await saveAdminPromotion(promotionForm, selectedPromotionId);
      const rows = await listAdminPromotions();
      setPromotions(rows);
      setSelectedPromotionId(saved.id);
      setPromotionForm({ ...saved });
      setMessage(`${saved.name} saved. Base prices were not changed.`);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  }

  const promotionVariants = useMemo(
    () =>
      allProductDetails.flatMap((product) =>
        product.variants
          .filter((variant) => !variant.isArchived)
          .map((variant) => ({ ...variant, productName: product.name, productPublished: product.isPublished }))
      ),
    [allProductDetails]
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tag product management">
        <TabButton active={tab === "products"} onClick={() => setTab("products")}>Products &amp; SKUs</TabButton>
        <TabButton active={tab === "promotions"} onClick={() => void openPromotions()}>Promotions</TabButton>
      </div>

      {message ? <AdminNotice>{message}</AdminNotice> : null}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800" role="alert">
          {error}
        </div>
      ) : null}

      {tab === "products" ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.6fr)]">
          <AdminSection
            title="Product catalog"
            description="Draft, publish, or archive products without changing historical orders."
            action={<AdminActionButton onClick={createProduct} tone="primary">New Product</AdminActionButton>}
          >
            <div className="grid gap-3 border-b border-slate-100 p-4">
              <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">
                Search product or SKU
                <input className={fieldClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or SKU" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <FilterSelect label="Publication" value={publicationFilter} onChange={setPublicationFilter} options={[["all", "All"], ["published", "Published"], ["draft", "Draft"]]} />
                <FilterSelect label="Archive" value={archiveFilter} onChange={setArchiveFilter} options={[["active", "Active"], ["archived", "Archived"], ["all", "All"]]} />
                <FilterSelect label="Capability" value={capabilityFilter} onChange={setCapabilityFilter} options={[["all", "All"], ["qr", "QR"], ["nfc", "NFC"]]} />
                <FilterSelect label="Purchasable" value={purchasableFilter} onChange={setPurchasableFilter} options={[["all", "All"], ["yes", "Yes"], ["no", "No"]]} />
              </div>
            </div>
            <div className="max-h-[38rem] overflow-y-auto p-2">
              {loading ? <StatusLine>Loading tag products...</StatusLine> : null}
              {!loading && products.length === 0 ? <StatusLine>No tag products found.</StatusLine> : null}
              {products.map((product) => (
                <button
                  className={`mb-2 w-full rounded-xl border p-3 text-left transition ${selectedProduct?.id === product.id ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:bg-slate-50"}`}
                  key={product.id}
                  onClick={() => void openProduct(product.id)}
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
              ))}
            </div>
          </AdminSection>

          <div className="grid min-w-0 gap-4">
            <ProductEditor
              busy={busy}
              form={productForm}
              isNew={!selectedProduct}
              onArchive={() => void archiveProduct()}
              onChange={setProductForm}
              onImageUpload={(file) => void uploadProductImage(file)}
              onSave={() => void submitProduct()}
              product={selectedProduct}
            />
            {selectedProduct ? (
              <VariantEditor
                busy={busy}
                form={variantForm}
                onArchive={() => void archiveVariant()}
                onChange={setVariantForm}
                onClear={clearVariant}
                onEdit={editVariant}
                onSave={() => void submitVariant()}
                product={selectedProduct}
                selectedVariantId={selectedVariantId}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <PromotionsEditor
          busy={busy}
          form={promotionForm}
          loading={loading}
          onChange={setPromotionForm}
          onEdit={editPromotion}
          onNew={() => { setSelectedPromotionId(undefined); setPromotionForm(blankPromotion); }}
          onSave={() => void submitPromotion()}
          promotions={promotions}
          selectedId={selectedPromotionId}
          variants={promotionVariants}
        />
      )}
    </div>
  );
}

function ProductEditor({ product, form, isNew, busy, onChange, onImageUpload, onSave, onArchive }: {
  product: AdminTagProduct | null;
  form: AdminProductInput;
  isNew: boolean;
  busy: boolean;
  onChange: (value: AdminProductInput) => void;
  onImageUpload: (file: File) => void;
  onSave: () => void;
  onArchive: () => void;
}) {
  return (
    <AdminSection title={isNew ? "Create product" : `Edit ${product?.name}`} description="Customer-facing product information and publication state.">
      <div className="grid gap-5 p-4 sm:p-5">
        <FormGroup title="Basic information">
          <Field label="Product name"><input className={fieldClass} value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} /></Field>
          <Field label="Stable product link"><input className={fieldClass} value={form.slug} onChange={(event) => onChange({ ...form, slug: event.target.value.toLowerCase().replace(/\s+/g, "-") })} placeholder="smart-pet-tag" /></Field>
          <Field label="Short description"><input className={fieldClass} value={form.shortDescription ?? ""} onChange={(event) => onChange({ ...form, shortDescription: event.target.value })} /></Field>
          <Field label="Full description" wide><textarea className={textAreaClass} value={form.description ?? ""} onChange={(event) => onChange({ ...form, description: event.target.value })} /></Field>
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
          <label className="sm:col-span-2 grid cursor-pointer gap-1 rounded-xl border border-dashed border-slate-300 p-4 text-sm font-bold text-slate-700">
            Upload product image
            <span className="text-xs font-medium text-slate-500">JPEG, PNG, or WebP, up to 10 MB. Add useful alternative text after upload.</span>
            <input accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" disabled={busy || form.media.length >= 12} onChange={(event) => { const file = event.target.files?.[0]; if (file) onImageUpload(file); event.target.value = ""; }} type="file" />
          </label>
        </FormGroup>
        <FormGroup title="Publication">
          <Field label="Display order"><input className={fieldClass} min={0} type="number" value={form.sortOrder} onChange={(event) => onChange({ ...form, sortOrder: numberValue(event.target.value) })} /></Field>
          <Toggle checked={form.isPublished} label="Published for customers" onChange={(checked) => onChange({ ...form, isPublished: checked })} />
        </FormGroup>
        <div className="flex flex-wrap justify-end gap-2">
          {!isNew && !product?.isArchived ? <AdminActionButton disabled={busy} onClick={onArchive} tone="danger">Archive Product</AdminActionButton> : null}
          <AdminActionButton disabled={busy || product?.isArchived} onClick={onSave} tone="primary">{busy ? "Saving..." : "Save Product"}</AdminActionButton>
        </div>
      </div>
    </AdminSection>
  );
}

function VariantEditor({ product, form, selectedVariantId, busy, onChange, onEdit, onClear, onSave, onArchive }: {
  product: AdminTagProduct;
  form: AdminVariantInput;
  selectedVariantId?: string;
  busy: boolean;
  onChange: (value: AdminVariantInput) => void;
  onEdit: (variant: AdminTagProductVariant) => void;
  onClear: () => void;
  onSave: () => void;
  onArchive: () => void;
}) {
  const selected = product.variants.find((variant) => variant.id === selectedVariantId);
  return (
    <AdminSection title="Product variants / SKUs" description="Each SKU is one exact sellable and manufacturable configuration." action={<AdminActionButton onClick={onClear}>New SKU</AdminActionButton>}>
      <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-2">
        {product.variants.length === 0 ? <StatusLine>No SKUs added yet.</StatusLine> : null}
        {product.variants.map((variant) => (
          <button className={`rounded-xl border p-3 text-left ${selectedVariantId === variant.id ? "border-slate-900 bg-slate-50" : "border-slate-200"}`} key={variant.id} onClick={() => onEdit(variant)} type="button">
            <div className="flex items-start justify-between gap-2"><span className="font-mono text-sm font-black text-slate-950">{variant.sku}</span><Badge tone={variant.isArchived ? "soft" : variant.isPurchasable ? "mint" : "warm"}>{variant.isArchived ? "Archived" : variant.isPurchasable ? "Purchasable" : "Unavailable"}</Badge></div>
            <p className="mt-1 text-sm font-semibold text-slate-700">{variant.displayName}</p>
            <p className="mt-1 text-xs text-slate-500">{formatCatalogPrice(variant.basePrice, variant.currency)} · {variant.inventoryCount} inventory</p>
          </button>
        ))}
      </div>
      <div className="grid gap-5 p-4 sm:p-5">
        {selected?.productionFieldsLocked ? <AdminNotice>Production specifications are locked because this SKU has inventory or order history. Create a new versioned SKU to change them.</AdminNotice> : null}
        <FormGroup title="Basic information">
          <Field label="SKU"><input className={fieldClass} disabled={selected?.productionFieldsLocked} value={form.sku} onChange={(event) => onChange({ ...form, sku: event.target.value.toUpperCase() })} /></Field>
          <Field label="Variant name"><input className={fieldClass} value={form.displayName} onChange={(event) => onChange({ ...form, displayName: event.target.value })} /></Field>
          <Field label="Tag variant"><select className={fieldClass} disabled={selected?.productionFieldsLocked} value={form.tagVariant} onChange={(event) => onChange({ ...form, tagVariant: event.target.value })}><option>Lightweight</option><option>Standard</option></select></Field>
          <Field label="Display order"><input className={fieldClass} min={0} type="number" value={form.sortOrder} onChange={(event) => onChange({ ...form, sortOrder: numberValue(event.target.value) })} /></Field>
        </FormGroup>
        <FormGroup title="Capabilities">
          <Toggle checked={form.supportsQr} disabled={selected?.productionFieldsLocked} label="QR scanning" onChange={(checked) => onChange({ ...form, supportsQr: checked })} />
          <Toggle checked={form.supportsNfc} disabled={selected?.productionFieldsLocked} label="NFC tapping" onChange={(checked) => onChange({ ...form, supportsNfc: checked })} />
        </FormGroup>
        <FormGroup title="Physical specifications">
          <NumberField label="Width (mm)" value={form.widthMm} disabled={selected?.productionFieldsLocked} onChange={(value) => onChange({ ...form, widthMm: value })} />
          <NumberField label="Height (mm)" value={form.heightMm} disabled={selected?.productionFieldsLocked} onChange={(value) => onChange({ ...form, heightMm: value })} />
          <NumberField label="Thickness (mm)" value={form.thicknessMm} disabled={selected?.productionFieldsLocked} onChange={(value) => onChange({ ...form, thicknessMm: value })} />
          <NumberField label="Weight (g)" value={form.weightGrams} disabled={selected?.productionFieldsLocked} onChange={(value) => onChange({ ...form, weightGrams: value })} />
          {(["material", "shape", "colour", "packagingType"] as const).map((key) => <Field key={key} label={key === "packagingType" ? "Packaging" : titleCase(key)}><input className={fieldClass} disabled={selected?.productionFieldsLocked} value={form[key] ?? ""} onChange={(event) => onChange({ ...form, [key]: event.target.value })} /></Field>)}
        </FormGroup>
        <FormGroup title="Pricing">
          <NumberField label="Base price" value={form.basePrice} onChange={(value) => onChange({ ...form, basePrice: value ?? 0 })} />
          <Field label="Currency"><input className={fieldClass} disabled value="MYR" /></Field>
          <NumberField label="Compare-at price (optional)" value={form.compareAtPrice} onChange={(value) => onChange({ ...form, compareAtPrice: value })} />
        </FormGroup>
        <FormGroup title="Production">
          <Field label="Print template"><input className={fieldClass} disabled={selected?.productionFieldsLocked} value={form.printTemplateCode ?? ""} onChange={(event) => onChange({ ...form, printTemplateCode: event.target.value })} /></Field>
          <Field label="Production notes" wide><textarea className={textAreaClass} value={form.productionNotes ?? ""} onChange={(event) => onChange({ ...form, productionNotes: event.target.value })} /></Field>
        </FormGroup>
        <FormGroup title="Availability">
          <Toggle checked={form.isActive} label="Active SKU" onChange={(checked) => onChange({ ...form, isActive: checked })} />
          <Toggle checked={form.isPurchasable} label="Purchasable by customers" onChange={(checked) => onChange({ ...form, isPurchasable: checked })} />
        </FormGroup>
        <div className="flex flex-wrap justify-end gap-2">
          {selectedVariantId && !selected?.isArchived ? <AdminActionButton disabled={busy} onClick={onArchive} tone="danger">Archive SKU</AdminActionButton> : null}
          <AdminActionButton disabled={busy || selected?.isArchived || product.isArchived} onClick={onSave} tone="primary">{busy ? "Saving..." : selectedVariantId ? "Save SKU" : "Create SKU"}</AdminActionButton>
        </div>
      </div>
    </AdminSection>
  );
}

function PromotionsEditor({ promotions, variants, form, selectedId, loading, busy, onChange, onEdit, onNew, onSave }: {
  promotions: AdminPromotion[];
  variants: (AdminTagProductVariant & { productName: string; productPublished: boolean })[];
  form: AdminPromotionInput;
  selectedId?: string;
  loading: boolean;
  busy: boolean;
  onChange: (value: AdminPromotionInput) => void;
  onEdit: (promotion: AdminPromotion) => void;
  onNew: () => void;
  onSave: () => void;
}) {
  const previewVariant = variants.find((variant) => form.productVariantIds.includes(variant.id));
  const previewDiscount = previewVariant
    ? form.discountType === "Percentage"
      ? previewVariant.basePrice * form.discountValue / 100
      : form.discountValue
    : 0;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.6fr)]">
      <AdminSection title="Promotions" description="One automatic promotion applies per SKU; priority wins, then the greatest discount." action={<AdminActionButton onClick={onNew} tone="primary">New Promotion</AdminActionButton>}>
        <div className="p-2">
          {loading ? <StatusLine>Loading promotions...</StatusLine> : null}
          {!loading && promotions.length === 0 ? <StatusLine>No promotions created.</StatusLine> : null}
          {promotions.map((promotion) => <button className={`mb-2 w-full rounded-xl border p-3 text-left ${selectedId === promotion.id ? "border-slate-900 bg-slate-50" : "border-slate-200"}`} key={promotion.id} onClick={() => onEdit(promotion)} type="button"><div className="flex justify-between gap-2"><span className="font-black text-slate-950">{promotion.name}</span><Badge tone={promotion.isActive ? "mint" : "soft"}>{promotion.isActive ? "Enabled" : "Disabled"}</Badge></div><p className="mt-1 text-xs text-slate-500">{promotion.discountType === "Percentage" ? `${promotion.discountValue}%` : formatCatalogPrice(promotion.discountValue)} · Priority {promotion.priority}</p></button>)}
        </div>
      </AdminSection>
      <AdminSection title={selectedId ? "Edit promotion" : "Create promotion"} description="Promotions change effective prices without overwriting the SKU base price.">
        <div className="grid gap-5 p-4 sm:p-5">
          <FormGroup title="Promotion details">
            <Field label="Promotion name"><input className={fieldClass} value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} /></Field>
            <Field label="Customer label"><input className={fieldClass} value={form.displayLabel ?? ""} onChange={(event) => onChange({ ...form, displayLabel: event.target.value })} /></Field>
            <Field label="Internal description" wide><textarea className={textAreaClass} value={form.internalDescription ?? ""} onChange={(event) => onChange({ ...form, internalDescription: event.target.value })} /></Field>
          </FormGroup>
          <FormGroup title="Discount and priority">
            <Field label="Discount type"><select className={fieldClass} value={form.discountType} onChange={(event) => onChange({ ...form, discountType: event.target.value as AdminPromotionInput["discountType"] })}><option value="Percentage">Percentage</option><option value="FixedAmount">Fixed amount</option></select></Field>
            <NumberField label="Discount value" value={form.discountValue} onChange={(value) => onChange({ ...form, discountValue: value ?? 0 })} />
            <NumberField label="Priority" value={form.priority} onChange={(value) => onChange({ ...form, priority: value ?? 0 })} />
          </FormGroup>
          <FormGroup title="Schedule">
            <Field label="Starts"><input className={fieldClass} type="datetime-local" value={toLocalInput(form.startsAt)} onChange={(event) => onChange({ ...form, startsAt: fromLocalInput(event.target.value) })} /></Field>
            <Field label="Ends"><input className={fieldClass} type="datetime-local" value={toLocalInput(form.endsAt)} onChange={(event) => onChange({ ...form, endsAt: fromLocalInput(event.target.value) })} /></Field>
          </FormGroup>
          <FormGroup title="Applicable SKUs">
            <div className="grid gap-2 sm:col-span-2">
              {variants.map((variant) => <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm font-semibold" key={variant.id}><input checked={form.productVariantIds.includes(variant.id)} disabled={variant.isArchived || !variant.isPurchasable || !variant.productPublished} onChange={(event) => onChange({ ...form, productVariantIds: event.target.checked ? [...form.productVariantIds, variant.id] : form.productVariantIds.filter((id) => id !== variant.id) })} type="checkbox" /><span><strong>{variant.sku}</strong> · {variant.productName} · {formatCatalogPrice(variant.basePrice, variant.currency)}</span></label>)}
            </div>
          </FormGroup>
          <FormGroup title="Availability">
            <Toggle checked={form.isAutomatic} label="Apply automatically" onChange={(checked) => onChange({ ...form, isAutomatic: checked })} />
            <Toggle checked={form.isActive} label="Promotion enabled" onChange={(checked) => onChange({ ...form, isActive: checked })} />
          </FormGroup>
          {previewVariant ? <AdminNotice>Price preview for {previewVariant.sku}: {formatCatalogPrice(previewVariant.basePrice, previewVariant.currency)} → {formatCatalogPrice(Math.max(0, previewVariant.basePrice - previewDiscount), previewVariant.currency)}</AdminNotice> : null}
          <div className="flex justify-end"><AdminActionButton disabled={busy} onClick={onSave} tone="primary">{busy ? "Saving..." : "Save Promotion"}</AdminActionButton></div>
        </div>
      </AdminSection>
    </div>
  );
}

function FormGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2"><legend className="px-2 text-sm font-black text-slate-900">{title}</legend>{children}</fieldset>;
}
function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`grid gap-1 text-xs font-extrabold uppercase text-slate-500 ${wide ? "sm:col-span-2" : ""}`}>{label}{children}</label>;
}
function NumberField({ label, value, disabled, onChange }: { label: string; value?: number | null; disabled?: boolean; onChange: (value: number | null) => void }) {
  return <Field label={label}><input className={fieldClass} disabled={disabled} min={0} step="0.01" type="number" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} /></Field>;
}
function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-800"><input checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />{label}</label>;
}
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button aria-selected={active} className={`min-h-10 rounded-full border px-4 text-sm font-extrabold ${active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700"}`} onClick={onClick} role="tab" type="button">{children}</button>;
}
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">{label}<select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
function StatusLine({ children }: { children: React.ReactNode }) { return <p className="p-4 text-sm font-semibold text-slate-500">{children}</p>; }
function productInput(product: AdminTagProduct): AdminProductInput { return { name: product.name, slug: product.slug, shortDescription: product.shortDescription, description: product.description, isPublished: product.isPublished, sortOrder: product.sortOrder, media: product.media.map((item) => ({ mediaFileId: item.mediaFileId, productVariantId: item.productVariantId, sortOrder: item.sortOrder, altText: item.altText })), concurrencyToken: product.concurrencyToken }; }
function variantInput(variant: AdminTagProductVariant): AdminVariantInput { return { sku: variant.sku, displayName: variant.displayName, supportsQr: variant.supportsQr, supportsNfc: variant.supportsNfc, tagVariant: variant.tagVariant, widthMm: variant.widthMm, heightMm: variant.heightMm, thicknessMm: variant.thicknessMm, weightGrams: variant.weightGrams, material: variant.material, shape: variant.shape, colour: variant.colour, packagingType: variant.packagingType, basePrice: variant.basePrice, currency: variant.currency, compareAtPrice: variant.compareAtPrice, printTemplateCode: variant.printTemplateCode, productionNotes: variant.productionNotes, isActive: variant.isActive, isPurchasable: variant.isPurchasable, sortOrder: variant.sortOrder, concurrencyToken: variant.concurrencyToken }; }
function friendlyError(error: unknown) { if (isApiClientError(error)) return Object.values(error.details ?? {}).flat()[0] ?? error.message; return error instanceof Error ? error.message : "This change could not be saved. Please try again."; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-MY", { dateStyle: "medium" }).format(new Date(value)); }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function numberValue(value: string) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function toLocalInput(value: string) { const date = new Date(value); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function fromLocalInput(value: string) { return value ? new Date(value).toISOString() : ""; }
