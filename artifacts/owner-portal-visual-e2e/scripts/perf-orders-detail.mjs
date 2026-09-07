import { promises as fs } from "node:fs";
import { chromium } from "playwright-core";

const session = JSON.parse(await fs.readFile(process.env.SESSION_FILE, "utf8"));
const PET = process.env.PET_ID;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript((s) => localStorage.setItem("mypetlink_api_auth_session", s), JSON.stringify(session));
const page = await ctx.newPage();

// Node-side view: when did Chrome issue and finish each API request?
const t0 = Date.now();
const reqs = new Map();
page.on("request", (r) => {
  if (r.url().includes(":5281")) reqs.set(r, { url: r.url().replace("http://localhost:5281", ""), issued: Date.now() - t0, finished: null, status: null, failure: null });
});
page.on("requestfinished", async (r) => {
  const e = reqs.get(r);
  if (!e) return;
  e.finished = Date.now() - t0;
  try { const resp = await r.response(); e.status = resp ? resp.status() : null; } catch {}
});
page.on("requestfailed", (r) => { const e = reqs.get(r); if (e) { e.finished = Date.now() - t0; e.failure = r.failure()?.errorText; } });

await page.goto(`http://localhost:3000/pets/${PET}`, { waitUntil: "commit" });
await page.waitForTimeout(40000);

console.log("=== NODE-SIDE REQUEST TIMELINE (ms from navigation) ===");
[...reqs.values()].sort((a, b) => a.issued - b.issued).forEach((e) => {
  const dur = e.finished === null ? "PENDING" : `${e.finished - e.issued}ms`;
  console.log(`  issued +${String(e.issued).padStart(6)}  finished +${String(e.finished ?? "-").padStart(6)}  ${String(dur).padStart(9)}  ${e.status ?? e.failure ?? ""}  ${e.url}`);
});

console.log("\n=== PAGE-SIDE RESOURCE TIMING DETAIL (API only) ===");
const detail = await page.evaluate(() =>
  performance.getEntriesByType("resource")
    .filter((e) => e.name.includes(":5281"))
    .map((e) => ({
      url: e.name.replace("http://localhost:5281", ""),
      startTime: Math.round(e.startTime),
      fetchStart: Math.round(e.fetchStart),
      connectStart: Math.round(e.connectStart),
      connectEnd: Math.round(e.connectEnd),
      requestStart: Math.round(e.requestStart),
      responseStart: Math.round(e.responseStart),
      responseEnd: Math.round(e.responseEnd),
      duration: Math.round(e.duration),
      stalledMs: Math.round(e.requestStart - e.fetchStart),
      waitingMs: Math.round(e.responseStart - e.requestStart),
    }))
);
detail.sort((a, b) => b.duration - a.duration).forEach((d) => {
  console.log(`  ${String(d.duration).padStart(6)}ms total | stalled(queue+connect) ${String(d.stalledMs).padStart(6)}ms | server-wait ${String(d.waitingMs).padStart(5)}ms | ${d.url}`);
});

await browser.close();
