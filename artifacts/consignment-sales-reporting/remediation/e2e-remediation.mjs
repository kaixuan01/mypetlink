// Phase 1A remediation browser QA: the reviewed failure paths through the real UI, against the
// local API and a disposable QA database seeded with synthetic data only (see report.md).
// Usage: node artifacts/consignment-sales-reporting/remediation/e2e-remediation.mjs <seeded.json> [baseUrl]
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("apps/web/package.json"));
const { chromium } = require("playwright-core");
const seeded = JSON.parse(await readFile(process.argv[2], "utf8"));
const origin = process.argv[3] ?? "http://localhost:3001";
const api = "http://localhost:5281/api/v1/admin/merchant-sales/consignment";
const out = path.resolve("artifacts/consignment-sales-reporting/remediation/screenshots");
await mkdir(out, { recursive: true });
const base = `${origin}/admin/merchant-sales?tab=consignment`;
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const d = (await (await fetch("http://localhost:5281/api/v1/dev-auth/admin-login", { method: "POST" })).json()).data;
const session = JSON.stringify({ accessToken: d.accessToken, refreshToken: d.refreshToken, expiresAt: Date.now() + d.expiresIn * 1000, user: d.user, ownerProfile: d.ownerProfile });
const reports = async () => (await (await fetch(`${api}/sales-reports?pageSize=100`, { headers: { Authorization: `Bearer ${d.accessToken}` } })).json()).data;

