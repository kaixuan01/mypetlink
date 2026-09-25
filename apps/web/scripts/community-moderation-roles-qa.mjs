/** Browser capability fixtures for the Admin Community Reports UI.
 * Uses a real local Development sign-in, then substitutes only the Admin access
 * response and one report detail. Backend authorization remains covered by the
 * API policy tests; this checks the browser's capability-driven presentation.
 */
import { chromium } from "playwright-core";

const WEB = process.env.QA_WEB_ORIGIN ?? "http://localhost:3000";
const BROWSER = process.env.QA_BROWSER_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const REPORT_ID = process.env.QA_REPORT_ID;
if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(REPORT_ID ?? "")) {
  throw new Error("Set QA_REPORT_ID to a readable local Development Moment report.");
}

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
try {
  const signedIn = await browser.newContext();
  const login = await signedIn.newPage();
  await login.goto(`${WEB}/admin/community-reports`);
  await login.getByRole("button", { name: "Development login" }).click();
  await login.getByRole("heading", { name: "Community Reports" }).waitFor();
  const storageState = await signedIn.storageState();
  await signedIn.close();

  async function fixture(capabilities, accessDenied = false) {
    const context = await browser.newContext({ storageState, viewport: { width: 390, height: 844 } });
    await context.route("**/api/v1/admin/auth/check", async (route) => {
      if (accessDenied) {
        await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: "forbidden", message: "Access denied" } }) });
        return;
      }
      const response = await route.fetch();
      const payload = await response.json();
      payload.data.access = { isSuperAdmin: false, roles: [], capabilities };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
    });
    await context.route(`**/api/v1/admin/community-reports/${REPORT_ID}`, async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.data.targetType = "Comment";
      payload.data.status = "Open";
      payload.data.involvesYou = false;
      payload.data.availableActions = ["Dismiss", "RemoveComment", "HideMoment", "RestrictHousehold"];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
    });
    return context;
  }

  const support = await fixture(["community_reports.view", "community_reports.resolve"]);
  const supportPage = await support.newPage();
  await supportPage.goto(`${WEB}/admin/community-reports?report=${REPORT_ID}`);
  await supportPage.getByRole("heading", { name: "Evidence at time of report" }).waitFor();
  if (!(await supportPage.getByRole("link", { name: "Community Reports" }).count())) throw new Error("Owner Support navigation missing.");
  if (!(await supportPage.getByRole("button", { name: "Dismiss report" }).count())) throw new Error("Owner Support resolve action missing.");
  if (!(await supportPage.getByRole("button", { name: "Remove comment" }).count())) throw new Error("Owner Support remove action missing.");
  if (await supportPage.getByRole("button", { name: "Hide Moment" }).count()) throw new Error("Owner Support enforcement visible.");
  if (await supportPage.getByRole("button", { name: "Restrict Community access" }).count()) throw new Error("Owner Support restriction visible.");
  await support.close();

  const auditor = await fixture(["audit_log.view"]);
  const auditorPage = await auditor.newPage();
  await auditorPage.goto(`${WEB}/admin/community-reports?report=${REPORT_ID}`);
  await auditorPage.getByText(/You do not have permission to open this page/).waitFor();
  if (await auditorPage.getByRole("link", { name: "Community Reports" }).count()) throw new Error("Auditor navigation visible.");
  await auditor.close();

  const owner = await fixture([], true);
  const ownerPage = await owner.newPage();
  await ownerPage.goto(`${WEB}/admin/community-reports?report=${REPORT_ID}`);
  await ownerPage.getByRole("heading", { name: "Access not available" }).waitFor();
  if (await ownerPage.getByRole("heading", { name: "Evidence at time of report" }).count()) throw new Error("Ordinary owner saw moderation detail.");
  await owner.close();
  console.log("Community moderation role browser fixtures: PASS (Owner Support, Auditor, ordinary owner)");
} finally {
  await browser.close();
}
