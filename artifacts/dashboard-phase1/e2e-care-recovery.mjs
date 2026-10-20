// API-connected Log as done recovery checks: real web app (next dev, API
// mode) + real API + disposable SQL Server database. Failures are injected at
// the browser's network layer only; the server is never mocked.
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

/** Every active record on the pet written as a completion of this item, linked or not. */
function completingLogs(petId, targetId, title) {
  return Number(
    sql(`select count(*) from CareRecords where PetId='${petId}' and Id<>'${targetId}' and Title=N'${title}' and ArchivedAt is null and DeletedAt is null`)
  );
}
function linkedLogs(targetId) {
  return Number(sql(`select count(*) from CareRecords where FulfillsCareRecordId='${targetId}' and ArchivedAt is null and DeletedAt is null`));
}

const malaysiaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
const daysAgo = (n) => {
  const d = new Date(`${malaysiaToday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

let petId;
async function setUp() {
  // Earlier runs' pets in this disposable database: archive them (plan limit).
  const existing = await api("GET", "/api/v1/pets");
  for (const old of existing.json?.data ?? []) {
    if (old.lifecycleStatus !== "Archived") await api("POST", `/api/v1/pets/${old.id}/archive`, {});
  }
  const pet = await api("POST", "/api/v1/pets", { name: "Oyen", species: "Cat" });
  if (pet.status >= 300) throw new Error(`pet create ${pet.status} ${JSON.stringify(pet.json)}`);
  petId = pet.json.data.id;
}

async function newTarget(title) {
  const created = await api("POST", `/api/v1/pets/${petId}/care-records`, {
    type: "Vaccine",
    title,
    date: daysAgo(370),
    dueDate: daysAgo(5),
    notes: "Earlier visit",
    publicVisibility: "Private",
  });
  if (created.status >= 300) throw new Error(`target create ${created.status} ${JSON.stringify(created.json)}`);
  return created.json.data.id;
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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

async function openLogAsDone(page, targetId) {
  await page.goto(`${WEB}/pets/${petId}/records?complete=${targetId}`);
  await page.getByRole("dialog", { name: "Log completed care" }).waitFor({ timeout: 60_000 });
  await page.getByLabel("Notes").fill("Booster went well");
}
const saveButton = (page) => page.getByRole("button", { name: "Save care record" });
const text = (page, pattern) => page.getByText(pattern).first();

/** Intercepts this page's care-record create requests. */
function interceptCreates(page, handler) {
  const posts = [];
  page.route(`${API}/api/v1/pets/*/care-records`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts.push(route.request());
    await handler(route, posts.length);
  });
  return posts;
}

async function replay(request) {
  // The original request, as the browser sent it, reaching the server late.
  const headers = await request.allHeaders();
  const response = await fetch(request.url(), {
    method: "POST",
    headers: { authorization: headers.authorization, "content-type": headers["content-type"] },
    body: request.postData(),
  });
  return response.status;
}

await setUp();

// A. Response lost after the server committed the save.
{
  const title = "Rabies booster A";
  const targetId = await newTarget(title);
  const page = await context.newPage();
  const posts = interceptCreates(page, async (route) => {
    const response = await route.fetch(); // reaches the server and commits
    check("A: server committed the create", response.status() === 201 || response.status() === 200, `HTTP ${response.status()}`);
    await route.abort("connectionreset"); // the browser never sees it
  });
  await openLogAsDone(page, targetId);
  await saveButton(page).click();
  await text(page, "Care is already logged with these details.").waitFor({ timeout: 30_000 });
  check("A: confirmed from the stored record, truthful wording", true);
  check("A: one completing record, one create request", completingLogs(petId, targetId, title) === 1 && posts.length === 1,
    `logs=${completingLogs(petId, targetId, title)} posts=${posts.length}`);
  await page.screenshot({ path: `${SP}/e2e-A-confirmed.png` });
  await page.close();
}

// B. Save still in flight with no response, held far beyond five seconds.
{
  const title = "Rabies booster B";
  const targetId = await newTarget(title);
  const page = await context.newPage();
  let held;
  const posts = interceptCreates(page, async (route) => {
    held = route.request();
    await route.abort("failed"); // the browser loses it; the server has not seen it yet
  });
  await openLogAsDone(page, targetId);
  await saveButton(page).click();
  await text(page, /We can't confirm this save yet/).waitFor({ timeout: 30_000 });
  const start = Date.now();
  let lockedThroughout = true;
  for (let i = 0; i < 4; i += 1) {
    await page.waitForTimeout(4_000);
    await page.getByRole("button", { name: "Check again" }).click();
    await text(page, /We can't confirm this save yet/).waitFor({ timeout: 30_000 });
    lockedThroughout &&= await saveButton(page).isDisabled();
    lockedThroughout &&= (await page.getByRole("button", { name: "Save as a separate record" }).count()) === 0;
  }
  check("B: Save stays locked with no unlinked option after real elapsed time", lockedThroughout, `${Math.round((Date.now() - start) / 1000)}s, 4 checks`);
  await page.screenshot({ path: `${SP}/e2e-B-unknown-locked.png` });

  // Closing keeps the save, with its draft, to review.
  await page.getByRole("button", { name: "Cancel" }).click();
  await text(page, /isn't confirmed yet\. Your details are kept on this page until you leave or reload it/).waitFor({ timeout: 10_000 });
  check("B: closing the editor keeps the unconfirmed save", true);
  await page.screenshot({ path: `${SP}/e2e-B-held.png` });

  // The original finally reaches the server.
  const late = await replay(held);
  check("B: the late original is accepted", late === 201 || late === 200, `HTTP ${late}`);
  await page.getByRole("button", { name: "Review my save" }).click();
  await text(page, "Care is already logged with these details.").waitFor({ timeout: 30_000 });
  check("B: confirmed once the original landed; one record, one browser request",
    completingLogs(petId, targetId, title) === 1 && posts.length === 1,
    `logs=${completingLogs(petId, targetId, title)} posts=${posts.length}`);
  await page.close();
}

// C. The due item is deleted while the outcome is unknown.
{
  const title = "Rabies booster C";
  const targetId = await newTarget(title);
  const page = await context.newPage();
  let held;
  const posts = interceptCreates(page, async (route) => {
    held = route.request();
    await route.abort("failed");
  });
  await openLogAsDone(page, targetId);
  await saveButton(page).click();
  await text(page, /We can't confirm this save yet/).waitFor({ timeout: 30_000 });
  const archived = await api("DELETE", `/api/v1/care-records/${targetId}`);
  check("C: another tab deleted the due item", archived.status < 300, `HTTP ${archived.status}`);
  await page.getByRole("button", { name: "Check again" }).click();
  await text(page, /This care item was deleted while you were saving/).waitFor({ timeout: 30_000 });
  const locked = await saveButton(page).isDisabled();
  const noSeparate = (await page.getByRole("button", { name: "Save as a separate record" }).count()) === 0;
  check("C: changed item reported, Save locked, no unlinked save offered", locked && noSeparate);
  await page.screenshot({ path: `${SP}/e2e-C-target-deleted.png` });
  const late = await replay(held);
  check("C: the late original is refused by the server", late === 400, `HTTP ${late}`);
  check("C: no completing record and only one browser request",
    completingLogs(petId, targetId, title) === 0 && posts.length === 1,
    `logs=${completingLogs(petId, targetId, title)} posts=${posts.length}`);
  await page.close();
}

// D. Another tab logged it first with the same details: the real server refuses.
{
  const title = "Rabies booster D";
  const targetId = await newTarget(title);
  const other = await api("POST", `/api/v1/pets/${petId}/care-records`, {
    type: "Vaccine", title, date: malaysiaToday, notes: "Booster went well", provider: "",
    publicVisibility: "Private", fulfillsCareRecordId: targetId,
  });
  check("D: other tab logged it", other.status < 300, `HTTP ${other.status}`);
  const page = await context.newPage();
  const posts = interceptCreates(page, (route) => route.continue());
  // Opening reads the item as already completed, so the page says so instead.
  await page.goto(`${WEB}/pets/${petId}/records?complete=${targetId}`);
  await text(page, /already logged as done on/).waitFor({ timeout: 60_000 });
  check("D: reopening a completed item writes nothing", posts.length === 0 && linkedLogs(targetId) === 1);
  await page.close();
}

// E. Another tab logs it with different details while this form is open.
{
  const title = "Rabies booster E";
  const targetId = await newTarget(title);
  const page = await context.newPage();
  const posts = interceptCreates(page, (route) => route.continue());
  await openLogAsDone(page, targetId);
  const other = await api("POST", `/api/v1/pets/${petId}/care-records`, {
    type: "Vaccine", title, date: malaysiaToday, notes: "Partner logged it", provider: "",
    publicVisibility: "Private", fulfillsCareRecordId: targetId,
  });
  check("E: other tab logged it first", other.status < 300, `HTTP ${other.status}`);
  await saveButton(page).click();
  await text(page, /with different details, so this save wasn't recorded/).waitFor({ timeout: 30_000 });
  const noShortcut = (await page.getByRole("button", { name: "Save as a separate record" }).count()) === 0;
  check("E: refusal explained, draft kept, Save locked, no unlinked shortcut",
    (await saveButton(page).isDisabled()) && noShortcut);
  await page.screenshot({ path: `${SP}/e2e-E-refused.png` });
  check("E: one browser request; only the other tab's record exists",
    posts.length === 1 && linkedLogs(targetId) === 1 && completingLogs(petId, targetId, title) === 1,
    `posts=${posts.length} linked=${linkedLogs(targetId)} total=${completingLogs(petId, targetId, title)}`);
  await page.close();
}

// F. G1: the initial request is still waiting; the owner tries to leave and
//    edit another record; the late success settles only its own editor.
{
  const title = "Rabies booster F";
  const targetId = await newTarget(title);
  const historyB = await api("POST", `/api/v1/pets/${petId}/care-records`, {
    type: "Grooming", title: "Grooming visit F", date: daysAgo(20), notes: "Nail trim", publicVisibility: "Private",
  });
  check("F: history record B exists", historyB.status < 300, `HTTP ${historyB.status}`);
  const page = await context.newPage();
  let held;
  const posts = interceptCreates(page, async (route) => {
    held = route; // the request waits here, unanswered
  });
  await openLogAsDone(page, targetId);
  await saveButton(page).click();
  await page.getByRole("button", { name: "Saving..." }).waitFor({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  const cancelDisabled = await page.getByRole("button", { name: "Cancel" }).isDisabled();
  const closeHidden = (await page.getByRole("button", { name: "Close care record editor" }).count()) === 0;
  // The Edit button sits behind the modal; dispatch the click directly.
  await page.locator("article", { hasText: "Grooming visit F" }).getByRole("button", { name: "Edit", includeHidden: true }).dispatchEvent("click");
  await page.waitForTimeout(500);
  const stillA = (await page.getByRole("dialog", { name: "Log completed care" }).count()) === 1
    && (await page.getByLabel("Notes").inputValue()) === "Booster went well"
    && (await page.getByRole("dialog", { name: "Update care record" }).count()) === 0;
  check("F: while A waits, Escape/Cancel/Close/Edit B can't leave or replace A's editor",
    cancelDisabled && closeHidden && stillA, `cancelDisabled=${cancelDisabled} closeHidden=${closeHidden} stillA=${stillA}`);
  await page.screenshot({ path: `${SP}/e2e-F-saving-locked.png` });
  await held.continue(); // the server finally receives and commits A
  await text(page, `${title} for Oyen is logged as done.`).waitFor({ timeout: 30_000 });
  await page.locator("article", { hasText: "Grooming visit F" }).getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog", { name: "Update care record" }).waitFor({ timeout: 10_000 });
  await page.getByLabel("Notes").fill("NEW UNSAVED DRAFT");
  await page.waitForTimeout(500);
  check("F: A settled once; B's new draft is untouched",
    posts.length === 1 && completingLogs(petId, targetId, title) === 1
      && (await page.getByLabel("Notes").inputValue()) === "NEW UNSAVED DRAFT",
    `posts=${posts.length} logs=${completingLogs(petId, targetId, title)}`);
  await page.close();
}

// G. G2: page 1's request is lost with its page; page 2's linked request is
//    refused after the item was deleted. No unlinked shortcut appears.
{
  const title = "Rabies booster G";
  const targetId = await newTarget(title);
  const page1 = await context.newPage();
  let heldA;
  interceptCreates(page1, async (route) => {
    // Captured now: page 1 is closed before A is replayed.
    const request = route.request();
    const headers = await request.allHeaders();
    heldA = {
      url: () => request.url(),
      postData: () => request.postData(),
      allHeaders: async () => headers,
    };
    await route.abort("failed");
  });
  await openLogAsDone(page1, targetId);
  await saveButton(page1).click();
  await text(page1, /We can't confirm this save yet/).waitFor({ timeout: 30_000 });
  await page1.close(); // reload/navigation: A's in-page state is gone

  const page2 = await context.newPage();
  const postsB = interceptCreates(page2, (route) => route.continue());
  await openLogAsDone(page2, targetId);
  const archived = await api("DELETE", `/api/v1/care-records/${targetId}`);
  await saveButton(page2).click();
  await text(page2, /This care item was deleted, so this save wasn't recorded/).waitFor({ timeout: 30_000 });
  const earlierNote = (await page2.getByText(/An earlier save for this item may still appear in your care records/).count()) > 0;
  const noShortcut = (await page2.getByRole("button", { name: "Save as a separate record" }).count()) === 0;
  check("G: B refused by the server; no unlinked shortcut; Save locked; earlier save mentioned",
    archived.status < 300 && noShortcut && earlierNote && (await saveButton(page2).isDisabled()) && postsB.length === 1,
    `archive=${archived.status} posts=${postsB.length}`);
  await page2.screenshot({ path: `${SP}/e2e-G-refused-no-shortcut.png` });
  const late = await replay(heldA);
  check("G: A arriving late is refused too; no record and no unlinked copy",
    late === 400 && completingLogs(petId, targetId, title) === 0, `HTTP ${late} logs=${completingLogs(petId, targetId, title)}`);
  await page2.close();
}

// H. G4 boundary: once a save has completed the item, the service refuses
//    to remove the item's due date, so "undated with a late completion" can
//    only come from the server-side race (validated, then the date removed,
//    then written) that the SQL interleaving tests reproduce. Here: the late
//    original lands, removing the date is refused, and the editor confirms.
{
  const title = "Rabies booster H";
  const targetId = await newTarget(title);
  const page = await context.newPage();
  let held;
  interceptCreates(page, async (route) => {
    held = route.request();
    await route.abort("failed");
  });
  await openLogAsDone(page, targetId);
  await saveButton(page).click();
  await text(page, /We can't confirm this save yet/).waitFor({ timeout: 30_000 });
  const landed = await replay(held);
  const cleared = await api("PUT", `/api/v1/care-records/${targetId}`, { clearDueDate: true });
  const status = await api("GET", `/api/v1/care-records/${targetId}/completion`);
  check("H: removing a completed item's due date is refused; it stays completed",
    landed === 201 && cleared.status === 400 && status.json?.data?.state === "completed",
    `landed=${landed} clear=${cleared.status} state=${status.json?.data?.state}`);
  await page.getByRole("button", { name: "Check again" }).click();
  await text(page, "Care is already logged with these details.").waitFor({ timeout: 30_000 });
  check("H: confirmed once, one record", completingLogs(petId, targetId, title) === 1);
  await page.close();
}

await browser.close();
writeFileSync(`${SP}/e2e-results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
