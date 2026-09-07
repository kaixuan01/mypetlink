import { promises as fs } from "node:fs";
import { chromium } from "playwright-core";

const session = JSON.parse(await fs.readFile("artifacts/owner-portal-visual-e2e/session.json", "utf8"));
const PET = process.env.PET_ID;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript((s) => localStorage.setItem("mypetlink_api_auth_session", s), JSON.stringify(session));
const page = await ctx.newPage();

let posts = 0;
page.on("request", (r) => {
  if (r.method() === "POST" && /\/api\/v1\/pets\/[^/]+\/(memories|care-records)/.test(r.url())) posts += 1;
});

// --- moment create, three rapid clicks --------------------------------------
await page.goto(`http://localhost:3000/pets/${PET}/moments?edit=new`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
const dlg = page.locator('[role=dialog]');
await dlg.locator('input[type=text]').first().fill("Double submit moment probe");
await dlg.locator('input[type=date]').first().fill("2026-08-26");
await dlg.locator("select").first().selectOption({ label: "Memory" });
await page.waitForTimeout(800);

const add = page.getByRole("button", { name: /^add moment$/i }).last();
const disabledBefore = await add.isDisabled();
await add.click({ force: true });
const disabledAfter = await add.isDisabled().catch(() => null);
await add.click({ force: true }).catch(() => {});
await add.click({ force: true }).catch(() => {});
await page.waitForTimeout(4000);

console.log("moment create POSTs fired:", posts);
console.log("add button disabled before click:", disabledBefore, "| immediately after first click:", disabledAfter);

// how many moments now carry that title?
const listed = await page.evaluate(() => {
  const t = document.querySelector("main").innerText;
  return (t.match(/Double submit moment probe/g) || []).length;
});
console.log("cards showing the probe title:", listed);

await browser.close();
