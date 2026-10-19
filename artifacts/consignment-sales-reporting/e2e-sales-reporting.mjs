// Phase 1A browser QA: sales reports, approved prices and SKU stock through the real UI,
// against the local API and the disposable MyPetLinkQA_SalesReporting database. Synthetic data only.
// Usage: node artifacts/consignment-sales-reporting/e2e-sales-reporting.mjs <seeded.json> [baseUrl]
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const seeded = JSON.parse(await readFile(process.argv[2], "utf8"));
const origin = process.argv[3] ?? "http://localhost:3000";
const out = path.resolve("artifacts/consignment-sales-reporting/screenshots");
await mkdir(out, { recursive: true });
const base = `${origin}/admin/merchant-sales?tab=consignment`;
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const d = (await (await fetch("http://localhost:5281/api/v1/dev-auth/admin-login", { method: "POST" })).json()).data;
const session = JSON.stringify({ accessToken: d.accessToken, refreshToken: d.refreshToken, expiresAt: Date.now() + d.expiresIn * 1000, user: d.user, ownerProfile: d.ownerProfile });

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
const row = (sku) => page.getByRole("table", { name: /stock by SKU/ }).getByRole("row").filter({ hasText: sku });
const cells = async (sku) => (await row(sku).getByRole("cell").allInnerTexts()).map((t) => t.trim());

// 1. Sales reports tab: stock after the seeded verified report (40/30/30 less 5/2/4).
await page.goto(base, { waitUntil: "networkidle" });
await sections().getByRole("button", { name: /^Sales reports/ }).click();
await page.getByRole("table", { name: /stock by SKU/ }).waitFor();
assert.equal((await cells("QA-PAWSOME-LW"))[1], "35");
assert.equal((await cells("QA-PAWSOME-SD"))[1], "28");
assert.equal((await cells("QA-MYBOSS-LW"))[1], "26");
assert.match((await cells("QA-PAWSOME-LW"))[7], /Balanced/);
await snap("01-sales-reports-tab");
pass("stock position shows shelf stock 35/28/26 after the verified first-half report, tie-out balanced");

// 2. Record the second-half report with the wizard: one approved price, one unapproved.
await page.getByRole("button", { name: "Record sales report" }).first().click();
const body = page.getByTestId("form-dialog-body");
await body.getByLabel("Agreement").selectOption({ index: 1 });
await body.getByRole("option", { name: "Furry Friends Bangsar" }).waitFor({ state: "attached" });
await body.getByLabel("Branch").selectOption({ label: "Furry Friends Bangsar" });
await body.getByLabel("Sales month").selectOption("2026-09");
await body.getByText("16th – month end").click();
await body.getByLabel("Partner report reference").fill("2026-09-B");
await snap("02-wizard-period");
await page.getByRole("button", { name: "Continue" }).click();
await body.getByLabel("Tag option (line 1)").selectOption({ label: "QA-PAWSOME-LW" });
await body.getByLabel("Price (line 1)").selectOption({ label: "Standard · RM39.90" });
await body.getByLabel("Sold (line 1)").fill("3");
await body.getByRole("button", { name: "+ Add sale line" }).click();
await body.getByLabel("Tag option (line 2)").selectOption({ label: "QA-MYBOSS-LW" });
await body.getByLabel("Price (line 2)").selectOption({ label: "Another price (not approved)" });
await body.getByLabel("Unit price RM (line 2)").fill("29.90");
await body.getByLabel("Sold (line 2)").fill("3");
await body.getByText("This price isn’t approved").first().waitFor();
await snap("03-wizard-lines");
await page.getByRole("button", { name: "Continue" }).click();
await body.getByLabel("Evidence reference").fill("WA 1 Oct from shop owner");
await snap("04-wizard-evidence");
await page.getByRole("button", { name: "Record as unverified" }).click();
await page.getByRole("heading", { name: "16–30 Sep 2026" }).waitFor();
await page.getByText("isn't an approved price").first().waitFor();
assert.equal(await page.getByRole("button", { name: "Verify report" }).isDisabled(), true);
await snap("05-report-blocked");
pass("an unapproved price is recorded exactly as reported and blocks verification");

