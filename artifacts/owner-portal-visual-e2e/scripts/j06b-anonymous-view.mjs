import { openSession, layoutProbe, writeJson, BASE, ROOT } from "./lib.mjs";

const notes = { journey: "06b-anonymous-public-and-finder-view", viewport: "mobile 390x844", steps: [], probes: [], auth: "NONE - clean context" };
const log = (t) => { notes.steps.push(t); console.log("  •", t); };

// No session -> a genuinely anonymous visitor.
const { page, shot, beat, finish } = await openSession({ name: "06b-anonymous-view", viewport: "mobile", session: null });

// --- public share profile ----------------------------------------------------
await page.goto(`${BASE}/p/${process.env.PUBLIC_SLUG}`, { waitUntil: "networkidle" });
await beat(3600);
await shot("anon-public-profile-top");
notes.publicProfileText = await page.locator("main").innerText();
notes.probes.push(await layoutProbe(page, "anon-public-profile"));
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await beat(1500);
await shot("anon-public-profile-bottom");
log("Captured the anonymous Public Share Profile (About tab).");

// The public profile is tabbed; panels render lazily, so each tab must be
// opened before its content can be judged.
notes.publicTabs = {};
for (const tab of ["Moments", "Timeline", "About"]) {
  const btn = page.locator("main button, main a", { hasText: new RegExp(`^${tab}$`, "i") }).first();
  if (await btn.count()) {
    await btn.click();
    await beat(2400);
    await shot(`anon-public-tab-${tab.toLowerCase()}`);
    notes.publicTabs[tab] = await page.locator("main").innerText();
    log(`Opened anonymous public tab: ${tab}`);
  } else {
    log(`Anonymous public tab NOT FOUND: ${tab}`);
  }
}

// --- safety profile (finder) --------------------------------------------------
await page.goto(`${BASE}/q/${process.env.SAFETY_CODE}`, { waitUntil: "networkidle" });
await beat(3600);
await shot("anon-safety-profile-top");
notes.safetyProfileText = await page.locator("main").innerText();
notes.probes.push(await layoutProbe(page, "anon-safety-profile"));
notes.finderActions = await page.evaluate(() =>
  [...document.querySelectorAll("main a, main button")].map((el) => ({
    text: (el.innerText || "").trim().slice(0, 40),
    href: el.getAttribute("href"),
  })).filter((x) => x.text));
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await beat(1500);
await shot("anon-safety-profile-bottom");
log("Captured the anonymous Safety Profile (finder view).");

// --- leakage assertions --------------------------------------------------------
const all = [
  notes.publicProfileText,
  notes.safetyProfileText,
  ...Object.values(notes.publicTabs || {}),
].join("\n");
notes.leakChecks = {
  privateMomentTitleLeaked: /Vet worry - private note/i.test(all),
  privateMomentCaptionLeaked: /bad reaction, do not share/i.test(all),
  privateCareNameLeaked: /Overdue probe|Due today probe|September probe|Upcoming probe|No due probe/i.test(all),
  careDueDateLeaked: /Next due|Next review|Next follow-up|Due today|Overdue|Due soon/i.test(all),
  providerLeaked: /Owner recorded|Happy Paws/i.test(all),
  ownerEmailLeaked: /plain\.owner@|mypetlink\.local/i.test(all),
  publicMomentShown: /First night at home/i.test(all),
};
log(`Leak checks: ${JSON.stringify(notes.leakChecks)}`);

const { video, consoleErrors } = await finish();
notes.video = video;
notes.consoleErrors = [...new Set(consoleErrors)];
await writeJson(`${ROOT}/_notes/06b-anonymous.json`, notes);
console.log("VIDEO:", video);
