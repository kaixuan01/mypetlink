// API-connected checks for the Phase 2 remediation (F1, F2, F4, F5, UX):
// real web app (next dev, API mode) + real API + disposable SQL Server
// database. Delays and failures are injected at the browser's network layer.
import { createRequire } from "node:module";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const require = createRequire("C:/Project/MyPetLink/package.json");
const { chromium } = require("playwright-core");

const SP = process.argv[2];
const DB = readFileSync(`${SP}/e2e-db.txt`, "utf8").trim();
const KEY = readFileSync(`${SP}/e2e-signing-key.txt`, "utf8").trim();
const API = "http://localhost:5281";
const WEB = "http://localhost:3000";
const OWNER = "e2e00000-0000-4000-8000-000000000001";
const EMAIL = "care.e2e@mypetlink.local";

const b64 = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
function mintToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({
    sub: OWNER,
    jti: randomUUID(),
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier": OWNER,
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": EMAIL,
    "http://schemas.microsoft.com/ws/2008/06/identity/claims/role": "Owner",
    iss: "MyPetLink.Api",
    aud: "MyPetLink.Local",
    nbf: now - 5,
    iat: now - 5,
    exp: now + 2 * 3600,
  });
  const signature = createHmac("sha256", KEY).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
const TOKEN = mintToken();

async function api(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}
function sql(query) {
  return execFileSync(
    "sqlcmd",
    ["-S", "(localdb)\\MSSQLLocalDB", "-d", DB, "-l", "20", "-b", "-h", "-1", "-W", "-Q", `SET NOCOUNT ON; ${query}`],
    { encoding: "utf8" }
  ).trim();
}
const completions = (targetId) =>
  Number(sql(`select count(*) from CareRecords where FulfillsCareRecordId='${targetId}' and ArchivedAt is null and DeletedAt is null`));

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
const shift = (days) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}


// ---- data: one pet, 150 due-soon pending items ----------------------------------
for (const old of (await api("GET", "/api/v1/pets")).json?.data ?? []) {
  if (old.lifecycleStatus !== "Archived") await api("POST", `/api/v1/pets/${old.id}/archive`, {});
}
const pet = (await api("POST", "/api/v1/pets", { name: "Milo", species: "Cat" })).json.data.id;
const items = [];
for (let index = 0; index < 150; index += 1) {
  const created = await api("POST", `/api/v1/pets/${pet}/care-records`, {
    type: "Vaccine", title: `A${String(index).padStart(3, "0")}`, date: shift(-400), dueDate: shift(1 + Math.floor(index / 10)),
    notes: "Earlier visit", publicVisibility: "Private",
  });
  if (created.status >= 300) throw new Error(`record ${created.status}`);
  items.push(created.json.data.id);
}
check("seeded 150 due-soon items", items.length === 150);

const browser = await chromium.launch({ channel: "msedge", headless: true });
async function newContext(viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(
    ([token, owner, email]) => {
      window.localStorage.setItem("mypetlink_api_auth_session", JSON.stringify({
        accessToken: token, refreshToken: "e2e-not-used", expiresAt: Date.now() + 2 * 3600 * 1000,
        user: { id: owner, email, displayName: "Care E2E Owner", roles: ["Owner"], status: "Active" }, ownerProfile: null,
      }));
    },
    [TOKEN, OWNER, EMAIL]
  );
  return context;
}
const rows = (page) => page.locator("[data-care-planner-item]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-care-planner-item")));
const FRESH = "Care dates may change while you’re browsing. Refresh to check the latest list.".replace("’", "'");
const HISTORY_FRESH = "Records may change while you browse. Reload to check again.";

