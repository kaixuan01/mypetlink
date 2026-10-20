// End-to-end Consignment workflow through the redesigned UI, on the production export (port 3001)
// against the local API and the disposable MyPetLinkQA_ConsignmentUX database. Synthetic data only.
import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright-core";

const out = path.resolve("artifacts/consignment-ux-redesign/screenshots");
const base = "http://localhost:3001/admin/merchant-sales?tab=consignment";
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const d = (await (await fetch("http://localhost:5281/api/v1/dev-auth/admin-login", { method: "POST" })).json()).data;
const session = JSON.stringify({ accessToken: d.accessToken, refreshToken: d.refreshToken, expiresAt: Date.now() + d.expiresIn * 1000, user: d.user, ownerProfile: d.ownerProfile });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript((v) => localStorage.setItem("mypetlink_api_auth_session", v), session);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// Next RSC prefetch files (/__next.*.txt) are not mapped by this minimal static server; any other 404 fails the run.
const missing = [];
page.on("response", (r) => {
  if (r.status() === 404) missing.push(r.url());
});
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const snap = async (name) => page.screenshot({ path: path.join(out, `e2e-${name}.png`), fullPage: true });
const dialog = () => page.getByRole("dialog");
const notice = async () => (await page.getByTestId("admin-operation-notice").innerText()).replace(/\s+/g, " ");
const ref = `TAILS-UX-${Date.now().toString(36).toUpperCase()}`;
const step = (label) => console.log("PASS", label);
const now = new Date();
const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

