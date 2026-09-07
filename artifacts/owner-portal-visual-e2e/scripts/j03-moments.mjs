import { promises as fs } from "node:fs";
import { openSession, layoutProbe, writeJson, BASE, ROOT } from "./lib.mjs";

const session = JSON.parse(await fs.readFile(`${ROOT}/session.json`, "utf8"));
const PET = process.env.PET_ID;
const notes = { journey: "03-create-edit-moments", viewport: "mobile 390x844", petId: PET, steps: [], probes: [] };
const log = (t) => { notes.steps.push(t); console.log("  •", t); };

const { page, shot, beat, finish } = await openSession({ name: "03-create-edit-moments", viewport: "mobile", session });

// --- empty state ------------------------------------------------------------
await page.goto(`${BASE}/pets/${PET}/moments`, { waitUntil: "networkidle" });
await beat(2800);
await shot("moments-empty");
notes.emptyText = await page.locator("main").innerText();
notes.probes.push(await layoutProbe(page, "moments-empty"));
log("Moments empty state.");

// --- open the create dialog -------------------------------------------------
await page.getByRole("button", { name: /add moment/i }).first().click();
await beat(2200);
await shot("moment-dialog-open");
notes.dialogUrl = page.url();
notes.dialogText = await page.evaluate(() => document.querySelector('[role=dialog]')?.innerText || "NO DIALOG");
notes.focusOnOpen = await page.evaluate(() => {
  const a = document.activeElement;
  return { tag: a?.tagName, type: a?.type, placeholder: a?.placeholder, aria: a?.getAttribute("aria-label") };
});
notes.probes.push(await layoutProbe(page, "moment-dialog"));
log("Add Moment dialog opened.");

// --- validation: save with nothing ------------------------------------------
const saveBtn = page.getByRole("button", { name: /^add moment$/i }).last();
await saveBtn.click();
await beat(1800);
await shot("moment-validation");
notes.validationText = await page.evaluate(() => document.querySelector('[role=dialog]')?.innerText || "");
log("Attempted to save an empty moment.");

// --- fill it out -------------------------------------------------------------
const dlg = page.locator('[role=dialog]');
const title = dlg.locator('input[type="text"]').first();
await title.click();
await title.type("First night at home", { delay: 90 });
await beat(900);
await shot("moment-title");

const date = dlg.locator('input[type="date"]').first();
if (await date.count()) { await date.fill("2026-08-20"); await beat(800); await shot("moment-date"); }

// Moment category is required. NOTE: this is a NATIVE <select>, whereas the
// Add Pet form uses custom button/listbox comboboxes - recorded as a
// control-consistency finding.
const catSelect = dlg.locator("select").first();
if (await catSelect.count()) {
  notes.categoryControlType = "native <select>";
  await catSelect.selectOption({ label: "First Day Home" });
  await beat(1200);
  await shot("moment-category-chosen");
  log("Selected moment category: First Day Home (native select).");
}

// media affordance (R2 not configured locally - affordance only, no upload)
notes.mediaAffordance = await dlg.evaluate((d) =>
  [...d.querySelectorAll("button")].map((b) => b.textContent.trim()).filter((t) => /photo|video/i.test(t)));

// audience / privacy controls
notes.audienceControls = await dlg.evaluate((d) => {
  const out = [];
  d.querySelectorAll('input[type=radio], [role=switch], input[type=checkbox]').forEach((el) => {
    const wrap = el.closest("label") || el.parentElement?.parentElement;
    out.push({
      type: el.type || el.getAttribute("role"),
      checked: el.checked ?? el.getAttribute("aria-checked"),
      label: (wrap?.innerText || "").split("\n").slice(0, 2).join(" / ").slice(0, 70),
    });
  });
  return out;
});
await shot("moment-audience-controls");

// choose public + life timeline
const publicOpt = dlg.locator("text=Anyone with the link").first();
if (await publicOpt.count()) { await publicOpt.click(); await beat(1000); await shot("moment-public-selected"); log("Selected audience: Anyone with the link."); }

const timeline = dlg.locator('[role=switch], input[type=checkbox]').last();
if (await timeline.count()) {
  const before = await timeline.getAttribute("aria-checked");
  await timeline.click();
  await beat(900);
  notes.timelineToggled = { before, after: await timeline.getAttribute("aria-checked") };
  await shot("moment-timeline-toggled");
}

await shot("moment-before-save");
notes.filledDialogText = await page.evaluate(() => document.querySelector('[role=dialog]')?.innerText || "");

// --- save --------------------------------------------------------------------
await page.getByRole("button", { name: /^add moment$/i }).last().click();
await beat(600);
await shot("moment-saving");
await page.waitForTimeout(3000);
await shot("moment-saved");
notes.afterSaveText = await page.locator("main").innerText();
notes.afterSaveUrl = page.url();
notes.probes.push(await layoutProbe(page, "moments-after-save"));
log("Saved the moment.");

// --- edit --------------------------------------------------------------------
const editBtn = page.getByRole("button", { name: /^edit$/i }).first();
if (await editBtn.count()) {
  await editBtn.click();
  await beat(2400);
  await shot("moment-edit-open");
  notes.editDialogUrl = page.url();
  notes.editPrefill = await page.evaluate(() => {
    const d = document.querySelector('[role=dialog]');
    const i = d?.querySelector('input[type=text]');
    const dt = d?.querySelector('input[type=date]');
    return { title: i?.value, date: dt?.value };
  });
  log(`Edit dialog prefilled: ${JSON.stringify(notes.editPrefill)}`);

  const t2 = page.locator('[role=dialog] input[type="text"]').first();
  await t2.fill("First night at home (edited)");
  await beat(900);
  await shot("moment-edit-changed");

  // dirty back behaviour
  await page.goBack();
  await beat(2000);
  await shot("moment-dirty-back");
  const body = await page.locator("body").innerText();
  notes.dirtyBackPrompt = /discard|unsaved|keep editing/i.test(body);
  notes.dirtyBackText = (body.match(/[^\n]*(discard|unsaved|keep editing)[^\n]*/gi) || []).slice(0, 4);
  log(`Dirty Back prompt shown: ${notes.dirtyBackPrompt}`);

  const keep = page.getByRole("button", { name: /keep editing/i }).first();
  if (await keep.count()) { await keep.click(); await beat(1400); await shot("moment-kept-editing"); }

  await page.getByRole("button", { name: /save changes|save moment|^save$/i }).last().click();
  await page.waitForTimeout(3000);
  await shot("moment-edit-saved");
  notes.afterEditText = await page.locator("main").innerText();
  log("Saved the edited moment.");
}

// --- persistence -------------------------------------------------------------
await page.goto(`${BASE}/pets/${PET}/moments`, { waitUntil: "networkidle" });
await beat(2600);
await shot("moment-persisted");
notes.persistedText = await page.locator("main").innerText();
log("Reloaded moments list to confirm persistence.");

const { video, consoleErrors } = await finish();
notes.video = video;
notes.consoleErrors = [...new Set(consoleErrors)];
await writeJson(`${ROOT}/_notes/03-moments.json`, notes);
console.log("VIDEO:", video);
