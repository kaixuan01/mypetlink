import { promises as fs } from "node:fs";
import { chromium } from "playwright-core";

const session = JSON.parse(await fs.readFile("artifacts/owner-portal-visual-e2e/session.json", "utf8"));
const PET = process.env.PET_ID;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript((s) => localStorage.setItem("mypetlink_api_auth_session", s), JSON.stringify(session));
const page = await ctx.newPage();

const failed = [];
page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

const dialogs = [];
page.on("dialog", async (d) => { dialogs.push({ type: d.type(), message: d.message() }); await d.dismiss(); });

await page.goto(`http://localhost:3000/pets/${PET}/edit`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

// make dirty
const ta = page.locator("main textarea").first();
await ta.click();
await ta.fill("UNSAVED DIRTY TEXT THAT SHOULD NOT VANISH SILENTLY");
await page.waitForTimeout(800);

const beforeUrl = page.url();
await page.getByRole("link", { name: /^cancel$/i }).first().click();
await page.waitForTimeout(2500);

console.log("beforeUrl :", beforeUrl);
console.log("afterUrl  :", page.url());
console.log("navigatedAway:", beforeUrl !== page.url());
console.log("native dialogs captured:", JSON.stringify(dialogs));
const bodyText = await page.locator("body").innerText();
console.log("in-page discard prompt present:", /discard|unsaved|keep editing/i.test(bodyText));

// go back and check the typed value is gone
await page.goto(`http://localhost:3000/pets/${PET}/edit`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const val = await page.locator("main textarea").first().inputValue();
console.log("bio after cancel+reopen:", JSON.stringify(val));
console.log("dirty text lost:", !val.includes("UNSAVED DIRTY TEXT"));

console.log("\nFAILED REQUESTS:");
[...new Set(failed)].forEach((f) => console.log("  " + f));

await browser.close();
