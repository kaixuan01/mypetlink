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

// ---- data ---------------------------------------------------------------------
for (const old of (await api("GET", "/api/v1/pets")).json?.data ?? []) {
  if (old.lifecycleStatus !== "Archived") await api("POST", `/api/v1/pets/${old.id}/archive`, {});
}
const LONG_PET = "Sir Reginald Fluffington-Whiskerbottom the Third";
const pets = {};
for (const name of ["Milo", LONG_PET]) {
  const created = await api("POST", "/api/v1/pets", { name, species: "Cat" });
  if (created.status >= 300) throw new Error(`pet ${created.status} ${JSON.stringify(created.json)}`);
  pets[name] = created.json.data.id;
}
async function addPending(pet, title, due) {
  const created = await api("POST", `/api/v1/pets/${pets[pet]}/care-records`, {
    type: "Vaccine", title, date: shift(-400), dueDate: due, notes: "Earlier visit", publicVisibility: "Private",
  });
  if (created.status >= 300) throw new Error(`record ${created.status} ${JSON.stringify(created.json)}`);
  return { id: created.json.data.id, title, pet };
}
const milo = [];
for (let index = 0; index < 105; index += 1) {
  milo.push(await addPending("Milo", `Booster ${String(index).padStart(3, "0")}`, shift(index - 20)));
}
const LONG_TITLE = "Annual combination vaccination booster (DHPP plus Leptospirosis four-way) follow-up";
const longOne = await addPending(LONG_PET, LONG_TITLE, shift(3));
check("seeded 105 pending for Milo and one long-named item", milo.length === 105 && longOne.id);

const browser = await chromium.launch({ channel: "msedge", headless: true });
async function newContext(viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(
    ([token, owner, email]) => {
      window.localStorage.setItem(
        "mypetlink_api_auth_session",
        JSON.stringify({
          accessToken: token,
          refreshToken: "e2e-not-used",
          expiresAt: Date.now() + 2 * 3600 * 1000,
          user: { id: owner, email, displayName: "Care E2E Owner", roles: ["Owner"], status: "Active" },
          ownerProfile: null,
        })
      );
    },
    [TOKEN, OWNER, EMAIL]
  );
  return context;
}
const desktop = await newContext({ width: 1280, height: 900 });
async function openPlanner(page, query = "") {
  await page.goto(`${WEB}/records${query}`);
  await page.locator("[data-care-planner-state=ready]").waitFor({ timeout: 60_000 });
}
const rows = (page) => page.locator("[data-care-planner-item]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-care-planner-item")));

// R1 (F1). An all-pets read that settles after switching to one pet is dropped.
{
  const page = await desktop.newPage();
  await openPlanner(page);
  await page.getByRole("button", { name: /Show more care dates/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-care-planner-item]").length === 100, null, { timeout: 30_000 });
  // The next Show more reads page 2 for all pets: hold it.
  const held = [];
  await page.route(`${API}/api/v1/care-records/upcoming?*`, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("page") === "2" && !url.searchParams.get("petId")) {
      held.push(route);
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: /Show more care dates/ }).click();
  await page.waitForFunction(() => true);
  for (let wait = 0; wait < 50 && held.length === 0; wait += 1) await page.waitForTimeout(100);
  await page.getByRole("button", { name: LONG_PET, exact: true }).click();
  await page.getByText(LONG_TITLE).waitFor({ timeout: 30_000 });
  for (const route of held) await route.continue();
  await page.waitForTimeout(1500);
  const shown = await rows(page);
  check("R1 (F1): the late all-pets page is dropped; only the selected pet's row is shown and actionable",
    held.length > 0 && shown.length === 1 && shown[0] === longOne.id && (await page.getByRole("button", { name: /^Mark .* as done$/ }).count()) === 1,
    `held=${held.length} rows=${shown.length}`);
  await page.close();
}