try {
await page.goto(base, { waitUntil: "networkidle" });
await page.getByTestId("consignment-overview").waitFor();
step("overview loads on the production export");

// 1. Wizard -> save draft -> continue to approval (Solo self-review) -> Active
await page.getByRole("button", { name: "New agreement" }).first().click();
const body = page.getByTestId("form-dialog-body");
await body.getByLabel("Merchant", { exact: true }).selectOption({ label: "QA Happy Tails" });
await body.getByLabel("Agreement reference").fill(ref);
await page.getByRole("button", { name: "Continue" }).click();
await body.getByRole("button", { name: "Use proposed initial rate (35%)" }).click();
await body.getByLabel("Duration and renewal terms").fill("6 month trial, renewable in writing");
await body.getByLabel("Effective start").fill(iso);
await body.getByLabel("Settlement frequency").fill("Monthly");
await body.getByLabel("Payment deadline (days)").fill("14");
await body.getByLabel("Discount permissions").fill("No discounts without written approval");
await body.getByLabel("Return terms").fill("Unsold tags returned within 30 days");
await body.getByLabel("Loss and damage responsibility").fill("Partner responsible after signed receipt");
await body.getByLabel("Signed agreement reference").fill("SIGNED-TAILS-UX");
await body.getByLabel("External tracker reference").fill("TRACKER-TAILS-UX");
await page.getByRole("button", { name: "Continue" }).click();
await body.getByText("Every term is recorded").waitFor();
await snap("01-wizard-review");
await page.getByRole("button", { name: "Save draft" }).click();
await body.getByText(`${ref} v1 saved as a draft`).waitFor();
await snap("02-wizard-saved");
step("wizard saved a complete draft");
await page.getByRole("button", { name: "Continue to approval" }).click();
await dialog().getByText("Internal approval is not the partner’s signature").waitFor();
await dialog().getByRole("checkbox", { name: /This is my own work/ }).check();
await dialog().getByLabel("Self-review reason").fill("Founder checked the signed partner agreement");
await dialog().getByLabel("Self-review external evidence reference").fill("SIGNED-TAILS-UX");
await snap("03-approve-dialog");
await dialog().getByRole("button", { name: "Approve", exact: true }).click();
await page.getByRole("heading", { name: new RegExp(`${ref} · version 1`) }).waitFor();
await page.getByTestId("admin-operation-notice").waitFor();
assert.match(await notice(), /approved/);
await page.locator("section[aria-labelledby='agreement-title']").getByText("Self-reviewed (Solo)").waitFor();
await snap("04-agreement-active");
step("approval recorded as Self-reviewed (Solo) and agreement is Active");

// 2. Contextual reservation from the agreement
const header = page.locator("section[aria-labelledby='agreement-title']");
await header.getByRole("button", { name: "Reserve stock" }).click();
await dialog().getByRole("option", { name: "Happy Tails Gurney" }).waitFor({ state: "attached" });
await dialog().getByLabel("Delivery branch").selectOption({ label: "Happy Tails Gurney" });
await dialog().getByLabel("Tag option 1").selectOption({ label: "QA Synthetic Smart Tag · QA-SYN-STD · Standard" });
await dialog().getByLabel("Quantity 1").fill("3");
await dialog().getByRole("button", { name: "Review reservation" }).click();
await dialog().getByText("3 tags will leave central availability").waitFor();
await snap("05-reserve-review");
await dialog().getByRole("button", { name: "Reserve tags" }).click();
await page.getByRole("button", { name: "Confirm dispatch" }).waitFor();
assert.match(await notice(), /Reservation MPL-CS-\S+ created/);
await snap("06-dispatch-reserved");
step("reservation created and its delivery opened");

// 3. Dispatch
await page.getByLabel("Courier or shipment reference").fill("COURIER-TAILS-UX");
await page.getByRole("button", { name: "Confirm dispatch" }).click();
await dialog().getByText(/creates no invoice, sale or commission/).waitFor();
await dialog().getByRole("button", { name: "Confirm", exact: true }).click();
await page.getByRole("button", { name: "Acknowledge receipt" }).waitFor();
assert.equal(await page.getByRole("button", { name: "Confirm dispatch" }).count(), 0);
await page.getByRole("button", { name: "Download Dispatch Note" }).waitFor();
step("dispatch confirmed; receipt task replaced the dispatch task; dispatch note issued");

// 4. Partner receipt with Solo self-review
await page.getByLabel("Actual partner recipient").fill("Synthetic Store Lead");
const t = new Date(Date.now() + 60000); await page.getByLabel("Actual receipt date").fill(`${iso}T${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`);
await page.getByLabel("Signed receipt / evidence reference").fill("TAILS-UX-SIGNED-COUNT");
await page.getByLabel("Receipt acknowledgment reference").fill("RX-TAILS-UX");
await page.getByRole("button", { name: "Mark all unconfirmed units good" }).click();
await page.getByText(/3 counted \(including 0 damaged\), 0 missing/).waitFor();
await snap("07-receipt-form");
await page.getByRole("button", { name: "Acknowledge receipt" }).click();
await dialog().getByRole("checkbox", { name: /This is my own work/ }).check();
await dialog().getByLabel("Self-review reason").fill("Founder checked the signed partner count");
await dialog().getByLabel("Self-review external evidence reference").fill("TAILS-UX-SIGNED-COUNT");
await dialog().getByRole("button", { name: "Confirm", exact: true }).click();
await page.getByText("Receiving complete").first().waitFor();
assert.equal(await page.getByRole("button", { name: "Acknowledge receipt" }).count(), 0);
step("partner receipt recorded; receiving complete");

// 5. Stock movement: return one unit
await page.getByRole("radio", { name: /Receive returned tags/ }).check();
await page.getByRole("checkbox", { name: /^Select / }).first().check();
await page.getByLabel("Reason or tracker entry reference").fill("RETURN-TAILS-UX-1");
await page.getByRole("button", { name: "Receive selected returns" }).click();
await dialog().getByRole("button", { name: "Confirm", exact: true }).click();
await page.getByText("Inspect returns").first().waitFor({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(800);
const inspection = await page.getByText("Return inspection", { exact: true }).first().locator("..").innerText();
assert.match(inspection, /^1/);
await snap("08-after-return");
step("one unit returned to inspection");

// 6. Closing with stock still held is refused by the server and explained
await page.getByRole("button", { name: "All deliveries" }).click();
await page.getByRole("navigation", { name: "Consignment sections" }).getByRole("button", { name: /^Agreements/ }).click();
await page.getByRole("button", { name: new RegExp(`Open agreement ${ref} v1`) }).click();
await header.getByRole("button", { name: "Close agreement" }).click();
await dialog().getByLabel("Reason for closing").fill("UX QA closure attempt");
await dialog().getByRole("button", { name: "Confirm closure" }).click();
await page.getByRole("button", { name: "Refresh records" }).waitFor();
assert.match(await notice(), /Reconcile partner-held stock/);
await snap("09-close-refused");
step("closure with partner-held stock refused with the server's message and a refresh action");

// 7. Back/forward and refresh restore
await page.goBack();
await page.waitForTimeout(500);
await page.goForward();
await page.getByRole("heading", { name: new RegExp(`${ref} · version 1`) }).waitFor();
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("heading", { name: new RegExp(`${ref} · version 1`) }).waitFor();
step("refresh and Back/Forward restore the open agreement");

// 8. Keyboard: section navigation is reachable and operable
await page.goto(base, { waitUntil: "networkidle" });
await page.getByRole("navigation", { name: "Consignment sections" }).getByRole("button", { name: /^Settings/ }).focus();
await page.keyboard.press("Enter");
await page.getByRole("region", { name: "Consignment approval policy" }).waitFor();
step("section navigation works from the keyboard");

} catch (failure) {
  await snap("failure");
  const n = page.getByTestId("admin-operation-notice");
  console.log("FAIL notice:", (await n.count()) ? (await n.innerText()).replace(/s+/g, " ") : "none");
  console.log("FAIL alerts:", (await page.getByRole("alert").allInnerTexts()).map((t) => t.replace(/s+/g, " ")));
  console.log("FAIL console errors:", errors);
  await browser.close();
  throw failure;
}
const otherMissing = missing.filter((u) => !/\/__next\.[^/]*\.txt\?/.test(u));
assert.deepEqual(otherMissing, []);
const unexpected = errors.filter((e) => !/Failed to load resource: the server responded with a status of (409|404)/.test(e));
assert.deepEqual(unexpected, []);
console.log("No unexpected page errors.", errors.length ? `(ignored ${errors.length} expected console entries: the refused-closure 409 and ${missing.length} unmapped prefetch 404s)` : "");
await browser.close();
