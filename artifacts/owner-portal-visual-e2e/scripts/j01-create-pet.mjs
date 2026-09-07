import { promises as fs } from "node:fs";
import { openSession, layoutProbe, touchTargets, writeJson, BASE, ROOT } from "./lib.mjs";

const session = JSON.parse(await fs.readFile(`${ROOT}/session.json`, "utf8"));
const notes = { journey: "01-create-pet", viewport: "mobile 390x844", steps: [], probes: [], findings: [] };
const log = (t) => { notes.steps.push(t); console.log("  •", t); };

const { page, shot, beat, finish } = await openSession({
  name: "01-create-pet", viewport: "mobile", session,
});

// --- 1. Landing, signed in --------------------------------------------------
await page.goto(BASE, { waitUntil: "networkidle" });
await beat(1400);
await shot("landing");
log("Landing page loaded as a signed-in owner.");

// --- 2. Dashboard empty state ----------------------------------------------
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await beat(1800);
await shot("dashboard-empty");
notes.probes.push(await layoutProbe(page, "dashboard-empty"));
notes.dashboardEmptyText = await page.locator("main").innerText();
log("Dashboard empty state (zero pets).");

// --- 3. Navigate to Add Pet -------------------------------------------------
await page.goto(`${BASE}/pets`, { waitUntil: "networkidle" });
await beat(1500);
await shot("pets-empty");
notes.petsEmptyText = await page.locator("main").innerText();

await page.goto(`${BASE}/pets/new`, { waitUntil: "networkidle" });
await beat(1600);
await shot("add-pet-initial");
notes.probes.push(await layoutProbe(page, "add-pet-initial"));
notes.addPetInitialText = await page.locator("main").innerText();
notes.addPetTouchTargets = await touchTargets(page);
log("Add Pet form initial state.");

// --- 4. Validation: submit empty -------------------------------------------
await page.getByRole("button", { name: /save pet/i }).click();
await beat(1500);
await shot("validation-empty-submit");
notes.validationText = await page.locator("main").innerText();
log("Submitted empty form to observe validation.");

// --- 5. Fill the form like a real owner ------------------------------------
const nameInput = page.locator('input[placeholder="Milo"]');
await nameInput.click();
await nameInput.type("Mochi", { delay: 120 });
await beat(900);
await shot("name-filled");
log('Typed pet name "Mochi".');

// Pet type control
const typeCombo = page.locator("main button[aria-haspopup], main [role=combobox]").first();
if (await typeCombo.count()) {
  await typeCombo.click();
  await beat(1200);
  await shot("pet-type-open");
  notes.petTypeOptions = await page.evaluate(() =>
    [...document.querySelectorAll('[role=option],[role=listbox] button,[role=menu] button')]
      .map((b) => b.textContent.trim()).filter(Boolean).slice(0, 14));
  // choose Cat
  const cat = page.getByRole("option", { name: /^cat$/i });
  if (await cat.count()) { await cat.click(); }
  else {
    const catBtn = page.locator("button", { hasText: /^Cat$/ }).first();
    if (await catBtn.count()) await catBtn.click();
  }
  await beat(1100);
  await shot("pet-type-cat");
  log("Selected pet type: Cat.");
}

// Breed
const breedTrigger = page.locator("main button", { hasText: /select breed/i }).first();
if (await breedTrigger.count()) {
  await breedTrigger.click();
  await beat(1300);
  await shot("breed-open");
  notes.breedFocusOnOpen = await page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a?.tagName, type: a?.getAttribute("type"), role: a?.getAttribute("role"), aria: a?.getAttribute("aria-label") };
  });
  notes.breedOptionsSample = await page.evaluate(() =>
    [...document.querySelectorAll('[role=option]')].map((b) => b.textContent.trim()).slice(0, 10));
  const opt = page.getByRole("option").filter({ hasText: /british shorthair|persian|siamese/i }).first();
  if (await opt.count()) { await opt.click(); } else { await page.keyboard.press("Escape"); }
  await beat(1100);
  await shot("breed-selected");
  log("Opened breed picker and chose a breed.");
}

await shot("form-filled");
notes.probes.push(await layoutProbe(page, "add-pet-filled"));

// --- 6. Save ----------------------------------------------------------------
await page.getByRole("button", { name: /save pet/i }).click();
await beat(600);
await shot("saving");
await page.waitForTimeout(2600);
await shot("created");
notes.postCreateText = await page.locator("main").innerText();
notes.probes.push(await layoutProbe(page, "post-create"));
log("Saved the pet and captured the post-create screen.");

// --- 7. Follow the post-create CTA -----------------------------------------
const goTo = page.getByRole("link", { name: /go to .*page/i }).first();
if (await goTo.count()) {
  await goTo.click();
  await page.waitForLoadState("networkidle");
  await beat(2200);
  await shot("pet-page");
  notes.petPageText = await page.locator("main").innerText();
  notes.probes.push(await layoutProbe(page, "pet-page"));
  log("Followed the post-create CTA to the pet page.");
}

notes.url = page.url();
const { video, consoleErrors } = await finish();
notes.video = video;
notes.consoleErrors = consoleErrors;
await writeJson(`${ROOT}/_notes/01-create-pet.json`, notes);
console.log("VIDEO:", video);
console.log("CONSOLE ERRORS:", consoleErrors.length);
