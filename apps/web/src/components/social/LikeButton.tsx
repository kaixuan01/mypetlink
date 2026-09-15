"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ownerLoginPath } from "@/lib/authRedirect";
import { isApiClientError } from "@/services/apiClient";
import { likeMoment, unlikeMoment } from "@/services/momentLikeService";

type LikeButtonProps = {
  momentId: string;
  /** Named in the accessible label so a grid of hearts is not a grid of "Like". */
  momentTitle: string;
  likeCount: number;
  viewerHasLiked: boolean;
  /** Null until the signed-in check has run. */
  signedIn: boolean | null;
  onChange: (state: { likeCount: number; viewerHasLiked: boolean }) => void;
  className?: string;
};

/**
 * The heart on a Moment.
 *
 * Updates optimistically and rolls back if the request is refused, so a tap
 * answers instantly but the button never settles on a state the server did not
 * agree to. The count beside it is the Moment's, computed from the like rows.
 *
 * A signed-out visitor gets the way in rather than a control that cannot work:
 * the heart becomes a link to sign in, returning to this page afterwards.
 */
export function LikeButton({
  momentId,
  momentTitle,
  likeCount,
  viewerHasLiked,
  signedIn,
  onChange,
  className = "",
}: LikeButtonProps) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  // Remembered against the Moment it belongs to, so a recycled button in a grid
  // never shows another Moment's failure.
  const [failure, setFailure] = useState<{
    momentId: string;
    message: string;
  } | null>(null);

  const submit = useCallback(async () => {
    if (pending) {
      return;
    }

    const previous = { likeCount, viewerHasLiked };

    setPending(true);
    setFailure(null);
    onChange({
      viewerHasLiked: !viewerHasLiked,
      likeCount: Math.max(0, likeCount + (viewerHasLiked ? -1 : 1)),
    });

    try {
      const confirmed = viewerHasLiked
        ? await unlikeMoment(momentId)
        : await likeMoment(momentId);

      onChange({
        likeCount: confirmed.likeCount,
        viewerHasLiked: confirmed.viewerHasLiked,
      });
    } catch (caught) {
      onChange(previous);
      setFailure({
        momentId,
        message: isApiClientError(caught)
          ? caught.message
          : "We couldn't update this. Please try again.",
      });
    } finally {
      setPending(false);
    }
  }, [likeCount, momentId, onChange, pending, viewerHasLiked]);

  const countLabel = likeCount === 1 ? "1 like" : `${likeCount} likes`;

  if (signedIn === false) {
    return (
      <Link
        aria-label={`Sign in to like ${momentTitle}. ${countLabel}.`}
        className={`${baseClass} ${className}`}
        data-testid="like-button-signin"
        href={ownerLoginPath(pathname || "/")}
      >
        <Icon aria-hidden="true" className="h-4 w-4" name="heart" />
        <span className="tabular-nums">{likeCount}</span>
      </Link>
    );
  }

  const error = failure?.momentId === momentId ? failure.message : null;

  return (
    <span className={`inline-flex flex-col items-start gap-0.5 ${className}`}>
      <button
        aria-label={
          viewerHasLiked
            ? `Remove your like from ${momentTitle}. ${countLabel}.`
            : `Like ${momentTitle}. ${countLabel}.`
        }
        aria-pressed={viewerHasLiked}
        className={`${baseClass} like-button ${
          viewerHasLiked ? "text-pet-coral" : "text-pet-muted hover:text-pet-ink"
        }`}
        data-liked={viewerHasLiked ? "true" : "false"}
        data-testid="like-button"
        disabled={pending || signedIn === null}
        onClick={submit}
        type="button"
      >
        <Icon
          aria-hidden="true"
          className="like-heart h-4 w-4"
          fill={viewerHasLiked ? "currentColor" : "none"}
          name="heart"
        />
        <span className="tabular-nums" data-testid="like-count">
          {likeCount}
        </span>
      </button>

      {error ? (
        <span
          className="text-xs font-semibold text-[#a63c2e]"
          data-testid="like-button-error"
          role="status"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}

const baseClass =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 py-1 text-sm font-bold text-pet-muted transition hover:bg-pet-cream disabled:cursor-not-allowed disabled:opacity-60";