// 3. Dispute, then correct to the approved price and verify under Solo.
await page.getByRole("button", { name: "Dispute report" }).click();
await dialog().getByLabel("What needs correcting").fill("My Boss sold below the approved price");
await dialog().getByRole("button", { name: "Dispute report" }).click();
await page.getByRole("button", { name: "Correct report" }).waitFor();
await page.getByRole("button", { name: "Correct report" }).click();
await page.getByText(/Correct 2026-09-B \(version 2\)/).waitFor();
assert.equal(await body.getByLabel("Partner report reference").isDisabled(), true);
await page.getByRole("button", { name: "Continue" }).click();
// A saved report lists lines by SKU, so the unapproved My Boss line is now line 1.
assert.equal(await body.getByLabel("Unit price RM (line 1)").inputValue(), "29.90");
await body.getByLabel("Price (line 1)").selectOption({ label: "Standard · RM39.90" });
assert.equal(await body.getByLabel("Unit price RM (line 1)").inputValue(), "39.90");
await page.getByRole("button", { name: "Continue" }).click();
await page.getByRole("button", { name: "Record as unverified" }).click();
await page.getByRole("button", { name: "Verify report" }).waitFor();
assert.equal(await page.getByRole("button", { name: "Verify report" }).isDisabled(), false);
await page.getByRole("button", { name: "Verify report" }).click();
await dialog().getByRole("checkbox", { name: /This is my own work/ }).check();
assert.equal(await dialog().getByLabel("Self-review external evidence reference").inputValue(), "WA 1 Oct from shop owner");
await dialog().getByLabel("Self-review reason").fill("Founder checked the owner's WhatsApp summary");
// Entered today for a September period, so the late-report warning must be acknowledged first.
await dialog().getByText(/days after the period ended/).waitFor();
assert.equal(await dialog().getByRole("button", { name: "Verify report" }).isDisabled(), true);
await dialog().getByRole("checkbox", { name: /checked these points/ }).check();
await snap("06-verify-dialog");
await dialog().getByRole("button", { name: "Verify report" }).click();
await page.getByText("Self-reviewed (Solo)").first().waitFor();
await snap("07-report-verified");
pass("dispute → correction v2 → Solo verification with the report's own evidence");

// 4. Stock reflects only the verified correction; v1 stays in history as Superseded.
await page.getByRole("button", { name: "All sales reports" }).click();
await page.getByRole("table", { name: /stock by SKU/ }).waitFor();
assert.equal((await cells("QA-PAWSOME-LW"))[1], "32");
assert.equal((await cells("QA-MYBOSS-LW"))[1], "23");
await page.getByRole("button", { name: /Open sales report 2026-09-B version 1/ }).waitFor();
assert.match(await page.getByRole("button", { name: /Open sales report 2026-09-B version 1/ }).innerText(), /Superseded/);
await snap("08-sales-list");
pass("shelf stock 32/28/23 after the correction; the disputed original is kept as Superseded");

// 5. Agreement shows approved prices; the dispatch screen asks for attribution, not a price.
await page.goto(`${base}&agreement=${seeded.agreement}`, { waitUntil: "networkidle" });
await page.getByText("Promotion · Opening week").waitFor();
await snap("09-agreement-prices");
await page.goto(`${base}&dispatch=${seeded.dispatch}`, { waitUntil: "networkidle" });
await page.getByRole("radio", { name: /Record customer handover/ }).check();
await page.getByText("What happened to this tag?").waitFor();
assert.equal(await page.getByRole("checkbox", { name: /externally reported sale/ }).count(), 0);
await snap("10-dispatch-attribution");
pass("prices visible on the agreement; tracked handovers ask for attribution and never a price");

// 6. Mobile: no real horizontal scroll on the sales views.
const mobile = await newPage(390, 844);
for (const url of [`${base}&view=sales`, `${base}&report=${seeded.report}`]) {
  await mobile.goto(url, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(800);
  const scroll = await mobile.evaluate(() => { window.scrollTo(4000, 0); return window.scrollX; });
  assert.equal(scroll, 0, `horizontal scroll on ${url}`);
}
await mobile.goto(`${base}&view=sales`, { waitUntil: "networkidle" });
await mobile.screenshot({ path: path.join(out, "11-mobile-sales.png"), fullPage: true });
await mobile.goto(`${base}&report=${seeded.report}`, { waitUntil: "networkidle" });
await mobile.screenshot({ path: path.join(out, "12-mobile-report.png"), fullPage: true });
pass("mobile sales views have no horizontal page scroll");

assert.deepEqual([...page.errors, ...mobile.errors], []);
console.log("No page errors.");
await browser.close();
