// Phase 1B browser QA: monthly stocktake, period close, discrepancies and carry forward through the
// real UI, against the local API and a disposable QA database seeded with synthetic data only.
// Usage: node artifacts/consignment-stocktake/e2e-stocktake.mjs <seeded.json> [baseUrl]
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("apps/web/package.json"));
const { chromium } = require("playwright-core");
const seeded = JSON.parse(await readFile(process.argv[2], "utf8"));
const origin = process.argv[3] ?? "http://localhost:3001";
const api = "http://localhost:5281/api/v1/admin/merchant-sales/consignment";
const out = path.resolve("artifacts/consignment-stocktake/screenshots");
await mkdir(out, { recursive: true });
const base = `${origin}/admin/merchant-sales?tab=consignment`;
const login = (await (await fetch("http://localhost:5281/api/v1/dev-auth/admin-login", { method: "POST" })).json()).data;
const headers = { Authorization: `Bearer ${login.accessToken}`, "Content-Type": "application/json" };
async function call(method, p, body) {
  const r = await fetch(api + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j.data;
}
const solo = (evidence) => ({ confirmed: true, reason: "Founder checked the partner evidence", externalEvidenceReference: evidence });

// The 16–30 Sep report, verified through the API (the sales report UI is covered by the Phase 1A rehearsal).
const terms = await call("GET", `/price-terms?agreementId=${seeded.agreement}`);
const std = (variant) => terms.find((t) => t.productVariantId === variant && t.kind === "Standard").id;
let report = await call("POST", "/sales-reports", { agreementId: seeded.agreement, merchantBranchId: seeded.branch, periodMonth: "2026-09", half: 2,
  partnerReference: "2026-09-B", reportReceivedAt: "2026-10-01T04:00:00Z", evidenceLevel: "Documented", evidenceKind: "POS report",
  evidenceReference: "POS report photo 1 Oct", notes: null,
  lines: Object.values(seeded.variants).map((v) => ({ productVariantId: v, lineType: "Sale", priceTermId: std(v), unitNetPrice: 39.9, quantity: 3 })) });
report = await call("POST", `/sales-reports/${report.id}/record`, { concurrencyToken: report.concurrencyToken });
await call("POST", `/sales-reports/${report.id}/verify`, { concurrencyToken: report.concurrencyToken, selfReview: solo("POS report photo 1 Oct"), acknowledgeWarnings: true });

const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const session = JSON.stringify({ accessToken: login.accessToken, refreshToken: login.refreshToken, expiresAt: Date.now() + login.expiresIn * 1000,
  user: login.user, ownerProfile: login.ownerProfile });
async function newPage(width = 1440, height = 900) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript((v) => localStorage.setItem("mypetlink_api_auth_session", v), session);
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  return page;
}
const pass = (label) => console.log("PASS", label);
const page = await newPage();
const snap = (name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
const dialog = () => page.getByRole("dialog");
const sections = () => page.getByRole("navigation", { name: "Consignment sections" });
const cells = async (table, sku) => (await page.getByRole("table", { name: table }).getByRole("row").filter({ hasText: sku }).getByRole("cell").allInnerTexts()).map((t) => t.trim());

// 1. The tab shows partner stock by SKU after the September reports: 32 / 25 / 23 on the shelf.
await page.goto(base, { waitUntil: "networkidle" });
await sections().getByRole("button", { name: /^Stocktake & reconciliation/ }).click();
await page.getByText("Monthly stocktakes").waitFor();
await page.getByRole("table", { name: /stock by SKU/ }).waitFor();
assert.deepEqual([(await cells(/stock by SKU/, "QA-PAWSOME-LW"))[1], (await cells(/stock by SKU/, "QA-PAWSOME-SD"))[1], (await cells(/stock by SKU/, "QA-MYBOSS-LW"))[1]], ["32", "25", "23"]);
await snap("01-stocktake-tab");
pass("stock position by SKU after verified September sales: 32 / 25 / 23");

// 2. Record the 30 Sep count: one Pawsome SD package missing, one My Boss package damaged.
await page.getByRole("button", { name: "Record stocktake" }).click();
await dialog().getByLabel("Count date").selectOption("2026-09-30");
await dialog().getByLabel("Counted sellable QA-PAWSOME-LW").waitFor();
const counts = { "QA-PAWSOME-LW": ["32", "0"], "QA-PAWSOME-SD": ["24", "0"], "QA-MYBOSS-LW": ["22", "1"] };
for (const [sku, [sellable, unsellable]] of Object.entries(counts)) {
  await dialog().getByLabel(`Counted sellable ${sku}`).fill(sellable);
  await dialog().getByLabel(`Counted unsellable ${sku}`).fill(unsellable);
}
const preview = async (sku) => (await dialog().getByRole("table", { name: /Expected and counted/ }).getByRole("row").filter({ hasText: sku }).getByRole("cell").last().innerText()).trim();
assert.deepEqual([await preview("QA-PAWSOME-LW"), await preview("QA-PAWSOME-SD"), await preview("QA-MYBOSS-LW")], ["Matches", "1 missing", "1 damaged"]);
await dialog().getByLabel("Counted by").fill("Shop owner with the founder on video call");
await dialog().getByLabel("Evidence reference").fill("Count sheet photo 30 Sep 9:40 pm");
await snap("02-record-count");
await dialog().getByRole("button", { name: "Record count" }).click();
await page.getByRole("heading", { name: "Stocktake 30 Sep 2026" }).waitFor();
pass("count entered by SKU with a live preview of what closing records; no Tag Code scanned");

// 3. Close the month (Solo self-review with the count's own evidence, findings acknowledged).
await page.getByRole("button", { name: "Close month" }).click();
await dialog().getByText(/opens next month with 24 sellable, 1 under investigation/).waitFor();
await dialog().getByRole("checkbox", { name: /This is my own work/ }).check();
assert.equal(await dialog().getByLabel("Self-review external evidence reference").inputValue(), "Count sheet photo 30 Sep 9:40 pm");
await dialog().getByLabel("Self-review reason").fill("Founder checked the count sheet photo with the shop owner");
await dialog().getByRole("checkbox", { name: /checked these points/ }).check();
await snap("03-close-month");
await dialog().getByRole("button", { name: "Close month" }).click();
await page.getByText("This month is closed").waitFor();
await page.getByText("Self-reviewed (Solo)").first().waitFor();
const closed = await cells(/Stocktake 30 Sep 2026 by SKU/, "QA-MYBOSS-LW");
assert.match(closed[3], /1 damaged/);
await snap("04-month-closed");
pass("month closed in one review; the count is frozen and carries forward");

// 4. Settle what the count found, with evidence.
await page.getByRole("button", { name: "All stocktakes" }).click();
await page.getByText("QA-PAWSOME-SD · Missing from the shelf").waitFor();
async function resolve(heading, outcome, quantity) {
  await page.getByRole("listitem").filter({ hasText: heading }).getByRole("button", { name: "Resolve" }).click();
  await dialog().getByRole("radio", { name: outcome }).check();
  await dialog().getByLabel("Quantity").fill(String(quantity));
  await dialog().getByLabel("Evidence", { exact: true }).fill("Owner WhatsApp photo 2 Oct");
  await dialog().getByLabel("Explanation").fill("Checked the storeroom with the shop owner");
  await dialog().getByRole("checkbox", { name: /Solo self-review/ }).check();
  await dialog().getByRole("button", { name: "Record outcome" }).click();
  await dialog().waitFor({ state: "detached" });
}
await snap("05-discrepancies");
await resolve("QA-PAWSOME-SD · Missing from the shelf", /Found at the shop/, 1);
await resolve("QA-MYBOSS-LW · Damaged or opened", /Confirmed damaged/, 1);
await page.getByText("No open discrepancies").waitFor();
await snap("06-discrepancies-resolved");
pass("shortage found and damaged package confirmed, each with evidence; nothing written off");

// 5. The books after settlement: 32 / 25 / 22 sellable, 1 My Boss unsellable, tie-out balanced.
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("table", { name: /stock by SKU/ }).waitFor();
const lw = await cells(/stock by SKU/, "QA-PAWSOME-LW"), sd = await cells(/stock by SKU/, "QA-PAWSOME-SD"), mb = await cells(/stock by SKU/, "QA-MYBOSS-LW");
assert.deepEqual([lw[1], sd[1], mb[1], mb[3]], ["32", "25", "22", "1"]);
for (const row of [lw, sd, mb]) assert.match(row[7], /Balanced/);
pass("carried-forward stock 32 / 25 / 22 (+1 unsellable), custody tie-out balanced");

// 6. Mobile: no real horizontal scroll on the stocktake views.
const mobile = await newPage(390, 844);
const stocktakeId = (await call("GET", "/stocktakes")).at(0).id;
for (const url of [`${base}&view=reconciliation`, `${base}&stocktake=${stocktakeId}`]) {
  await mobile.goto(url, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(800);
  const scroll = await mobile.evaluate(() => { window.scrollTo(4000, 0); return window.scrollX; });
  assert.equal(scroll, 0, `horizontal scroll on ${url}`);
}
await mobile.screenshot({ path: path.join(out, "07-mobile-stocktake.png"), fullPage: true });
pass("mobile stocktake views have no horizontal page scroll");

assert.deepEqual([...page.errors, ...mobile.errors], []);
console.log("No page errors.");
await browser.close();
