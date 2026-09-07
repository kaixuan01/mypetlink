/**
 * Reproduces the AUDIT RECORDING configuration and varies one factor at a time
 * to find what made the recorded videos show a long loading screen.
 *
 * Navigation is identical to the recording scripts:
 *   page.goto(url, { waitUntil: "networkidle" })
 * The loading-screen duration is measured IN-PAGE by a MutationObserver, so it
 * is the real on-screen duration regardless of how the harness waits.
 */
import { promises as fs } from "node:fs";
import { chromium } from "playwright-core";

const session = JSON.parse(await fs.readFile(process.env.SESSION_FILE, "utf8"));
const PET = process.env.PET_ID;
const VIEW = process.env.VIEW === "desktop" ? { width: 1280, height: 900 } : { width: 390, height: 844 };
const TMP = process.env.TMP_DIR;

const INIT = `
window.__m = { first: null, gone: null };
(function(){
  const check = () => {
    const t = document.body ? document.body.innerText : "";
    const now = performance.now();
    const loading = /Getting this pet|profile ready|Just a moment/i.test(t);
    if (loading && window.__m.first === null) window.__m.first = now;
    if (!loading && window.__m.first !== null && window.__m.gone === null) window.__m.gone = now;
  };
  const o = new MutationObserver(check);
  const s = () => { o.observe(document.documentElement,{childList:true,subtree:true,characterData:true}); check(); };
  if (document.documentElement) s(); else document.addEventListener("DOMContentLoaded", s);
})();
`;

async function run({ video, slowMo, label }) {
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    slowMo,
  });
  const ctx = await browser.newContext({
    viewport: VIEW,
    recordVideo: video ? { dir: `${TMP}/${label.replace(/\W+/g, "_")}`, size: VIEW } : undefined,
  });
  await ctx.addInitScript((s) => localStorage.setItem("mypetlink_api_auth_session", s), JSON.stringify(session));
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();

  const t0 = Date.now();
  await page.goto(`http://localhost:3000/pets/${PET}`, { waitUntil: "networkidle" });
  const gotoMs = Date.now() - t0;
  await page.waitForTimeout(3000); // the recording's beat(3000)

  const m = await page.evaluate(() => ({
    first: window.__m.first === null ? null : Math.round(window.__m.first),
    gone: window.__m.gone === null ? null : Math.round(window.__m.gone),
    slowestApi: Math.round(Math.max(0, ...performance.getEntriesByType("resource").filter(e => e.name.includes(":5281")).map(e => e.duration))),
    apiCount: performance.getEntriesByType("resource").filter(e => e.name.includes(":5281")).length,
  }));

  await page.close();
  await ctx.close();
  await browser.close();
  return {
    label,
    gotoMs,
    loadingVisibleMs: m.first !== null && m.gone !== null ? m.gone - m.first : (m.first !== null ? "still visible" : "never seen"),
    slowestApiMs: m.slowestApi,
    apiCount: m.apiCount,
  };
}

const rows = [];
rows.push(await run({ video: true,  slowMo: 260, label: "AUDIT CONFIG: video + slowMo 260" }));
rows.push(await run({ video: true,  slowMo: 0,   label: "video, no slowMo" }));
rows.push(await run({ video: false, slowMo: 260, label: "no video, slowMo 260" }));
rows.push(await run({ video: false, slowMo: 0,   label: "no video, no slowMo (baseline)" }));
rows.push(await run({ video: true,  slowMo: 260, label: "AUDIT CONFIG repeat" }));
rows.push(await run({ video: false, slowMo: 0,   label: "baseline repeat" }));

console.log(`\nviewport ${VIEW.width}x${VIEW.height} | navigation: goto(waitUntil:networkidle) + 3s beat\n`);
console.log("configuration".padEnd(36) + "goto".padStart(8) + "loadingUI".padStart(16) + "slowestAPI".padStart(12) + "apis".padStart(6));
for (const r of rows) {
  console.log(r.label.padEnd(36) + String(r.gotoMs).padStart(8) + String(r.loadingVisibleMs).padStart(16) + String(r.slowestApiMs).padStart(12) + String(r.apiCount).padStart(6));
}
