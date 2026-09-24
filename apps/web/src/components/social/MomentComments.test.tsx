// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/services/momentCommentService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/momentCommentService")
  >("@/services/momentCommentService");
  return {
    ...actual,
    getMomentComments: (...args: unknown[]) => mocks.get(...args),
    createMomentComment: (...args: unknown[]) => mocks.create(...args),
    deleteMomentComment: (...args: unknown[]) => mocks.remove(...args),
  };
});

import { MomentComments } from "@/components/social/MomentComments";
import { MomentCommentError } from "@/services/momentCommentService";

const author = {
  handle: "limfamily",
  displayName: "The Lim Family",
  avatarUrl: null,
  avatarThumbnailUrl: null,
};

const older = {
  id: "comment-1",
  body: "First comment",
  createdAt: "2026-09-20T10:00:00Z",
  author,
  viewerDeleteAction: "delete" as const,
};

const newer = {
  ...older,
  id: "comment-2",
  body: "Second comment",
  createdAt: "2026-09-20T11:00:00Z",
};

beforeEach(() => {
  window.history.replaceState({}, "", "/moments/moment-1");
  mocks.get.mockResolvedValue({
    // API order is newest first.
    items: [newer, older],
    nextCursor: null,
    commentCount: 2,
    viewer: { canComment: false, requirement: "signIn", identity: null },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Moment Comments", () => {
  it("shows skeletons, then conversation order and an anonymous sign-in return", async () => {
    render(<MomentComments initialCount={2} momentId="moment-1" onCountChange={vi.fn()} />);

    expect(screen.getByTestId("comments-loading")).toBeTruthy();
    const list = await screen.findByTestId("comment-list");
    expect(list.textContent?.indexOf("First comment")).toBeLessThan(
      list.textContent?.indexOf("Second comment") ?? 0
    );
    const signIn = screen.getByRole("link", { name: "Sign in to comment" });
    expect(decodeURIComponent(signIn.getAttribute("href") ?? "")).toContain(
      "/moments/moment-1#comments"
    );
  });

  it("shows an empty state for a loaded thread with no comments", async () => {
    mocks.get.mockResolvedValue({
      items: [],
      nextCursor: null,
      commentCount: 0,
      viewer: { canComment: false, requirement: "signIn", identity: null },
    });

    render(<MomentComments initialCount={0} momentId="moment-1" onCountChange={vi.fn()} />);

    expect(await screen.findByText("No comments yet.")).toBeTruthy();
  });

  it("retries an initial load failure", async () => {
    mocks.get
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        items: [],
        nextCursor: null,
        commentCount: 0,
        viewer: { canComment: false, requirement: "signIn", identity: null },
      });

    render(<MomentComments initialCount={0} momentId="moment-1" onCountChange={vi.fn()} />);
    await screen.findByText("We couldn’t load comments.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("No comments yet.")).toBeTruthy();
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("keeps loaded rows after an earlier-page error and prepends a retry", async () => {
    mocks.get
      .mockResolvedValueOnce({
        items: [newer],
        nextCursor: "older-cursor",
        commentCount: 2,
        viewer: { canComment: false, requirement: "signIn", identity: null },
      })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        items: [older],
        nextCursor: null,
        commentCount: 2,
        viewer: { canComment: false, requirement: "signIn", identity: null },
      });

    render(<MomentComments initialCount={2} momentId="moment-1" onCountChange={vi.fn()} />);
    const showEarlier = await screen.findByRole("button", {
      name: "Show earlier comments",
    });
    fireEvent.click(showEarlier);
    await screen.findByText("We couldn’t load earlier comments. Please try again.");
    expect(screen.getByText("Second comment")).toBeTruthy();

    fireEvent.click(showEarlier);
    const list = await screen.findByTestId("comment-list");
    await waitFor(() => expect(screen.getByText("First comment")).toBeTruthy());
    expect(list.textContent?.indexOf("First comment")).toBeLessThan(
      list.textContent?.indexOf("Second comment") ?? 0
    );
  });

  it("offers Community profile setup when the signed-in identity is incomplete", async () => {
    mocks.get.mockResolvedValue({
      items: [],
      nextCursor: null,
      commentCount: 0,
      viewer: { canComment: false, requirement: "communityProfile", identity: null },
    });

    render(<MomentComments initialCount={0} momentId="moment-1" onCountChange={vi.fn()} />);

    const setup = await screen.findByRole("link", {
      name: "Set up your Community profile to comment",
    });
    expect(setup.getAttribute("href")).toBe("/community/profile");
  });

  it("keeps a failed draft and clears it only after a successful post", async () => {
    mocks.get.mockResolvedValue({
      items: [],
      nextCursor: null,
      commentCount: 0,
      viewer: { canComment: true, requirement: null, identity: author },
    });
    mocks.create
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ comment: newer, commentCount: 1 });

    render(<MomentComments initialCount={0} momentId="moment-1" onCountChange={vi.fn()} />);
    const textarea = await screen.findByLabelText("Add a comment");
    fireEvent.change(textarea, { target: { value: "My draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("We couldn’t post your comment. Please try again.");
    expect((textarea as HTMLTextAreaElement).value).toBe("My draft");

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe(""));
    expect(screen.getByText("Second comment")).toBeTruthy();
  });

  it("disables empty and duplicate submissions and shows the near-limit count", async () => {
    mocks.get.mockResolvedValue({
      items: [],
      nextCursor: null,
      commentCount: 0,
      viewer: { canComment: true, requirement: null, identity: author },
    });
    let resolveCreate!: (value: {
      comment: typeof newer;
      commentCount: number;
    }) => void;
    mocks.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );

    render(<MomentComments initialCount={0} momentId="moment-1" onCountChange={vi.fn()} />);
    const textarea = await screen.findByLabelText("Add a comment");
    const send = screen.getByRole("button", { name: "Send" });
    expect((send as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(textarea, { target: { value: "x".repeat(400) } });
    expect(screen.getByText("400 / 500")).toBeTruthy();
    fireEvent.click(send);
    expect(screen.getByRole("button", { name: "Posting…" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Posting…" }));
    expect(mocks.create).toHaveBeenCalledTimes(1);

    resolveCreate({ comment: newer, commentCount: 1 });
    await screen.findByText("Second comment");
  });

  describe("a session that ends mid-comment", () => {
    const signedInViewer = {
      canComment: true,
      requirement: null,
      identity: author,
    };

    function signIn(userId: string) {
      window.localStorage.setItem(
        "mypetlink_api_auth_session",
        JSON.stringify({
          accessToken: "access",
          refreshToken: "refresh",
          expiresAt: Date.now() + 60_000,
          user: { id: userId, email: "a@b.local", displayName: "A", roles: ["Owner"], status: "Active" },
        })
      );
    }

    afterEach(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    async function expireWhilePosting(text: string) {
      signIn("user-1");
      mocks.get.mockResolvedValue({ items: [], nextCursor: null, commentCount: 0, viewer: signedInViewer });
      mocks.create.mockImplementationOnce(async () => {
        // apiClient clears the stored session before the 401 reaches us.
        window.localStorage.removeItem("mypetlink_api_auth_session");
        throw new MomentCommentError("session", "Sign in to comment.");
      });

      const view = render(
        <MomentComments initialCount={0} momentId="moment-1" onCountChange={vi.fn()} />
      );
      fireEvent.change(await screen.findByLabelText("Add a comment"), { target: { value: text } });
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      await screen.findByRole("link", { name: "Sign in to comment" });
      return view;
    }

    it("keeps the draft through sign-in without putting it in the URL", async () => {
      await expireWhilePosting("This is my comment");

      expect(screen.getByText("We’ve kept your comment. Sign in to finish posting it.")).toBeTruthy();
      const href = screen.getByRole("link", { name: "Sign in to comment" }).getAttribute("href") ?? "";
      expect(decodeURIComponent(href)).toContain("/moments/moment-1#comments");
      expect(href).not.toContain("This");
      expect(window.location.href).not.toContain("This");
      expect(window.sessionStorage.getItem("mypetlink_comment_draft_v1")).toContain("This is my comment");
    });

    it("restores the draft after the same account returns, and never sends it by itself", async () => {
      const first = await expireWhilePosting("This is my comment");
      first.unmount();
      mocks.create.mockClear();

      signIn("user-1");
      render(<MomentComments initialCount={0} momentId="moment-1" onCountChange={vi.fn()} />);

      const textarea = (await screen.findByLabelText("Add a comment")) as HTMLTextAreaElement;
      expect(textarea.value).toBe("This is my comment");
      expect(screen.getByText("Your unsent comment is back. Press Send when you’re ready.")).toBeTruthy();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(mocks.create).not.toHaveBeenCalled();
      // Consumed: a reload does not bring it back a second time.
      expect(window.sessionStorage.getItem("mypetlink_comment_draft_v1")).toBeNull();
    });

    it("clears the draft once it is sent deliberately", async () => {
      const first = await expireWhilePosting("Send me later");
      first.unmount();
      mocks.create.mockClear();

      signIn("user-1");
      mocks.create.mockResolvedValueOnce({
        comment: { ...newer, id: "comment-9", body: "Send me later" },
        commentCount: 1,
      });
      render(<MomentComments initialCount={0} momentId="moment-1" onCountChange={vi.fn()} />);
      const textarea = (await screen.findByLabelText("Add a comment")) as HTMLTextAreaElement;
      await waitFor(() => expect(textarea.value).toBe("Send me later"));
      fireEvent.click(screen.getByRole("button", { name: "Send" }));

      await screen.findByText("Send me later");
      expect(mocks.create).toHaveBeenCalledTimes(1);
      expect(textarea.value).toBe("");
      expect(window.sessionStorage.getItem("mypetlink_comment_draft_v1")).toBeNull();
    });

    it("does not give the draft to a different Moment", async () => {
      const first = await expireWhilePosting("Only for moment one");
      first.unmount();

      signIn("user-1");
      render(<MomentComments initialCount={0} momentId="moment-2" onCountChange={vi.fn()} />);
      const textarea = (await screen.findByLabelText("Add a comment")) as HTMLTextAreaElement;
      expect(textarea.value).toBe("");
      expect(window.sessionStorage.getItem("mypetlink_comment_draft_v1")).toContain("Only for moment one");
    });

    it("does not give the draft to a different account", async () => {
      const first = await expireWhilePosting("Private words");
      first.unmount();

      signIn("user-2");
      render(<MomentComments initialCount={0} momentId="moment-1" onCountChange={vi.fn()} />);
      const textarea = (await screen.findByLabelText("Add a comment")) as HTMLTextAreaElement;
      expect(textarea.value).toBe("");
      expect(window.sessionStorage.getItem("mypetlink_comment_draft_v1")).toBeNull();
    });
  });

  it("replaces the composer with an unavailable state after a safe 404", async () => {
    mocks.get.mockResolvedValue({
      items: [],
      nextCursor: null,
      commentCount: 0,
      viewer: { canComment: true, requirement: null, identity: author },
    });
    mocks.create.mockRejectedValue(
      new MomentCommentError("unavailable", "This Moment isn’t available any more.")
    );

    render(<MomentComments initialCount={0} momentId="moment-1" onCountChange={vi.fn()} />);
    const textarea = await screen.findByLabelText("Add a comment");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("This Moment isn’t available any more.")).toBeTruthy();
    expect(screen.queryByLabelText("Add a comment")).toBeNull();
  });

  it("requires confirmation and removes an authorized comment", async () => {
    mocks.remove.mockResolvedValue({ commentId: older.id, commentCount: 1 });
    render(<MomentComments initialCount={2} momentId="moment-1" onCountChange={vi.fn()} />);

    await screen.findByText("First comment");
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Comment actions for The Lim Family",
      })[0]
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Delete comment" })
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete comment",
      })
    );

    await waitFor(() => expect(screen.queryByText("First comment")).toBeNull());
    expect(mocks.remove).toHaveBeenCalledWith("moment-1", "comment-1");
    await waitFor(() =>
      expect(document.activeElement?.id).toBe("comment-comment-2")
    );
  });

  it("returns focus to the row action when confirmation is cancelled", async () => {
    render(<MomentComments initialCount={2} momentId="moment-1" onCountChange={vi.fn()} />);

    await screen.findByText("First comment");
    const trigger = screen.getAllByRole("button", {
      name: "Comment actions for The Lim Family",
    })[0];
    trigger.focus();
    fireEvent.click(trigger);
    const action = screen.getByRole("button", { name: "Delete comment" });
    action.focus();
    fireEvent.click(action);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" })
    );

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("uses Remove copy for the Moment owner and keeps the row on failure", async () => {
    mocks.get.mockResolvedValue({
      items: [{ ...older, viewerDeleteAction: "remove" }],
      nextCursor: null,
      commentCount: 1,
      viewer: { canComment: true, requirement: null, identity: author },
    });
    mocks.remove.mockRejectedValue(new Error("offline"));
    render(<MomentComments initialCount={1} momentId="moment-1" onCountChange={vi.fn()} />);

    await screen.findByText("First comment");
    fireEvent.click(
      screen.getByRole("button", { name: "Comment actions for The Lim Family" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove comment" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove comment",
      })
    );

    expect(await screen.findByText("We couldn’t remove this comment. Please try again.")).toBeTruthy();
    expect(screen.getByText("First comment")).toBeTruthy();
  });

  it("links the household author and hides destructive controls from unrelated viewers", async () => {
    mocks.get.mockResolvedValue({
      items: [{ ...older, viewerDeleteAction: null }],
      nextCursor: null,
      commentCount: 1,
      viewer: { canComment: false, requirement: "signIn", identity: null },
    });

    render(<MomentComments initialCount={1} momentId="moment-1" onCountChange={vi.fn()} />);

    const authorLink = await screen.findByRole("link", { name: "The Lim Family" });
    expect(authorLink.getAttribute("href")).toBe("/u/limfamily");
    expect(
      screen.queryByRole("button", { name: "Comment actions for The Lim Family" })
    ).toBeNull();
  });
});
