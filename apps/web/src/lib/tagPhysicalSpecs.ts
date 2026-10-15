import type { TagProductVariant } from "@/services/tagCatalogService";

type PhysicalVariant = Pick<TagProductVariant, "widthMm" | "heightMm" | "thicknessMm" | "weightGrams" | "material" | "shape">;

// Catalogue values such as "-" or "N/A" mean "not set" and are never shown to customers.
export function isCustomerPlaceholder(value: string | null | undefined) {
  const normalized = value?.trim().toLocaleLowerCase() ?? "";
  return !normalized || ["-", "—", "n/a", "na", "none", "not set"].includes(normalized);
}

function measurement(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }).format(value)
    : null;
}

export function formatTagPhysicalSpecs(variant: PhysicalVariant) {
  const width = measurement(variant.widthMm);
  const height = measurement(variant.heightMm);
  const weight = measurement(variant.weightGrams);
  const thickness = measurement(variant.thicknessMm);
  const isRound = variant.shape?.trim().toLowerCase() === "round";
  const isDiameter = isRound && width && height && variant.widthMm === variant.heightMm;
  const size = isDiameter
    ? `Diameter ${width} mm`
    : width && height
      ? `${width} × ${height} mm (W × H)`
      : width
        ? `Width ${width} mm`
        : height
          ? `Height ${height} mm`
          : null;
  const weightLabel = weight ? `Weight ${weight} g` : null;
  const material = isCustomerPlaceholder(variant.material) ? null : variant.material!.trim();

  return {
    size,
    weight: weightLabel,
    summary: [size, weightLabel].filter(Boolean).join(" · "),
    secondary: [thickness ? `Thickness ${thickness} mm` : null, material].filter(Boolean).join(" · "),
  };
}
