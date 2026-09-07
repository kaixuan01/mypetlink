/**
 * Is the stall bound to the /orders endpoint, or to concurrency depth?
 * All requests are issued from inside the page with fetch(), so Chrome's
 * per-host connection limit applies exactly as it does for the real app.
 */
import { promises as fs } from "node:fs";
import { chromium } from "playwright-core";

const session = JSON.parse(await fs.readFile(process.env.SESSION_FILE, "utf8"));
const PET = process.env.PET_ID;
const TOKEN = session.accessToken;

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });

const probe = async (label, urls) => {
  const res = await page.evaluate(async ({ urls, token }) => {
    const t0 = performance.now();
    const out = await Promise.all(urls.map(async (u) => {
      const s = performance.now();
      try {
        const r = await fetch("http://localhost:5281" + u, { headers: { Authorization: "Bearer " + token } });
        await r.text();
        return { u, ms: Math.round(performance.now() - s), status: r.status };
      } catch (e) {
        return { u, ms: Math.round(performance.now() - s), status: "ERR " + e.message };
      }
    }));
    return { total: Math.round(performance.now() - t0), out };
  }, { urls, token: TOKEN });
  const slow = res.out.filter((o) => o.ms > 3000);
  console.log(`\n${label}  (${urls.length} concurrent)  total ${res.total}ms`);
  res.out.forEach((o) => console.log(`   ${String(o.ms).padStart(6)}ms  ${o.status}  ${o.u}`));
  if (slow.length) console.log(`   >>> STALLED: ${slow.map((s) => s.u).join(", ")}`);
};

const P = `/api/v1/pets/${PET}`;
const fast = [
  "/api/v1/auth/me",
  P,
  "/api/v1/pets?lifecycleStatus=All&page=1&pageSize=100",
  `${P}/care-records?page=1&pageSize=100`,
  `${P}/memories?page=1&pageSize=100`,
  `${P}/tags?page=1&pageSize=100`,
];
const ORDERS = "/api/v1/orders?page=1&pageSize=100";

await probe("1. /orders ALONE", [ORDERS]);
await probe("2. six fast endpoints, no /orders", fast);
await probe("3. the real page mix: six fast + /orders (7 concurrent)", [...fast, ORDERS]);
await probe("4. seven fast endpoints, /orders replaced by a duplicate", [...fast, "/api/v1/auth/me?x=1"]);
await probe("5. /orders FIRST, then the six", [ORDERS, ...fast]);
await probe("6. repeat of the real page mix", [...fast, ORDERS]);

await browser.close();
