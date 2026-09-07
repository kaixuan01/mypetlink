import { promises as fs } from "node:fs";
import { openSession, layoutProbe, writeJson, BASE, ROOT } from "./lib.mjs";

const session = JSON.parse(await fs.readFile(`${ROOT}/session.json`, "utf8"));
const PET = process.env.PET_ID;
const notes = { journey: "04b-care-date-states", viewport: "mobile 390x844", today: "2026-08-29", steps: [], probes: [] };
const log = (t) => { notes.steps.push(t); console.log("  •", t); };

const { page, shot, beat, finish } = await openSession({ name: "04b-care-date-states", viewport: "mobile", session });

await page.goto(`${BASE}/pets/${PET}/records`, { waitUntil: "networkidle" });
await beat(3200);
await shot("care-all-states-top");
notes.careListText = await page.locator("main").innerText();
notes.probes.push(await layoutProbe(page, "care-all-states"));

// Pull the rendered status chip for every record card.
notes.renderedStates = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll("main article, main .brand-card").forEach((card) => {
    const t = card.innerText || "";
    if (!/Date:|Start date:|Vaccination Date:/i.test(t)) return;
    const lines = t.split("\n").map((s) => s.trim()).filter(Boolean);
    out.push({
      lines: lines.slice(0, 9),
      statusChip: (t.match(/Overdue|Due today|Due soon|Upcoming|Completed|Complete/i) || [null])[0],
      dueLine: (t.match(/(Next due|Next review|Next visit)[^\n]*/i) || [null])[0],
    });
  });
  return out;
});
log(`Rendered ${notes.renderedStates.length} care cards.`);

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
await beat(1400);
await shot("care-all-states-mid");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await beat(1400);
await shot("care-all-states-bottom");

// Dashboard upcoming-care surface
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await beat(3200);
await shot("dashboard-upcoming-care");
notes.dashboardText = await page.locator("main").innerText();
notes.probes.push(await layoutProbe(page, "dashboard-upcoming-care"));
log("Captured dashboard upcoming-care surface.");

const { video, consoleErrors } = await finish();
notes.video = video;
notes.consoleErrors = [...new Set(consoleErrors)];
await writeJson(`${ROOT}/_notes/04b-care-states.json`, notes);
console.log("VIDEO:", video);
