"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { momentPath } from "@/lib/routes";

export function CommentAction({
  momentId,
  momentTitle,
  commentCount,
  inPage = false,
}: {
  momentId: string;
  momentTitle: string;
  commentCount: number;
  /**
   * On the Moment's own page the thread is already below: scroll to it
   * rather than adding a `#comments` history entry (see MomentComments for
   * why fragment entries on a Moment page are avoided).
   */
  inPage?: boolean;
}) {
  const label = `${commentCount} ${commentCount === 1 ? "comment" : "comments"}`;

  return (
    <Link
      aria-label={`Comments on ${momentTitle}. ${label}.`}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-extrabold text-pet-muted transition hover:bg-pet-cream hover:text-pet-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
      data-testid="moment-comment-action"
      href={`${momentPath(momentId)}#comments`}
      onClick={
        inPage
          ? (event) => {
              const section = document.getElementById("comments");
              if (!section) return;
              event.preventDefault();
              section.scrollIntoView({ block: "start" });
              document.getElementById("comments-heading")?.focus({ preventScroll: true });
            }
          : undefined
      }
    >
      <Icon aria-hidden="true" className="h-5 w-5" name="comment" />
      <span>{commentCount}</span>
    </Link>
  );
}
