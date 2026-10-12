import type { TagProductVariant } from "@/services/tagCatalogService";

type PhysicalVariant = Pick<TagProductVariant, "widthMm" | "heightMm" | "thicknessMm" | "weightGrams" | "material" | "shape">;

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
  const material = variant.material?.trim() || null;

  return {
    size,
    weight: weightLabel,
    summary: [size, weightLabel].filter(Boolean).join(" · "),
    secondary: [thickness ? `Thickness ${thickness} mm` : null, material].filter(Boolean).join(" · "),
  };
}
