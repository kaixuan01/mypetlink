// Phase 1B remediation browser QA, against the local API and a disposable QA database. September's history was
// built by the fixed-clock service harness (no trigger disabled, nothing backdated by SQL); every step here runs
// through the real admin UI at today's real time.
// Usage: node artifacts/consignment-phase1b-remediation/e2e-remediation.mjs <qa-seeded.json> [baseUrl]
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("apps/web/package.json"));
const { chromium } = require("playwright-core");
const seeded = JSON.parse(await readFile(process.argv[2], "utf8"));
const origin = process.argv[3] ?? "http://localhost:3001";
const api = "http://localhost:5281/api/v1/admin/merchant-sales/consignment";
const out = path.resolve("artifacts/consignment-phase1b-remediation/screenshots");
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
const position = async (sku) => (await call("GET", "/stock-positions")).flatMap((p) => p.skus).find((s) => s.sku === sku);

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

// 1. B1/B2: the corrected 1–15 Sep report is late. The reviewer links its two extra sales to the 15 Sep shortage, with evidence.
await page.goto(`${base}&report=${seeded.correction}`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Verify report" }).click();
await dialog().getByText("The stocktake of 15 Sep 2026 already closed this period", { exact: true }).waitFor();
await dialog().getByText(/QA-PAWSOME-SD: 2 sold that the count couldn’t have seen/).waitFor();
await dialog().getByText(/Missing from the shelf · count of 15 Sep 2026 · 2 of 2 open/).waitFor();
assert.equal(await dialog().getByLabel("Link to this shortage").count(), 1, "only the Pawsome SD shortage is a candidate");
await dialog().getByRole("checkbox", { name: /checked these points/ }).check();
await dialog().getByLabel("Link to this shortage").fill("2");
await dialog().getByRole("button", { name: "Verify report" }).click();
await dialog().getByText("QA-PAWSOME-SD: record the evidence that links this report to what the count found.").waitFor();
await dialog().getByLabel("Link evidence").fill("POS receipts 10 and 14 Sep");
await dialog().getByLabel("Why this report accounts for it").fill("Both packages were sold before the 15 Sep count");
await snap("01-late-report-link");
await dialog().getByRole("button", { name: "Verify report" }).click();
await dialog().waitFor({ state: "detached" });
await page.getByText("Verified", { exact: true }).first().waitFor();
const psdShortage = (await call("GET", "/discrepancies")).find((d) => d.sku === "QA-PAWSOME-SD");
assert.equal(psdShortage.status, "Resolved");
assert.deepEqual(psdShortage.resolutions.map((r) => [r.outcome, r.quantity, r.evidenceReference]), [["ExplainedByLateReport", 2, "POS receipts 10 and 14 Sep"]]);
const psd = await position("QA-PAWSOME-SD");
assert.deepEqual([psd.sellable, psd.investigation, psd.soldUnidentified, psd.tieOutBalanced], [25, 0, 5, true]);
pass("late report linked to the 15 Sep shortage only by the reviewer, with evidence; shortage settled, books balanced");

// 2. B3/B8: damaged stock can't be certified as returned; the outcome needs new evidence, shown in the history.
await page.goto(`${base}&view=reconciliation`, { waitUntil: "networkidle" });
await page.getByText("QA-MYBOSS-LW · Damaged or opened").waitFor();
await page.getByRole("listitem").filter({ hasText: "QA-MYBOSS-LW · Damaged or opened" }).getByRole("button", { name: "Resolve" }).click();
assert.equal(await dialog().getByRole("radio").count(), 2);
assert.equal(await dialog().getByText(/returned/i).count(), 0, "no returned outcome");
await dialog().getByRole("radio", { name: /Confirmed damaged/ }).check();
await dialog().getByLabel("Quantity").fill("1");
await dialog().getByLabel("Evidence", { exact: true }).fill("Count sheet photo 15 Sep 9:40 pm");
await dialog().getByLabel("Explanation").fill("The package is torn and can't be sold");
await dialog().getByRole("button", { name: "Record outcome" }).click();
await dialog().getByText(/Record new evidence for this outcome/).waitFor();
await dialog().getByLabel("Evidence", { exact: true }).fill("Shop photo of the torn package 21 Sep");
await snap("02-resolve-damaged");
await dialog().getByRole("button", { name: "Record outcome" }).click();
await dialog().waitFor({ state: "detached" });
await page.getByRole("button", { name: "Show resolved too" }).click();
await page.getByText("Evidence: Shop photo of the torn package 21 Sep").waitFor();
await page.getByText("Evidence: POS receipts 10 and 14 Sep").waitFor();
await snap("03-discrepancy-history");
pass("damaged stock confirmed (never certified as returned); the count sheet refused as evidence; evidence visible in history");

// 3. B5: the 30 Sep count was taken at 8:30 am on 1 Oct, before the shop opened. Its real time is recorded, never backdated.
await page.getByRole("button", { name: "Record stocktake" }).click();
await dialog().getByLabel("Count date").selectOption("2026-09-30");
await dialog().getByLabel("Counted sellable QA-PAWSOME-LW").waitFor();
await dialog().getByText("35 verified + 1 extra noted").waitFor();
for (const [sku, sellable, unsellable] of [["QA-PAWSOME-LW", "36", "0"], ["QA-PAWSOME-SD", "25", "0"], ["QA-MYBOSS-LW", "27", "1"]]) {
  await dialog().getByLabel(`Counted sellable ${sku}`).fill(sellable);
  await dialog().getByLabel(`Counted unsellable ${sku}`).fill(unsellable);
}
await dialog().getByLabel("Counted by").fill("Shop owner with the founder on video call");
await dialog().getByLabel("Evidence reference").fill("Count sheet photo 1 Oct 8:45 am");
await dialog().getByLabel("Counted at").fill("2026-10-01T08:30");
await dialog().getByRole("button", { name: "Record count" }).click();
await dialog().getByText(/Explain how you know nothing was sold/).first().waitFor();
await dialog().getByLabel("Nothing moved since midnight because").fill("The shop opens at 10 am; the owner confirms no sales or deliveries before the count");
await snap("04-next-morning-count");
await dialog().getByRole("button", { name: "Record count" }).click();
await page.getByRole("heading", { name: "Stocktake 30 Sep 2026" }).waitFor();
await page.getByText(/Counted by Shop owner with the founder on video call on 1 Oct 2026, 8:30 am/).waitFor();
pass("next-morning count recorded with its real time and a reason nothing moved");

// 4. Close the month: the after-cutoff count is a finding to acknowledge, and the close carries the reviewed figures.
await page.getByRole("button", { name: "Close month" }).click();
await dialog().getByText(/Counted at 1 Oct 2026 8:30 AM, after 30 Sep 2026 ended/).waitFor();
await dialog().getByRole("checkbox", { name: /This is my own work/ }).check();
assert.equal(await dialog().getByLabel("Self-review external evidence reference").inputValue(), "Count sheet photo 1 Oct 8:45 am");
await dialog().getByLabel("Self-review reason").fill("Founder checked the count sheet photo with the shop owner");
await dialog().getByRole("checkbox", { name: /checked these points/ }).check();
await snap("05-close-month");
await dialog().getByRole("button", { name: "Close month" }).click();
await page.getByText("This month is closed").waitFor();
await page.getByText("Self-reviewed (Solo)").first().waitFor();
await snap("06-month-closed");
const lw = await position("QA-PAWSOME-LW"), sd = await position("QA-PAWSOME-SD"), mb = await position("QA-MYBOSS-LW");
assert.deepEqual([lw.sellable, lw.openSurplus, sd.sellable, sd.investigation, mb.sellable, mb.unsellable], [35, 1, 25, 0, 27, 1]);
for (const p of [lw, sd, mb]) assert.equal(p.tieOutBalanced, true);
pass("month closed; verified stock 35 / 25 / 27 (+1 unsellable), the extra Pawsome LW still only a note; tie-out balanced");

// 5. Mobile: no horizontal page scroll on the report and stocktake views.
const mobile = await newPage(390, 844);
const stocktakeId = (await call("GET", "/stocktakes")).at(0).id;
for (const url of [`${base}&report=${seeded.correction}`, `${base}&view=reconciliation`, `${base}&stocktake=${stocktakeId}`]) {
  await mobile.goto(url, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(800);
  const scroll = await mobile.evaluate(() => { window.scrollTo(4000, 0); return window.scrollX; });
  assert.equal(scroll, 0, `horizontal scroll on ${url}`);
}
await mobile.screenshot({ path: path.join(out, "07-mobile-stocktake.png"), fullPage: true });
pass("mobile report and stocktake views have no horizontal page scroll");

assert.deepEqual([...page.errors, ...mobile.errors], []);
console.log("No page errors.");
await browser.close();
