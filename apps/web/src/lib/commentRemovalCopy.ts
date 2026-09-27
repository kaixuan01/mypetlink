/**
 * What removing a top-level Comment does to its Replies, in words.
 *
 * Removing a Comment hides its whole Reply thread: the Replies stay stored but
 * are no longer shown to anyone. The copy says exactly that — never that the
 * Replies are deleted. A Reply has no thread of its own, so removing one needs
 * no warning, and a Comment without Replies keeps the plain message.
 *
 * The count is the one on screen when the dialog opens. It is informational:
 * the removal itself always follows the server.
 */

export type CommentRemovalAction = "delete" | "remove";

/** "1 reply", "3 replies". */
export function replyCountLabel(count: number): string {
  return `${count} ${count === 1 ? "reply" : "replies"}`;
}

function repliesToWarnAbout(replyCount: number | null | undefined): number {
  return typeof replyCount === "number" && replyCount > 0 ? replyCount : 0;
}

/** The confirmation message for deleting or removing a Comment or Reply on a Moment. */
export function commentRemovalMessage(
  action: CommentRemovalAction,
  isReply: boolean,
  replyCount: number | null | undefined,
): string {
  const replies = isReply ? 0 : repliesToWarnAbout(replyCount);
  if (replies === 0) return `This ${isReply ? "reply" : "comment"} will be permanently removed.`;

  if (action === "delete") {
    return `This comment will be permanently removed. ${replies === 1 ? "Its reply" : `Its ${replyCountLabel(replies)}`} will also no longer be shown.`;
  }

  return `This comment has ${replyCountLabel(replies)}. The comment and ${replies === 1 ? "its reply" : "its replies"} will no longer be shown.`;
}

/** The Admin removal warning for a top-level Comment with Replies, or null when there is nothing to warn about. */
export function adminReplyThreadImpact(replyCount: number | null | undefined): string | null {
  const replies = repliesToWarnAbout(replyCount);
  return replies === 0
    ? null
    : `This comment has ${replyCountLabel(replies)}. Removing the comment will also hide its reply thread.`;
}
