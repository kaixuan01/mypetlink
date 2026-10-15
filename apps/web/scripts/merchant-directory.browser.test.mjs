// Real Next.js/browser navigation; only HTTP fixture data is intercepted.
// Run against an isolated dev server with MYPETLINK_BROWSER_BASE_URL, or an
// isolated export with MYPETLINK_BROWSER_EXPORT_DIR. No real merchant data.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, access, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";
import ts from "typescript";
import sharp from "sharp";

let browser, server, baseUrl = process.env.MYPETLINK_BROWSER_BASE_URL;
const source = await readFile(new URL("../src/components/admin/merchantSales/merchantSalesFixtures.ts", import.meta.url), "utf8");
const { merchant } = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText).toString("base64")}`);
const first = merchant(), second = merchant({ id: "merchant-2", merchantCode: "MPL-MER-00002", legalBusinessName: "Second Pet Store" });
const listing = { merchantIsActive: true, showOnWebsite: false, businessDescription: null, isPublished: false, publicCode: null, concurrencyToken: "AQ==", branches: [] };

before(async () => {
  if (!baseUrl) {
    const exportRoot = process.env.MYPETLINK_BROWSER_EXPORT_DIR;
    assert.ok(exportRoot, "Supply an isolated browser test server/export, never a live environment.");
    server = createServer(async (req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const relative = pathname === "/" ? "index.html" : pathname.slice(1) + (path.extname(pathname) ? "" : ".html");
      const target = path.resolve(exportRoot, relative);
      if (!target.startsWith(path.resolve(exportRoot) + path.sep)) { res.writeHead(404).end(); return; }
      try {
        const body = await readFile(target);
        const mime = { ".js": "application/javascript", ".css": "text/css", ".txt": "text/x-component", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2" };
        res.setHeader("Content-Type", mime[path.extname(target)] ?? "text/html"); res.end(body);
      }
      catch { res.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }
  const origin = new URL(baseUrl);
  assert.ok(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname), "Browser regressions must use a loopback fixture server.");
  let executablePath = process.env.MYPETLINK_BROWSER_EXECUTABLE;
  if (!executablePath) for (const candidate of ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"]) {
    if (await access(candidate).then(() => true, () => false)) { executablePath = candidate; break; }
  }
  assert.ok(executablePath, "Install/use a browser for this check; do not silently skip it.");
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function pageWithFixtures() {
  const page = await browser.newPage(); page.setDefaultTimeout(10000);
  await page.addInitScript(() => localStorage.setItem("mypetlink_api_auth_session", JSON.stringify({ accessToken: "browser-test", refreshToken: "browser-test", user: { id: "admin", email: "admin@example.test", displayName: "Admin", roles: [], status: "Active" }, expiresAt: Date.now() + 3600000 })));
  await page.route("**/api/v1/**", route => {
    const url = new URL(route.request().url());
    let data = [], meta = { total: 0, page: 1, pageSize: 20 };
    if (url.pathname.endsWith("/admin/auth/check")) data = { user: { id: "admin", email: "admin@example.test", displayName: "Admin" }, admin: { id: "admin", isActive: true }, access: { isSuperAdmin: false, roles: [], capabilities: ["sales.view", "sales.manage"] } };
    else if (url.pathname.endsWith("/listing")) data = listing;
    else if (url.pathname.endsWith("/merchants")) { data = [first, second]; meta.total = 2; }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data, meta }) });
  });
  return page;
}
async function openFirst(page) {
  await page.goto(`${baseUrl}/admin/merchant-sales?tab=merchants`);
  const refreshedRows = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/merchants"));
  await page.getByRole("row").filter({ hasText: "MPL-MER-00001" }).getByRole("button", { name: "View", exact: true }).click();
  await (await refreshedRows).finished();
  await page.getByLabel("Business description").waitFor();
}

async function screenshot(locator, name) {
  const directory = process.env.MYPETLINK_BROWSER_SCREENSHOT_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  // Keep tall sections within the capture surface so the browser does not
  // leave the final card unpainted when taking an element screenshot.
  const page = locator.page(), viewport = page.viewportSize();
  const bounds = await locator.boundingBox();
  if (bounds && viewport && bounds.height + 120 > viewport.height)
    await page.setViewportSize({ width: viewport.width, height: Math.ceil(bounds.height) + 120 });
  try { await locator.screenshot({ path: path.join(directory, `${name}.png`) }); }
  finally { if (viewport) await page.setViewportSize(viewport); }
}

test("single-store and multi-location cards stay contained on phone, tablet and desktop", async () => {
  const page = await browser.newPage();
  const logo = await sharp({ create: { width: 240, height: 80, channels: 4, background: { r: 0, g: 140, b: 130, alpha: 1 } } }).png().toBuffer();
  let name = "Happy Pets & Friends";
  const location = { name, address: { addressLine1: "12 Jalan Meranti, Taman Pet Lovers, Lot " + "1234567890".repeat(8), postcode: "50000", city: "Kuala Lumpur", state: "Kuala Lumpur", country: "Malaysia" },
    googleMapsUrl: "https://www.google.com/maps/dir/?api=1&destination=3.1,101.6", wazeUrl: "https://www.waze.com/ul?ll=3.1,101.6&navigate=yes", contactPhone: "+60123456789", whatsApp: "+60123456789", businessHours: "Daily, 10am–7pm" };
  let locations = [location];
  try {
    await page.route("**/api/v1/**", route => route.fulfill({ json: { data: [{ publicCode: "logo-store", name,
      businessDescription: "Your neighbourhood pet shop for happy, healthy companions.", logoUrl: `${baseUrl}/logo-fixture.png`,
      branches: locations }], meta: { page: 1, pageSize: 20, total: 1 } } }));
    await page.route("**/logo-fixture.png", route => route.fulfill({ contentType: "image/png", body: logo }));
    for (const width of [375, 768, 1440]) for (const count of [1, 3]) {
      locations = count === 1 ? [location] : [location, { ...location, name: "Shah Alam" }, { ...location, name: "Petaling Jaya" }];
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${baseUrl}/where-to-buy`);
      const image = page.getByAltText(`${name} logo`);
      await image.waitFor(); await image.evaluate(img => img.decode());
      assert.equal(await image.count(), 1);
      const card = page.getByRole("article").filter({ has: image });
      const layout = await image.evaluate(img => ({ fit: getComputedStyle(img).objectFit,
        width: img.parentElement.getBoundingClientRect().width, height: img.parentElement.getBoundingClientRect().height,
        imageCount: img.closest("article").querySelectorAll("img").length,
        locationCards: img.closest("article").querySelectorAll("section").length,
        headerBottom: img.parentElement.parentElement.getBoundingClientRect().bottom,
        firstLocationTop: img.closest("article").querySelector("section")?.getBoundingClientRect().top,
        overflow: document.documentElement.scrollWidth > innerWidth }));
      assert.equal(layout.fit, "contain"); assert.equal(layout.width, width < 640 ? 56 : 72);
      assert.equal(layout.width, layout.height); assert.equal(layout.imageCount, 1);
      assert.equal(layout.locationCards, count === 1 ? 0 : 3);
      if (count > 1) assert.ok(layout.firstLocationTop >= layout.headerBottom);
      assert.equal(layout.overflow, false, JSON.stringify({ width, ...layout }));
      assert.equal(await card.getByRole("heading", { name, exact: true }).count(), count === 1 ? 1 : 2);
      assert.equal(await card.getByRole("heading", { name: "Our Locations (3)", exact: true }).count(), count === 1 ? 0 : 1);
      for (const provider of ["Google Maps", "Waze", "Call store", "WhatsApp"]) {
        const links = card.getByRole("link", { name: provider, exact: true });
        assert.equal(await links.count(), count);
        for (const link of await links.all()) assert.ok((await link.boundingBox()).height >= 44);
      }
      await screenshot(page.locator("#partner-stores"), `public-${count === 1 ? "single" : "multiple"}-${width}`);
    }
    // Retain the original unbroken-name stress coverage alongside realistic previews.
    name = "HappyPets".repeat(12);
    await page.setViewportSize({ width: 375, height: 1000 }); await page.reload();
    await page.getByAltText(`${name} logo`).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.ok(await page.getByRole("heading", { name, exact: true }).isVisible());
    await page.route("**/logo-fixture.png", route => route.abort());
    await page.reload();
    await page.getByRole("img", { name: `${name} logo placeholder` }).waitFor();
    assert.equal(await page.getByAltText(`${name} logo`).count(), 0);
    assert.ok(await page.getByRole("heading", { name: "Shah Alam", exact: true }).isVisible());
  } finally { await page.close(); }
});

