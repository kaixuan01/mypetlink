import { chromium } from "playwright-core";
import { promises as fs } from "node:fs";
import path from "node:path";

export const ROOT = "artifacts/owner-portal-visual-e2e";
export const BASE = "http://localhost:3000";
export const API = "http://localhost:5281";

const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];

export const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 900 },
};

async function findBrowser() {
  for (const c of BROWSERS) {
    try { await fs.access(c); return c; } catch {}
  }
  throw new Error("No Chrome/Edge executable found.");
}

/**
 * Opens a recorded session. `name` becomes the video filename.
 * Everything is deliberately slow so the recording is watchable.
 */
export async function openSession({ name, viewport = "mobile", session = null, slowMo = 260 }) {
  const vp = VIEWPORTS[viewport];
  const rawDir = path.join(ROOT, "_raw", name);
  const shotDir = path.join(ROOT, "screenshots", name);
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(shotDir, { recursive: true });

  const executablePath = await findBrowser();
  const browser = await chromium.launch({ executablePath, headless: true, slowMo });
  const ctx = await browser.newContext({
    viewport: vp,
    deviceScaleFactor: 1,
    recordVideo: { dir: rawDir, size: vp },
    locale: "en-MY",
    timezoneId: "Asia/Kuala_Lumpur",
  });

  if (session) {
    await ctx.addInitScript((s) => {
      try { window.localStorage.setItem("mypetlink_api_auth_session", s); } catch {}
    }, JSON.stringify(session));
  }

  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

  let n = 0;
  const shot = async (label) => {
    n += 1;
    const file = path.join(shotDir, `${String(n).padStart(2, "0")}-${label}.png`);
    await page.screenshot({ path: file });
    return file;
  };

  /** Pause long enough that the state is visible when watching back. */
  const beat = (ms = 1100) => page.waitForTimeout(ms);

  const finish = async () => {
    await beat(700);
    await page.close();
    await ctx.close();
    await browser.close();
    // Playwright names videos by GUID; rename to the journey name.
    const files = await fs.readdir(rawDir);
    const webm = files.find((f) => f.endsWith(".webm"));
    let out = null;
    if (webm) {
      out = path.join(ROOT, "videos", `${name}.webm`);
      await fs.mkdir(path.join(ROOT, "videos"), { recursive: true });
      await fs.rename(path.join(rawDir, webm), out);
    }
    await fs.rm(rawDir, { recursive: true, force: true });
    return { video: out, consoleErrors };
  };

  return { browser, ctx, page, shot, beat, finish, consoleErrors, viewport: vp };
}

/** Overflow / clipping probe. Excludes absolute, fixed and aria-hidden helpers. */
export async function layoutProbe(page, label) {
  return page.evaluate((lbl) => {
    const vw = window.innerWidth;
    window.scrollTo(4000, 0);
    const pannedX = window.scrollX;
    window.scrollTo(0, 0);
    const bad = [];
    document.querySelectorAll("main *").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position === "absolute" || cs.position === "fixed") return;
      if (el.closest('[aria-hidden="true"]')) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      if (r.right <= vw + 1 && r.left >= -1) return;
      let p = el.parentElement, scrollable = false;
      while (p) {
        const pc = getComputedStyle(p);
        if (pc.overflowX === "auto" || pc.overflowX === "scroll") { scrollable = true; break; }
        p = p.parentElement;
      }
      if (scrollable) return;
      if (el.querySelector("*")) return; // leaf nodes only
      bad.push({
        text: (el.innerText || "").slice(0, 40),
        left: Math.round(r.left),
        right: Math.round(r.right),
        tag: el.tagName,
      });
    });
    return {
      label: lbl,
      route: location.pathname + location.search,
      viewportWidth: vw,
      viewportMatchesVisual: vw === window.visualViewport.width,
      pannedX,
      clippedCount: bad.length,
      clipped: bad.slice(0, 6),
    };
  }, label);
}

/** Small touch-target audit (WCAG 2.5.5 / 24px minimum practical check). */
export async function touchTargets(page) {
  return page.evaluate(() => {
    const small = [];
    document.querySelectorAll("main button, main a, main input[type=checkbox], main [role=switch]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.height < 24 || r.width < 24) {
        small.push({ tag: el.tagName, text: (el.innerText || el.getAttribute("aria-label") || "").slice(0, 34), w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    return small.slice(0, 10);
  });
}

export async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}
