/**
 * Browser QA for the local Development Admin moderation UI.
 * Requires the local API and web dev servers with Development sign-in enabled.
 * Run with QA_MODE=conflict while the reporting QA identity is configured, then
 * QA_MODE=moderator with QA_REPORT_ID set to a disposable, known Open report
 * using a separate local moderator identity. The latter dismisses that report
 * and verifies the stale-page response.
 */
import { chromium } from "playwright-core";

const WEB = process.env.QA_WEB_ORIGIN ?? "http://localhost:3000";
const BROWSER = process.env.QA_BROWSER_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const MODE = process.env.QA_MODE ?? "conflict";
const expectedReportId = process.env.QA_REPORT_ID?.toLowerCase();
const widths = [320, 360, 375, 390, 412, 768, 1024, 1280];
const check = (condition, message) => { if (!condition) throw new Error(message); };

async function noOverflow(page, width, label) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  check(size.document <= width + 1, `${label} overflows at ${width}: ${JSON.stringify(size)}`);
}

async function login(page) {
  await page.goto(`${WEB}/admin/community-reports`);
  await page.getByRole("button", { name: "Development login" }).click();
  await page.getByRole("heading", { name: "Community Reports" }).waitFor();
}

async function run() {
  if (MODE === "moderator" && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(expectedReportId ?? "")) {
    throw new Error("Set QA_REPORT_ID to the disposable Development report to review.");
  }
  const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    // A separate browser session has no Admin credentials and cannot read the queue.
    const unauthorized = await browser.newContext();
    const anonymous = await unauthorized.newPage();
    await anonymous.goto(`${WEB}/admin/community-reports`);
    await anonymous.waitForURL((url) => url.pathname === "/admin/login");
    check(await anonymous.getByText("Report queue").count() === 0, "Unauthorized visitor saw reports.");
    await unauthorized.close();

    await login(page);
    await page.getByRole("heading", { name: "Report queue" }).waitFor();
    await page.getByRole("button", { name: "View report" }).first().waitFor();
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    if (MODE === "conflict") {
      await page.getByRole("combobox", { name: "Target type" }).first().selectOption("Moment");
    } else {
      await page.getByRole("combobox", { name: "Status" }).first().selectOption("Open");
    }
    await page.getByRole("button", { name: "View report" }).first().click();
    await page.getByRole("heading", { name: "Evidence at time of report" }).waitFor();
    check(await page.getByRole("heading", { name: /Reported content · Current state/ }).count() === 1, "Current state missing.");
    check(await page.getByRole("heading", { name: "Prior report history" }).count() === 1, "History missing.");
    const detailUrl = page.url();
    if (MODE === "moderator") {
      check(new URL(detailUrl).searchParams.get("report")?.toLowerCase() === expectedReportId, "The selected report is not QA_REPORT_ID; no action was taken.");
    }

    if (MODE === "conflict") {
      await page.getByText("This report involves your household. Moderation actions are unavailable.").waitFor();
      check(await page.getByRole("button", { name: "Dismiss report" }).count() === 0, "Conflict action exposed.");
      console.log("Conflict-of-interest and unauthorized browser QA: PASS");
      return;
    }

    for (const width of widths) {
      await page.setViewportSize({ width, height: width <= 412 ? 844 : 900 });
      await noOverflow(page, width, "detail");
      await page.getByRole("button", { name: "Dismiss report" }).click();
      const dialog = page.getByRole("dialog", { name: "Dismiss report" });
      await dialog.waitFor();
      await noOverflow(page, width, "confirmation");
      check(await dialog.getByRole("textbox", { name: /Internal moderator note/ }).count() === 1, "Note missing.");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      check(await page.evaluate(() => document.activeElement?.textContent?.includes("Dismiss report")), "Focus did not return to action.");
    }

    const stale = await context.newPage();
    await stale.goto(detailUrl);
    await stale.getByRole("heading", { name: "Evidence at time of report" }).waitFor();
    await page.getByRole("button", { name: "Dismiss report" }).click();
    await page.getByRole("textbox", { name: /Internal moderator note/ }).fill("Reviewed the preserved evidence and current state in Development QA.");
    const decision = page.waitForResponse((response) => response.url().endsWith("/dismiss") && response.request().method() === "POST");
    await page.getByRole("dialog", { name: "Dismiss report" }).getByRole("button", { name: "Dismiss report" }).click();
    check((await decision).status() === 200, "Dismiss did not succeed.");
    await page.getByText(/Dismiss report completed/).waitFor();
    await page.getByText("Dismissed").waitFor();

    await stale.getByRole("button", { name: "Dismiss report" }).click();
    await stale.getByRole("textbox", { name: /Internal moderator note/ }).fill("Stale second review");
    const staleResponse = stale.waitForResponse((response) => response.url().endsWith("/dismiss") && response.request().method() === "POST");
    await stale.getByRole("dialog", { name: "Dismiss report" }).getByRole("button", { name: "Dismiss report" }).click();
    check((await staleResponse).status() === 409, "Stale review did not return 409.");
    await stale.getByText(/changed while you were reviewing/).waitFor();
    await stale.close();

    await page.getByRole("button", { name: /Back to report queue/ }).click();
    await page.getByRole("heading", { name: "Report queue" }).waitFor();
    await page.getByRole("combobox", { name: "Status" }).first().selectOption("Resolved");
    await page.locator("tbody").getByText("Resolved", { exact: true }).first().waitFor();
    for (const width of widths) {
      await page.setViewportSize({ width, height: width <= 412 ? 844 : 900 });
      await noOverflow(page, width, "queue");
      check(await page.getByRole("button", { name: "View report" }).first().isVisible(), `Queue action inaccessible at ${width}.`);
    }
    console.log("Community moderation browser QA: PASS (real Development action, stale 409, eight widths, unauthorized)");
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
