import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import ts from "typescript";

const before = process.argv.includes("--before");
const root = path.resolve("apps/web/out");
const directory = path.resolve("artifacts/smart-tags-management-screenshots");
await mkdir(directory, { recursive: true });
const source = await readFile("apps/web/src/data/mockPets.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { mockPets } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const owner = { id: "owner-test", email: "owner@example.test", displayName: "Owner", roles: [], status: "Active" };
const pets = mockPets.map(item => ({ ...item, profileTheme: "mint", publicSlug: `${item.slug}-${item.publicCode}`,
  publicProfileEnabled: false, qrSafetyEnabled: true, hasUsableSafetyContact: true, profilePhotoUrl: null, coverPhotoUrl: null,
  contact: { useOwnerDefaults: false, ownerDisplayName: "Owner", phoneE164: "+60123456789" } }));
function tag(id, petId, status = "Active", extra = {}) {
  return { id, tagCode: `MPL-5ATV-${id.toUpperCase()}`, petId, hasNfc: true, variant: "Lightweight", status,
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z", activatedAt: "2026-10-01T00:00:00Z",
    lastScannedAt: "2026-10-16T06:38:00Z", lastScanSource: "Qr", qrScansLast30Days: 1, nfcTapsLast30Days: 0, ...extra };
}
const fixtures = [tag("SFBZ", pets[0].id), tag("HF7K", pets[0].id, "Active", { hasNfc: false, variant: "Standard" }),
  tag("KL9W", pets[1].id), tag("PEND", pets[0].id, "Delivered", { activatedAt: null, lastScannedAt: null, qrScansLast30Days: 0 }),
  tag("DSBL", pets[0].id, "Disabled"), tag("LOST", pets[1].id, "Lost"), tag("REPL", pets[0].id, "Replaced"),
  tag("ARCH", pets[0].id, "Disabled", { archivedAt: "2026-10-15T00:00:00Z" })];
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.slice(1) + (path.extname(pathname) ? "" : ".html");
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) return res.writeHead(404).end();
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
  for (const width of before ? [390, 1440] : [320, 375, 390, 430, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    const requests = [], errors = [];
    const tags = structuredClone(fixtures);
    const fullHistory = !before && width === 768;
    context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
    await context.addInitScript(owner => { if (location.protocol === "http:") localStorage.setItem("mypetlink_api_auth_session", JSON.stringify({
      accessToken: "test", refreshToken: "test", user: owner, expiresAt: Date.now() + 3600000,
    })); }, owner);
    await context.route("**/api/v1/**", async route => {
      const req = route.request(), url = new URL(req.url());
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: {
        "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*",
      } });
      requests.push({ path: url.pathname, method: req.method() });
      let data = [];
      if (url.pathname === "/api/v1/pets") data = pets;
      else if (url.pathname === "/api/v1/tags") data = tags;
      else if (url.pathname === "/api/v1/auth/me") data = { user: owner };
      else if (url.pathname === "/api/v1/owner/profile") data = { displayName: "Owner", email: owner.email,
        defaultContact: { displayName: "Owner" }, plan: { code: fullHistory ? "Premium" : "Free", name: fullHistory ? "Premium Plan" : "Free Plan", scanHistoryDays: fullHistory ? 365 : 0, maxPets: 3, maxMemoriesPerPet: 10 } };
      else if (url.pathname.endsWith("/scans")) data = { items: [{ id: "scan-1", scanSource: "Qr", resolvedState: "Active", scannedAt: "2026-10-16T06:38:00Z" }], total: 1, qrScans: 1, nfcTaps: 0, legacyOrUnknown: 0, page: 1, pageSize: 20, hasMore: false };
      else if (url.pathname.endsWith("/mark-lost")) {
        const target = tags.find(tag => url.pathname.endsWith(`/${tag.id}/mark-lost`));
        assert.ok(target); target.status = "Lost"; data = target;
      }
      else if (url.pathname.toLowerCase().includes("/public/safety/")) {
        const pet = pets.find(pet => url.pathname.toLowerCase().endsWith(pet.safetyCode.toLowerCase()));
        if (!pet) return route.fulfill({ status: 404, json: { error: { code: "not_found", message: "Not found" } } });
        data = { safetyCode: pet.safetyCode, name: pet.name, species: pet.species, lifecycleStatus: "Active", state: "LostMode",
          lostModeEnabled: true, profileTheme: "mint", contact: { ownerDisplayName: "Owner", phoneE164: "+60123456789" }, showFoundLocationAction: false };
      }
      return route.fulfill({ headers: { "Access-Control-Allow-Origin": "*" }, json: { data, meta: { total: Array.isArray(data) ? data.length : undefined } } });
    });
    const page = await context.newPage();
    async function capture(name) {
      const original = page.viewportSize();
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width, height: Math.max(original.height, height) });
      await page.evaluate(() => {
        for (const element of document.querySelectorAll("*")) {
          if (element.scrollLeft) element.scrollLeft = 0;
        }
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      await page.screenshot({ path: path.join(directory, name), animations: "disabled" });
      await page.setViewportSize(original);
    }
    await page.goto(`${base}/tags`);
    await page.getByText(fixtures[0].tagCode, { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.getByRole("article").count(), 3);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const heights = await page.getByRole("article").evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().height)));
    if (before) await page.screenshot({ path: path.join(directory, `before-${width}.png`) });
    else await capture(`after-${width}.png`);
    if (!before) {
      const content = item => page.getByRole("article").filter({ has: page.getByText(item.tagCode, { exact: true }) });
      const first = content(tags[0]), second = content(tags[1]);
      const manage = card => card.getByRole("button", { name: "Manage Tag & Details", exact: true });
      async function selectFilter(name) {
        const tab = page.getByRole("tab", { name, exact: true });
        if (await tab.count()) return tab.click();
        await page.getByRole("tablist", { name: "Filter smart tags" }).getByRole("button", { name: /More|more filters/ }).click();
        await page.getByRole("menuitem", { name, exact: true }).click();
      }
      async function noOverflow() {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
      }
      assert.ok(heights.every(height => height <= 380));
      for (const toggle of await page.getByRole("button", { name: "Manage Tag & Details", exact: true }).all()) {
        assert.equal(await toggle.getAttribute("aria-expanded"), "false");
        const id = await toggle.getAttribute("aria-controls");
        assert.equal(await page.locator(`[id="${id}"]`).isVisible(), false);
      }
      assert.equal(await page.getByRole("button", { name: "Disable Tag", exact: true }).count(), 0);
      assert.equal(await page.getByText(/Premium is coming soon/).count(), 0);
      await manage(first).focus(); await page.keyboard.press("Enter");
      assert.equal(await manage(first).getAttribute("aria-expanded"), "true");
      assert.equal(await manage(second).getAttribute("aria-expanded"), "false");
      await manage(second).click(); await manage(first).click();
      assert.equal(await manage(second).getAttribute("aria-expanded"), "true");
      await manage(second).click(); await manage(first).click();
      await noOverflow();
      await capture(`expanded-${width}.png`);
      const targets = [...await first.getByRole("button").all(), ...await first.getByRole("link").all()];
      const rectangles = [];
      for (const target of targets) {
        const rect = await target.boundingBox();
        assert.ok(rect && rect.height >= 44 && rect.x >= 0 && rect.x + rect.width <= width + 1);
        rectangles.push(rect);
      }
      for (let a = 0; a < rectangles.length; a++) for (let b = a + 1; b < rectangles.length; b++) {
        const first = rectangles[a], second = rectangles[b];
        assert.ok(first.x + first.width <= second.x + 1 || second.x + second.width <= first.x + 1
          || first.y + first.height <= second.y + 1 || second.y + second.height <= first.y + 1, "Overlapping card actions");
      }
      assert.equal(await first.getByRole("link", { name: "View Tag Scan Page", exact: true }).getAttribute("href"), `/q/${tags[0].tagCode}`);
      assert.equal(await first.getByRole("link", { name: "Open NFC Link", exact: true }).getAttribute("href"), `/n/${tags[0].tagCode}`);
      await first.getByRole("button", { name: "Copy QR Link", exact: true }).click();
      assert.ok((await page.evaluate(() => navigator.clipboard.readText())).endsWith(`/q/${tags[0].tagCode}`));
      await first.getByRole("button", { name: "Copy NFC Link", exact: true }).click();
      assert.ok((await page.evaluate(() => navigator.clipboard.readText())).endsWith(`/n/${tags[0].tagCode}`));
      await first.getByRole("button", { name: "View QR Code", exact: true }).click();
      const qr = page.getByRole("dialog", { name: "Physical Tag QR", exact: true });
      await qr.waitFor();
      assert.ok((await qr.getByLabel("Physical Tag QR link", { exact: true }).innerText()).endsWith(`/q/${tags[0].tagCode}`));
      await noOverflow();
      await page.keyboard.press("Escape");
      await qr.waitFor({ state: "hidden" });
      assert.ok(await first.getByRole("button", { name: "View QR Code", exact: true }).evaluate(node => node === document.activeElement));
      if (fullHistory) {
        await first.getByRole("button", { name: "View Scan History", exact: true }).click();
        const history = page.getByRole("dialog", { name: "Scan history", exact: true });
        await history.getByText("Showing 1 of 1 scans", { exact: true }).waitFor();
        await page.keyboard.press("Escape");
      } else {
        assert.equal(await first.getByRole("button", { name: /View Scan History/ }).count(), 0);
        assert.ok(await first.getByText(/Premium is coming soon/).isVisible());
        assert.equal(requests.filter(request => request.path.endsWith("/scans")).length, 0);
      }
      await first.getByRole("button", { name: "Disable Tag", exact: true }).click();
      const disable = page.getByRole("dialog", { name: "Disable this tag?", exact: true });
      await disable.waitFor(); await page.keyboard.press("Escape"); await disable.waitFor({ state: "hidden" });
      await page.getByRole("combobox", { name: "Filter Smart Tags by pet" }).selectOption(pets[1].id);
      assert.equal(await page.getByRole("article").count(), 1);
      await page.getByRole("combobox", { name: "Filter Smart Tags by pet" }).selectOption("");
      assert.equal(await page.getByRole("article").count(), 3);
      assert.equal(await manage(first).getAttribute("aria-expanded"), "true");
      await selectFilter("Pending");
      assert.equal(await page.getByRole("article").count(), 1);
      assert.equal(await page.getByRole("link", { name: "View Safety Profile", exact: true }).count(), 0);
      await selectFilter("Inactive");
      assert.equal(await page.getByRole("article").count(), 3);
      await noOverflow();
      await selectFilter("Archived");
      assert.equal(await page.getByRole("article").count(), 1);
      await manage(content(tags[7])).click();
      assert.ok(await page.getByRole("button", { name: "Restore to List", exact: true }).isVisible());
      assert.equal(await page.getByRole("button", { name: "Disable Tag", exact: true }).count(), 0);
      await selectFilter("All"); assert.equal(await page.getByRole("article").count(), 8);
      await selectFilter("Active");
      const preview = first.getByRole("link", { name: "View Safety Profile", exact: true });
      assert.equal(await preview.getAttribute("href"), `/q/${pets[0].safetyCode}`);
      const popupPromise = page.waitForEvent("popup"); await preview.click();
      const safety = await popupPromise;
      await safety.getByRole("heading", { name: `${pets[0].name} is currently missing`, exact: true }).waitFor();
      await safety.close();
      assert.equal(requests.filter(request => request.path.includes("/public/tags/")).length, 0);
      assert.equal(requests.filter(request => request.method !== "GET" && !request.path.endsWith("/auth/owner-portal-entry")).length, 0);
      if (width === 390) {
        await first.getByRole("button", { name: "Report Tag Lost", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Report this tag as lost?", exact: true });
        assert.ok(await dialog.getByText(/does not turn on Lost Mode/).isVisible());
        await dialog.getByRole("button", { name: "Report Tag Lost", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        assert.ok(await first.getByText("Lost", { exact: true }).isVisible());
        assert.equal(await first.getByRole("link", { name: "View Safety Profile", exact: true }).count(), 0);
        assert.equal(requests.filter(request => request.path.endsWith("/mark-lost")).length, 1);
        assert.equal(pets[0].lostModeEnabled, false);
        await noOverflow();
      }
      if (width === 320) {
        const originalName = pets[0].name;
        pets[0].name = "LongestPetName".repeat(6);
        tags[0].tagCode = "MPL-LONG-LEGACY-TAG-CODE-1234567890";
        await page.reload();
        await page.getByText(tags[0].tagCode, { exact: true }).waitFor();
        await noOverflow();
        await manage(content(tags[0])).click();
        await noOverflow();
        pets[0].name = originalName;
      }
      assert.deepEqual(errors, []);
    }
    results.push({ width, cardHeights: heights, errors, ...(before ? {} : { result: "PASS", previewScans: 0, fullHistory }) });
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
  await writeFile(`artifacts/smart-tags-management-${before ? "before" : "after"}.json`, JSON.stringify(results, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
