/** Real, disposable Development moderation journeys. See community-report-qa.mjs
 * for creating the three reports with QA_KEEP_COMMENT=true. Run this using a
 * separate Development Admin identity, then remove the disposable report rows.
 */
import { chromium } from "playwright-core";

const WEB = process.env.QA_WEB_ORIGIN ?? "http://localhost:3000";
const API = process.env.QA_API_ORIGIN ?? "http://localhost:5281";
const BROWSER = process.env.QA_BROWSER_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const reports = {
  comment: process.env.QA_COMMENT_REPORT_ID,
  moment: process.env.QA_MOMENT_REPORT_ID,
  household: process.env.QA_HOUSEHOLD_REPORT_ID,
};
const momentId = process.env.QA_MOMENT_ID;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

for (const [target, id] of Object.entries(reports)) {
  assert(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id ?? ""), `Set QA_${target.toUpperCase()}_REPORT_ID.`);
}
assert(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(momentId ?? ""), "Set QA_MOMENT_ID.");

async function openReport(page, id) {
  await page.goto(`${WEB}/admin/community-reports?report=${id}`);
  await page.getByRole("heading", { name: "Evidence at time of report" }).waitFor();
  assert(await page.getByRole("heading", { name: /Current state/ }).count() === 1, "Current state missing.");
}

async function act(page, label, path) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: label });
  await dialog.waitFor();
  assert(await dialog.getByRole("button", { name: label, exact: true }).isDisabled(), "Note is not required.");
  await dialog.getByRole("textbox", { name: /Internal moderator note/ }).fill("Reviewed preserved evidence and current state in disposable Development QA.");
  const response = page.waitForResponse((item) => item.url().endsWith(`/${path}`) && item.request().method() === "POST");
  await dialog.getByRole("button", { name: label, exact: true }).click();
  const result = await response;
  assert(result.status() === 200, `${label} returned ${result.status()}.`);
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Evidence at time of report" }).waitFor();
}

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
try {
  await page.goto(`${WEB}/admin/community-reports`);
  await page.getByRole("button", { name: "Development login" }).click();
  await page.getByRole("heading", { name: "Community Reports" }).waitFor();

  await openReport(page, reports.comment);
  await page.getByText("QA review text").first().waitFor();
  await act(page, "Remove comment", "remove-comment");
  await page.getByText("Comment already removed").waitFor();
  assert(await page.getByText("QA review text").count() === 1, "Preserved comment evidence changed.");
  await page.getByText("Comment removed", { exact: true }).first().waitFor();

  await openReport(page, reports.moment);
  await act(page, "Hide Moment", "hide-moment");
  await page.getByText("Hidden by MyPetLink", { exact: true }).waitFor();
  await page.getByText("Moment hidden", { exact: true }).first().waitFor();
  assert((await page.request.get(`${API}/api/v1/public/moments/${momentId}`)).status() === 404, "Hidden Moment remained public.");
  await act(page, "Unhide Moment", "unhide-moment");
  await page.getByText("Not hidden", { exact: true }).waitFor();
  assert((await page.request.get(`${API}/api/v1/public/moments/${momentId}`)).status() === 200, "Public Moment did not return after unhide.");

  await openReport(page, reports.household);
  await act(page, "Restrict Community access", "restrict-household");
  await page.getByText("Restricted", { exact: true }).waitFor();
  await page.getByText("Household restricted", { exact: true }).first().waitFor();
  await page.getByText("Active", { exact: true }).first().waitFor();
  assert((await page.request.get(`${API}/api/v1/public/owners/quietpaws`)).status() === 404, "Restricted household remained public in Community.");
  await act(page, "Lift Community restriction", "lift-restriction");
  await page.getByText("Not restricted", { exact: true }).waitFor();
  assert((await page.request.get(`${API}/api/v1/public/owners/quietpaws`)).status() === 200, "Community profile did not return after lifting restriction.");
  console.log("Community moderation actions browser QA: PASS (Remove, Hide/Unhide, Restrict/Lift, public visibility and report evidence)");
} finally {
  await context.close();
  await browser.close();
}
