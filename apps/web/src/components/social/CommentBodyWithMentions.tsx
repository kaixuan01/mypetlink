import Link from "next/link";
import { ownerSocialProfilePath } from "@/lib/routes";
import type { MomentCommentMention } from "@/services/momentCommentService";

/**
 * Renders only the identity spans the API resolved when the Comment was saved.
 * The visible token always comes from the immutable body while the destination
 * uses the household's current handle, so a rename cannot rewrite history or
 * leave a stale profile link behind.
 */
export function CommentBodyWithMentions({
  body,
  mentions = [],
}: {
  body: string;
  mentions?: MomentCommentMention[];
}) {
  const ordered = [...mentions].sort(
    (left, right) => left.start - right.start || left.length - right.length
  );

  // A malformed response must never crash a public thread or link text the API
  // did not unambiguously identify. Falling back for the whole body is the
  // conservative choice for overlapping spans: both claims touch that text.
  if (!validMentionSpans(body, ordered)) return <>{body}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  ordered.forEach((mention, index) => {
    if (mention.start > cursor) parts.push(body.slice(cursor, mention.start));
    const end = mention.start + mention.length;
    parts.push(
      <Link
        className="rounded-sm font-black text-pet-teal underline decoration-pet-teal/40 underline-offset-2 hover:decoration-pet-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
        href={ownerSocialProfilePath(mention.household.handle)}
        key={`${mention.start}-${mention.length}-${index}`}
      >
        {body.slice(mention.start, end)}
      </Link>
    );
    cursor = end;
  });

  if (cursor < body.length) parts.push(body.slice(cursor));
  return <>{parts}</>;
}

function validMentionSpans(body: string, mentions: MomentCommentMention[]) {
  let cursor = 0;
  for (const mention of mentions) {
    const end = mention.start + mention.length;
    if (
      !Number.isInteger(mention.start) ||
      !Number.isInteger(mention.length) ||
      mention.start < cursor ||
      mention.start < 0 ||
      mention.length <= 1 ||
      end > body.length ||
      body[mention.start] !== "@" ||
      !mention.household?.handle
    ) {
      return false;
    }
    cursor = end;
  }
  return true;
}
