/**
 * Community reporting browser QA against the local Development API and web app.
 * Run with DevAuth enabled, E2 migrations applied, and both servers started:
 *   node apps/web/scripts/community-report-qa.mjs
 *
 * Uses the app's Development sign-in, submits three real reports, and checks
 * privacy responses with browser interception. A disposable Comment is added
 * to the local QA database and removed with its report in the finally block.
 * The temporary Block relationship is also undone before the run ends.
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const WEB = process.env.QA_WEB_ORIGIN ?? "http://localhost:3000";
const executablePath = process.env.QA_BROWSER_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const widths = [[320,640],[360,800],[375,812],[390,844],[412,915],[768,900],[1024,900],[1280,900]];
const check = (condition, message) => { if (!condition) throw new Error(message); };
const path = (response) => new URL(response.url()).pathname;
const sqlServer = process.env.QA_SQL_SERVER ?? "(localdb)\\MSSQLLocalDB";
const sqlDatabase = process.env.QA_SQL_DATABASE ?? "MyPetLinkDev";
const keepCommentForModeration = process.env.QA_KEEP_COMMENT === "true";
const sql = (query) => execFileSync("sqlcmd", ["-S", sqlServer, "-d", sqlDatabase, "-b", "-Q", `SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF; ${query}`], { encoding: "utf8" });

async function run() {
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const reportBodies = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/social/reports") reportBodies.push(request.postDataJSON());
  });
  let blockCreated = false;
  let qaCommentId = null;
  try {
    await page.goto(`${WEB}/login?redirect=%2Fu%2Fquietpaws`);
    await page.getByTestId("owner-development-login").click();
    await page.waitForURL((url) => url.pathname === "/u/quietpaws");
    await page.getByTestId("owner-profile-menu-trigger").click();
    await page.getByRole("menuitem", { name: "Report household" }).click();
    await page.getByRole("radio", { name: "Spam or scam" }).check();
    const householdResponse = page.waitForResponse((response) => path(response) === "/api/v1/social/reports" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Submit report" }).click();
    const householdResult = await householdResponse;
    check(householdResult.status() === 200, `Household report returned ${householdResult.status()}: ${await householdResult.text()}`);
    await page.getByText("Reports are private.").waitFor();
    check((await page.getByRole("menuitem", { name: "Block @quietpaws" }).count()) === 0, "Block must remain a separate action.");
    await page.getByRole("button", { name: "Block Quiet Paws" }).click();
    const blockResponse = page.waitForResponse((response) => path(response) === "/api/v1/social/owners/quietpaws/block" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Block", exact: true }).click();
    check((await blockResponse).ok(), "Separate Block failed.");
    blockCreated = true;
    await page.getByText("Household blocked.").waitFor();
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByTestId("owner-profile-menu-trigger").click();
    await page.getByRole("menuitem", { name: "Unblock @quietpaws" }).click();
    const unblockResponse = page.waitForResponse((response) => path(response) === "/api/v1/social/owners/quietpaws/block" && response.request().method() === "DELETE");
    await page.getByRole("button", { name: "Unblock", exact: true }).click();
    check((await unblockResponse).ok(), "QA relationship cleanup failed.");
    blockCreated = false;

    await page.goto(`${WEB}/u/quietpaws`);
    const momentHref = await page.getByRole("link", { name: /Morning song/ }).first().getAttribute("href");
    check(momentHref?.startsWith("/moments/"), "No seeded Moment link for QA.");
    await page.goto(`${WEB}${momentHref}`);
    await page.getByRole("button", { name: "Moment actions" }).click();
    await page.getByRole("menuitem", { name: "Report Moment" }).click();
    await page.getByRole("radio", { name: "Something else" }).check();
    await page.getByRole("textbox", { name: "Add details (optional)" }).fill("Please review this Moment 🐾");
    const momentResponse = page.waitForResponse((response) => path(response) === "/api/v1/social/reports" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Submit report" }).click();
    check((await momentResponse).status() === 200, "Moment report did not reach E2 successfully.");
    await page.getByText("Reports are private.").waitFor();
    await page.getByRole("button", { name: "Done" }).click();
    check((await page.getByRole("heading", { name: "Morning song" }).count()) === 1, "Reporting changed Moment visibility.");

    // A disposable Comment by another seeded household lets the browser send
    // a genuine request through E2. Remove this QA Comment and its QA report
    // in finally; never insert a report row directly.
    const momentId = momentHref.split("/").at(-1);
    check(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(momentId ?? ""), "Moment identifier is not a UUID.");
    const commentId = randomUUID();
    sql(`SET NOCOUNT ON; INSERT INTO MomentComments (Id, MomentId, AuthorUserId, Body, CreatedAt) SELECT '${commentId}', '${momentId}', UserId, N'QA review text', SYSDATETIMEOFFSET() FROM OwnerSocialProfiles WHERE Handle=N'teohfamily'; IF @@ROWCOUNT<>1 THROW 51000, 'QA author missing', 1;`);
    qaCommentId = commentId;
    await page.reload();
    const row = page.locator(`#comment-${commentId}`);
    await row.getByRole("button", { name: /Comment actions/ }).click();
    check((await row.getByRole("button", { name: "Remove comment" }).count()) === 0, "Viewer gained Moment-owner Remove action.");
    await row.getByRole("button", { name: "Report comment" }).click();
    await page.getByRole("radio", { name: "Privacy concern" }).check();
    const commentResponse = page.waitForResponse((response) => path(response) === "/api/v1/social/reports" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Submit report" }).click();
    check((await commentResponse).status() === 200, "Comment report did not reach E2 successfully.");
    await page.getByText("Reports are private.").waitFor();
    check((await row.getByText("QA review text").count()) === 1, "Reporting hid Comment.");
    await page.getByRole("button", { name: "Done" }).click();

    for (const [width, height] of widths) {
      await page.setViewportSize({ width, height });
      await page.goto(`${WEB}/u/quietpaws`);
      await page.getByTestId("owner-profile-menu-trigger").click();
      await page.getByRole("menuitem", { name: "Report household" }).click();
      const dialog = page.getByRole("dialog", { name: "Report household" });
      const result = await dialog.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const buttons = [...el.querySelectorAll("footer button")].map((button) => button.getBoundingClientRect());
        const reasons = [...el.querySelectorAll("input[type=radio]")].map((input) => input.closest("label").getBoundingClientRect());
        return { left: box.left, right: box.right, width: document.documentElement.scrollWidth, viewport: innerWidth, actions: buttons.every((r) => r.width >= 44 && r.height >= 44 && r.bottom <= innerHeight + 1), reasons: reasons.every((r) => r.height >= 44) };
      });
      check(result.left >= -1 && result.right <= width + 1 && result.width <= width + 1 && result.actions && result.reasons, `Dialog layout failed at ${width}: ${JSON.stringify(result)}`);
      await page.getByRole("textbox", { name: "Add details (optional)" }).fill("Usable text 🐾");
      await page.route("**/api/v1/social/reports", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { accepted: true } }) }), { times: 1 });
      await page.getByRole("radio", { name: "Spam or scam" }).check();
      await page.getByRole("button", { name: "Submit report" }).click();
      await page.getByText("Reports are private.").waitFor();
      check((await page.getByRole("button", { name: "Block Quiet Paws" }).isVisible()), `Block option not reachable at ${width}.`);
      check((await page.getByRole("button", { name: "Done" }).isVisible()), `Done not reachable at ${width}.`);
      await page.getByRole("button", { name: "Done" }).click();
      console.log(`responsive ${width}x${height}: OK`);
    }

    for (const [status, code, expected] of [
      [404, "report_target_unavailable", "This content is no longer available."],
      [429, "rate_limited", "You’ve sent several reports recently. Please try again later."],
      [503, "unavailable", "Couldn’t send report. Please try again."],
    ]) {
      await page.route("**/api/v1/social/reports", (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error: { code, message: "private server detail" } }) }), { times: 1 });
      await page.getByTestId("owner-profile-menu-trigger").click();
      await page.getByRole("menuitem", { name: "Report household" }).click();
      await page.getByRole("radio", { name: "Spam or scam" }).check();
      await page.getByRole("button", { name: "Submit report" }).click();
      await page.getByText(expected).waitFor();
      check((await page.getByText("private server detail").count()) === 0, "Private error detail leaked.");
      await page.getByRole("button", { name: status === 404 ? "Done" : "Cancel" }).click();
    }
    check(reportBodies.some((body) => body.targetType === "household" && body.target === "quietpaws"), "Household request target incorrect.");
    check(reportBodies.some((body) => body.targetType === "moment" && body.target === momentId), "Moment request target incorrect.");
    check(reportBodies.some((body) => body.targetType === "comment" && body.target === commentId), "Comment request target incorrect.");
    check(reportBodies.every((body) => Object.keys(body).sort().join() === "details,reason,target,targetType"), "Report request has unexpected fields.");
    if (keepCommentForModeration) console.log(`Disposable moderation Comment: ${qaCommentId}`);
    console.log("Community report browser QA: PASS (three real E2 reports, Block cleanup, privacy, eight widths)");
  } finally {
    if (qaCommentId && !keepCommentForModeration) sql(`SET NOCOUNT ON; BEGIN TRANSACTION; DELETE FROM CommunityReports WHERE CommentId='${qaCommentId}'; DELETE FROM MomentComments WHERE Id='${qaCommentId}'; COMMIT TRANSACTION;`);
    if (blockCreated) {
      await page.goto(`${WEB}/u/quietpaws`).catch(() => {});
      await page.getByTestId("owner-profile-menu-trigger").click().catch(() => {});
      await page.getByRole("menuitem", { name: "Unblock @quietpaws" }).click().catch(() => {});
      await page.getByRole("button", { name: "Unblock", exact: true }).click().catch(() => {});
    }
    await context.close();
    await browser.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
