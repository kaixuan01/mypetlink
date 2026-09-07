/**
 * Repeats the navigation until a slow run is caught, then prints the Node-side
 * request timeline for it.
 *
 * Discriminator:
 *   issued early + finished late  -> network / connection stall
 *   issued late                   -> renderer or JS starvation
 */
import { promises as fs } from "node:fs";
import { chromium } from "playwright-core";

const session = JSON.parse(await fs.readFile(process.env.SESSION_FILE, "utf8"));
const PET = process.env.PET_ID;

async function attempt(i) {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((s) => localStorage.setItem("mypetlink_api_auth_session", s), JSON.stringify(session));
  const page = await ctx.newPage();

  const t0 = Date.now();
  const events = [];
  page.on("request", (r) => {
    if (r.url().includes(":5281")) events.push({ url: r.url().replace("http://localhost:5281", ""), issued: Date.now() - t0, finished: null, err: null });
  });
  page.on("requestfinished", (r) => {
    if (!r.url().includes(":5281")) return;
    const e = [...events].reverse().find((x) => x.url === r.url().replace("http://localhost:5281", "") && x.finished === null);
    if (e) e.finished = Date.now() - t0;
  });
  page.on("requestfailed", (r) => {
    if (!r.url().includes(":5281")) return;
    const e = [...events].reverse().find((x) => x.url === r.url().replace("http://localhost:5281", "") && x.finished === null);
    if (e) { e.finished = Date.now() - t0; e.err = r.failure()?.errorText; }
  });

  await page.goto(`http://localhost:3000/pets/${PET}`, { waitUntil: "commit" });
  await page.waitForTimeout(32000);
  const total = Date.now() - t0;

  const slowest = events.reduce((m, e) => Math.max(m, (e.finished ?? total) - e.issued), 0);
  await browser.close();
  return { events, slowest, total };
}

for (let i = 1; i <= 6; i++) {
  const r = await attempt(i);
  console.log(`attempt ${i}: slowest request ${r.slowest}ms  (${r.events.length} api requests)`);
  if (r.slowest > 5000) {
    console.log("\n=== SLOW RUN CAUGHT - Node-side timeline ===");
    r.events.sort((a, b) => a.issued - b.issued).forEach((e) => {
      const dur = (e.finished ?? r.total) - e.issued;
      const flag = dur > 5000 ? "  <<< STALLED" : "";
      console.log(`  issued +${String(e.issued).padStart(6)}  finished +${String(e.finished ?? "never").padStart(6)}  dur ${String(dur).padStart(6)}ms  ${e.err ?? ""}  ${e.url}${flag}`);
    });
    process.exit(0);
  }
}
console.log("\nNo slow run reproduced in 6 attempts.");
