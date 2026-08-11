"use client";

import Image from "next/image";
import { useId, useRef } from "react";
import { useModalDialogFocus } from "@/lib/useModalDialogFocus";
import { formatCatalogPrice, type TagProduct, type TagProductMedia, type TagProductVariant } from "@/services/tagCatalogService";

export function TagProductPickerDialog({
  products,
  selectedVariantKey,
  lineLabel,
  onSelect,
  onClose,
}: {
  products: TagProduct[];
  selectedVariantKey: string;
  lineLabel: string;
  onSelect: (variantKey: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const availableProducts = products
    .map((product) => ({ ...product, variants: product.variants.filter((variant) => variant.inStock) }))
    .filter((product) => product.variants.length > 0);

  useModalDialogFocus({
    dialogRef: panelRef,
    initialFocusRef: closeRef,
    onEscape: onClose,
  });

  return (
    <div
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-[60] grid place-items-end bg-pet-ink/45 backdrop-blur-sm sm:place-items-center sm:p-4"
      role="dialog"
    >
      <button
        aria-hidden="true"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        className={`relative flex max-h-[calc(100dvh-0.5rem)] w-full flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:max-h-[88dvh] sm:rounded-[2rem] ${availableProducts.length > 1 ? "max-w-5xl" : "max-w-2xl"}`}
        ref={panelRef}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-pet-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-pet-coral">{lineLabel}</p>
            <h2 className="mt-1 text-2xl font-black text-pet-ink" id={titleId}>Choose a tag</h2>
            <p className="mt-1 text-sm text-pet-muted" id={descriptionId}>Choose a design, then select the tag type that suits you.</p>
          </div>
          <button
            aria-label="Close tag picker"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-pet-border bg-white text-xl font-black text-pet-ink"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6">
          <div aria-label="Available tag designs" className={`grid gap-4 ${availableProducts.length > 1 ? "md:grid-cols-2" : ""}`} role="radiogroup">
            {availableProducts.map((product) => {
              const variantLabels = new Set(product.variants.map((variant) => customerVariantLabel(variant.tagVariant)).filter(Boolean));
              const sharedVariantLabel = variantLabels.size === 1 ? Array.from(variantLabels)[0] : "";
              const image = product.media[0];
              return (
                <article className="min-w-0 overflow-hidden rounded-[1.5rem] border border-pet-border bg-pet-cream/45" key={product.slug}>
                  <ProductImage image={image} name={conciseProductName(product.name)} />
                  <div className="grid gap-4 p-4">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-black text-pet-ink">{conciseProductName(product.name)}</h3>
                      {sharedVariantLabel ? <p className="mt-1 text-sm font-bold text-pet-muted">{sharedVariantLabel}</p> : null}
                      {product.shortDescription ? <p className="mt-2 line-clamp-2 text-sm leading-5 text-pet-muted">{product.shortDescription}</p> : null}
                    </div>

                    <div className="grid gap-2">
                      {product.variants.map((variant) => {
                        const selected = variant.key === selectedVariantKey;
                        const technology = tagTechnology(variant);
                        const variantLabel = customerVariantLabel(variant.tagVariant);
                        return (
                          <button
                            aria-checked={selected}
                            aria-label={`${conciseProductName(product.name)}, ${variantLabel ? `${variantLabel}, ` : ""}${technology.label}, ${formatCatalogPrice(variant.price.finalPrice, variant.price.currency)}`}
                            className={`grid min-h-20 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-pet-teal ${selected ? "border-pet-teal bg-white ring-2 ring-pet-teal/20" : "border-pet-border bg-white hover:border-pet-teal/50"}`}
                            key={variant.key}
                            onClick={() => onSelect(variant.key)}
                            role="radio"
                            type="button"
                          >
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-black text-pet-ink">{technology.label}</span>
                                {selected ? <span className="rounded-full bg-pet-teal px-2 py-0.5 text-[0.68rem] font-black uppercase tracking-wide text-white">Selected</span> : null}
                              </span>
                              {!sharedVariantLabel && variantLabel ? <span className="mt-1 block text-xs font-bold text-pet-muted">{variantLabel}</span> : null}
                              <span className="mt-1 block text-xs font-semibold leading-4 text-pet-muted">{technology.description}</span>
                              {variant.price.promotionLabel ? <span className="mt-1 block text-xs font-black text-pet-coral">{variant.price.promotionLabel}</span> : null}
                            </span>
                            <TagPrice variant={variant} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function conciseProductName(name: string) {
  return name.trim().replace(/^MyPetLink\s+/i, "") || "Pet Tag";
}

export function customerVariantLabel(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return isCustomerPlaceholder(normalized) ? "" : normalized;
}

export function isCustomerPlaceholder(value: string | null | undefined) {
  const normalized = value?.trim().toLocaleLowerCase() ?? "";
  return !normalized || ["-", "—", "n/a", "na", "none", "not set"].includes(normalized);
}

export function tagTechnology(variant: Pick<TagProductVariant, "supportsQr" | "supportsNfc">) {
  if (variant.supportsQr && variant.supportsNfc) {
    return { label: "QR + NFC", description: "Scan QR or tap with NFC" };
  }
  if (variant.supportsNfc) {
    return { label: "NFC", description: "Tap with an NFC-enabled phone" };
  }
  return { label: "QR", description: "Scan with any phone camera" };
}

function ProductImage({ image, name }: { image?: TagProductMedia; name: string }) {
  return image ? (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-white">
      <Image alt={image.altText || name} className="object-contain p-3" fill sizes="(max-width: 767px) 100vw, 480px" src={image.url} unoptimized />
    </div>
  ) : (
    <div className="grid aspect-[4/3] w-full place-items-center bg-white p-6 text-center text-sm font-bold text-pet-muted">
      Product image coming soon
    </div>
  );
}

function TagPrice({ variant }: { variant: TagProductVariant }) {
  const discounted = variant.price.discountAmount > 0 && variant.price.finalPrice < variant.price.basePrice;
  return (
    <span className="shrink-0 text-right">
      <span className="block whitespace-nowrap text-base font-black text-pet-teal">{formatCatalogPrice(variant.price.finalPrice, variant.price.currency)}</span>
      {discounted ? <span className="block text-xs font-bold text-pet-muted line-through">{formatCatalogPrice(variant.price.basePrice, variant.price.currency)}</span> : null}
    </span>
  );
}
