"use client";

import Link from "next/link";
import { FollowButton } from "@/components/social/FollowButton";
import { Icon } from "@/components/ui/Icon";
import { ownerSocialProfilePath } from "@/lib/routes";
import {
  noRelationship,
  type OwnerRelationship,
  type SocialAccountSummary,
} from "@/services/socialGraphService";

type SocialAccountListProps = {
  accounts: SocialAccountSummary[];
  emptyMessage: string;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Applied after the server confirms, so a row never shows an unsaved state. */
  onFollowChange: (handle: string, isFollowing: boolean) => void;
  signedIn: boolean | null;
};

/**
 * A page of households, used by both the followers and the following lists.
 *
 * Each row carries its own Follow control so the list is somewhere you can
 * actually act, not just read. Rows show a name, a handle and a picture and
 * nothing else — a followers list is not a directory of people, and anything
 * more here would make it one.
 */
export function SocialAccountList({
  accounts,
  emptyMessage,
  hasMore,
  loadingMore,
  onLoadMore,
  onFollowChange,
  signedIn,
}: SocialAccountListProps) {
  if (accounts.length === 0) {
    return (
      <p
        className="mt-6 rounded-[1.5rem] border border-pet-border bg-white p-6 text-center text-sm font-semibold text-pet-muted"
        data-testid="social-account-list-empty"
      >
        {emptyMessage}
      </p>
    );
  }

  return (
    <>
      <ul className="mt-4 space-y-2" data-testid="social-account-list">
        {accounts.map((account) => (
          <li
            className="flex min-w-0 items-center gap-3 rounded-[1.5rem] border border-pet-border bg-white p-3"
            key={account.handle}
          >
            <Link
              className="flex min-w-0 flex-1 items-center gap-3"
              href={ownerSocialProfilePath(account.handle)}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-cream">
                {account.avatarThumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    className="h-full w-full object-cover"
                    src={account.avatarThumbnailUrl}
                  />
                ) : (
                  <Icon className="h-5 w-5 text-pet-muted" name="users" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-pet-ink">
                  {account.displayName}
                </span>
                <span className="block truncate text-xs font-bold text-pet-muted">
                  @{account.handle}
                </span>
              </span>
            </Link>

            <div className="shrink-0">
              <FollowButton
                displayName={account.displayName}
                handle={account.handle}
                onChange={(relationship) =>
                  onFollowChange(account.handle, relationship.isFollowing)
                }
                relationship={rowRelationship(account)}
                signedIn={signedIn}
              />
            </div>
          </li>
        ))}
      </ul>

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-6 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="social-account-list-more"
            disabled={loadingMore}
            onClick={onLoadMore}
            type="button"
          >
            {loadingMore ? "Loading…" : "Show more"}
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * A listing gives only what a row needs: whether this is you and whether you
 * already follow them. Counts belong to a profile, not to a row, and nothing
 * here displays one.
 */
function rowRelationship(account: SocialAccountSummary): OwnerRelationship {
  return {
    ...noRelationship,
    isSelf: account.isSelf,
    isFollowing: account.isFollowing,
    // A listing does not carry each household's follow settings, and fetching
    // them per row would be a request per row. Offer the control and let the
    // API have the final word: a refusal rolls the button back with its own
    // message, which is the same path any other refusal takes.
    canFollow: !account.isSelf,
    allowsFollowers: !account.isSelf,
  };
}
