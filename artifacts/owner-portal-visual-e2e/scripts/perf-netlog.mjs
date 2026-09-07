import { promises as fs } from "node:fs";
import { chromium } from "playwright-core";

const session = JSON.parse(await fs.readFile(process.env.SESSION_FILE, "utf8"));
const NETLOG = process.env.NETLOG;
const TOKEN = session.accessToken;

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: [`--log-net-log=${NETLOG}`, "--net-log-capture-mode=IncludeSensitive"],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });

const r = await page.evaluate(async (token) => {
  const s = performance.now();
  const resp = await fetch("http://localhost:5281/api/v1/orders?page=1&pageSize=100", { headers: { Authorization: "Bearer " + token } });
  await resp.text();
  return Math.round(performance.now() - s);
}, TOKEN);
console.log("first /orders from fresh context:", r + "ms");

await browser.close();
await new Promise((res) => setTimeout(res, 1500));

// ---- analyse the netlog ----------------------------------------------------
const raw = await fs.readFile(NETLOG, "utf8");
let log;
try { log = JSON.parse(raw); } catch { log = JSON.parse(raw.replace(/,\s*$/, "") + "]}"); }
const types = log.constants.logEventTypes;
const byId = {};
for (const [name, id] of Object.entries(types)) byId[id] = name;

const events = log.events || [];
// find the URL_REQUEST source for /orders
const ordersSources = new Set();
for (const e of events) {
  const p = e.params || {};
  const s = JSON.stringify(p);
  if (s.includes("/api/v1/orders")) ordersSources.add(e.source.id);
}
console.log("\n=== netlog events for the /orders URL_REQUEST ===");
const rows = [];
for (const e of events) {
  if (!ordersSources.has(e.source.id)) continue;
  rows.push({ t: Number(e.time), type: byId[e.type], phase: e.phase, params: e.params ? JSON.stringify(e.params).slice(0, 130) : "" });
}
rows.sort((a, b) => a.t - b.t);
const base = rows.length ? rows[0].t : 0;
let prev = base;
for (const r2 of rows) {
  const gap = r2.t - prev;
  const flag = gap > 1000 ? `   <<< ${gap}ms GAP` : "";
  console.log(`  +${String(r2.t - base).padStart(6)}ms  ${String(byId ? r2.type : "").padEnd(42)} ${r2.params}${flag}`);
  prev = r2.t;
}