async function newPage(width = 1440, height = 900) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript((v) => localStorage.setItem("mypetlink_api_auth_session", v), session);
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) page.errors.push(m.text()); });
  return page;
}
const pass = (label) => console.log("PASS", label);
const page = await newPage();
const snap = (name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
const dialog = () => page.getByRole("dialog");
const body = () => page.getByTestId("form-dialog-body");
const sections = () => page.getByRole("navigation", { name: "Consignment sections" });
const row = (sku) => page.getByRole("table", { name: /stock by SKU/ }).getByRole("row").filter({ hasText: sku });
const cells = async (sku) => (await row(sku).getByRole("cell").allInnerTexts()).map((t) => t.trim());

// F9. Partner stock that fails to load is an error with a working retry, never "no stock".
let failStock = true;
await page.route("**/consignment/stock-positions*", async (route) => {
  if (failStock) { failStock = false; return route.abort(); }
  return route.continue();
});
await page.goto(base, { waitUntil: "networkidle" });
await page.getByText("Sales report and partner stock work is unavailable").waitFor();
await sections().getByRole("button", { name: /^Sales reports/ }).click();
await page.getByText("Partner stock couldn’t be loaded").waitFor();
assert.equal(await page.getByText("No partner stock yet").count(), 0);
await snap("01-stock-load-error");
await page.getByRole("button", { name: "Try again" }).first().click();
await page.getByRole("table", { name: /stock by SKU/ }).waitFor();
assert.equal((await cells("QA-PAWSOME-LW"))[1], "35");
await snap("02-stock-after-retry");
pass("F9: failed stock load shows an error and a working retry; no zero stock shown");

async function wizardSale({ half, reference, sold }) {
  await page.getByRole("button", { name: "Record sales report" }).first().click();
  await body().getByLabel("Agreement").selectOption({ index: 1 });
  await body().getByRole("option", { name: "Furry Friends Bangsar" }).waitFor({ state: "attached" });
  await body().getByLabel("Branch").selectOption({ label: "Furry Friends Bangsar" });
  await body().getByLabel("Sales month").selectOption(half.month);
  await body().getByText(half.label).click();
  await body().getByLabel("Partner report reference").fill(reference);
  await page.getByRole("button", { name: "Continue" }).click();
  await body().getByLabel("Tag option (line 1)").selectOption({ label: "QA-PAWSOME-LW" });
  await body().getByLabel("Price (line 1)").selectOption({ label: "Standard · RM39.90" });
  await body().getByLabel("Sold (line 1)").fill(String(sold));
  await page.getByRole("button", { name: "Continue" }).click();
  await body().getByLabel("Evidence reference").fill("WA 1 Oct from shop owner");
}
// The server records the report, but the browser never sees the reply.
async function loseNextRecordReply() {
  await page.route("**/sales-reports/*/record", async (route) => {
    await page.unroute("**/sales-reports/*/record");
    await route.fetch();
    await route.abort();
  });
}

// F8. A recording whose reply was lost, retried unchanged: done, recorded exactly once.
await wizardSale({ half: { month: "2026-09", label: "16th – month end" }, reference: "2026-09-B", sold: 3 });
await loseNextRecordReply();
await page.getByRole("button", { name: "Record as unverified" }).click();
await page.getByText(/Your entries are kept/).waitFor();
await snap("03-lost-record-reply");
await page.getByRole("button", { name: "Record as unverified" }).click();
await page.getByRole("heading", { name: "16–30 Sep 2026" }).waitFor();
let saved = (await reports()).filter((r) => r.partnerReference === "2026-09-B");
assert.equal(saved.length, 1); assert.equal(saved[0].status, "Recorded"); assert.equal(saved[0].unitsSold, 3);
pass("F8: an identical retry after a lost reply completes without recording twice");

// F8. Retried with a changed quantity after the earlier attempt was recorded: refused, never silent.
await page.goto(`${base}&view=sales`, { waitUntil: "networkidle" });
await wizardSale({ half: { month: "2026-10", label: "1st – 15th" }, reference: "2026-10-A", sold: 3 });
await loseNextRecordReply();
await page.getByRole("button", { name: "Record as unverified" }).click();
await page.getByText(/Your entries are kept/).waitFor();
await page.getByRole("button", { name: "Back" }).click();
await body().getByLabel("Sold (line 1)").fill("4");
await page.getByRole("button", { name: "Continue" }).click();
await page.getByRole("button", { name: "Record as unverified" }).click();
await page.getByText(/already recorded with different values/).waitFor();
await snap("04-changed-retry-refused");
saved = (await reports()).filter((r) => r.partnerReference === "2026-10-A");
assert.equal(saved.length, 1); assert.equal(saved[0].unitsSold, 3);
await page.getByRole("button", { name: "Cancel" }).click();
pass("F8: a changed retry after a lost reply is refused and the recorded figures are untouched");

// Verify 2026-09-B under Solo (late report acknowledged).
await page.goto(`${base}&report=${(await reports()).find((r) => r.partnerReference === "2026-09-B").id}`, { waitUntil: "networkidle" });
async function verifyOpenReport() {
  await page.getByRole("button", { name: "Verify report" }).click();
  await dialog().getByRole("checkbox", { name: /This is my own work/ }).check();
  await dialog().getByLabel("Self-review reason").fill("Founder checked the owner's WhatsApp summary");
  if (await dialog().getByRole("checkbox", { name: /checked these points/ }).count()) await dialog().getByRole("checkbox", { name: /checked these points/ }).check();
  await dialog().getByRole("button", { name: "Verify report" }).click();
  await page.getByText("Self-reviewed (Solo)").first().waitFor();
}
await verifyOpenReport();

// Items 1 and 3, F6/F7: a correction needs a reason; a refund names the sale's real period and
// a restock needs the sealed-return confirmation.
await page.getByRole("button", { name: "Correct report" }).click();
assert.equal(await dialog().getByRole("button", { name: "Start correction" }).isDisabled(), true);
await dialog().getByLabel("Why it needs correcting").fill("Partner reported a customer refund for this period");
await snap("05-correction-reason");
await dialog().getByRole("button", { name: "Start correction" }).click();
await page.getByText(/Correct 2026-09-B \(version 2\)/).waitFor();
await page.getByRole("button", { name: "Continue" }).click();
await body().getByRole("button", { name: "+ Add refund line" }).click();
await body().getByLabel("Tag option (line 2)").selectOption({ label: "QA-PAWSOME-LW" });
await body().getByLabel("Original sale period (line 2)").selectOption({ label: "1–15 Sep 2026 · 2026-09-A" });
await body().getByLabel("Price (line 2)").selectOption({ label: "Opening week · RM34.90" });
await body().getByLabel("Refunded (line 2)").fill("1");
await body().getByLabel("Restockable (line 2)").fill("1");
await page.getByRole("button", { name: "Continue" }).click();
await body().getByText(/came back sealed, and say how you know/).waitFor();
await body().getByRole("checkbox", { name: /restocked package came back sealed and unopened/ }).check();
await body().getByLabel("How you know (line 2)").fill("Shop photo of the intact seal, 30 Sep");
await snap("06-sealed-refund-line");
await page.getByRole("button", { name: "Continue" }).click();
await page.getByRole("button", { name: "Record as unverified" }).click();
await page.getByText("Sealed: Shop photo of the intact seal, 30 Sep").waitFor();
await verifyOpenReport();
await snap("07-correction-verified");
pass("Items 1/3, F6/F7: correction with a reason; sealed refund against the 1–15 Sep promotion sale verified");

// F4. A period that hasn't reached its exclusive end can be recorded but not verified.
await page.goto(`${base}&view=sales`, { waitUntil: "networkidle" });
await wizardSale({ half: { month: "2026-10", label: "16th – month end" }, reference: "2026-10-B", sold: 1 });
await page.getByRole("button", { name: "Record as unverified" }).click();
await page.getByText("This sales period hasn't ended yet").first().waitFor();
assert.equal(await page.getByRole("button", { name: "Verify report" }).isDisabled(), true);
await snap("08-unfinished-period-blocked");
pass("F4: an unfinished period is recorded but can't be verified");

// Stock after: 35 − 3 (09-B) + 1 sealed restock = 33 on the shelf; 10-A and 10-B are only provisional.
await page.goto(`${base}&view=sales`, { waitUntil: "networkidle" });
await page.getByRole("table", { name: /stock by SKU/ }).waitFor();
const plw = await cells("QA-PAWSOME-LW");
assert.equal(plw[1], "33"); assert.equal(plw[2], "29"); assert.match(plw[7], /Balanced/);
await snap("09-stock-final");
pass("stock: shelf 33, provisional 29, tie-out balanced");

// Mobile: no real horizontal scroll on the sales views.
const mobile = await newPage(390, 844);
for (const url of [`${base}&view=sales`, `${base}&report=${(await reports()).find((r) => r.partnerReference === "2026-09-B" && r.version === 2).id}`]) {
  await mobile.goto(url, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(800);
  const scroll = await mobile.evaluate(() => { window.scrollTo(4000, 0); return window.scrollX; });
  assert.equal(scroll, 0, `horizontal scroll on ${url}`);
}
await mobile.screenshot({ path: path.join(out, "10-mobile-report.png"), fullPage: true });
pass("mobile sales views have no horizontal page scroll");

assert.deepEqual([...page.errors, ...mobile.errors], []);
console.log("No page errors.");
await browser.close();
