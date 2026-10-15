// Real Next.js/browser navigation; only HTTP fixture data is intercepted.
// Run against an isolated dev server with MYPETLINK_BROWSER_BASE_URL, or an
// isolated export with MYPETLINK_BROWSER_EXPORT_DIR. No real merchant data.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
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

test("merchant logos stay contained and appear once above branches on phone, tablet and desktop", async () => {
  const page = await browser.newPage();
  const logo = await sharp({ create: { width: 240, height: 80, channels: 4, background: { r: 0, g: 140, b: 130, alpha: 1 } } }).png().toBuffer();
  const name = "HappyPets".repeat(12);
  const branch = { name: "Main", address: { addressLine1: "1 Pet Street", postcode: "50000", city: "KL", state: "KL", country: "Malaysia" } };
  try {
    await page.route("**/api/v1/**", route => route.fulfill({ json: { data: [{ publicCode: "logo-store", name,
      businessDescription: "A welcoming pet store. ".repeat(12), logoUrl: `${baseUrl}/logo-fixture.png`,
      branches: [branch, { ...branch, name: "North" }] }], meta: { page: 1, pageSize: 20, total: 1 } } }));
    await page.route("**/logo-fixture.png", route => route.fulfill({ contentType: "image/png", body: logo }));
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseUrl}/where-to-buy`);
      const image = page.getByAltText(`${name} logo`);
      await image.waitFor(); await image.evaluate(img => img.decode());
      assert.equal(await image.count(), 1);
      const layout = await image.evaluate(img => ({ fit: getComputedStyle(img).objectFit,
        width: img.parentElement.getBoundingClientRect().width, height: img.parentElement.getBoundingClientRect().height,
        imageCount: img.closest("article").querySelectorAll("img").length,
        branchCount: img.closest("article").querySelectorAll("section").length,
        headerBottom: img.parentElement.parentElement.getBoundingClientRect().bottom,
        firstBranchTop: img.closest("article").querySelector("section").getBoundingClientRect().top,
        overflow: document.documentElement.scrollWidth > innerWidth,
        overflowElements: Array.from(document.querySelectorAll("main *")).filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(el => ({ tag: el.tagName, classes: el.className })) }));
      assert.equal(layout.fit, "contain"); assert.equal(layout.width, width < 640 ? 56 : 72);
      assert.equal(layout.width, layout.height); assert.equal(layout.imageCount, 1); assert.equal(layout.branchCount, 2);
      assert.ok(layout.firstBranchTop >= layout.headerBottom); assert.equal(layout.overflow, false, JSON.stringify({ width, ...layout }));
    }
    await page.route("**/logo-fixture.png", route => route.abort());
    await page.reload();
    await page.getByRole("img", { name: `${name} logo placeholder` }).waitFor();
    assert.equal(await page.getByAltText(`${name} logo`).count(), 0);
    assert.ok(await page.getByRole("heading", { name: "North", exact: true }).isVisible());
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
    await page.getByRole("button", { name: "Add branch", exact: true }).click();
    await page.getByLabel("Branch name").fill("Unsaved branch name");
    for (let i = 0; i < 2; i++) {
      await page.getByLabel("Merchant logo", { exact: true }).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: logo });
      await page.getByRole("button", { name: "Save logo", exact: true }).click();
      await page.getByText("Merchant logo saved.", { exact: true }).waitFor();
      assert.equal(await page.getByLabel("Business description").inputValue(), "Unsaved merchant description");
      assert.equal(await page.getByLabel("Branch name").inputValue(), "Unsaved branch name");
    }
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("button", { name: "Save logo", exact: true }).click();
    await page.getByText("Merchant logo removed.", { exact: true }).waitFor();
    assert.equal(savedListing.logoMediaFileId, null); assert.equal(saves, 3);
    assert.equal(await page.getByLabel("Branch name").inputValue(), "Unsaved branch name");
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
    await openFirst(page); await page.getByRole("button", { name: "Add branch" }).click();
    await page.getByLabel("Branch name").fill("Unsaved physical branch");
    await page.evaluate(() => history.back());
    const dialog = page.getByRole("dialog", { name: "Discard unsaved merchant changes?" }); await dialog.waitFor();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    assert.equal(await page.getByLabel("Branch name").inputValue(), "Unsaved physical branch");
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
