// Captures the Consignment admin UI against the local dev server and the disposable QA API.
// Usage: node artifacts/consignment-ux-redesign/capture.mjs <label> <dispatchId> [steps...]
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const [label, dispatchId] = process.argv.slice(2);
const out = path.resolve("artifacts/consignment-ux-redesign/screenshots");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const login = await (await fetch("http://localhost:5281/api/v1/dev-auth/admin-login", { method: "POST" })).json();
const d = login.data;
const session = JSON.stringify({ accessToken: d.accessToken, refreshToken: d.refreshToken, expiresAt: Date.now() + d.expiresIn * 1000, user: d.user, ownerProfile: d.ownerProfile });
async function shot(name, width, height, url, prepare) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await context.addInitScript(value => { localStorage.setItem("mypetlink_api_auth_session", value); localStorage.setItem("mypetlink_admin_launch_banner_dismissed", "1"); }, session);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`http://localhost:3000${url}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  if (prepare) await prepare(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, `${label}-${name}.png`), fullPage: true });
  const height2 = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(name, `${width}x${height2}`, errors.length ? errors : "");
  await context.close();
}
const tab = "/admin/merchant-sales?tab=consignment";
const step = process.argv[4] ?? "all";
if (label === "before") {
  await shot("desktop-page", 1440, 900, tab);
  await shot("desktop-new-agreement", 1440, 900, tab, async p => { await p.getByRole("button", { name: "New agreement" }).click(); });
  await shot("desktop-dispatch-open", 1440, 900, `${tab}&dispatch=${dispatchId}`);
  await shot("mobile-page", 390, 844, tab);
} else {
  await import(pathToFileURL(path.resolve(`artifacts/consignment-ux-redesign/capture-${step}.mjs`)).href).then(m => m.default({ shot, tab, dispatchId }));
}
await browser.close();
