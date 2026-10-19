// Final Phase 1A remediation browser QA (N3 recovery through the real UI). Runs after
// ../remediation/e2e-remediation.mjs on the same disposable database, once report 2026-09-A has been
// marked as having unknown contributor history (as the corrective migration marks older records).
// Usage: node artifacts/consignment-sales-reporting/final-remediation/e2e-final.mjs <seeded.json> [baseUrl]
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("apps/web/package.json"));
const { chromium } = require("playwright-core");
const seeded = JSON.parse(await readFile(process.argv[2], "utf8"));
const origin = process.argv[3] ?? "http://localhost:3001";
const api = "http://localhost:5281/api/v1/admin/merchant-sales/consignment";
const out = path.resolve("artifacts/consignment-sales-reporting/final-remediation/screenshots");
await mkdir(out, { recursive: true });
const base = `${origin}/admin/merchant-sales?tab=consignment`;
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const d = (await (await fetch("http://localhost:5281/api/v1/dev-auth/admin-login", { method: "POST" })).json()).data;
const session = JSON.stringify({ accessToken: d.accessToken, refreshToken: d.refreshToken, expiresAt: Date.now() + d.expiresIn * 1000, user: d.user, ownerProfile: d.ownerProfile });
const reports = async () => (await (await fetch(`${api}/sales-reports?pageSize=100`, { headers: { Authorization: `Bearer ${d.accessToken}` } })).json()).data;

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript((v) => localStorage.setItem("mypetlink_api_auth_session", v), session);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const pass = (label) => console.log("PASS", label);
const snap = (name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
const body = () => page.getByTestId("form-dialog-body");
const dialog = () => page.getByRole("dialog");
const cells = async (sku) => (await page.getByRole("table", { name: /stock by SKU/ }).getByRole("row").filter({ hasText: sku }).getByRole("cell").allInnerTexts()).map((t) => t.trim());

const original = (await reports()).find((r) => r.partnerReference === "2026-09-A");
await page.goto(`${base}&report=${original.id}`, { waitUntil: "networkidle" });
await page.getByText("Earlier edits weren’t recorded").waitFor();
assert.equal(await page.getByRole("button", { name: "Correct report" }).count(), 0);
await snap("01-unknown-history-report");
pass("N3: a report with unknown history explains why and offers re-entry, not a correction");

await page.getByRole("button", { name: "Re-enter from evidence" }).click();
assert.equal(await dialog().getByRole("button", { name: "Re-enter report" }).isDisabled(), true);
await dialog().getByLabel("Why it’s being re-entered").fill("Editors before tracking are unknown; partner re-sent the figures");
await dialog().getByRole("button", { name: "Re-enter report" }).click();
await page.getByText(/Correct 2026-09-A \(version 2\)/).waitFor();
await page.getByRole("button", { name: "Continue" }).click();
assert.equal(await body().getByLabel("Sold (line 1)").inputValue(), "");
// The partner's re-sent figures, entered afresh: the same as the original report.
const lines = [["QA-PAWSOME-LW", "Opening week · RM34.90", "3"], ["QA-PAWSOME-LW", "Standard · RM39.90", "2"],
  ["QA-PAWSOME-SD", "Standard · RM39.90", "2"], ["QA-MYBOSS-LW", "Standard · RM39.90", "4"]];
for (const [i, [sku, price, sold]] of lines.entries()) {
  if (i > 0) await body().getByRole("button", { name: "+ Add sale line" }).click();
  await body().getByLabel(`Tag option (line ${i + 1})`).selectOption({ label: sku });
  await body().getByLabel(`Price (line ${i + 1})`).selectOption({ label: price });
  await body().getByLabel(`Sold (line ${i + 1})`).fill(sold);
}
await snap("02-reentry-lines");
await page.getByRole("button", { name: "Continue" }).click();
await page.getByRole("button", { name: "Record as unverified" }).click();
await page.getByRole("button", { name: "Verify report" }).waitFor();
// The founder re-entered it, so in Solo Mode it is a self-review with the report's own evidence.
await page.getByRole("button", { name: "Verify report" }).click();
await dialog().getByRole("checkbox", { name: /This is my own work/ }).check();
await dialog().getByLabel("Self-review reason").fill("Founder re-entered the partner's re-sent figures");
if (await dialog().getByRole("checkbox", { name: /checked these points/ }).count()) await dialog().getByRole("checkbox", { name: /checked these points/ }).check();
await dialog().getByRole("button", { name: "Verify report" }).click();
await page.getByText("Self-reviewed (Solo)").first().waitFor();
await snap("03-reentry-verified");
const after = (await reports()).filter((r) => r.partnerReference === "2026-09-A");
assert.deepEqual(after.map((r) => [r.version, r.status]).sort(), [[1, "Superseded"], [2, "Verified"]]);
pass("N3: re-entered from evidence, recorded and self-reviewed in Solo; the original is kept as Superseded");

await page.goto(`${base}&view=sales`, { waitUntil: "networkidle" });
await page.getByRole("table", { name: /stock by SKU/ }).waitFor();
assert.equal((await cells("QA-PAWSOME-LW"))[1], "33");
assert.equal((await cells("QA-PAWSOME-SD"))[1], "28");
assert.equal((await cells("QA-MYBOSS-LW"))[1], "26");
assert.match((await cells("QA-PAWSOME-LW"))[7], /Balanced/);
pass("stock unchanged by re-entering identical figures (33/28/26), tie-out balanced");

assert.deepEqual(errors, []);
console.log("No page errors.");
await browser.close();
