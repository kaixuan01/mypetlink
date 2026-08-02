import type { TagOrder } from "@/types";

function normalized(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function formatOrderProduct(
  productName: string | null | undefined,
  optionName: string | null | undefined,
  fallback = "MyPetLink Pet Tag"
) {
  const product = normalized(productName) || fallback;
  const option = normalized(optionName).replace(/\s+Tag$/i, "");
  if (!option || product.toLocaleLowerCase().includes(option.toLocaleLowerCase())) {
    return product;
  }
  return `${product} · ${option}`;
}

export function formatOrderOption(order: Pick<TagOrder, "variantName" | "variant">) {
  const option = normalized(order.variantName) || normalized(order.variant);
  return option.replace(/\s+Tag$/i, "") || "Standard";
}

export function formatStateAndZone(
  state: string | null | undefined,
  zone: string | null | undefined
) {
  const stateLabel = normalized(state);
  const zoneLabel = normalized(zone);
  if (!zoneLabel || stateLabel.toLocaleLowerCase() === zoneLabel.toLocaleLowerCase()) {
    return stateLabel;
  }
  return `${stateLabel} · ${zoneLabel}`;
}
