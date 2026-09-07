/**
 * Instrumented navigation timing for the Owner Portal.
 *
 * Everything is timed INSIDE the page against a single clock so Node-side
 * and page-side timestamps cannot drift. No slowMo, no artificial waits -
 * this measures the application, not the harness.
 */
import { promises as fs } from "node:fs";
import { chromium } from "playwright-core";

const EXE = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE || "http://localhost:3000";
const PET = process.env.PET_ID;
const VIEWPORT = process.env.VIEW === "desktop"
  ? { width: 1280, height: 900 }
  : { width: 390, height: 844 };
const LABEL = process.env.LABEL || "run";

const LOADING_RE = /Getting this pet|profile ready|Just a moment/i;

const INIT = `
window.__perf = { marks: [], loadingFirstSeen: null, loadingGone: null, contentFirstSeen: null, navStart: performance.now() };
(function () {
  const seen = () => {
    const t = document.body ? document.body.innerText : "";
    const now = performance.now();
    const isLoading = /Getting this pet|profile ready|Just a moment/i.test(t);
    // "meaningful content" = the pet heading plus a real section, not the placeholder
    const h1 = document.querySelector("main h1");
    const hasContent = !!h1 && h1.innerText.trim().length > 0 && !isLoading;
    if (isLoading && window.__perf.loadingFirstSeen === null) window.__perf.loadingFirstSeen = now;
    if (!isLoading && window.__perf.loadingFirstSeen !== null && window.__perf.loadingGone === null) window.__perf.loadingGone = now;
    if (hasContent && window.__perf.contentFirstSeen === null) window.__perf.contentFirstSeen = now;
  };
  const obs = new MutationObserver(seen);
  const start = () => { obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true }); seen(); };
  if (document.documentElement) start(); else document.addEventListener("DOMContentLoaded", start);
  document.addEventListener("DOMContentLoaded", seen);
  window.addEventListener("load", seen);
  // resource timings for API + JS chunks
  const po = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (/:5281\\//.test(e.name) || /_next\\/static|\\.js($|\\?)/.test(e.name)) {
        window.__perf.marks.push({
          url: e.name.replace(/^https?:\\/\\/localhost:\\d+/, ""),
          kind: /:5281\\//.test(e.name) ? "api" : "asset",
          start: Math.round(e.startTime),
          end: Math.round(e.responseEnd),
          dur: Math.round(e.duration),
        });
      }
    }
  });
  po.observe({ type: "resource", buffered: true });
})();
`;

export async function measure({ session, navigations, label = LABEL, viewport = VIEWPORT }) {
  const browser = await chromium.launch({ executablePath: EXE, headless: true }); // no slowMo
  const ctx = await browser.newContext({ viewport });
  if (session) await ctx.addInitScript((s) => localStorage.setItem("mypetlink_api_auth_session", s), JSON.stringify(session));
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();

  const results = [];
  for (const nav of navigations) {
    const t0 = Date.now();
    if (nav.type === "goto") {
      await page.goto(BASE + nav.route, { waitUntil: "commit" });
    } else {
      await page.evaluate(() => { window.__perf = { marks: [], loadingFirstSeen: null, loadingGone: null, contentFirstSeen: null, navStart: performance.now() }; });
      await nav.action(page);
    }

    // Wait until real content is on screen (or give up).
    let settled = true;
    try {
      await page.waitForFunction(
        () => {
          const t = document.body ? document.body.innerText : "";
          if (/Getting this pet|profile ready|Just a moment/i.test(t)) return false;
          const h1 = document.querySelector("main h1");
          return !!h1 && h1.innerText.trim().length > 0;
        },
        { timeout: 60000 }
      );
    } catch { settled = false; }
    const wallMs = Date.now() - t0;

    await page.waitForTimeout(400); // let trailing resource entries flush
    const perf = await page.evaluate(() => {
      const p = window.__perf;
      return {
        navStart: Math.round(p.navStart),
        loadingFirstSeen: p.loadingFirstSeen === null ? null : Math.round(p.loadingFirstSeen),
        loadingGone: p.loadingGone === null ? null : Math.round(p.loadingGone),
        contentFirstSeen: p.contentFirstSeen === null ? null : Math.round(p.contentFirstSeen),
        marks: p.marks,
        nav: performance.getEntriesByType("navigation").map((n) => ({
          type: n.type,
          responseStart: Math.round(n.responseStart),
          responseEnd: Math.round(n.responseEnd),
          domContentLoaded: Math.round(n.domContentLoadedEventEnd),
          loadEvent: Math.round(n.loadEventEnd),
          duration: Math.round(n.duration),
        }))[0] || null,
      };
    });

    const api = perf.marks.filter((m) => m.kind === "api");
    const assets = perf.marks.filter((m) => m.kind === "asset");
    results.push({
      label: nav.label,
      route: nav.route || "(client nav)",
      settled,
      wallMs,
      docResponseEnd: perf.nav ? perf.nav.responseEnd : null,
      docDuration: perf.nav ? perf.nav.duration : null,
      loadingFirstSeen: perf.loadingFirstSeen,
      loadingGone: perf.loadingGone,
      loadingVisibleMs: perf.loadingFirstSeen !== null && perf.loadingGone !== null ? perf.loadingGone - perf.loadingFirstSeen : null,
      contentFirstSeen: perf.contentFirstSeen,
      apiCount: api.length,
      apiFirstStart: api.length ? Math.min(...api.map((a) => a.start)) : null,
      apiLastEnd: api.length ? Math.max(...api.map((a) => a.end)) : null,
      apiSlowest: api.length ? api.slice().sort((a, b) => b.dur - a.dur)[0] : null,
      apiCalls: api.map((a) => `${a.dur}ms ${a.url}`),
      assetCount: assets.length,
      assetBytesHint: assets.length,
      slowestAssets: assets.slice().sort((a, b) => b.dur - a.dur).slice(0, 3).map((a) => `${a.dur}ms ${a.url.slice(0, 70)}`),
    });
  }

  await browser.close();
  return { label, viewport, results };
}

export async function loadSession() {
  const raw = await fs.readFile(process.env.SESSION_FILE, "utf8");
  return JSON.parse(raw);
}