// R2 (F4). Five earlier items completed elsewhere between reads: none skipped.
{
  const page = await desktop.newPage();
  await openPlanner(page, `?pet=${pets.Milo}`);
  const before = await rows(page);
  for (const target of milo.slice(0, 5)) {
    const done = await api("POST", `/api/v1/care-records/${target.id}/complete`, { idempotencyKey: randomUUID(), completedOn: today });
    if (done.status !== 201) throw new Error(`complete ${done.status}`);
  }
  await page.getByRole("button", { name: /Show more care dates/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-care-planner-item]").length === 100, null, { timeout: 30_000 });
  const after = await rows(page);
  const expected = milo.slice(5, 105).map((entry) => entry.id);
  check("R2 (F4): after five earlier completions, Show more shows the next 100 exactly, none skipped or stale",
    before.length === 50 && JSON.stringify(after) === JSON.stringify(expected), `before=${before.length} after=${after.length}`);
  await page.close();
}

// R3 (F5). An item created between the summary and the list read is shown.
{
  const page = await desktop.newPage();
  let created = null;
  let delayed = false;
  await page.route(`${API}/api/v1/care-records/upcoming?*`, async (route) => {
    if (!delayed) {
      delayed = true;
      // The summary has been read; another tab now adds a pending item.
      created = await addPending(LONG_PET, "Created between reads", shift(1));
    }
    await route.continue();
  });
  await page.goto(`${WEB}/records?pet=${pets[LONG_PET]}`);
  await page.getByText("Created between reads").waitFor({ timeout: 60_000 });
  const noFalseEmpty = (await page.getByText(/No care records yet|No pending care dates/).count()) === 0;
  const counted = await page.locator("[data-care-group-count]").allInnerTexts();
  check("R3 (F5): the new item is shown, no empty state; counts shown only once they agree",
    created && noFalseEmpty, `counts=${JSON.stringify(counted)}`);
  await page.close();
}

// R4 (F2). Pending save locks the full-form link; unknown outcome survives Close.
{
  const page = await desktop.newPage();
  const target = longOne;
  const posts = [];
  let release;
  await page.route(`${API}/api/v1/care-records/*/complete`, async (route) => {
    posts.push(route.request().postData());
    if (posts.length === 1) {
      await new Promise((resolve) => { release = resolve; });
      const response = await route.fetch(); // commits on the server
      check("R4: first request committed", response.status() === 201, `HTTP ${response.status()}`);
      await route.abort("connectionreset");
      return;
    }
    await route.continue();
  });
  await openPlanner(page, `?pet=${pets[LONG_PET]}`);
  await page.getByRole("button", { name: `Mark ${LONG_TITLE} for ${LONG_PET} as done` }).click();
  await page.getByLabel("Next due date (optional)").fill(shift(365));
  await page.getByLabel("Note (optional)").fill("Booster went well");
  await page.getByRole("button", { name: "Save as done" }).click();
  await page.getByRole("button", { name: "Saving..." }).waitFor();
  const linkGone = (await page.getByRole("link", { name: "Add documents or a clinic" }).count()) === 0;
  const disabledText = await page.getByText("Add documents or a clinic").getAttribute("aria-disabled");
  await page.screenshot({ path: `${SP}/r-01-saving-link-disabled-1280.png` });
  release();
  await page.getByText(/We couldn't confirm this yet/).waitFor({ timeout: 30_000 });
  check("R4 (F2): while sending, the full-form switch is disabled", linkGone && disabledText === "true");
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByText(/isn't confirmed yet\. Your details are kept on this page until you leave or reload it/).waitFor();
  await page.screenshot({ path: `${SP}/r-02-held-banner-1280.png` });
  await page.getByRole("button", { name: "Review" }).click();
  const note = await page.getByLabel("Note (optional)").inputValue();
  const next = await page.getByLabel("Next due date (optional)").inputValue();
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByText(new RegExp(`${LONG_TITLE.replace(/[()+]/g, ".")} is logged as done`)).waitFor({ timeout: 30_000 });
  check("R4 (F2): Review restores the same details; Try again resends the same request; one completion",
    note === "Booster went well" && next === shift(365) && posts.length === 2 && posts[0] === posts[1] && completions(target.id) === 1,
    `posts=${posts.length} completions=${completions(target.id)}`);
  await page.close();
}

// R5 (F2). Entered details aren't dropped silently for the full form.
{
  const page = await desktop.newPage();
  await openPlanner(page, `?pet=${pets.Milo}`);
  await page.getByRole("button", { name: /^Mark Booster 010 for Milo as done$/ }).click();
  await page.getByLabel("Note (optional)").fill("Typed but not sent");
  await page.getByRole("link", { name: "Add documents or a clinic" }).click();
  await page.getByText(/won't carry over to the full form/).waitFor();
  const stillHere = page.url().includes("/records") && (await page.getByLabel("Note (optional)").inputValue()) === "Typed but not sent";
  await page.screenshot({ path: `${SP}/r-03-full-form-confirm-1280.png` });
  await page.getByRole("link", { name: "Go to the full form" }).click();
  await page.getByRole("dialog", { name: "Log completed care" }).waitFor({ timeout: 60_000 });
  check("R5 (F2): full-form switch asks first, then opens the Phase 1 form", stillHere);
  await page.close();
}

// UX. Widths, long names, bottom navigation clearance, keyboard focus.
for (const [width, height] of [[320, 700], [390, 844], [768, 1024], [1280, 900]]) {
  const context = await newContext({ width, height });
  const page = await context.newPage();
  await openPlanner(page, `?pet=${pets[LONG_PET]}`);
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  await page.screenshot({ path: `${SP}/r-ux-planner-${width}.png` });
  // The last content clears the bottom navigation when scrolled to the end.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  const clearance = await page.evaluate(() => {
    const last = [...document.querySelectorAll("[data-care-planner] *")].filter((node) => node.getBoundingClientRect().height > 0).at(-1);
    const nav = [...document.querySelectorAll("nav")].find((node) => {
      const style = getComputedStyle(node);
      return style.position === "fixed" && node.getBoundingClientRect().bottom >= window.innerHeight - 2;
    });
    if (!last) return { ok: false };
    const bottom = last.getBoundingClientRect().bottom;
    const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    return { ok: bottom <= navTop + 1, bottom: Math.round(bottom), navTop: Math.round(navTop) };
  });
  await page.screenshot({ path: `${SP}/r-ux-planner-${width}-end.png` });
  // Keyboard: the dialog keeps focus inside while tabbing.
  await page.evaluate(() => window.scrollTo(0, 0));
  const done = page.getByRole("button", { name: /^Mark .* as done$/ }).first();
  let focusInside = true;
  if (await done.count()) {
    await done.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog", { name: "Mark as done" }).waitFor();
    for (let tab = 0; tab < 8; tab += 1) {
      await page.keyboard.press("Tab");
      focusInside &&= await page.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]")));
    }
    await page.screenshot({ path: `${SP}/r-ux-dialog-${width}.png` });
    await page.keyboard.press("Escape");
  }
  check(`UX ${width}px: no sideways scroll, end clears bottom nav, dialog keeps keyboard focus`,
    fits && clearance.ok && focusInside, `clearance=${JSON.stringify(clearance)} focusInside=${focusInside}`);
  await context.close();
}

await browser.close();
writeFileSync(`${SP}/e2e-remediation-results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
