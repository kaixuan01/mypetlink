// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), replies: vi.fn(), create: vi.fn(), remove: vi.fn(), report: vi.fn(), block: vi.fn(), suggestions: vi.fn() }));
vi.mock("@/services/momentCommentService", async (original) => ({
  ...await original<typeof import("@/services/momentCommentService")>(),
  getMomentComments: mocks.get, getMomentReplies: mocks.replies,
  createMomentComment: mocks.create, deleteMomentComment: mocks.remove,
  getCommentMentionSuggestions: mocks.suggestions,
}));
vi.mock("@/services/communityReportService", async (original) => ({
  ...await original<typeof import("@/services/communityReportService")>(), submitCommunityReport: mocks.report,
}));
vi.mock("@/services/socialGraphService", async (original) => ({
  ...await original<typeof import("@/services/socialGraphService")>(), blockOwner: mocks.block,
}));

import { MomentComments } from "./MomentComments";
import { MomentCommentError, type MomentComment } from "@/services/momentCommentService";
import { COMMENT_DRAFT_STORAGE_KEY, saveCommentDraft } from "@/lib/commentDraftRecovery";

const parentId = "11111111-1111-4111-8111-111111111111";
const replyId = "22222222-2222-4222-8222-222222222222";
const amy = { handle: "amy", displayName: "Amy", avatarUrl: null, avatarThumbnailUrl: null };
const ben = { ...amy, handle: "ben", displayName: "Ben" };
const viewer = { canComment: true, requirement: null, identity: { ...amy, handle: "me", displayName: "My household" } };
const parent: MomentComment = { id: parentId, body: "Parent text", createdAt: "2026-09-20T10:00:00Z", author: amy, viewerDeleteAction: null, parentCommentId: null, replyCount: 2 };
const reply: MomentComment = { ...parent, id: replyId, body: "Earlier reply", author: ben, parentCommentId: parentId, replyCount: 0, createdAt: "2026-09-20T11:00:00Z" };
const later: MomentComment = { ...reply, id: "33333333-3333-4333-8333-333333333333", body: "Later reply", createdAt: "2026-09-20T12:00:00Z" };
const page = (items = [parent], commentCount = 3) => ({ items, nextCursor: null, commentCount, viewer });
const replyPage = (items = [reply, later], nextCursor: string | null = null, replyCount = 2) => ({ parentCommentId: parentId, items, nextCursor, replyCount });
function mount() { const count = vi.fn(); return { ...render(<MomentComments initialCount={3} momentId="moment-1" onCountChange={count} />), count }; }
async function expand() { fireEvent.click(await screen.findByRole("button", { name: "View 2 replies to Amy's comment" })); return screen.findByText("Earlier reply"); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function auth(userId = "account-1") {
  localStorage.setItem("mypetlink_api_auth_session", JSON.stringify({ accessToken: "test", refreshToken: "test", user: { id: userId } }));
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState({}, "", "/moments/moment-1");
  Element.prototype.scrollIntoView = vi.fn();
  mocks.get.mockResolvedValue(page());
  mocks.replies.mockResolvedValue(replyPage());
  mocks.suggestions.mockResolvedValue({ query: "ben", items: [{ household: ben, context: "commenter" }] });
  mocks.report.mockResolvedValue({});
  mocks.block.mockResolvedValue({ isBlockedByMe: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("One-level Reply threads", () => {
  it("preserves top-level chronology, expands an oldest-first nested list and caches collapse/reopen", async () => {
    mocks.get.mockResolvedValue(page([{ ...parent, id: "newer", body: "Newer parent", author: ben }, parent]));
    mount(); await expand();
    const list = screen.getByTestId("comment-list");
    expect(list.textContent!.indexOf("Parent text")).toBeLessThan(list.textContent!.indexOf("Newer parent"));
    const nested = screen.getByRole("list", { name: "Replies to Amy's comment" });
    expect(nested.closest("[data-testid=comment-row]")?.id).toBe(`comment-${parentId}`);
    expect(within(nested).getAllByTestId("reply-row").map((row) => row.id)).toEqual([`comment-${replyId}`, `comment-${later.id}`]);
    const hide = screen.getByRole("button", { name: "Hide replies to Amy's comment" });
    expect(hide.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(hide.getAttribute("aria-controls")!)).toBeTruthy();
    fireEvent.click(hide);
    expect(screen.queryByRole("list", { name: "Replies to Amy's comment" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "View 2 replies to Amy's comment" })[0]);
    expect(mocks.replies).toHaveBeenCalledTimes(1);
  });

  it("uses the additive contract to hide Reply controls against an old deployment", async () => {
    const legacy = { ...parent, parentCommentId: undefined, replyCount: undefined };
    mocks.get.mockResolvedValue(page([legacy])); mount();
    await screen.findByText("Parent text");
    expect(screen.queryByRole("button", { name: "Reply to Amy" })).toBeNull();
    expect(screen.queryByRole("button", { name: /View.*replies/ })).toBeNull();
  });

  it("offers Reply on a Comment with no Replies yet to every eligible viewer and posts to that Comment", async () => {
    const empty = { ...parent, replyCount: 0 };
    const roles: [string, MomentComment][] = [
      ["a signed-in viewer", { ...empty, viewerDeleteAction: null }],
      ["the Moment's author", { ...empty, viewerDeleteAction: "remove" }],
      ["the Comment's own author", { ...empty, author: viewer.identity, viewerDeleteAction: "delete" }],
    ];
    for (const [role, comment] of roles) {
      vi.resetAllMocks();
      auth();
      mocks.get.mockResolvedValue(page([comment], 1));
      mocks.create.mockResolvedValue({ comment: { ...reply, body: `Reply from ${role}` }, commentCount: 2, parentCommentId: parentId, parentReplyCount: 1 });
      mount();
      const action = await screen.findByRole("button", { name: `Reply to ${comment.author.displayName}` });
      expect(action.textContent, role).toBe("Reply");
      expect(screen.queryByRole("button", { name: /View.*replies/ }), role).toBeNull();
      fireEvent.click(action);
      fireEvent.change(await screen.findByLabelText("Add a reply"), { target: { value: `Reply from ${role}` } });
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      await waitFor(() => expect(mocks.create, role).toHaveBeenCalledWith("moment-1", `Reply from ${role}`, parentId));
      cleanup();
    }
  });

  it("warns that a Comment's Replies stop being shown with it, in the right number, and never says they are deleted", async () => {
    const cases: ["delete" | "remove", number, string, string][] = [
      ["delete", 0, "Delete your comment?", "This comment will be permanently removed."],
      ["delete", 1, "Delete your comment?", "This comment will be permanently removed. Its reply will also no longer be shown."],
      ["delete", 3, "Delete your comment?", "This comment will be permanently removed. Its 3 replies will also no longer be shown."],
      ["remove", 0, "Remove this comment?", "This comment will be permanently removed."],
      ["remove", 1, "Remove this comment?", "This comment has 1 reply. The comment and its reply will no longer be shown."],
      ["remove", 3, "Remove this comment?", "This comment has 3 replies. The comment and its replies will no longer be shown."],
    ];
    for (const [action, replyCount, title, message] of cases) {
      vi.resetAllMocks();
      mocks.get.mockResolvedValue(page([{ ...parent, replyCount, viewerDeleteAction: action }], 1 + replyCount));
      mount();
      fireEvent.click(await screen.findByRole("button", { name: "Comment actions for Amy" }));
      fireEvent.click(screen.getByRole("button", { name: `${action === "delete" ? "Delete" : "Remove"} comment` }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText(title), `${action} ${replyCount}`).toBeTruthy();
      expect(within(dialog).getByText(message), `${action} ${replyCount}`).toBeTruthy();
      expect(dialog.textContent).not.toMatch(/repl(y|ies)[^.]*(deleted|permanently)/i);
      cleanup();
    }
  });

  it("warns about nothing more when a single Reply is deleted", async () => {
    mocks.replies.mockResolvedValue(replyPage([{ ...reply, viewerDeleteAction: "remove" }, later]));
    mount(); await expand();
    fireEvent.click(screen.getAllByRole("button", { name: "Reply actions for Ben" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Remove reply" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Remove this reply?")).toBeTruthy();
    expect(within(dialog).getByText("This reply will be permanently removed.")).toBeTruthy();
  });

  it("tells each household the real reason it cannot comment or reply", async () => {
    const cases: [string, typeof viewer | { canComment: false; requirement: "signIn" | "communityProfile" | "communityRestricted"; identity: null }, string | null][] = [
      ["eligible", viewer, null],
      ["anonymous", { canComment: false, requirement: "signIn", identity: null }, "Sign in to comment"],
      ["no or switched-off Community profile", { canComment: false, requirement: "communityProfile", identity: null }, "Set up your Community profile to comment"],
      ["restricted", { canComment: false, requirement: "communityRestricted", identity: null }, "Community access is currently paused."],
    ];
    for (const [who, state, text] of cases) {
      vi.resetAllMocks();
      mocks.get.mockResolvedValue({ ...page(), viewer: state });
      mount();
      await screen.findByText("Parent text");
      if (text) expect(screen.getByText(text), who).toBeTruthy();
      else expect(screen.getByLabelText("Add a comment"), who).toBeTruthy();
      expect(Boolean(screen.queryByRole("button", { name: "Reply to Amy" })), who).toBe(state.canComment);
      if (who === "restricted") {
        expect(screen.queryByText(/Set up your Community profile|Sign in to comment/)).toBeNull();
        expect(screen.queryByLabelText("Add a comment")).toBeNull();
      }
      cleanup();
    }
  });

  it.each(["comment", "reply"] as const)("shows the paused message, not a setup prompt, when a %s is refused for a restriction", async (kind) => {
    auth();
    mocks.create.mockRejectedValue(new MomentCommentError("community-restricted", "Community access is currently paused."));
    mount();
    await screen.findByText("Parent text");
    if (kind === "reply") fireEvent.click(screen.getByRole("button", { name: "Reply to Amy" }));
    fireEvent.change(await screen.findByLabelText(kind === "reply" ? "Add a reply" : "Add a comment"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Community access is currently paused.")).toBeTruthy();
    expect(mocks.create.mock.calls[0].slice(0, 2)).toEqual(["moment-1", "Hello"]);
    expect(mocks.create.mock.calls[0][2] ?? null).toBe(kind === "reply" ? parentId : null);
    expect(screen.queryByText(/Set up your Community profile/)).toBeNull();
    expect(screen.queryByText(/Couldn’t post reply|couldn’t post your comment/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Reply to Amy" })).toBeNull();
  });

  it("keeps the parent usable during loading, announces completion and retries inline", async () => {
    const pending = deferred<ReturnType<typeof replyPage>>();
    mocks.replies.mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(replyPage());
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "View 2 replies to Amy's comment" }));
    expect(screen.getByText("Loading replies…")).toBeTruthy();
    expect(document.getElementById(`replies-${parentId}`)?.getAttribute("aria-busy")).toBe("true");
    await act(async () => pending.resolve(replyPage([reply], "next")));
    expect(screen.getByText("1 reply loaded.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View 1 more reply" }));
    expect(await screen.findByText("We couldn’t load replies.")).toBeTruthy();
    expect(screen.getByText("Parent text")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Later reply");
    expect(mocks.replies).toHaveBeenLastCalledWith("moment-1", parentId, "next");
  });

  it("keeps a new Reply after the paging control, merges older pages before it and deduplicates", async () => {
    mocks.get.mockResolvedValue(page([{ ...parent, replyCount: 30 }], 31));
    const ten = Array.from({ length: 10 }, (_, index) => ({ ...reply, id: `r-${index}`, body: `Reply ${index}`, createdAt: `2026-09-20T11:00:${String(index).padStart(2, "0")}Z` }));
    const newest = { ...later, id: "posted", body: "Newest reply", createdAt: "2026-09-21T00:00:00Z" };
    mocks.replies.mockResolvedValueOnce(replyPage(ten, "next", 30)).mockResolvedValueOnce(replyPage([later, newest], null, 31));
    mocks.create.mockResolvedValue({ comment: newest, commentCount: 32, parentCommentId: parentId, parentReplyCount: 31 });
    const { count } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "View 30 replies to Amy's comment" }));
    await screen.findByText("Reply 0");
    fireEvent.click(screen.getByRole("button", { name: "Reply to Amy" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Newest reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Reply posted.");
    const nested = screen.getByTestId("reply-list");
    expect(nested.textContent!.indexOf("View 20 more replies")).toBeLessThan(nested.textContent!.indexOf("Newest reply"));
    expect(count).toHaveBeenLastCalledWith(32);
    fireEvent.click(screen.getByRole("button", { name: "View 20 more replies" }));
    await screen.findByText("Later reply");
    expect(screen.getAllByText("Newest reply")).toHaveLength(1);
    expect(within(nested).getAllByTestId("reply-row").at(-1)?.textContent).toContain("Newest reply");
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it("reconciles cached rows when a subsequent public page reports fewer visible Replies", async () => {
    mocks.replies.mockResolvedValueOnce(replyPage([reply], "next", 2))
      .mockResolvedValueOnce(replyPage([later], null, 1)).mockResolvedValueOnce(replyPage([later], null, 1));
    mocks.get.mockResolvedValueOnce(page()).mockResolvedValueOnce(page([{ ...parent, replyCount: 1 }], 2));
    const { count } = mount(); await expand();
    fireEvent.click(screen.getByRole("button", { name: "View 1 more reply" }));
    await screen.findByText("Later reply");
    expect(screen.queryByText("Earlier reply")).toBeNull();
    expect(mocks.replies).toHaveBeenCalledTimes(3);
    expect(count).toHaveBeenLastCalledWith(2);
  });

  it("discards the whole thread and refreshes counts when its parent becomes unavailable", async () => {
    mocks.replies.mockResolvedValueOnce(replyPage([reply], "next"))
      .mockRejectedValueOnce(new MomentCommentError("parent-unavailable", "This comment is no longer available."));
    mocks.get.mockResolvedValueOnce(page()).mockResolvedValueOnce(page([], 0));
    const { count } = mount(); await expand();
    fireEvent.click(screen.getByRole("button", { name: "View 1 more reply" }));
    await screen.findByText("No comments yet.");
    expect(screen.queryByText("Earlier reply")).toBeNull();
    await waitFor(() => expect(count).toHaveBeenLastCalledWith(0));
  });
});

describe("One movable composer", () => {
  it("preserves both drafts when switching targets, cancels without posting and restores focus", async () => {
    mocks.get.mockResolvedValue(page([parent, { ...parent, id: "other", author: ben, body: "Other parent", replyCount: 0 }]));
    mount();
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "Top draft" } });
    const trigger = screen.getByRole("button", { name: "Reply to Amy" });
    fireEvent.click(trigger);
    expect(screen.getByRole("combobox")).toHaveProperty("value", "");
    expect(screen.getByText("Reply to Amy")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Reply draft" } });
    fireEvent.click(within(document.getElementById("comment-other")!).getByRole("button", { name: "Reply to Ben" }));
    expect(screen.getByRole("combobox")).toHaveProperty("value", "Reply draft");
    expect(screen.getAllByTestId("active-comment-composer")).toHaveLength(1);
    expect(screen.getByTestId("active-comment-composer").closest("[data-testid=comment-row]")?.id).toBe("comment-other");
    fireEvent.click(screen.getByRole("button", { name: "Cancel reply" }));
    expect(screen.getByRole("combobox")).toHaveProperty("value", "Top draft");
    await waitFor(() => expect(document.activeElement).toBe(within(document.getElementById("comment-other")!).getByRole("button", { name: "Reply to Ben" })));
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    expect(screen.getByRole("combobox")).toHaveProperty("value", "");
  });

  it("Reply-to-Reply prefills a non-self handle, posts to the root and never adds another depth", async () => {
    mocks.create.mockResolvedValue({ comment: later, commentCount: 4, parentReplyCount: 3 });
    mount(); await expand();
    fireEvent.click(within(screen.getAllByTestId("reply-row")[0]).getByRole("button", { name: "Reply to Ben" }));
    expect(screen.getByText("Replying to @ben")).toBeTruthy();
    expect(screen.getByRole("combobox")).toHaveProperty("value", "@ben ");
    expect(screen.getByTestId("active-comment-composer").closest("[data-testid=reply-row]")).toBeNull();
    expect(screen.getByTestId("active-comment-composer").parentElement?.className).toContain("ml-11");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "@ben Thanks" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Reply posted.");
    expect(mocks.create).toHaveBeenCalledWith("moment-1", "@ben Thanks", parentId);
  });

  it.each(["typed", "removed"])("never overwrites a %s draft or reinserts a deleted prefill", async (mode) => {
    mount(); await expand();
    fireEvent.click(screen.getByRole("button", { name: "Reply to Amy" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: mode === "typed" ? "Keep this" : "@ben " } });
    if (mode === "removed") fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    fireEvent.click(within(screen.getAllByTestId("reply-row")[0]).getByRole("button", { name: "Reply to Ben" }));
    expect(screen.getByRole("combobox")).toHaveProperty("value", mode === "typed" ? "Keep this" : "");
  });

  it("does not prefill a self Reply", async () => {
    mocks.replies.mockResolvedValue(replyPage([{ ...reply, author: viewer.identity }]));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "View 2 replies to Amy's comment" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reply to My household" }));
    expect(screen.getByRole("combobox")).toHaveProperty("value", "");
  });

  it("uses existing autocomplete in Reply mode; Escape dismisses suggestions and target changes clear stale results", async () => {
    mocks.get.mockResolvedValue(page([parent, { ...parent, id: "other", author: ben, replyCount: 0 }]));
    mount(); await screen.findByRole("combobox");
    fireEvent.click(screen.getByRole("button", { name: "Reply to Amy" }));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "@be", selectionStart: 3 } });
    await screen.findByRole("option");
    expect(mocks.suggestions).toHaveBeenCalledWith("moment-1", "be");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel reply" })).toBeTruthy();
    fireEvent.click(within(document.getElementById("comment-other")!).getByRole("button", { name: "Reply to Ben" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("combobox")).toHaveProperty("value", "@be");
  });

  it.each(["parent-unavailable", "parent-invalid", "rate-limit", "community-profile", "forbidden", "error"] as const)("keeps Reply text after %s", async (reason) => {
    mocks.create.mockRejectedValue(new MomentCommentError(reason, reason === "error" ? "raw" : "This comment is no longer available."));
    mount(); await screen.findByRole("combobox");
    fireEvent.click(screen.getByRole("button", { name: "Reply to Amy" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Unsent reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    if (reason === "community-profile") {
      await screen.findByRole("link", { name: "Set up your Community profile to comment" });
    } else {
      await screen.findByRole("alert");
      expect(screen.getByRole("combobox")).toHaveProperty("value", "Unsent reply");
    }
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});

describe("Reply session recovery", () => {
  it("stores a session-interrupted Reply with its root, target, account and top-level draft", async () => {
    auth(); mocks.create.mockRejectedValue(new MomentCommentError("session", "Sign in again."));
    mount(); await expand();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Top draft" } });
    fireEvent.click(within(screen.getAllByTestId("reply-row")[0]).getByRole("button", { name: "Reply to Ben" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "@ben My reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("We’ve kept your reply. Sign in to finish posting it.");
    expect(JSON.parse(sessionStorage.getItem(COMMENT_DRAFT_STORAGE_KEY)!)).toMatchObject({ momentId: "moment-1", userId: "account-1", parentCommentId: parentId, replyToCommentId: replyId, body: "@ben My reply", topLevelBody: "Top draft" });
  });

  it("restores only as a Reply after public parent validation, preserving the separate Comment draft", async () => {
    auth(); saveCommentDraft(sessionStorage, { momentId: "moment-1", userId: "account-1", body: "Recovered reply", parentCommentId: parentId, replyToCommentId: replyId, topLevelBody: "Top draft" });
    mount();
    expect(await screen.findByRole("combobox", { name: "Add a reply" })).toHaveProperty("value", "Recovered reply");
    expect(screen.getByText("Replying to @ben")).toBeTruthy();
    expect(sessionStorage.getItem(COMMENT_DRAFT_STORAGE_KEY)).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel reply" }));
    expect(screen.getByRole("combobox", { name: "Add a comment" })).toHaveProperty("value", "Top draft");
  });

  it.each(["hidden", "other-moment"])("drops a %s parent instead of restoring its Reply as a Comment", async () => {
    auth(); saveCommentDraft(sessionStorage, { momentId: "moment-1", userId: "account-1", body: "Do not promote", parentCommentId: "absent", topLevelBody: "Top draft" });
    mount();
    await screen.findByText("The comment you were replying to is no longer available.");
    expect(screen.getByRole("combobox")).toHaveProperty("value", "Top draft");
    expect(screen.queryByText("Do not promote")).toBeNull();
    expect(mocks.get).toHaveBeenLastCalledWith("moment-1", undefined, { anchor: "absent" });
    expect(mocks.replies).not.toHaveBeenCalled();
  });

  it("drops a stored Reply from a different account", async () => {
    auth("account-2"); saveCommentDraft(sessionStorage, { momentId: "moment-1", userId: "account-1", body: "Private draft", parentCommentId: parentId });
    mount(); expect(await screen.findByRole("combobox")).toHaveProperty("value", "");
    expect(sessionStorage.getItem(COMMENT_DRAFT_STORAGE_KEY)).toBeNull();
    expect(mocks.replies).not.toHaveBeenCalled();
  });

  it("rechecks the total and drops the Reply when its parent disappears during recovery", async () => {
    auth(); saveCommentDraft(sessionStorage, { momentId: "moment-1", userId: "account-1", body: "Do not promote", parentCommentId: parentId });
    mocks.get.mockResolvedValueOnce(page()).mockResolvedValueOnce(page([], 0));
    mocks.replies.mockRejectedValue(new MomentCommentError("parent-unavailable", "This comment is no longer available."));
    const { count } = mount();
    await screen.findByText("The comment you were replying to is no longer available.");
    expect(screen.queryByTestId("comment-row")).toBeNull();
    expect(screen.getByRole("combobox")).toHaveProperty("value", "");
    expect(count).toHaveBeenLastCalledWith(0);
    expect(mocks.get).toHaveBeenLastCalledWith("moment-1");
  });
});

describe("Reply actions and anchors", () => {
  it("refreshes the public thread after Block and clears cached Replies without client privacy filtering", async () => {
    mocks.get.mockResolvedValueOnce(page()).mockResolvedValueOnce(page([{ ...parent, replyCount: 0 }], 1));
    const { count } = mount(); await expand();
    fireEvent.click(within(screen.getAllByTestId("reply-row")[0]).getByRole("button", { name: "Reply actions for Ben" }));
    fireEvent.click(screen.getByRole("button", { name: "Report reply" }));
    fireEvent.click(screen.getByRole("radio", { name: "Spam or scam" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    fireEvent.click(await screen.findByRole("button", { name: "Block Ben" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Block Ben?" })).getByRole("button", { name: "Block" }));
    await waitFor(() => expect(count).toHaveBeenLastCalledWith(1));
    expect(screen.queryByText("Earlier reply")).toBeNull();
    expect(screen.queryByTestId("reply-row")).toBeNull();
    expect(screen.getByText("Parent text")).toBeTruthy();
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("does not let an older top-level page overwrite the total returned by a Reply write", async () => {
    const pending = deferred<ReturnType<typeof page>>();
    mocks.get.mockResolvedValueOnce({ ...page(), nextCursor: "older" }).mockReturnValueOnce(pending.promise);
    mocks.create.mockResolvedValue({ comment: { ...later, id: "posted" }, commentCount: 4, parentReplyCount: 3 });
    const { count } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Show earlier comments" }));
    fireEvent.click(screen.getByRole("button", { name: "Reply to Amy" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Reply posted.");
    await act(async () => pending.resolve(page([], 3)));
    expect(count).toHaveBeenLastCalledWith(4);
    expect(screen.getByRole("heading", { name: "Comments · 4" })).toBeTruthy();
  });
  it.each([
    ["Reply author", ben, "delete", false],
    ["Moment author", viewer.identity, "remove", true],
    ["collaborator", viewer.identity, null, true],
    ["parent author", amy, null, true],
    ["viewer", viewer.identity, null, true],
  ] as const)("uses API action permissions for %s", async (_role, identity, action, reportVisible) => {
    mocks.get.mockResolvedValue({ ...page(), viewer: { ...viewer, identity } });
    mocks.replies.mockResolvedValue(replyPage([{ ...reply, viewerDeleteAction: action }]));
    mount(); await expand();
    fireEvent.click(within(screen.getAllByTestId("reply-row")[0]).getByRole("button", { name: "Reply actions for Ben" }));
    expect(Boolean(screen.queryByRole("button", { name: "Report reply" }))).toBe(reportVisible);
    expect(Boolean(screen.queryByRole("button", { name: "Delete reply" }))).toBe(action === "delete");
    expect(Boolean(screen.queryByRole("button", { name: "Remove reply" }))).toBe(action === "remove");
  });

  it.each(["delete", "remove"] as const)("confirms %s Reply, removes its row, updates authoritative counts and keeps the parent", async (action) => {
    mocks.replies.mockResolvedValue(replyPage([{ ...reply, viewerDeleteAction: action }, later]));
    mocks.remove.mockResolvedValue({ commentId: replyId, parentCommentId: parentId, parentReplyCount: 1, commentCount: 2 });
    const { count } = mount(); await expand();
    fireEvent.click(within(screen.getAllByTestId("reply-row")[0]).getByRole("button", { name: "Reply actions for Ben" }));
    const label = `${action === "delete" ? "Delete" : "Remove"} reply`;
    fireEvent.click(screen.getByRole("button", { name: label }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: label }));
    await waitFor(() => expect(screen.queryByText("Earlier reply")).toBeNull());
    expect(screen.getByText("Parent text")).toBeTruthy();
    expect(count).toHaveBeenLastCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "Hide replies to Amy's comment" }));
    expect(screen.getByRole("button", { name: "View 1 reply to Amy's comment" })).toHaveProperty("textContent", "View 1 reply");
    expect(mocks.remove).toHaveBeenCalledWith("moment-1", replyId);
  });

  it("reports a Reply through the shared Comment target dialog", async () => {
    mount(); await expand();
    fireEvent.click(within(screen.getAllByTestId("reply-row")[0]).getByRole("button", { name: "Reply actions for Ben" }));
    fireEvent.click(screen.getByRole("button", { name: "Report reply" }));
    const dialog = screen.getByRole("dialog", { name: "Report reply" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Spam or scam" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Submit report" }));
    await screen.findByText("Report received");
    expect(mocks.report).toHaveBeenCalledWith({ targetType: "comment", target: replyId, reason: "SpamOrScam", details: "" });
  });

  it("allows anonymous expansion without write or action controls", async () => {
    mocks.get.mockResolvedValue({ ...page(), viewer: { canComment: false, requirement: "signIn", identity: null } });
    mount(); await expand();
    expect(screen.queryByRole("button", { name: /^Reply to/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /actions for/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in to comment" })).toBeTruthy();
  });

  it("expands a Reply anchor, focuses and highlights it while preserving return navigation", async () => {
    window.history.replaceState({}, "", `/moments/moment-1?returnTo=%2Fnotifications#comment-${replyId}`);
    mocks.get.mockResolvedValue({ ...page(), anchorParentCommentId: parentId });
    mount(); await screen.findByText("Earlier reply");
    await waitFor(() => expect(document.activeElement?.id).toBe(`comment-${replyId}`));
    expect(document.activeElement?.getAttribute("data-highlighted")).toBe("true");
    expect(mocks.get).toHaveBeenCalledWith("moment-1", undefined, { anchor: replyId });
    expect(mocks.replies).toHaveBeenCalledWith("moment-1", parentId, undefined, { anchor: replyId });
    expect(window.location.search).toBe("?returnTo=%2Fnotifications");
    expect(window.location.hash).toBe("");
  });

  it("silently falls back for an inaccessible Reply anchor", async () => {
    window.history.replaceState({}, "", `/moments/moment-1#comment-${replyId}`);
    mount(); await screen.findByText("Parent text");
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(mocks.replies).not.toHaveBeenCalled();
    expect(screen.queryByText(/reply deleted|Reply not found/i)).toBeNull();
    expect(screen.queryByTestId("reply-row")).toBeNull();
  });

  it("does not resurrect a deleted Reply from a concurrent page or overwrite write counts", async () => {
    const pending = deferred<ReturnType<typeof replyPage>>();
    mocks.replies.mockResolvedValueOnce(replyPage([{ ...reply, viewerDeleteAction: "delete" }], "next", 2)).mockReturnValueOnce(pending.promise);
    mocks.remove.mockResolvedValue({ commentId: replyId, parentCommentId: parentId, parentReplyCount: 1, commentCount: 2 });
    mount(); await expand();
    fireEvent.click(screen.getByRole("button", { name: "View 1 more reply" }));
    fireEvent.click(screen.getByRole("button", { name: "Reply actions for Ben" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete reply" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete reply" }));
    await waitFor(() => expect(screen.queryByText("Earlier reply")).toBeNull());
    await act(async () => pending.resolve(replyPage([reply, later], null, 2)));
    expect(screen.queryByText("Earlier reply")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hide replies to Amy's comment" }));
    expect(screen.getByRole("button", { name: "View 1 reply to Amy's comment" })).toBeTruthy();
  });
});
