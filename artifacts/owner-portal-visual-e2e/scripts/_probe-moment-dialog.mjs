import { promises as fs } from "node:fs";
import { chromium } from "playwright-core";

const session = JSON.parse(await fs.readFile("artifacts/owner-portal-visual-e2e/session.json", "utf8"));
const PET = process.env.PET_ID;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript((s) => localStorage.setItem("mypetlink_api_auth_session", s), JSON.stringify(session));
const page = await ctx.newPage();
await page.goto(`http://localhost:3000/pets/${PET}/moments?edit=new`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

const info = await page.evaluate(() => {
  const d = document.querySelector('[role=dialog]');
  if (!d) return { error: "no dialog" };
  return {
    buttons: [...d.querySelectorAll("button")].map((b) => ({
      text: b.textContent.trim().slice(0, 45),
      role: b.getAttribute("role"),
      haspopup: b.getAttribute("aria-haspopup"),
      expanded: b.getAttribute("aria-expanded"),
    })),
    selects: [...d.querySelectorAll("select")].map((s) => ({
      name: s.name, options: [...s.options].map((o) => o.value).slice(0, 6),
    })),
    inputs: [...d.querySelectorAll("input")].map((i) => ({ type: i.type, name: i.name, placeholder: i.placeholder })),
  };
});
console.log(JSON.stringify(info, null, 1).slice(0, 2600));
await browser.close();
