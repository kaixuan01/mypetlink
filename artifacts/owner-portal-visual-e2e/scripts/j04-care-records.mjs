import { promises as fs } from "node:fs";
import { openSession, layoutProbe, writeJson, BASE, ROOT } from "./lib.mjs";

const session = JSON.parse(await fs.readFile(`${ROOT}/session.json`, "utf8"));
const PET = process.env.PET_ID;
const notes = { journey: "04-care-records", viewport: "mobile 390x844", petId: PET, today: "2026-08-29", steps: [], probes: [] };
const log = (t) => { notes.steps.push(t); console.log("  •", t); };

const { page, shot, beat, finish } = await openSession({ name: "04-care-records", viewport: "mobile", session });

// --- empty state ------------------------------------------------------------
await page.goto(`${BASE}/pets/${PET}/records`, { waitUntil: "networkidle" });
await beat(2800);
await shot("care-empty");
notes.emptyText = await page.locator("main").innerText();
notes.probes.push(await layoutProbe(page, "care-empty"));
log("Care records empty state.");

// --- open create dialog and inventory the form ------------------------------
await page.getByRole("button", { name: /add care record|add record/i }).first().click();
await beat(2400);
await shot("care-dialog-open");
notes.dialogText = await page.evaluate(() => document.querySelector('[role=dialog]')?.innerText || "NO DIALOG");
notes.formControls = await page.evaluate(() => {
  const d = document.querySelector('[role=dialog]');
  if (!d) return null;
  return {
    selects: [...d.querySelectorAll("select")].map((s) => ({ options: [...s.options].map((o) => o.textContent.trim()).filter(Boolean) })),
    inputs: [...d.querySelectorAll("input")].map((i) => ({ type: i.type, placeholder: i.placeholder })),
    buttons: [...d.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean),
  };
});
notes.careTypeOptions = notes.formControls?.selects?.[0]?.options ?? [];
log(`Care types exposed to owners: ${JSON.stringify(notes.careTypeOptions)}`);

// --- validation: empty save --------------------------------------------------
await page.getByRole("button", { name: /^add care record$|^save/i }).last().click();
await beat(1800);
await shot("care-validation");
notes.validationText = await page.evaluate(() => document.querySelector('[role=dialog]')?.innerText || "");
log("Attempted an empty save to observe validation.");

// --- create a Vaccine record with a September due date ----------------------
const dlg = page.locator('[role=dialog]');
const typeSel = dlg.locator("select").first();
if (await typeSel.count()) { await typeSel.selectOption({ label: "Vaccine" }); await beat(1000); await shot("care-type-vaccine"); }

const texts = dlg.locator('input[type="text"]');
const nText = await texts.count();
if (nText > 0) { await texts.nth(0).click(); await texts.nth(0).type("Rabies", { delay: 90 }); await beat(700); }
if (nText > 1) { await texts.nth(1).click(); await texts.nth(1).type("Rabies annual booster", { delay: 60 }); await beat(700); }
await shot("care-names-filled");

const dates = dlg.locator('input[type="date"]');
const nDates = await dates.count();
if (nDates > 0) await dates.nth(0).fill("2026-08-15");
if (nDates > 1) await dates.nth(1).fill("2026-09-03");   // September due date
await beat(1000);
await shot("care-dates-filled");
log("Filled a Vaccine record with a 3 September 2026 due date.");

notes.beforeSaveDialog = await page.evaluate(() => document.querySelector('[role=dialog]')?.innerText || "");
await page.getByRole("button", { name: /^add care record$|^save/i }).last().click();
await beat(600);
await shot("care-saving");
await page.waitForTimeout(3000);
await shot("care-saved");
notes.afterSaveText = await page.locator("main").innerText();
notes.probes.push(await layoutProbe(page, "care-after-save"));
log("Saved the Vaccine record.");

// --- create a second type (Grooming) ----------------------------------------
await page.getByRole("button", { name: /add care record|add record/i }).first().click();
await beat(2000);
const ts2 = page.locator('[role=dialog] select').first();
if (await ts2.count()) { await ts2.selectOption({ label: "Grooming" }); await beat(900); }
const tx2 = page.locator('[role=dialog] input[type="text"]');
if (await tx2.count()) { await tx2.nth(0).fill("Monthly groom"); }
if (await tx2.count() > 1) { await tx2.nth(1).fill("Full groom and nail trim"); }
const dt2 = page.locator('[role=dialog] input[type="date"]');
if (await dt2.count()) await dt2.nth(0).fill("2026-08-29");
if (await dt2.count() > 1) await dt2.nth(1).fill("2026-08-29");  // due today
await beat(1100);
await shot("care-grooming-filled");
await page.getByRole("button", { name: /^add care record$|^save/i }).last().click();
await page.waitForTimeout(3000);
await shot("care-two-records");
notes.twoRecordsText = await page.locator("main").innerText();
log("Added a Grooming record due today.");

// --- edit the first record ---------------------------------------------------
const edit = page.getByRole("button", { name: /^edit$/i }).first();
if (await edit.count()) {
  await edit.click();
  await beat(2400);
  await shot("care-edit-open");
  notes.editPrefill = await page.evaluate(() => {
    const d = document.querySelector('[role=dialog]');
    return {
      texts: [...d.querySelectorAll('input[type=text]')].map((i) => i.value),
      dates: [...d.querySelectorAll('input[type=date]')].map((i) => i.value),
      select: d.querySelector("select")?.value,
    };
  });
  log(`Care edit prefilled: ${JSON.stringify(notes.editPrefill)}`);
  await page.getByRole("button", { name: /cancel/i }).last().click();
  await beat(1600);
  await shot("care-edit-cancelled");
}

// --- dashboard impact ---------------------------------------------------------
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await beat(3000);
await shot("dashboard-with-care");
notes.dashboardText = await page.locator("main").innerText();
notes.probes.push(await layoutProbe(page, "dashboard-with-care"));
log("Checked the dashboard for upcoming-care impact.");

const { video, consoleErrors } = await finish();
notes.video = video;
notes.consoleErrors = [...new Set(consoleErrors)];
await writeJson(`${ROOT}/_notes/04-care.json`, notes);
console.log("VIDEO:", video);
