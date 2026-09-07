import { promises as fs } from "node:fs";
import { openSession, layoutProbe, touchTargets, writeJson, BASE, ROOT } from "./lib.mjs";

const session = JSON.parse(await fs.readFile(`${ROOT}/session.json`, "utf8"));
const PET = process.env.PET_ID;
const VIEW = process.env.VIEW || "desktop";
const NAME = process.env.REC_NAME || `08-desktop-owner-portal`;
const WITH_DELETES = process.env.WITH_DELETES === "1";

const notes = { journey: NAME, viewport: VIEW, steps: [], probes: [], touch: {} };
const log = (t) => { notes.steps.push(t); console.log("  •", t); };

const { page, shot, beat, finish } = await openSession({ name: NAME, viewport: VIEW, session });

const screens = [
  [`/dashboard`, "dashboard"],
  [`/pets`, "pets"],
  [`/pets/${PET}`, "pet-profile"],
  [`/pets/${PET}/edit`, "edit-pet"],
  [`/pets/${PET}/moments`, "moments"],
  [`/pets/${PET}/records`, "care-records"],
  [`/pets/${PET}/timeline`, "life-timeline"],
  [`/settings`, "settings"],
];

for (const [route, key] of screens) {
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  await beat(2900);
  await shot(key);
  notes.probes.push(await layoutProbe(page, key));
  notes.touch[key] = await touchTargets(page);
  notes[`text_${key}`] = (await page.locator("main").innerText()).slice(0, 1500);
  log(`${VIEW}: ${route}`);
}

// Edit tabs at this viewport
await page.goto(`${BASE}/pets/${PET}/edit`, { waitUntil: "networkidle" });
await beat(2400);
for (const label of ["Appearance", "Sharing & Privacy", "Contact & Safety"]) {
  const btn = page.locator("main button", { hasText: new RegExp(label, "i") }).first();
  if (await btn.count()) {
    await btn.click();
    await beat(2100);
    await shot(`edit-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`);
    notes.probes.push(await layoutProbe(page, `edit-${label}`));
    log(`${VIEW}: edit tab ${label}`);
  }
}

// Share sheet at this viewport
await page.goto(`${BASE}/pets/${PET}`, { waitUntil: "networkidle" });
await beat(2600);
const share = page.locator("main button, main a", { hasText: /^Share$/ }).first();
if (await share.count()) {
  await share.click();
  await beat(2400);
  await shot("share-sheet");
  notes.shareSheet = await page.evaluate(() => {
    const d = document.querySelector('[role=dialog]') || document.querySelector("main");
    return d.innerText.slice(0, 700);
  });
  notes.probes.push(await layoutProbe(page, "share-sheet"));
  log(`${VIEW}: share sheet`);
}

// --- destructive flows (mobile pass only) -----------------------------------
if (WITH_DELETES) {
  // Delete a care record
  await page.goto(`${BASE}/pets/${PET}/records`, { waitUntil: "networkidle" });
  await beat(2800);
  const delCare = page.getByRole("button", { name: /^delete$/i }).first();
  if (await delCare.count()) {
    await delCare.click();
    await beat(2000);
    await shot("care-delete-confirm");
    notes.careDeleteConfirm = await page.locator("body").innerText();
    notes.careDeleteHasConfirm = /are you sure|delete this|cannot be undone|confirm/i.test(notes.careDeleteConfirm);
    log(`Care delete confirmation shown: ${notes.careDeleteHasConfirm}`);
    const confirm = page.getByRole("button", { name: /^delete$|delete record|yes, delete/i }).last();
    if (await confirm.count()) { await confirm.click(); await page.waitForTimeout(2800); }
    await shot("care-after-delete");
    notes.careAfterDelete = await page.locator("main").innerText();
    log("Deleted a care record.");
  }

  // Delete a moment
  await page.goto(`${BASE}/pets/${PET}/moments`, { waitUntil: "networkidle" });
  await beat(2800);
  const delMoment = page.getByRole("button", { name: /^delete$/i }).first();
  if (await delMoment.count()) {
    await delMoment.click();
    await beat(2000);
    await shot("moment-delete-confirm");
    notes.momentDeleteConfirm = await page.locator("body").innerText();
    notes.momentDeleteHasConfirm = /are you sure|delete this|cannot be undone|confirm/i.test(notes.momentDeleteConfirm);
    log(`Moment delete confirmation shown: ${notes.momentDeleteHasConfirm}`);
    const confirm = page.getByRole("button", { name: /^delete$|delete moment|yes, delete/i }).last();
    if (await confirm.count()) { await confirm.click(); await page.waitForTimeout(2800); }
    await shot("moment-after-delete");
    notes.momentAfterDelete = await page.locator("main").innerText();
    log("Deleted a moment.");
  }
}

const { video, consoleErrors } = await finish();
notes.video = video;
notes.consoleErrors = [...new Set(consoleErrors)];
await writeJson(`${ROOT}/_notes/${NAME}.json`, notes);
console.log("VIDEO:", video);