test("Admin location labels, status badges and compact logo fit all screen sizes", async () => {
  const page = await pageWithFixtures();
  const logo = await sharp({ create: { width: 240, height: 80, channels: 4, background: { r: 0, g: 140, b: 130, alpha: 1 } } }).png().toBuffer();
  const branch = { id: "location-1", name: "Happy Pets Kuala Lumpur " + "LongLocationName".repeat(8), address: { addressLine1: "12 Jalan Meranti " + "LongAddress".repeat(12), postcode: "50000", city: "Kuala Lumpur", state: "Kuala Lumpur", country: "Malaysia" },
    isActive: true, showOnWebsite: true, isPublished: false, displayOrder: 0, concurrencyToken: "Ag==" };
  try {
    await page.route("**/listing", route => route.fulfill({ json: { data: { ...listing, logoMediaFileId: "logo-1", logoUrl: `${baseUrl}/logo-fixture.png`, branches: [branch, { ...branch, id: "location-2", name: "Shah Alam", isActive: false }] } } }));
    await page.route("**/logo-fixture.png", route => route.fulfill({ contentType: "image/png", body: logo }));
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await openFirst(page);
      const panel = page.getByRole("heading", { name: "Partner Directory & Store Locations" }).locator("..").locator("..");
      const image = page.getByAltText("Merchant logo preview"); await image.evaluate(img => img.decode());
      const layout = await image.evaluate(img => ({ fit: getComputedStyle(img).objectFit, width: img.parentElement.getBoundingClientRect().width,
        height: img.parentElement.getBoundingClientRect().height, overflow: document.documentElement.scrollWidth > innerWidth }));
      assert.equal(layout.fit, "contain"); assert.equal(layout.width, 80); assert.equal(layout.height, 80);
      assert.equal(layout.overflow, false, JSON.stringify({ width, ...layout }));
      assert.equal(await panel.getByText("Active", { exact: true }).count(), 1);
      assert.equal(await panel.getByText("Inactive", { exact: true }).count(), 1);
      assert.equal(await panel.getByText("Hidden", { exact: true }).count(), 3);
      await screenshot(panel, `admin-locations-${width}`);
      await panel.getByRole("button", { name: "Edit location", exact: true }).first().click();
      assert.ok(await page.getByLabel("Store name / Location name").isVisible());
      assert.ok(await page.getByLabel("Store address", { exact: true }).isVisible());
      assert.equal(await page.getByLabel("Show this location on website").isChecked(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await screenshot(panel, `admin-location-editor-${width}`);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    }
  } finally { await page.close(); }
});

test("merchant logo upload, replacement and removal preserve independent drafts", async () => {
  const page = await pageWithFixtures();
  const logo = await sharp({ create: { width: 120, height: 60, channels: 4, background: { r: 0, g: 140, b: 130, alpha: 1 } } }).png().toBuffer();
  const mediaId = "e6000000-0000-0000-0000-000000000001";
  let savedListing = { ...listing, logoMediaFileId: null, logoUrl: null };
  let saves = 0;
  try {
    await page.route("**/listing", route => route.fulfill({ json: { data: savedListing } }));
    await page.route("**/api/v1/media/**", route => {
      if (route.request().url().endsWith("/uploads")) return route.fulfill({ json: { data: { mediaId, isPublic: false,
        status: "Pending", uploadUrl: `${baseUrl}/logo-upload-fixture`, method: "PUT", requiredHeaders: { "Content-Type": "image/png" } } } });
      return route.fulfill({ json: { data: { mediaId, status: "Ready", isPublic: true, publicUrl: `${baseUrl}/logo-fixture.png` } } });
    });
    await page.route("**/logo-upload-fixture", route => route.fulfill({ status: 200, body: "" }));
    await page.route("**/logo-fixture.png", route => route.fulfill({ contentType: "image/png", body: logo }));
    await page.route("**/logo", route => {
      const body = route.request().postDataJSON();
      assert.equal(body.concurrencyToken, savedListing.concurrencyToken);
      savedListing = { ...savedListing, logoMediaFileId: body.mediaId,
        logoUrl: body.mediaId ? `${baseUrl}/logo-fixture.png` : null, concurrencyToken: Buffer.from(`logo-${++saves}`).toString("base64") };
      return route.fulfill({ json: { data: savedListing } });
    });
    await openFirst(page);
    await page.getByLabel("Business description").fill("Unsaved merchant description");
    await page.getByRole("button", { name: "Add location", exact: true }).click();
    await page.getByLabel("Store name / Location name").fill("Unsaved branch name");
    for (let i = 0; i < 2; i++) {
      await page.getByLabel("Merchant logo", { exact: true }).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: logo });
      await page.getByRole("button", { name: "Save logo", exact: true }).click();
      await page.getByText("Merchant logo saved.", { exact: true }).waitFor();
      assert.equal(await page.getByLabel("Business description").inputValue(), "Unsaved merchant description");
      assert.equal(await page.getByLabel("Store name / Location name").inputValue(), "Unsaved branch name");
    }
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("button", { name: "Save logo", exact: true }).click();
    await page.getByText("Merchant logo removed.", { exact: true }).waitFor();
    assert.equal(savedListing.logoMediaFileId, null); assert.equal(saves, 3);
    assert.equal(await page.getByLabel("Store name / Location name").inputValue(), "Unsaved branch name");
  } finally { await page.close(); }
});
test("native Back retains the merchant draft until explicit discard and Forward still works", async () => {
  const page = await pageWithFixtures();
  try {
    await openFirst(page);
    await page.getByLabel("Business description").fill("Keep my unsaved merchant description");
    await page.evaluate(() => history.back());
    const dialog = page.getByRole("dialog", { name: "Discard unsaved merchant changes?" });
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    assert.equal(await page.getByLabel("Business description").inputValue(), "Keep my unsaved merchant description");
    await page.evaluate(() => history.back()); await dialog.waitFor();
    await dialog.getByRole("button", { name: "Discard changes" }).click();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has("open"));
    await page.evaluate(() => history.forward());
    await page.getByLabel("Business description").waitFor();
    assert.equal(await page.getByLabel("Business description").inputValue(), "");
  } finally { await page.close(); }
});
test("merchant switch, router link and reload preserve dirty input unless discarded", async () => {
  const page = await pageWithFixtures();
  try {
    await openFirst(page); await page.getByLabel("Business description").fill("Private draft");
    await page.getByRole("row").filter({ hasText: "Second Pet Store" }).getByRole("button", { name: "View", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Discard unsaved merchant changes?" }); await dialog.waitFor();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    assert.equal(await page.getByLabel("Business description").inputValue(), "Private draft");
    await page.getByRole("link", { name: "Overview", exact: true }).first().click(); await dialog.waitFor();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    assert.equal(await page.getByLabel("Business description").inputValue(), "Private draft");
    const warning = page.waitForEvent("dialog", { timeout: 5000 }).then(async native => { assert.equal(native.type(), "beforeunload"); await native.dismiss(); });
    await Promise.all([warning, page.evaluate(() => location.reload())]);
    assert.equal(await page.getByLabel("Business description").inputValue(), "Private draft");
    await page.getByRole("link", { name: "Overview", exact: true }).first().click(); await dialog.waitFor();
    await dialog.getByRole("button", { name: "Discard changes" }).click();
    await page.waitForFunction(() => location.pathname === "/admin");
  } finally { await page.close(); }
});
test("native Forward protects the current merchant after an earlier Back", async () => {
  const page = await pageWithFixtures();
  try {
    await openFirst(page);
    await page.getByRole("row").filter({ hasText: "Second Pet Store" }).getByRole("button", { name: "View", exact: true }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("open") === "merchant-2");
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => new URL(location.href).searchParams.get("open") === "merchant-1");
    await page.getByLabel("Business description").fill("Protect my Forward draft");
    await page.evaluate(() => history.forward());
    const dialog = page.getByRole("dialog", { name: "Discard unsaved merchant changes?" }); await dialog.waitFor();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    assert.equal(await page.getByLabel("Business description").inputValue(), "Protect my Forward draft");
    await page.evaluate(() => history.forward()); await dialog.waitFor();
    await dialog.getByRole("button", { name: "Discard changes" }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("open") === "merchant-2");
  } finally { await page.close(); }
});
test("native Back also protects a new branch draft", async () => {
  const page = await pageWithFixtures();
  try {
    await openFirst(page); await page.getByRole("button", { name: "Add location" }).click();
    await page.getByLabel("Store name / Location name").fill("Unsaved physical branch");
    await page.evaluate(() => history.back());
    const dialog = page.getByRole("dialog", { name: "Discard unsaved merchant changes?" }); await dialog.waitFor();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    assert.equal(await page.getByLabel("Store name / Location name").inputValue(), "Unsaved physical branch");
  } finally { await page.close(); }
});
test("dirty tabs register the unload guard used for browser-controlled closing", async () => {
  const page = await pageWithFixtures();
  try {
    await openFirst(page); await page.getByLabel("Business description").fill("Protect closing this tab");
    // CDP can force-close a tab without a dialog. Native reload is exercised
    // above; actual tab-close prompts remain a manual browser QA check.
    assert.equal(await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event); return event.defaultPrevented;
    }), true);
    assert.equal(await page.getByLabel("Business description").inputValue(), "Protect closing this tab");
  } finally { await page.close(); }
});
