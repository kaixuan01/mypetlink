import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Release check: does what the website says about the Smart Tag match the
 * catalogue that checkout actually uses?
 *
 * The public pages are a static export, so "Available now" and the RM price
 * are fixed at build time — the label from the ordering flags, the price from
 * `smartTagAddOn.price` in `src/lib/planLimits.ts`. Checkout reads the
 * database catalogue at request time, and the catalogue's `inStock` counts only
 * stock that physical QA has released and no order has reserved. This script
 * compares the two before a release, read-only, and fails if they disagree:
 *
 * - a QR + NFC variant is offered at a different price or currency;
 * - a variant that is not QR + NFC is offered (the QR-only tag is retired);
 * - ordering is being released while no QR + NFC variant is in stock.
 *
 *   PUBLIC_API_BASE_URL=https://api.mypetlink.com.my \
 *   NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED=true \
 *   npm run verify:smart-tag-catalog
 *
 * It never writes anything. It does not decide availability: stock can sell
 * out after a deployment, and the order flow already handles that per SKU.
 */

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiBase = (
  process.env.PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  ""
).replace(/\/+$/, "");
const orderingReleased =
  process.env.NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED === "true" &&
  process.env.NEXT_PUBLIC_TAG_ORDERS_ENABLED === "true";

if (!apiBase) {
  console.error("Set PUBLIC_API_BASE_URL (or NEXT_PUBLIC_API_BASE_URL) to the API origin.");
  process.exit(1);
}

const planLimits = await readFile(path.join(appRoot, "src/lib/planLimits.ts"), "utf8");
const addOnBlock = /export const smartTagAddOn = \{([\s\S]*?)\n\} as const;/.exec(planLimits)?.[1] ?? "";
const displayPrice = /\bprice: "RM(\d+(?:\.\d{2})?)"/.exec(addOnBlock)?.[1];
if (!displayPrice) {
  console.error("Could not read smartTagAddOn.price from src/lib/planLimits.ts.");
  process.exit(1);
}

const response = await fetch(`${apiBase}/api/v1/tag-products`, {
  headers: { Accept: "application/json" },
});
if (!response.ok) {
  console.error(`The catalogue answered ${response.status}; refusing to guess.`);
  process.exit(1);
}
const products = (await response.json()).data ?? [];

const failures = [];
const rows = [];
let sellableInStock = 0;

for (const product of products) {
  for (const variant of product.variants ?? []) {
    const qrNfc = variant.supportsQr === true && variant.supportsNfc === true;
    const price = variant.price?.finalPrice;
    const currency = variant.price?.currency;
    rows.push({
      product: product.name,
      variant: variant.name,
      sku: variant.sku,
      "QR+NFC": qrNfc,
      price: `${currency} ${price}`,
      promotion: variant.price?.promotionName ?? "",
      inStock: variant.inStock,
    });

    if (!qrNfc) {
      failures.push(`${variant.sku} is offered but is not a QR + NFC tag.`);
      continue;
    }
    if (currency !== "MYR" || Number(price).toFixed(2) !== Number(displayPrice).toFixed(2)) {
      failures.push(
        `${variant.sku} sells at ${currency} ${price}; the website advertises RM${displayPrice}.`
      );
    }
    if (variant.inStock === true) sellableInStock += 1;
  }
}

console.table(rows);
console.log(
  `Website: RM${displayPrice}, ordering ${orderingReleased ? "released" : "not released"} in this build. ` +
    `Catalogue: ${rows.length} offered variant(s), ${sellableInStock} QR + NFC variant(s) in stock (QA-released, unreserved).`
);

if (orderingReleased && sellableInStock === 0) {
  failures.push(
    "This build tells visitors the Smart Tag is available now, but no QR + NFC variant is in stock."
  );
}

if (failures.length > 0) {
  console.error("Smart Tag catalogue check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Smart Tag catalogue check passed.");
