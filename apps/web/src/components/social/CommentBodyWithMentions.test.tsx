// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CommentBodyWithMentions } from "@/components/social/CommentBodyWithMentions";
import type { MomentCommentMention } from "@/services/momentCommentService";

const household = {
  handle: "currenthandle",
  displayName: "The Current Family",
  avatarUrl: null,
  avatarThumbnailUrl: null,
};

function mention(start: number, length: number): MomentCommentMention {
  return { start, length, household };
}

afterEach(cleanup);

describe("CommentBodyWithMentions", () => {
  it("keeps plain Comments and unresolved @text as plain text", () => {
    render(<p><CommentBodyWithMentions body="Hello @unknown" /></p>);
    expect(screen.getByText("Hello @unknown")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders one mention using the saved text and current profile handle", () => {
    render(<p><CommentBodyWithMentions body="Hello @oldhandle!" mentions={[mention(6, 10)]} /></p>);
    const link = screen.getByRole("link", { name: "@oldhandle" });
    expect(link.getAttribute("href")).toBe("/u/currenthandle");
    expect(screen.getByText("Hello", { exact: false }).textContent).toBe("Hello @oldhandle!");
  });

  it("renders multiple out-of-order spans without changing punctuation or line breaks", () => {
    const body = "Hi @one,\nmeet @two.";
    render(
      <p><CommentBodyWithMentions body={body} mentions={[mention(14, 4), mention(3, 4)]} /></p>
    );
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["@one", "@two"]);
    expect(screen.getByText("Hi", { exact: false }).textContent).toBe(body);
  });

  it("uses browser UTF-16 offsets after emoji", () => {
    const body = "🐾 @oldhandle says hi";
    render(<p><CommentBodyWithMentions body={body} mentions={[mention(3, 10)]} /></p>);
    expect(screen.getByRole("link", { name: "@oldhandle" })).toBeTruthy();
    expect(screen.getByText("🐾", { exact: false }).textContent).toBe(body);
  });

  it("falls back to entirely plain text for malformed, out-of-bounds, or overlapping spans", () => {
    const cases: MomentCommentMention[][] = [
      [mention(-1, 4)],
      [mention(6, 99)],
      [mention(6, 10), mention(8, 3)],
    ];
    for (const mentions of cases) {
      const view = render(<p><CommentBodyWithMentions body="Hello @oldhandle" mentions={mentions} /></p>);
      expect(view.queryByRole("link")).toBeNull();
      expect(view.container.textContent).toBe("Hello @oldhandle");
      view.unmount();
    }
  });
});
