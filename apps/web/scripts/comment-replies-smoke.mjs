/**
 * F4 browser UI smoke using the existing F2/F3 response contracts.
 * No live API, database, credentials or records are changed. This deliberately
 * does not claim F5 live API/privacy coverage. Run against a Social ON local
 * web server configured with an API base URL; all API calls are intercepted.
 * Optional QA_SCREENSHOT_DIR saves review images outside the source tree.
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const WEB = process.env.QA_WEB_ORIGIN ?? "http://localhost:3000";
const BROWSER = process.env.QA_BROWSER_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const widths = [[320, 640], [360, 800], [375, 812], [390, 844], [412, 915], [768, 900], [1024, 900], [1280, 900]];
const momentId = "99999999-9999-4999-8999-999999999999";
const parentId = "11111111-1111-4111-8111-111111111111";
const replyId = "22222222-2222-4222-8222-222222222222";
const amy = { handle: "amy", displayName: "Amy's household", avatarUrl: null, avatarThumbnailUrl: null };
const ben = { ...amy, handle: "ben", displayName: "Ben's household" };
const me = { ...amy, handle: "myhousehold", displayName: "My household" };
const user = { id: "fixture-user", email: "fixture@example.test", displayName: "Fixture account", roles: [], status: "Active" };
const check = (condition, message) => { if (!condition) throw new Error(message); };

function fixtures() {
  return {
    role: "viewer", sequence: 0, writes: [], reports: [], reads: [], unread: 1,
    parent: { id: parentId, body: "Such a lovely afternoon together!", createdAt: "2026-09-20T10:00:00Z", author: amy, parentCommentId: null, replyCount: 1, mentions: [] },
    replies: [{ id: replyId, body: "Thank you! This was a wonderful walk with our pets.", createdAt: "2026-09-20T11:00:00Z", author: ben, parentCommentId: parentId, replyCount: 0, mentions: [] }],
  };
}

async function wire(context, data, anonymous = false) {
  if (!anonymous) {
  await context.addInitScript(({ user }) => {
    localStorage.setItem("mypetlink_api_auth_session", JSON.stringify({ accessToken: "fixture-only", refreshToken: "fixture-only", expiresAt: Date.now() + 3600000, user }));
  }, { user });
  }
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const signedIn = Boolean(request.headers().authorization);
    const row = (comment) => ({ ...comment, viewerDeleteAction: !signedIn ? null : comment.author.handle === me.handle ? "delete" : data.role === "moment-author" ? "remove" : null });
    const total = 1 + data.replies.length;
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    const respond = (value, status = 200) => route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify({ data: value, meta: { requestId: "f4-fixture" } }) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path === "/api/v1/auth/me") return respond({ user, ownerProfile: { id: "owner", ownerDisplayName: "Fixture owner", planCode: "free", planName: "Free" } });
    if (path === "/api/v1/owner/profile") return respond({ id: "owner", displayName: "Fixture owner", email: user.email, defaultContact: { displayName: "Fixture owner" }, plan: { code: "free", name: "Free" } });
    if (path === "/api/v1/auth/owner-portal-entry") return respond(null);
    if (path === "/api/v1/social/me/profile") return respond({ ...me, isSocialEnabled: true, canEnableSocial: true, allowFollowers: true, missingRequirements: [] });
    if (path.endsWith("/collaborations")) return respond({ viewerRole: "viewer", items: [], author: amy });
    if (path === "/api/v1/social/notifications/unread") return respond({ unreadCount: data.unread });
    if (path === "/api/v1/social/notifications/read") {
      data.reads.push(request.postDataJSON()); data.unread = 0; return respond({ unreadCount: 0 });
    }
    if (path === "/api/v1/social/notifications") return respond({ items: [{ id: "reply-activity", type: "MomentCommentReplied", createdAt: "2026-09-20T11:00:00Z", isRead: false, actor: ben, momentId, commentId: replyId, momentTitle: "An afternoon together", momentSubjectNames: ["Mochi"] }], nextCursor: null, unreadCount: data.unread });
    if (path === `/api/v1/public/moments/${momentId}`) return respond({ id: momentId, title: "An afternoon together", caption: "A lovely day outside.", type: "Memory", publishedAt: "2026-09-20T09:00:00Z", author: amy, subjects: [{ name: "Mochi", publicSlug: "mochi-fixture", isPrimarySubject: true, lostModeEnabled: false, photoUrl: null }], media: [], likeCount: 0, viewerHasLiked: false, commentCount: total, collaborations: [] });
    if (path.endsWith("/mention-suggestions")) return respond({ query: url.searchParams.get("q"), items: [{ household: ben, context: "commenter" }] });
    if (path === `/api/v1/public/moments/${momentId}/comments`) {
      const anchor = url.searchParams.get("anchor");
      return respond({ items: [row({ ...data.parent, replyCount: data.replies.length })], nextCursor: null, commentCount: total, viewer: { canComment: signedIn, requirement: signedIn ? null : "signIn", identity: signedIn ? me : null }, anchorParentCommentId: data.replies.some((reply) => reply.id === anchor) ? parentId : null });
    }
    if (path === `/api/v1/public/moments/${momentId}/comments/${parentId}/replies`) {
      check(url.searchParams.get("limit") === "10", "Reply page size drifted.");
      return respond({ parentCommentId: parentId, items: data.replies.map(row), nextCursor: null, replyCount: data.replies.length });
    }
    if (path === `/api/v1/social/moments/${momentId}/comments` && method === "POST") {
      const body = request.postDataJSON();
      data.writes.push(body);
      check(body.parentCommentId === parentId, "Reply used a nested parent.");
      const comment = { id: `44444444-4444-4444-8444-${String(++data.sequence).padStart(12, "0")}`, parentCommentId: parentId, replyCount: 0, body: body.body, author: me, mentions: [], createdAt: new Date().toISOString(), viewerDeleteAction: "delete" };
      data.replies.push(comment);
      return respond({ comment, commentCount: 1 + data.replies.length, parentCommentId: parentId, parentReplyCount: data.replies.length }, 201);
    }
    if (path.startsWith(`/api/v1/social/moments/${momentId}/comments/`) && method === "DELETE") {
      const id = path.split("/").at(-1);
      data.replies = data.replies.filter((reply) => reply.id !== id);
      return respond({ commentId: id, commentCount: 1 + data.replies.length, parentCommentId: parentId, parentReplyCount: data.replies.length });
    }
    if (path === "/api/v1/social/reports") { data.reports.push(request.postDataJSON()); return respond({ accepted: true }); }
    return route.fulfill({ status: 404, headers, contentType: "application/json", body: JSON.stringify({ error: { code: "not_found", message: "Unavailable." } }) });
  });
}

async function layout(page, width, label) {
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  check(size.scroll <= width + 1, `${label} overflows at ${width}: ${JSON.stringify(size)}`);
  const ids = await page.locator("#comments [id]").evaluateAll((nodes) => nodes.map((node) => node.id));
  check(new Set(ids).size === ids.length, "Duplicate Comment/composer ids.");
}

async function run() {
  if (process.env.QA_SCREENSHOT_DIR) await mkdir(process.env.QA_SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
  try {
    for (const [width, height] of widths) {
      const context = await browser.newContext({ viewport: { width, height } });
      const data = fixtures();
      await wire(context, data);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${WEB}/moments/${momentId}`);
      await page.getByRole("combobox", { name: "Add a comment" }).waitFor().catch(async (error) => {
        console.error({ url: page.url(), text: await page.locator("body").innerText(), errors });
        throw error;
      });
      await page.getByRole("combobox").fill("My top-level draft");
      const parent = page.locator(`#comment-${parentId}`);
      await parent.getByRole("button", { name: "Reply to Amy's household", exact: true }).click();
      check(await page.getByRole("combobox").inputValue() === "", "Direct Reply was prefilled.");
      await page.getByRole("combobox").fill("My first Reply");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.getByText("Reply posted.", { exact: true }).waitFor();
      const own = page.getByTestId("reply-row").filter({ hasText: "My first Reply" });
      await own.waitFor();
      check(data.writes[0].parentCommentId === parentId, "Top-level Reply wrong parent.");
      await layout(page, width, "Reply posted");

      const benReply = page.locator(`#comment-${replyId}`);
      await benReply.getByRole("button", { name: "Reply to Ben's household", exact: true }).click();
      check(await page.getByRole("combobox").inputValue() === "@ben ", "Reply-to-Reply prefill missing.");
      check(await page.getByTestId("active-comment-composer").count() === 1, "More than one composer.");
      check(await page.getByTestId("active-comment-composer").evaluate((node) => !node.closest('[data-testid="reply-row"]')), "Reply composer nested twice.");
      await page.getByRole("combobox").fill("@ben Thank you too!");
      if (process.env.QA_SCREENSHOT_DIR) await page.locator("#comments").screenshot({ path: join(process.env.QA_SCREENSHOT_DIR, `reply-${width}.png`) });
      await layout(page, width, "Reply-to-Reply composer");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.getByTestId("reply-row").filter({ hasText: "@ben Thank you too!" }).waitFor();
      check(data.writes[1].parentCommentId === parentId, "Reply-to-Reply wrong parent.");
      await page.getByRole("button", { name: "Cancel reply" }).click();
      check(await page.getByRole("combobox").inputValue() === "My top-level draft", "Top-level draft was lost.");
      await parent.getByRole("button", { name: /Hide replies to/ }).click();
      check(await page.getByTestId("reply-row").first().isVisible() === false, "Collapse failed.");
      await parent.getByRole("button", { name: /View 3 replies to/ }).click();
      await own.getByRole("button", { name: "Reply actions for My household" }).click();
      await page.getByRole("button", { name: "Delete reply", exact: true }).click();
      await layout(page, width, "Delete confirmation");
      await page.getByRole("dialog").getByRole("button", { name: "Delete reply", exact: true }).click();
      await own.waitFor({ state: "hidden" });

      await benReply.getByRole("button", { name: "Reply actions for Ben's household" }).click();
      await page.getByRole("button", { name: "Report reply", exact: true }).click();
      const report = page.getByRole("dialog", { name: "Report reply" });
      await report.getByRole("radio", { name: "Spam or scam" }).check();
      await layout(page, width, "Report dialog");
      await report.getByRole("button", { name: "Submit report" }).click();
      await page.getByRole("dialog", { name: "Report received" }).waitFor();
      check(data.reports[0].targetType === "comment" && data.reports[0].target === replyId, "Reply report contract drifted.");
      await page.getByRole("button", { name: "Done", exact: true }).click();

      await page.goto(`${WEB}/notifications`);
      const activity = page.getByRole("link", { name: "Unread. Ben's household replied to your comment. View this reply." });
      await activity.waitFor();
      check(await page.getByTestId("activity-unread-marker").count() === 1, "Unread row mismatch.");
      await layout(page, width, "Reply Activity");
      await activity.click();
      await page.locator(`#comment-${replyId}[data-highlighted=true]`).waitFor();
      check(await page.evaluate(() => document.activeElement?.id) === `comment-${replyId}`, "Reply anchor focus missing.");
      check(new URL(page.url()).searchParams.get("returnTo") === "/notifications", "Activity return context lost.");
      check(data.reads.length >= 1 && data.unread === 0, "Reply Activity was not marked read.");

      data.role = "moment-author";
      await page.reload();
      await page.getByRole("button", { name: /View 2 replies to/ }).click();
      await benReply.getByRole("button", { name: "Reply actions for Ben's household" }).click();
      await page.getByRole("button", { name: "Remove reply", exact: true }).click();
      await layout(page, width, "Moment author Remove confirmation");
      await page.getByRole("dialog").getByRole("button", { name: "Remove reply", exact: true }).click();
      await benReply.waitFor({ state: "hidden" });
      check(data.replies.length === 1, "Remove reply failed.");
      // Reset the browser-only fixture for the anonymous read case.
      data.replies = fixtures().replies;
      await page.evaluate(() => localStorage.removeItem("mypetlink_api_auth_session"));
      // initScript signs in on each new load; remove it for this new context.
      const anonymous = await browser.newContext({ viewport: { width, height } });
      await wire(anonymous, data, true);
      const visitor = await anonymous.newPage();
      await visitor.goto(`${WEB}/moments/${momentId}`);
      await visitor.getByRole("button", { name: /View 1 reply to/ }).click();
      await visitor.locator(`#comment-${replyId}`).waitFor();
      check(await visitor.getByRole("button", { name: /^Reply to|actions for/ }).count() === 0, "Anonymous write actions exposed.");
      await layout(visitor, width, "Anonymous Reply expansion");
      await anonymous.close();
      check(errors.length === 0, `Uncaught browser errors: ${errors.join("; ")}`);
      await context.close();
      console.log(`${width}x${height}: PASS — all eight F4 flows (contract fixtures)`);
    }
  } finally { await browser.close(); }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
