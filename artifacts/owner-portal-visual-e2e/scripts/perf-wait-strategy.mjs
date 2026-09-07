/**
 * Isolates whether the observed "25s loading" is real app latency or an
 * artifact of how the harness waits for the page to settle.
 *
 * Same navigation, three wait strategies:
 *   A. passive  - navigate, sleep, then read timings recorded in-page
 *   B. rAF poll - page.waitForFunction() default polling (what the audit used)
 *   C. 250ms poll - page.waitForFunction() with interval polling
 *
 * In-page marks are recorded by a MutationObserver in all three cases, so the
 * measured "loading visible" duration is directly comparable.
 */
import { promises as fs } from "node:fs";
import { chromium } from "playwright-core";

const session = JSON.parse(await fs.readFile(process.env.SESSION_FILE, "utf8"));
const PET = process.env.PET_ID;
const ROUTE = process.env.ROUTE || `/pets/${PET}`;
const VIEW = process.env.VIEW === "desktop" ? { width: 1280, height: 900 } : { width: 390, height: 844 };

const INIT = `
window.__m = { loadingFirstSeen: null, loadingGone: null, navStart: performance.now() };
(function(){
  const check = () => {
    const t = document.body ? document.body.innerText : "";
    const now = performance.now();
    const loading = /Getting this pet|profile ready|Just a moment/i.test(t);
    if (loading && window.__m.loadingFirstSeen === null) window.__m.loadingFirstSeen = now;
    if (!loading && window.__m.loadingFirstSeen !== null && window.__m.loadingGone === null) window.__m.loadingGone = now;
    window.__m.settled = !loading && !!document.querySelector("main h1");
  };
  const o = new MutationObserver(check);
  const start = () => { o.observe(document.documentElement, {childList:true, subtree:true, characterData:true}); check(); };
  if (document.documentElement) start(); else document.addEventListener("DOMContentLoaded", start);
})();
`;

async function run(strategy, label) {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const ctx = await browser.newContext({ viewport: VIEW });
  await ctx.addInitScript((s) => localStorage.setItem("mypetlink_api_auth_session", s), JSON.stringify(session));
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();

  const t0 = Date.now();
  await page.goto("http://localhost:3000" + ROUTE, { waitUntil: "commit" });

  if (strategy === "passive") {
    // Never touch the page while it loads.
    await page.waitForTimeout(20000);
  } else if (strategy === "raf") {
    await page.waitForFunction(() => {
      const t = document.body ? document.body.innerText : "";
      if (/Getting this pet|profile ready|Just a moment/i.test(t)) return false;
      const h1 = document.querySelector("main h1");
      return !!h1 && h1.innerText.trim().length > 0;
    }, { timeout: 60000 }).catch(() => {});
  } else {
    await page.waitForFunction(() => window.__m && window.__m.settled === true, { timeout: 60000, polling: 250 }).catch(() => {});
  }
  const wall = Date.now() - t0;

  const m = await page.evaluate(() => ({
    first: window.__m.loadingFirstSeen === null ? null : Math.round(window.__m.loadingFirstSeen),
    gone: window.__m.loadingGone === null ? null : Math.round(window.__m.loadingGone),
    apiMax: Math.round(Math.max(0, ...performance.getEntriesByType("resource").filter(e => e.name.includes(":5281")).map(e => e.duration))),
    apiCount: performance.getEntriesByType("resource").filter(e => e.name.includes(":5281")).length,
  }));

  await browser.close();
  const visible = m.first !== null && m.gone !== null ? m.gone - m.first : null;
  return { label, wall, loadingVisibleMs: visible, slowestApiMs: m.apiMax, apiCount: m.apiCount };
}

const rows = [];
rows.push(await run("passive", "A. passive wait (no page interrogation)"));
rows.push(await run("raf", "B. waitForFunction, default rAF polling"));
rows.push(await run("interval", "C. waitForFunction, 250ms polling"));
rows.push(await run("passive", "A2. passive wait (repeat)"));
rows.push(await run("raf", "B2. rAF polling (repeat)"));

console.log(`\nROUTE ${ROUTE}  |  viewport ${VIEW.width}x${VIEW.height}\n`);
console.log("strategy".padEnd(42) + "wall".padStart(8) + "loadingUI".padStart(11) + "slowestAPI".padStart(12) + "apiCalls".padStart(10));
for (const r of rows) {
  console.log(r.label.padEnd(42) + String(r.wall).padStart(8) + String(r.loadingVisibleMs ?? "-").padStart(11) + String(r.slowestApiMs).padStart(12) + String(r.apiCount).padStart(10));
}
