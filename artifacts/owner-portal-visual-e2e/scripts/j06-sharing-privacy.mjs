import { promises as fs } from "node:fs";
import { openSession, layoutProbe, writeJson, BASE, ROOT } from "./lib.mjs";

const session = JSON.parse(await fs.readFile(`${ROOT}/session.json`, "utf8"));
const PET = process.env.PET_ID;
const notes = { journey: "06-sharing-privacy-public-profile", viewport: "mobile 390x844", steps: [], probes: [], ownerSelections: {} };
const log = (t) => { notes.steps.push(t); console.log("  •", t); };

const { page, shot, beat, finish } = await openSession({ name: "06-sharing-privacy-public-profile", viewport: "mobile", session });

// --- 1. Owner settings: add contact details ---------------------------------
await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
await beat(3000);
await shot("settings-before");
notes.settingsBefore = await page.locator("main").innerText();
notes.probes.push(await layoutProbe(page, "settings"));

const phone = page.locator('main input[type="tel"], main input[inputmode="tel"]').first();
if (await phone.count()) {
  await phone.click();
  await phone.type("0123456789", { delay: 90 });
  await beat(1000);
  await shot("settings-phone-typed");
  log("Entered a Malaysian phone number in Owner Settings.");
}
const saveSettings = page.getByRole("button", { name: /save settings|save/i }).first();
if (await saveSettings.count()) {
  await saveSettings.click();
  await beat(700);
  await shot("settings-saving");
  await page.waitForTimeout(2800);
  await shot("settings-saved");
  notes.settingsAfter = await page.locator("main").innerText();
  log("Saved owner contact details.");
}

// --- 2. Pet sharing & privacy selections ------------------------------------
await page.goto(`${BASE}/pets/${PET}/edit`, { waitUntil: "networkidle" });
await beat(2600);
const sharingTab = page.locator("main button", { hasText: /Sharing & Privacy/i }).first();
if (await sharingTab.count()) { await sharingTab.click(); await beat(2200); }
await shot("sharing-tab");
notes.ownerSelections.sharing = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('main [role=switch], main input[type=checkbox]').forEach((el) => {
    const wrap = el.closest("label") || el.parentElement?.parentElement;
    out.push({ label: (wrap?.innerText || "").split("\n")[0].slice(0, 52), checked: el.getAttribute("aria-checked") ?? el.checked });
  });
  return out;
});
log(`Sharing selections: ${JSON.stringify(notes.ownerSelections.sharing)}`);

const safetyTab = page.locator("main button", { hasText: /Contact & Safety/i }).first();
if (await safetyTab.count()) { await safetyTab.click(); await beat(2200); }
await shot("safety-tab");
notes.ownerSelections.safety = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('main [role=switch], main input[type=checkbox]').forEach((el) => {
    const wrap = el.closest("label") || el.parentElement?.parentElement;
    out.push({ label: (wrap?.innerText || "").split("\n")[0].slice(0, 52), checked: el.getAttribute("aria-checked") ?? el.checked });
  });
  return out;
});
notes.safetyTabText = await page.locator("main").innerText();
log(`Safety selections: ${JSON.stringify(notes.ownerSelections.safety)}`);

// --- 3. Owner's own view of the public profile ------------------------------
await page.goto(`${BASE}/p/${process.env.PUBLIC_SLUG}`, { waitUntil: "networkidle" });
await beat(3400);
await shot("owner-view-public-profile");
notes.ownerViewOfPublic = await page.locator("main").innerText();
notes.probes.push(await layoutProbe(page, "public-profile-owner-view"));
log("Viewed the public profile while signed in as the owner.");

// --- 4. Owner's own view of the safety profile ------------------------------
await page.goto(`${BASE}/q/${process.env.SAFETY_CODE}`, { waitUntil: "networkidle" });
await beat(3400);
await shot("owner-view-safety-profile");
notes.ownerViewOfSafety = await page.locator("main").innerText();
notes.probes.push(await layoutProbe(page, "safety-profile-owner-view"));
log("Viewed the Safety Profile while signed in as the owner.");

const { video, consoleErrors } = await finish();
notes.video = video;
notes.consoleErrors = [...new Set(consoleErrors)];
await writeJson(`${ROOT}/_notes/06-sharing.json`, notes);
console.log("VIDEO:", video);
