// API-connected Care Planner checks: real web app (next dev, API mode) + real
// API + disposable SQL Server database. Failures are injected at the
// browser's network layer only; the server is never mocked.
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
const keyed = (targetId) =>
  Number(sql(`select count(*) from CareRecords where FulfillsCareRecordId='${targetId}' and CompletionIdempotencyKey is not null`));

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

// ---- data: two pets, 130 pending dates (overdue, due soon, later) -------------
const pets = {};
// Earlier runs' pets in this disposable database: archive them (plan limit).
for (const old of (await api("GET", "/api/v1/pets")).json?.data ?? []) {
  if (old.lifecycleStatus !== "Archived") await api("POST", `/api/v1/pets/${old.id}/archive`, {});
}
for (const name of ["Oyen", "Mochi"]) {
  const created = await api("POST", "/api/v1/pets", { name, species: "Cat" });
  if (created.status >= 300) throw new Error(`pet ${created.status} ${JSON.stringify(created.json)}`);
  pets[name] = created.json.data.id;
}
const targets = [];
for (let index = 0; index < 130; index += 1) {
  const pet = index % 2 === 0 ? "Oyen" : "Mochi";
  const due = index < 10 ? shift(-(index + 1)) : index < 40 ? shift(index - 9) : shift(40 + index);
  const created = await api("POST", `/api/v1/pets/${pets[pet]}/care-records`, {
    type: "Vaccine",
    title: `Booster ${String(index).padStart(3, "0")}`,
    date: shift(-400),
    dueDate: due,
    notes: "Earlier visit",
    publicVisibility: "Private",
  });
  if (created.status >= 300) throw new Error(`record ${created.status} ${JSON.stringify(created.json)}`);
  targets.push({ id: created.json.data.id, title: `Booster ${String(index).padStart(3, "0")}`, pet, due });
}
check("seeded 130 pending care dates across two pets", targets.length === 130);

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
const doneButton = (page, target) =>
  page.getByRole("button", { name: `Mark ${target.title} for ${target.pet} as done` });
function interceptComplete(page, handler) {
  const posts = [];
  page.route(`${API}/api/v1/care-records/*/complete`, async (route) => {
    posts.push(route.request());
    await handler(route, posts.length);
  });
  return posts;
}

// S1. The planner reads all 130 items page by page, grouped, with exact counts.
{
  const page = await desktop.newPage();
  await openPlanner(page);
  const overdueCount = await page.locator("[data-care-group=overdue] [data-care-group-count]").innerText();
  const firstRows = await page.locator("[data-care-planner-item]").count();
  await page.getByRole("button", { name: "Show more care dates (80 more)" }).click();
  await page.getByRole("button", { name: "Show more care dates (30 more)" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-care-planner-item]").length === 130, null, { timeout: 30_000 });
  const allRows = await page.locator("[data-care-planner-item]").count();
  check("S1: first page shows 50, Show more reads all 130 without repeats", firstRows === 50 && allRows === 130, `first=${firstRows} all=${allRows}`);
  check("S1: exact overdue count from the server", overdueCount === "10", `overdue=${overdueCount}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SP}/p2-01-planner-1280.png` });
  await page.close();
}

// S2. Done once: the item leaves the list, counts refresh, one keyed completion.
{
  const target = targets[0];
  const page = await desktop.newPage();
  const posts = interceptComplete(page, (route) => route.continue());
  await openPlanner(page);
  await doneButton(page, target).click();
  await page.getByRole("dialog", { name: "Mark as done" }).waitFor();
  const doneOn = await page.getByLabel("Done on").inputValue();
  await page.getByLabel("Next due date (optional)").fill(shift(365));
  await page.screenshot({ path: `${SP}/p2-02-done-dialog-1280.png` });
  await page.getByRole("button", { name: "Save as done" }).click();
  await page.getByText(`${target.title} is logged as done for Oyen. Next due`).waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector("[data-care-group=overdue] [data-care-group-count]")?.textContent === "9", null, { timeout: 30_000 });
  check("S2: Done defaults to Malaysia's today", doneOn === today, `doneOn=${doneOn}`);
  check("S2: one request, one keyed completion; overdue count refreshed to 9", posts.length === 1 && completions(target.id) === 1 && keyed(target.id) === 1,
    `posts=${posts.length} completions=${completions(target.id)}`);
  const nextPending = await api("GET", `/api/v1/care-records/upcoming?page=1&pageSize=100&petId=${pets.Oyen}`);
  check("S2: the next due date became a new pending item", nextPending.json.data.items.some((item) => item.dueDate === shift(365)));
  await page.screenshot({ path: `${SP}/p2-03-done-success-1280.png` });
  await page.close();
}

// S3. A double click sends one request.
{
  const target = targets[1];
  const page = await desktop.newPage();
  const posts = interceptComplete(page, (route) => route.continue());
  await openPlanner(page);
  await doneButton(page, target).click();
  const save = page.getByRole("button", { name: "Save as done" });
  await save.dblclick();
  await page.getByText(`${target.title} is logged as done for Mochi.`).waitFor({ timeout: 30_000 });
  check("S3: double click → one request, one completion", posts.length === 1 && completions(target.id) === 1, `posts=${posts.length}`);
  await page.close();
}

