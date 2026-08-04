/**
 * Canonical delivery wording, mirroring the API's `DeliveryLabels`.
 *
 * Customers see "West Malaysia" rather than the geographer's "Peninsular";
 * operators keep "Peninsular Malaysia (West Malaysia)" so both vocabularies stay
 * connected. Zone codes (PEN/SBH/SWK/LBN) never change — this is wording only.
 *
 * The API already normalises what it sends, so this exists for local demo data
 * and as a second line of defence: a legacy label reaching the screen from any
 * path still reads in today's wording, and no stored value is ever rewritten.
 */
export const WEST_MALAYSIA = "West Malaysia";
export const WEST_MALAYSIA_ADMIN = "Peninsular Malaysia (West Malaysia)";

const EN_DASH = "—";
const STANDARD_DELIVERY = "Standard Delivery";

const customerRegions: Record<string, string> = {
  PEN: WEST_MALAYSIA,
  SBH: "Sabah",
  SWK: "Sarawak",
  LBN: "Labuan",
};

const adminRegions: Record<string, string> = {
  PEN: WEST_MALAYSIA_ADMIN,
  SBH: "Sabah",
  SWK: "Sarawak",
  LBN: "Labuan",
};

/**
 * Labels MyPetLink itself has shipped. Only these are re-worded; a name an
 * administrator typed is left exactly as entered.
 */
const legacyMethods: Record<string, string> = {
  "peninsular standard delivery": "PEN",
  "peninsular malaysia standard delivery": "PEN",
  "peninsular malaysia delivery": "PEN",
  "standard delivery - peninsular malaysia": "PEN",
  "standard delivery — peninsular malaysia": "PEN",
  "standard delivery - peninsular": "PEN",
  "standard delivery — peninsular": "PEN",
  "sabah standard delivery": "SBH",
  "standard delivery - sabah": "SBH",
  "sarawak standard delivery": "SWK",
  "standard delivery - sarawak": "SWK",
  "labuan standard delivery": "LBN",
  "standard delivery - labuan": "LBN",
};

const legacyRegions: Record<string, string> = {
  peninsular: WEST_MALAYSIA,
  "peninsular malaysia": WEST_MALAYSIA,
};

export function resolveZoneCode(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";

  const upper = trimmed.toUpperCase();
  if (customerRegions[upper]) return upper;

  const byRegion = Object.entries(customerRegions).find(
    ([, region]) => region.toLowerCase() === trimmed.toLowerCase()
  );
  if (byRegion) return byRegion[0];

  return legacyRegions[trimmed.toLowerCase()] ? "PEN" : "";
}

/** The delivery method a customer should see for a zone. */
export function customerDeliveryMethod(zoneCode: string | null | undefined) {
  const region = customerRegions[resolveZoneCode(zoneCode)];
  return region ? `${STANDARD_DELIVERY} ${EN_DASH} ${region}` : STANDARD_DELIVERY;
}

/** Region wording for the Admin Portal. */
export function adminRegionLabel(zoneCode: string | null | undefined) {
  return adminRegions[resolveZoneCode(zoneCode)] ?? "";
}

/**
 * Re-words a stored delivery method for display. A blank or MyPetLink-issued
 * label becomes the canonical wording; anything else is returned untouched.
 */
export function normalizeDeliveryMethod(
  storedName: string | null | undefined,
  zoneCode?: string | null
) {
  const trimmed = (storedName ?? "").trim();
  if (!trimmed) return customerDeliveryMethod(zoneCode);

  const legacyZone = legacyMethods[trimmed.toLowerCase()];
  return legacyZone ? customerDeliveryMethod(legacyZone) : trimmed;
}

/** Re-words a stored zone name for display, on the same terms. */
export function normalizeDeliveryRegion(
  storedZoneName: string | null | undefined,
  zoneCode?: string | null
) {
  const trimmed = (storedZoneName ?? "").trim();
  if (!trimmed) return customerRegions[resolveZoneCode(zoneCode)] ?? "";

  return legacyRegions[trimmed.toLowerCase()] ?? trimmed;
}

/** For contexts that cannot carry an en dash safely, such as a plain CSV. */
export function toPlainDeliveryLabel(label: string) {
  return label.replace(new RegExp(EN_DASH, "g"), "-");
}
