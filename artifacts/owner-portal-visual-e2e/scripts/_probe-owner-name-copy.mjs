import { promises as fs } from "node:fs";
import { chromium } from "playwright-core";

const session = JSON.parse(await fs.readFile("artifacts/owner-portal-visual-e2e/session.json", "utf8"));
const PET = process.env.PET_ID;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript((s) => localStorage.setItem("mypetlink_api_auth_session", s), JSON.stringify(session));
const page = await ctx.newPage();

await page.goto(`http://localhost:3000/pets/${PET}/edit`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.locator("main button", { hasText: /Contact & Safety/i }).first().click();
await page.waitForTimeout(2200);

const rows = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('main [role=switch]').forEach((el) => {
    let wrap = el.closest("label") || el.parentElement;
    for (let i = 0; i < 4 && wrap && wrap.innerText.split("\n").length < 2; i++) wrap = wrap.parentElement;
    out.push({
      checked: el.getAttribute("aria-checked"),
      text: (wrap?.innerText || "").split("\n").slice(0, 3).join(" || ").slice(0, 190),
    });
  });
  return out;
});
console.log("=== CONTACT & SAFETY SWITCHES (owner view) ===");
rows.forEach((r) => console.log(`  [${r.checked}] ${r.text}`));

// Which section heading are these under?
const headings = await page.evaluate(() =>
  [...document.querySelectorAll("main h2, main h3")].map((h) => h.innerText.trim()).slice(0, 12));
console.log("\nSECTION HEADINGS:", JSON.stringify(headings));

await browser.close();
