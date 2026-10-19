// Final-gate R1/R2 browser walkthrough against the local API and a disposable QA database (history built by the
// fixed-clock service harness; nothing backdated by SQL). Usage:
// node artifacts/consignment-phase1b-final-fixes/e2e-final-fixes.mjs <qa-final-gate.json> [baseUrl]
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("apps/web/package.json"));
const { chromium } = require("playwright-core");
const seeded = JSON.parse(await readFile(process.argv[2], "utf8"));
const origin = process.argv[3] ?? "http://localhost:3001";
const api = "http://localhost:5281/api/v1/admin/merchant-sales/consignment";
const out = path.resolve("artifacts/consignment-phase1b-final-fixes/screenshots");
await mkdir(out, { recursive: true });
const base = `${origin}/admin/merchant-sales?tab=consignment`;
const login = (await (await fetch("http://localhost:5281/api/v1/dev-auth/admin-login", { method: "POST" })).json()).data;
const headers = { Authorization: `Bearer ${login.accessToken}`, "Content-Type": "application/json" };
async function call(method, p, body) {
  const r = await fetch(api + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}
const position = async (sku) => (await call("GET", "/stock-positions")).body.data.flatMap((p) => p.skus).find((s) => s.sku === sku);

const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const session = JSON.stringify({ accessToken: login.accessToken, refreshToken: login.refreshToken, expiresAt: Date.now() + login.expiresIn * 1000,
  user: login.user, ownerProfile: login.ownerProfile });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript((v) => localStorage.setItem("mypetlink_api_auth_session", v), session);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const pass = (label) => console.log("PASS", label);
const snap = (name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
const dialog = () => page.getByRole("dialog");

// R2 / FG10: Pawsome LW is sold out on the books (0 sellable, 7 under investigation); the late report sells those 7.
let lw = await position("QA-PAWSOME-LW");
assert.deepEqual([lw.sellable, lw.investigation, lw.soldUnidentified, lw.tieOutBalanced], [0, 7, 3, true]);
await page.goto(`${base}&report=${seeded.late}`, { waitUntil: "networkidle" });
await page.getByText("Needs a link before it can be verified").waitFor();
assert.equal(await page.getByText("Can’t be verified as reported").count(), 0);
const verify = page.getByRole("button", { name: "Verify report" });
assert.equal(await verify.isDisabled(), false, "Verify must open the linking review");
await snap("01-sold-out-report");
await verify.click();
await dialog().getByText(/Link at least 7/).first().waitFor();
await dialog().getByText(/Missing from the shelf · count of 30 Sep 2026 · 7 of 7 open/).waitFor();
await dialog().getByRole("checkbox", { name: /checked these points/ }).check();
// No link, then too little: refused in the dialog; nothing is sent.
await dialog().getByRole("button", { name: "Verify report" }).click();
await dialog().getByRole("alert").filter({ hasText: /Link at least 7/ }).waitFor();
await dialog().getByLabel("Link to this shortage").fill("6");
await dialog().getByLabel("Link evidence").fill("Count sheet photo 30 Sep 9:30 pm");
await dialog().getByLabel("Why this report accounts for it").fill("All seven were sold before the 30 Sep count");
await dialog().getByRole("button", { name: "Verify report" }).click();
await dialog().getByRole("alert").filter({ hasText: /Link at least 7/ }).waitFor();
// The full link, but citing the count sheet: the server refuses it and the dialog keeps the entries for correction.
await dialog().getByLabel("Link to this shortage").fill("7");
await dialog().getByRole("button", { name: "Verify report" }).click();
await dialog().getByRole("alert").filter({ hasText: /count's own evidence/ }).waitFor();
assert.equal(await dialog().getByLabel("Link to this shortage").inputValue(), "7");
await snap("02-link-refused-kept-open");
assert.equal((await call("GET", `/sales-reports/${seeded.late}`)).body.data.status, "Recorded");
// The valid full link with its own evidence verifies.
await dialog().getByLabel("Link evidence").fill("Seven dated POS receipts 17–29 Sep");
await dialog().getByRole("button", { name: "Verify report" }).click();
await dialog().waitFor({ state: "detached" });
await page.getByText("Verified", { exact: true }).first().waitFor();
lw = await position("QA-PAWSOME-LW");
assert.deepEqual([lw.sellable, lw.investigation, lw.soldUnidentified, lw.tieOutBalanced], [0, 0, 10, true]);
await snap("03-sold-out-verified");
pass("FG10: sold-out late report reachable, short/invalid links refused with the dialog kept open, full link verifies to 0 / 0 / 10, balanced");

// R1: the 15 Oct count can't close: one September extra was settled on 17 Oct, after its cutoff.
const sd = await position("QA-PAWSOME-SD");
assert.deepEqual([sd.sellable, sd.openSurplus], [7, 1]);
await page.goto(`${base}&stocktake=${seeded.october}`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Stocktake 15 Oct 2026" }).waitFor();
await page.getByText(/QA-PAWSOME-SD: extra stock noted at an earlier count was settled on 17 Oct 2026, after this count date/).waitFor();
assert.equal(await page.getByRole("button", { name: "Close month" }).isDisabled(), true);
// As at its cutoff the count is compared with 7 verified + 2 extra noted = 9, which is what was counted.
await page.getByText("7 verified + 2 extra noted").waitFor();
await snap("04-historical-count-refused");
const stocktake = (await call("GET", `/stocktakes/${seeded.october}`)).body.data;
const refused = await call("POST", `/stocktakes/${seeded.october}/approve`, { concurrencyToken: stocktake.concurrencyToken, acknowledgeWarnings: true,
  reviewedFingerprint: stocktake.reviewFingerprint });
assert.equal(refused.status, 409);
assert.equal((await position("QA-PAWSOME-SD")).openSurplus, 1);
assert.equal((await call("GET", `/stocktakes/${seeded.october}`)).body.data.status, "Recorded");
pass("R1: the 15 Oct count shows the later change, can't be closed (409), and the remaining extra stays open");

assert.deepEqual(errors, []);
console.log("No page errors.");
await browser.close();