// Planner: real equal-total churn between page 1 and page 2 of the 150 window.
{
  const context = await newContext({ width: 1280, height: 900 });
  const page = await context.newPage();
  await page.goto(`${WEB}/records`);
  await page.locator("[data-care-planner-state=ready]").waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /Show more care dates/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-care-planner-item]").length === 100, null, { timeout: 30_000 });
  let churned = false;
  await page.route(`${API}/api/v1/care-records/upcoming?*`, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("page") === "2" && !churned) {
      churned = true;
      // Another device completes the first five, each with a next due date.
      for (const id of items.slice(0, 5)) {
        const done = await api("POST", `/api/v1/care-records/${id}/complete`, { idempotencyKey: randomUUID(), completedOn: today, nextDueDate: shift(29) });
        if (done.status !== 201) throw new Error(`complete ${done.status}`);
      }
    }
    await route.continue();
  });
  await page.getByRole("button", { name: /Show more care dates/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-care-planner-item]").length === 150, null, { timeout: 30_000 });
  const total = (await api("GET", `/api/v1/care-records/upcoming?page=1&pageSize=1`)).json.meta.total;
  const shown = await rows(page);
  const noMore = (await page.getByRole("button", { name: /Show more care dates/ }).count()) === 0;
  const fresh = await page.getByText(FRESH).isVisible();
  const noCounts = (await page.locator("[data-care-group-count]").count()) === 0;
  check("Planner: equal-total churn (total stays 150) leaves an exhausted list that carries the freshness note, Refresh, no counts",
    total === 150 && shown.length === 150 && noMore && fresh && noCounts && (await page.getByRole("button", { name: "Refresh", exact: true }).count()) === 1,
    `total=${total} shown=${shown.length} stale=${shown.filter((id) => items.slice(0, 5).includes(id)).length}`);
  await page.getByText(FRESH).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SP}/f4-planner-churn-1280.png` });
  // Keyboard: reach "Refresh the list" and use it.
  await page.getByRole("button", { name: "Refresh the list" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction((stale) => !stale.some((id) => document.querySelector(`[data-care-planner-item="${id}"]`)), items.slice(0, 5), { timeout: 30_000 });
  const after = await rows(page);
  const current = [];
  for (let p = 1; p <= 2; p += 1) current.push(...(await api("GET", `/api/v1/care-records/upcoming?page=${p}&pageSize=100`)).json.data.items.map((item) => item.id));
  check("Planner: Refresh the list (by keyboard) shows the current 150", JSON.stringify(after) === JSON.stringify(current), `after=${after.length}`);
  await context.close();
}

// History: multi-page history keeps Reload records after Show older is exhausted.
{
  const context = await newContext({ width: 1280, height: 900 });
  const page = await context.newPage();
  await page.goto(`${WEB}/pets/${pet}/records`);
  await page.getByRole("button", { name: /Show older records/ }).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /Show older records/ }).click();
  await page.getByText(HISTORY_FRESH).waitFor({ timeout: 30_000 });
  const exhausted = (await page.getByRole("button", { name: /Show older records/ }).count()) === 0;
  const reload = page.getByRole("button", { name: "Reload records" });
  await reload.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SP}/f4-history-1280.png` });
  await reload.focus();
  await page.keyboard.press("Enter");
  await page.getByText(HISTORY_FRESH).waitFor({ timeout: 30_000 });
  check("History: exhausted multi-page history shows the note and Reload records, usable by keyboard", exhausted && (await reload.count()) === 1);
  await context.close();
}

// Widths: notes wrap, no sideways scroll, controls reachable above the bottom bar.
for (const [width, height] of [[320, 700], [390, 844], [768, 1024], [1280, 900]]) {
  const context = await newContext({ width, height });
  const page = await context.newPage();
  await page.goto(`${WEB}/records`);
  await page.locator("[data-care-planner-state=ready]").waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /Show more care dates/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-care-planner-item]").length === 100, null, { timeout: 30_000 });
  await page.getByRole("button", { name: /Show more care dates/ }).click();
  await page.getByText(FRESH).waitFor({ timeout: 30_000 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const button = await page.getByRole("button", { name: "Refresh the list" }).boundingBox();
  await page.screenshot({ path: `${SP}/f4-planner-end-${width}.png` });
  await page.goto(`${WEB}/pets/${pet}/records`);
  await page.getByRole("button", { name: /Show older records/ }).click();
  await page.getByText(HISTORY_FRESH).waitFor({ timeout: 30_000 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  const historyFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  await page.screenshot({ path: `${SP}/f4-history-end-${width}.png` });
  check(`${width}px: notes wrap, no sideways scroll`, fits && historyFits && button && button.width <= width,
    `button=${JSON.stringify(button && { x: Math.round(button.x), w: Math.round(button.width) })}`);
  await context.close();
}

await browser.close();
writeFileSync(`${SP}/e2e-f4-final-results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
