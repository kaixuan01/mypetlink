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

/**
 * Pet summary for an order that may cover several pets. A one-pet order reads
 * naturally, two or three pets are listed, and a larger order collapses to a
 * count so the header stays scannable — the line items and tag-assignment
 * sections remain the authoritative detail.
 */
export function formatOrderPets(
  items: ReadonlyArray<{ petName?: string | null }> | null | undefined,
  fallback?: string | null
): string {
  const names: string[] = [];
  for (const item of items ?? []) {
    const name = item.petName?.trim();
    // Quantity lines repeat the same pet; list each pet once.
    if (name && !names.includes(name)) names.push(name);
  }

  if (names.length === 0) return fallback?.trim() || "Not set";
  if (names.length <= 3) return names.join(", ");
  return `${names.length} pets`;
}

/** "Pet" for a single-pet order, "Pets" once more than one is involved. */
export function petSummaryLabel(
  items: ReadonlyArray<{ petName?: string | null }> | null | undefined
): string {
  const unique = new Set(
    (items ?? []).map((item) => item.petName?.trim()).filter(Boolean)
  );
  return unique.size > 1 ? "Pets" : "Pet";
}
