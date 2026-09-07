import { promises as fs } from "node:fs";
import { openSession, layoutProbe, writeJson, BASE, ROOT } from "./lib.mjs";

const session = JSON.parse(await fs.readFile(`${ROOT}/session.json`, "utf8"));
const PET = process.env.PET_ID;
const notes = { journey: "05-dashboard-navigation", viewport: "mobile 390x844", steps: [], probes: [], completion: {} };
const log = (t) => { notes.steps.push(t); console.log("  •", t); };

const { page, shot, beat, finish } = await openSession({ name: "05-dashboard-navigation", viewport: "mobile", session });

// --- dashboard ---------------------------------------------------------------
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await beat(3200);
await shot("dashboard");
notes.dashboardText = await page.locator("main").innerText();
notes.probes.push(await layoutProbe(page, "dashboard"));
notes.completion.dashboard = (notes.dashboardText.match(/(\d+)%\s*complete/i) || [])[1] ?? null;
log(`Dashboard completion reads: ${notes.completion.dashboard}%`);

// --- primary navigation targets ---------------------------------------------
const navTargets = [
  ["/pets", "pets"],
  ["/moments", "moments-hub"],
  ["/records", "records-hub"],
  ["/settings", "settings"],
];
for (const [route, key] of navTargets) {
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  await beat(2600);
  await shot(`nav-${key}`);
  notes[`text_${key}`] = await page.locator("main").innerText();
  notes.probes.push(await layoutProbe(page, key));
  log(`Visited ${route}`);
}

// --- pet profile page --------------------------------------------------------
await page.goto(`${BASE}/pets/${PET}`, { waitUntil: "networkidle" });
await beat(3200);
await shot("pet-profile");
notes.petPageText = await page.locator("main").innerText();
notes.probes.push(await layoutProbe(page, "pet-profile"));
notes.completion.petPage = (notes.petPageText.match(/(\d+)%\s*complete/i) || [])[1] ?? null;
log(`Pet page completion reads: ${notes.completion.petPage}%`);

// --- completion detail --------------------------------------------------------
const viewAll = page.getByRole("link", { name: /view all profile steps|profile steps/i }).first();
if (await viewAll.count()) {
  await viewAll.click();
  await page.waitForLoadState("networkidle");
  await beat(2600);
  await shot("completion-steps");
  notes.completionStepsText = await page.locator("main").innerText();
  notes.completion.stepsPage = (notes.completionStepsText.match(/(\d+)%\s*complete/i) || [])[1] ?? null;
  log(`Completion steps page reads: ${notes.completion.stepsPage}%`);
}

// --- bottom nav overlap check ------------------------------------------------
notes.bottomNav = await page.evaluate(() => {
  const bars = [...document.querySelectorAll("*")].filter((e) => {
    const cs = getComputedStyle(e);
    return cs.position === "fixed" && e.getBoundingClientRect().bottom >= window.innerHeight - 4 && e.getBoundingClientRect().height > 30;
  });
  if (!bars.length) return null;
  const bar = bars[bars.length - 1];
  const r = bar.getBoundingClientRect();
  // does any main content sit underneath the bar at full scroll?
  window.scrollTo(0, document.body.scrollHeight);
  const overlapped = [...document.querySelectorAll("main button, main a")].filter((el) => {
    const b = el.getBoundingClientRect();
    return b.height > 0 && b.bottom > r.top + 2 && b.top < r.bottom;
  }).map((el) => (el.innerText || "").slice(0, 30));
  window.scrollTo(0, 0);
  return { barText: bar.innerText.replace(/\n/g, " | ").slice(0, 80), barTop: Math.round(r.top), viewportH: window.innerHeight, overlappedControls: overlapped.slice(0, 5) };
});
await shot("bottom-nav");
log(`Bottom nav overlap check: ${JSON.stringify(notes.bottomNav)}`);

const { video, consoleErrors } = await finish();
notes.video = video;
notes.consoleErrors = [...new Set(consoleErrors)];
await writeJson(`${ROOT}/_notes/05-dashboard.json`, notes);
console.log("VIDEO:", video);
