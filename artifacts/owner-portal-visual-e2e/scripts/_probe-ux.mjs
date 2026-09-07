import { promises as fs } from "node:fs";
import { chromium } from "playwright-core";

const session = JSON.parse(await fs.readFile("artifacts/owner-portal-visual-e2e/session.json", "utf8"));
const PET = process.env.PET_ID;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript((s) => localStorage.setItem("mypetlink_api_auth_session", s), JSON.stringify(session));
const page = await ctx.newPage();
const out = {};

// ---- 1. double-submit risk on the pet editor -------------------------------
await page.goto(`http://localhost:3000/pets/${PET}/edit`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
let putCount = 0;
page.on("request", (r) => { if (r.method() === "PUT" && r.url().includes("/api/v1/pets/")) putCount += 1; });
const ta = page.locator("main textarea").first();
await ta.fill("Double submit probe " + Date.now());
const save = page.getByRole("button", { name: /save changes|^save$/i }).first();
// fire three rapid clicks
await save.click({ force: true });
const disabledRightAfter = await save.isDisabled().catch(() => null);
await save.click({ force: true }).catch(() => {});
await save.click({ force: true }).catch(() => {});
await page.waitForTimeout(3500);
out.petEditor = { putRequests: putCount, saveDisabledImmediatelyAfterFirstClick: disabledRightAfter };

// ---- 2. keyboard focus visibility ------------------------------------------
await page.goto(`http://localhost:3000/dashboard`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const focusRing = [];
for (let i = 0; i < 8; i++) {
  await page.keyboard.press("Tab");
  const f = await page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return null;
    const cs = getComputedStyle(a);
    return {
      tag: a.tagName,
      text: (a.innerText || a.getAttribute("aria-label") || "").slice(0, 30),
      outline: cs.outlineStyle === "none" ? null : `${cs.outlineStyle} ${cs.outlineWidth}`,
      boxShadow: cs.boxShadow !== "none" ? cs.boxShadow.slice(0, 40) : null,
    };
  });
  if (f) focusRing.push(f);
}
out.focusOrder = focusRing;
out.focusWithoutVisibleIndicator = focusRing.filter((f) => !f.outline && !f.boxShadow).length;

// ---- 3. dialog focus trap ---------------------------------------------------
await page.goto(`http://localhost:3000/pets/${PET}/moments?edit=new`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
out.dialogInitialFocus = await page.evaluate(() => {
  const a = document.activeElement;
  return { tag: a?.tagName, aria: a?.getAttribute("aria-label"), inDialog: !!a?.closest('[role=dialog]') };
});
let escaped = 0;
for (let i = 0; i < 25; i++) {
  await page.keyboard.press("Tab");
  const inside = await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'));
  if (!inside) escaped += 1;
}
out.dialogFocusEscapes = escaped;

// Escape key closes?
await page.keyboard.press("Escape");
await page.waitForTimeout(1500);
out.escapeClosesDialog = await page.evaluate(() => !document.querySelector('[role=dialog]'));

// ---- 4. completion steps page ------------------------------------------------
await page.goto(`http://localhost:3000/pets/${PET}`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
const petPct = (await page.locator("main").innerText()).match(/(\d+)%\s*complete/i)?.[1];
const stepsLink = page.locator("main a, main button", { hasText: /view all profile steps/i }).first();
if (await stepsLink.count()) {
  await stepsLink.click();
  await page.waitForTimeout(3000);
  const t = await page.locator("main").innerText();
  out.completion = { petPage: petPct, stepsPage: t.match(/(\d+)%\s*complete/i)?.[1], url: page.url(), excerpt: t.slice(0, 400) };
} else {
  out.completion = { petPage: petPct, stepsPage: null, note: "no 'View all profile steps' control found" };
}

console.log(JSON.stringify(out, null, 1));
await browser.close();