// S4. The response is lost after the commit; Try again resends the same request.
{
  const target = targets[2];
  const page = await desktop.newPage();
  const posts = interceptComplete(page, async (route, n) => {
    if (n === 1) {
      const response = await route.fetch(); // commits on the server
      check("S4: first request committed", response.status() === 201, `HTTP ${response.status()}`);
      await route.abort("connectionreset"); // the browser never sees it
      return;
    }
    await route.continue();
  });
  await openPlanner(page);
  await doneButton(page, target).click();
  await page.getByRole("button", { name: "Save as done" }).click();
  await page.getByText(/We couldn't confirm this yet/).waitFor({ timeout: 30_000 });
  const lockedNext = await page.getByLabel("Next due date (optional)").isDisabled();
  await page.screenshot({ path: `${SP}/p2-04-unknown-1280.png` });
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByText(`${target.title} is logged as done for Oyen.`).waitFor({ timeout: 30_000 });
  const sameBody = posts.length === 2 && posts[0].postData() === posts[1].postData();
  check("S4: details locked; the retry resends the same key and details", lockedNext && sameBody, `locked=${lockedNext} posts=${posts.length}`);
  check("S4: still exactly one completion", completions(target.id) === 1, `completions=${completions(target.id)}`);
  await page.close();
}

// S5. Another tab completes the item while this dialog is open.
{
  const target = targets[3];
  const page = await desktop.newPage();
  await openPlanner(page);
  await doneButton(page, target).click();
  await page.getByRole("dialog", { name: "Mark as done" }).waitFor();
  const other = await api("POST", `/api/v1/care-records/${target.id}/complete`, { idempotencyKey: randomUUID(), completedOn: today });
  await page.getByRole("button", { name: "Save as done" }).click();
  await page.getByText("This care item was already logged as done.").waitFor({ timeout: 30_000 });
  const noSave = (await page.getByRole("button", { name: /Save as done|Try again/ }).count()) === 0;
  check("S5: other tab won (201); this tab is told, with no second save", other.status === 201 && noSave && completions(target.id) === 1,
    `other=${other.status} completions=${completions(target.id)}`);
  await page.screenshot({ path: `${SP}/p2-05-already-done-1280.png` });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.close();
}

// S6. The item is deleted while the dialog is open.
{
  const target = targets[5];
  const page = await desktop.newPage();
  await openPlanner(page);
  await doneButton(page, target).click();
  await page.getByRole("dialog", { name: "Mark as done" }).waitFor();
  const deleted = await api("DELETE", `/api/v1/care-records/${target.id}`);
  await page.getByRole("button", { name: "Save as done" }).click();
  await page.getByText("This care item was deleted, so it can't be logged as done.").waitFor({ timeout: 30_000 });
  check("S6: deleted item refused; nothing written", deleted.status < 300 && keyed(target.id) === 0, `delete=${deleted.status}`);
  await page.close();
}

// S7. Pet filter narrows the list and lives in the address.
{
  const page = await desktop.newPage();
  await openPlanner(page);
  await page.getByRole("button", { name: "Mochi", exact: true }).click();
  await page.waitForURL(/pet=/, { timeout: 10_000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Booster 000"), null, { timeout: 30_000 });
  const names = await page.locator("[data-care-planner-item]").allInnerTexts();
  check("S7: Mochi filter shows only Mochi's items", names.length > 0 && names.every((text) => !text.includes("Oyen")), `rows=${names.length}`);
  await page.close();
}

// S8. Dashboard "View all" leads to the planner; the full form still works.
{
  const page = await desktop.newPage();
  await page.goto(`${WEB}/dashboard`);
  const viewAll = page.locator("[data-dashboard-panel=dashboard-care]").getByRole("link", { name: "View all" });
  await viewAll.waitFor({ timeout: 60_000 });
  const href = await viewAll.getAttribute("href");
  check("S8: Dashboard View all opens the care planner", href === "/records", `href=${href}`);
  await openPlanner(page);
  const target = targets[7];
  await doneButton(page, target).click();
  await page.getByRole("link", { name: "Add documents or a clinic" }).click();
  await page.getByRole("dialog", { name: "Log completed care" }).waitFor({ timeout: 60_000 });
  check("S8: the full Log as done form still opens for documents and clinic", true);
  await page.close();
}

// S9. Phone width: planner and dialog fit, no sideways scroll.
{
  const phone = await newContext({ width: 390, height: 844 });
  const page = await phone.newPage();
  await openPlanner(page);
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  await page.screenshot({ path: `${SP}/p2-06-planner-390.png` });
  await doneButton(page, targets[9]).click();
  await page.getByRole("dialog", { name: "Mark as done" }).waitFor();
  await page.screenshot({ path: `${SP}/p2-07-done-dialog-390.png` });
  check("S9: 390px planner has no sideways scroll", fits);
  await phone.close();
}

await browser.close();
writeFileSync(`${SP}/e2e-planner-results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
