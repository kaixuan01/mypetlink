import { promises as fs } from "node:fs";
import { openSession, layoutProbe, touchTargets, writeJson, BASE, ROOT } from "./lib.mjs";

const session = JSON.parse(await fs.readFile(`${ROOT}/session.json`, "utf8"));
const PET = process.env.PET_ID;
const notes = { journey: "02-edit-pet", viewport: "mobile 390x844", petId: PET, steps: [], probes: [], tabs: {} };
const log = (t) => { notes.steps.push(t); console.log("  •", t); };

const { page, shot, beat, finish } = await openSession({ name: "02-edit-pet", viewport: "mobile", session });

// --- settled pet page (Journey 1 only caught the loading state) -------------
await page.goto(`${BASE}/pets/${PET}`, { waitUntil: "networkidle" });
await beat(3000);
await shot("pet-page-settled");
notes.petPageText = await page.locator("main").innerText();
notes.probes.push(await layoutProbe(page, "pet-page"));
log("Pet page settled state.");

// --- open the editor --------------------------------------------------------
await page.goto(`${BASE}/pets/${PET}/edit`, { waitUntil: "networkidle" });
await beat(2600);
await shot("edit-basic-info");
notes.probes.push(await layoutProbe(page, "edit-basic-info"));
notes.tabStrip = await page.evaluate(() =>
  [...document.querySelectorAll("main button")].map((b) => b.textContent.trim())
    .filter((t) => /Basic Info|Appearance|Sharing|Contact|More/i.test(t)).slice(0, 8));
notes.tabs.basic = await page.locator("main").innerText();
notes.editTouchTargets = await touchTargets(page);
log("Edit form open on Basic Info.");

// --- populated values check -------------------------------------------------
notes.populated = await page.evaluate(() => {
  const out = {};
  document.querySelectorAll("main input, main textarea").forEach((el) => {
    const lbl = el.closest("label")?.innerText || el.getAttribute("aria-label") || el.placeholder || el.name || "?";
    out[lbl.split("\n")[0].slice(0, 40)] = el.value;
  });
  return out;
});

// --- unsaved-changes behaviour: edit then try to leave ----------------------
const bio = page.locator("main textarea").first();
if (await bio.count()) {
  await bio.click();
  await bio.type("Mochi is a shy indoor cat who loves the window.", { delay: 26 });
  await beat(1200);
  await shot("bio-typed-dirty");
  log("Typed a bio to make the form dirty.");
}

// Try leaving via the in-app Cancel
const cancel = page.getByRole("link", { name: /^cancel$/i }).first();
notes.hasCancel = await cancel.count() > 0;
if (notes.hasCancel) {
  await cancel.click();
  await beat(1800);
  await shot("after-cancel-click");
  notes.afterCancelUrl = page.url();
  notes.afterCancelText = await page.locator("main").innerText();
  notes.unsavedPromptShown = /discard|unsaved|keep editing/i.test(notes.afterCancelText);
  log(`Clicked Cancel while dirty. Unsaved-changes prompt shown: ${notes.unsavedPromptShown}`);
}

// --- back into the editor and walk every tab --------------------------------
await page.goto(`${BASE}/pets/${PET}/edit`, { waitUntil: "networkidle" });
await beat(2400);

const tabNames = [
  ["Appearance", "appearance"],
  ["Sharing & Privacy", "sharing"],
  ["Contact & Safety", "safety"],
];
for (const [label, key] of tabNames) {
  const btn = page.locator("main button", { hasText: new RegExp(label.replace("&", "&"), "i") }).first();
  if (await btn.count()) {
    await btn.click();
    await beat(2000);
    await shot(`tab-${key}`);
    notes.tabs[key] = await page.locator("main").innerText();
    notes.probes.push(await layoutProbe(page, `edit-${key}`));
    log(`Opened tab: ${label}`);
  } else {
    log(`Tab NOT FOUND via text match: ${label}`);
  }
}

// --- fill real data on Basic Info and save ----------------------------------
const basic = page.locator("main button", { hasText: /Basic Info/i }).first();
if (await basic.count()) { await basic.click(); await beat(1600); }

const bio2 = page.locator("main textarea").first();
if (await bio2.count()) {
  await bio2.click();
  await bio2.fill("Mochi is a shy indoor cat who loves the window.");
  await beat(900);
}
await shot("before-save");
const save = page.getByRole("button", { name: /save changes|save/i }).first();
await save.click();
await beat(700);
await shot("saving-state");
await page.waitForTimeout(2800);
await shot("after-save");
notes.afterSaveUrl = page.url();
notes.afterSaveText = await page.locator("main").innerText();
log("Saved changes.");

// --- persistence: reopen ----------------------------------------------------
await page.goto(`${BASE}/pets/${PET}/edit`, { waitUntil: "networkidle" });
await beat(2600);
await shot("reopened-persistence");
notes.reopened = await page.evaluate(() => {
  const t = document.querySelector("main textarea");
  return { bio: t ? t.value : null };
});
log(`Reopened editor. Bio persisted: ${JSON.stringify(notes.reopened)}`);

const { video, consoleErrors } = await finish();
notes.video = video;
notes.consoleErrors = consoleErrors;
await writeJson(`${ROOT}/_notes/02-edit-pet.json`, notes);
console.log("VIDEO:", video);
