import { formatTagPhysicalSpecs } from "@/lib/tagPhysicalSpecs";
import type { TagProductVariant } from "@/services/tagCatalogService";

export function TagPhysicalFacts({ variant, secondary = false }: { variant: TagProductVariant; secondary?: boolean }) {
  const specs = formatTagPhysicalSpecs(variant);
  if (!specs.summary && !(secondary && specs.secondary)) return null;

  return (
    <span className="mt-1 block text-xs font-semibold leading-4 text-pet-muted">
      {specs.summary ? <span className="block">{specs.summary}</span> : null}
      {secondary && specs.secondary ? <span className="mt-0.5 block">{specs.secondary}</span> : null}
    </span>
  );
}
