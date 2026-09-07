import { promises as fs } from "node:fs";
import { chromium } from "playwright-core";

const session = JSON.parse(await fs.readFile("artifacts/owner-portal-visual-e2e/session.json", "utf8"));
const PET = process.env.PET_ID;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript((s) => localStorage.setItem("mypetlink_api_auth_session", s), JSON.stringify(session));
const page = await ctx.newPage();

await page.goto(`http://localhost:3000/pets/${PET}/records`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.getByRole("button", { name: /add care record|add record/i }).first().click();
await page.waitForTimeout(2200);

const before = await page.evaluate(() => {
  const d = document.querySelector('[role=dialog]');
  return [...d.querySelectorAll('input[type=text]')].map((i) => {
    const wrap = i.closest("label") || i.parentElement?.parentElement;
    return { label: (wrap?.innerText || "").split("\n")[0].slice(0, 34), value: i.value, placeholder: i.placeholder };
  });
});
console.log("TEXT INPUTS BEFORE choosing a type:");
before.forEach((b) => console.log("  ", JSON.stringify(b)));

await page.locator('[role=dialog] select').first().selectOption({ label: "Vaccine" });
await page.waitForTimeout(1200);

const after = await page.evaluate(() => {
  const d = document.querySelector('[role=dialog]');
  return [...d.querySelectorAll('input[type=text]')].map((i) => {
    const wrap = i.closest("label") || i.parentElement?.parentElement;
    return { label: (wrap?.innerText || "").split("\n")[0].slice(0, 34), value: i.value, placeholder: i.placeholder };
  });
});
console.log("\nTEXT INPUTS AFTER choosing Vaccine:");
after.forEach((b) => console.log("  ", JSON.stringify(b)));

const dates = await page.evaluate(() => {
  const d = document.querySelector('[role=dialog]');
  return [...d.querySelectorAll('input[type=date]')].map((i) => {
    const wrap = i.closest("label") || i.parentElement?.parentElement;
    return { label: (wrap?.innerText || "").split("\n")[0].slice(0, 34), value: i.value };
  });
});
console.log("\nDATE INPUTS:");
dates.forEach((b) => console.log("  ", JSON.stringify(b)));

await browser.close();
