import { promises as fs } from "node:fs";
import { chromium } from "playwright-core";

const session = JSON.parse(await fs.readFile(process.env.SESSION_FILE, "utf8"));
const DIR = process.env.NETLOG_DIR;
const TOKEN = session.accessToken;

async function attempt(i) {
  const netlog = `${DIR}/netlog-${i}.json`;
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    args: [`--log-net-log=${netlog}`, "--net-log-capture-mode=IncludeSensitive"],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  const ms = await page.evaluate(async (token) => {
    const s = performance.now();
    const r = await fetch("http://localhost:5281/api/v1/orders?page=1&pageSize=100", { headers: { Authorization: "Bearer " + token } });
    await r.text();
    return Math.round(performance.now() - s);
  }, TOKEN);
  await browser.close();
  await new Promise((r) => setTimeout(r, 1200));
  return { ms, netlog };
}

for (let i = 1; i <= 8; i++) {
  const { ms, netlog } = await attempt(i);
  console.log(`attempt ${i}: ${ms}ms`);
  if (ms < 5000) continue;

  console.log("\n=== STALL CAUGHT - netlog gap analysis ===");
  const raw = await fs.readFile(netlog, "utf8");
  let log;
  try { log = JSON.parse(raw); } catch { log = JSON.parse(raw.replace(/,\s*$/, "") + "]}"); }
  const byId = {};
  for (const [name, id] of Object.entries(log.constants.logEventTypes)) byId[id] = name;

  // every event, grouped by source, looking for the big gap
  const events = (log.events || []).map((e) => ({ ...e, t: Number(e.time), name: byId[e.type] }));
  events.sort((a, b) => a.t - b.t);

  let biggest = null;
  for (let k = 1; k < events.length; k++) {
    const gap = events[k].t - events[k - 1].t;
    if (!biggest || gap > biggest.gap) biggest = { gap, before: events[k - 1], after: events[k] };
  }
  if (biggest) {
    console.log(`\nLargest gap in the whole netlog: ${biggest.gap}ms`);
    console.log(`  BEFORE gap: ${biggest.before.name} src=${biggest.before.source.id} ${JSON.stringify(biggest.before.params || {}).slice(0, 200)}`);
    console.log(`  AFTER  gap: ${biggest.after.name} src=${biggest.after.source.id} ${JSON.stringify(biggest.after.params || {}).slice(0, 200)}`);

    // context around the gap
    const idx = events.indexOf(biggest.before);
    console.log("\n  --- 12 events before the gap ---");
    events.slice(Math.max(0, idx - 11), idx + 1).forEach((e) => console.log(`    ${e.name}  src=${e.source.id}  ${JSON.stringify(e.params || {}).slice(0, 110)}`));
    console.log("  --- 12 events after the gap ---");
    events.slice(idx + 1, idx + 13).forEach((e) => console.log(`    ${e.name}  src=${e.source.id}  ${JSON.stringify(e.params || {}).slice(0, 110)}`));
  }
  process.exit(0);
}
console.log("no stall reproduced in 8 attempts");
