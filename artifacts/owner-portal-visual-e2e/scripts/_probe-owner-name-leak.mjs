import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

const calls = [];
page.on("response", async (r) => {
  const u = r.url();
  if (!u.includes(":5281")) return;
  let body = "";
  try { body = (await r.text()).slice(0, 1200); } catch {}
  calls.push({ url: u.replace("http://localhost:5281", ""), status: r.status(), body });
});

await page.goto(`http://localhost:3000/q/${process.env.SAFETY_CODE}`, { waitUntil: "networkidle" });
await page.waitForTimeout(3500);

console.log("=== API CALLS MADE BY THE ANONYMOUS SAFETY PAGE ===");
for (const c of calls) {
  console.log(`\n${c.status} ${c.url}`);
  const hit = /Plain Owner|ownerDisplayName/i.test(c.body);
  console.log("  contains owner name:", hit);
  if (hit) console.log("  body:", c.body.slice(0, 700));
}

const shown = await page.evaluate(() => {
  const t = document.querySelector("main").innerText;
  const m = t.match(/Owner:[^\n]*/);
  return m ? m[0] : null;
});
console.log("\nRENDERED LINE:", JSON.stringify(shown));

await browser.close();
