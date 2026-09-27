import { describe, expect, it } from "vitest";
import { adminReplyThreadImpact, commentRemovalMessage, replyCountLabel } from "./commentRemovalCopy";

describe("commentRemovalCopy", () => {
  it("counts Replies in the singular and plural", () => {
    expect(replyCountLabel(1)).toBe("1 reply");
    expect(replyCountLabel(2)).toBe("2 replies");
  });

  it("keeps the plain message without Replies, for a Reply, and for an unknown count", () => {
    for (const action of ["delete", "remove"] as const) {
      expect(commentRemovalMessage(action, false, 0)).toBe("This comment will be permanently removed.");
      expect(commentRemovalMessage(action, false, undefined)).toBe("This comment will be permanently removed.");
      expect(commentRemovalMessage(action, false, null)).toBe("This comment will be permanently removed.");
      expect(commentRemovalMessage(action, true, 4)).toBe("This reply will be permanently removed.");
    }
  });

  it("says the thread stops being shown and never that Replies are deleted", () => {
    const messages = [
      commentRemovalMessage("delete", false, 1),
      commentRemovalMessage("delete", false, 5),
      commentRemovalMessage("remove", false, 1),
      commentRemovalMessage("remove", false, 5),
      adminReplyThreadImpact(1)!,
      adminReplyThreadImpact(5)!,
    ];
    expect(messages).toEqual([
      "This comment will be permanently removed. Its reply will also no longer be shown.",
      "This comment will be permanently removed. Its 5 replies will also no longer be shown.",
      "This comment has 1 reply. The comment and its reply will no longer be shown.",
      "This comment has 5 replies. The comment and its replies will no longer be shown.",
      "This comment has 1 reply. Removing the comment will also hide its reply thread.",
      "This comment has 5 replies. Removing the comment will also hide its reply thread.",
    ]);
    for (const message of messages) expect(message).not.toMatch(/repl(y|ies)[^.]*(deleted|permanently)/i);
  });

  it("has no Admin warning without Replies", () => {
    expect(adminReplyThreadImpact(0)).toBeNull();
    expect(adminReplyThreadImpact(null)).toBeNull();
    expect(adminReplyThreadImpact(undefined)).toBeNull();
  });
});
