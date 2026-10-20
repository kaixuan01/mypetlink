import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import ts from "typescript";

const root = path.resolve("apps/web/out");
const screenshots = path.resolve("artifacts/smart-tag-activation-screenshots");
await mkdir(screenshots, { recursive: true });
const source = await readFile("apps/web/src/data/mockPets.ts", "utf8");
const module = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { mockPets } = await import(`data:text/javascript;base64,${Buffer.from(module).toString("base64")}`);
const tagCode = "MPL-9F3K-H7Q2";
const pet = mockPets[1];
const owner = { id: "owner-test", email: "owner@example.test", displayName: "Owner", roles: [], status: "Active" };
const toBackend = item => ({ ...item, publicSlug: `${item.slug}-${item.publicCode}`, profileTheme: "mint",
  qrSafetyEnabled: true, publicProfileEnabled: false, hasUsableSafetyContact: true,
  contact: { useOwnerDefaults: false, ownerDisplayName: "Owner", phoneE164: "+60123456789" },
  visibility: { ...item.visibility, showPhone: true }, profilePhotoUrl: null, coverPhotoUrl: null });
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.slice(1) + (path.extname(pathname) ? "" : ".html");
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(target);
    const mime = { ".js": "application/javascript", ".css": "text/css", ".txt": "text/x-component", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
    res.setHeader("Content-Type", mime[path.extname(target)] ?? "text/html"); res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const results = [];
try {
  for (const scenario of [
    { width: 320, assigned: false, lostMode: false },
    { width: 375, assigned: true, lostMode: true },
    { width: 390, assigned: false, lostMode: true },
    { width: 430, assigned: true, lostMode: false },
  ]) {
    const context = await browser.newContext({ viewport: { width: scenario.width, height: 900 } });
    const requests = [], errors = [];
    context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
    await context.addInitScript(owner => { if (location.protocol === "http:") localStorage.setItem("mypetlink_api_auth_session", JSON.stringify({
      accessToken: "test", refreshToken: "test", user: owner, expiresAt: Date.now() + 3600000,
    })); }, owner);
    let active = false;
    await context.route("**/api/v1/**", async route => {
      const req = route.request(), url = new URL(req.url());
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: {
        "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*",
      } });
      requests.push({ path: url.pathname, method: req.method(), body: req.postDataJSON() });
      let data = [];
      const tag = { id: "tag-test", tagCode, hasNfc: true, variant: "Standard", status: active ? "Active" : scenario.assigned ? "Delivered" : "Unclaimed",
        petId: active || scenario.assigned ? pet.id : null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z" };
      if (url.pathname === `/api/v1/public/safety/${tagCode}`) return route.fulfill({ status: 404, json: { error: { code: "not_found", message: "Not found" } } });
      if (url.pathname === `/api/v1/public/tags/${tagCode}/qr`) data = { state: scenario.assigned ? "Pending" : "Unclaimed", tagCode, status: tag.status };
      else if (url.pathname === "/api/v1/pets") data = mockPets.map(toBackend);
      else if (url.pathname === "/api/v1/tags") data = scenario.assigned ? [tag] : [];
      else if (url.pathname.endsWith("/activate")) { active = true; data = { ...tag, status: "Active", petId: pet.id }; }
      else if (url.pathname.toLowerCase() === `/api/v1/public/safety/${pet.safetyCode}`.toLowerCase()) data = {
        safetyCode: pet.safetyCode, name: pet.name, species: pet.species, lifecycleStatus: "Active",
        profileTheme: "mint", state: scenario.lostMode ? "LostMode" : "Active", lostModeEnabled: scenario.lostMode,
        showFoundLocationAction: false, contact: { ownerDisplayName: "Owner", phoneE164: "+60123456789" }, publicProfileSlug: null,
      };
      else if (url.pathname === `/api/v1/pets/${pet.id}`) data = toBackend(pet);
      else if (url.pathname.includes("/auth/me")) data = { user: owner };
      else if (url.pathname === "/api/v1/owner/profile") data = { displayName: "Owner", email: owner.email,
        defaultContact: { displayName: "Owner", phoneE164: "+60123456789" } };
      return route.fulfill({ headers: { "Access-Control-Allow-Origin": "*" }, json: { data, meta: { total: Array.isArray(data) ? data.length : undefined } } });
    });
    const page = await context.newPage();
    await page.goto(`${base}/q/${tagCode}`);
    if (!scenario.assigned) await page.getByRole("button", { name: new RegExp(pet.name) }).click();
    await page.getByRole("button", { name: "Activate Tag", exact: true }).click();
    await page.getByRole("heading", { name: "Smart Tag Activated!", exact: true }).waitFor();
    const card = page.getByRole("article");
    assert.equal(await card.getByRole("link").count(), 2);
    assert.equal(await card.getByRole("button").count(), 0);
    assert.ok(await card.getByText(`${pet.name}'s Smart Tag is now active! Anyone who scans it can view ${pet.name}'s Safety Profile and contact you if needed.`, { exact: true }).isVisible());
    assert.ok(await card.getByText("Your Smart Tag is ready to use.", { exact: true }).isVisible());
    assert.equal(await card.getByText(/Preview Share Profile|View Tag Scan Page|Go to Dashboard|Test Smart Tag/).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    for (const link of await card.getByRole("link").all()) {
      const rect = await link.boundingBox(); assert.ok(rect.height >= 48 && rect.x >= 0 && rect.x + rect.width <= scenario.width);
    }
    await page.screenshot({ path: path.join(screenshots, `success-${scenario.width}.png`), fullPage: true });
    const scansAtSuccess = requests.filter(r => r.path.includes("/public/tags/")).length;
    const popupPromise = page.waitForEvent("popup");
    await card.getByRole("link", { name: "View Safety Profile", exact: true }).click();
    const safety = await popupPromise;
    await safety.getByRole("heading", { name: scenario.lostMode ? `${pet.name} is currently missing` : `Found ${pet.name}?`, exact: true }).waitFor({ timeout: 10000 }).catch(async error => {
      console.log(JSON.stringify({ url: safety.url(), body: await safety.locator("body").innerText(), requests, errors }, null, 2));
      throw error;
    });
    assert.equal(new URL(safety.url()).pathname, `/q/${pet.safetyCode}`);
    assert.ok(await safety.getByRole("link", { name: /Call/ }).count());
    await safety.close();
    await card.getByRole("link", { name: "Back to My Pet", exact: true }).click();
    await page.waitForURL(`**/pets/${pet.id}`);
    await page.getByRole("heading", { name: pet.name, exact: true }).waitFor();
    assert.equal(requests.filter(r => r.path.includes("/public/tags/")).length, scansAtSuccess);
    const writes = requests.filter(r => r.method !== "GET" && !r.path.endsWith("/auth/owner-portal-entry"));
    assert.equal(writes.length, 1, JSON.stringify(writes));
    assert.ok(writes[0].path.endsWith(`/${tagCode}/activate`));
    assert.deepEqual(writes[0].body, scenario.assigned ? {} : { petId: pet.id });
    assert.deepEqual(errors, []);
    results.push({ ...scenario, result: "PASS", physicalScansOnEntry: scansAtSuccess, extraScansAfterNavigation: 0, writes: 1 });
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
