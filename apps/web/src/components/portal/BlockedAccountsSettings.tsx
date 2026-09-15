"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormSection } from "@/components/ui/FormSection";
import { Icon } from "@/components/ui/Icon";
import { ownerSocialProfilePath } from "@/lib/routes";
import { isApiClientError } from "@/services/apiClient";
import { isApiConfigured } from "@/services/apiConfig";
import {
  getBlockedAccounts,
  unblockOwner,
  type SocialAccountSummary,
} from "@/services/socialGraphService";

/**
 * Where a block can be undone.
 *
 * Blocking someone is reversible everywhere else in the product only if you
 * still have their link: their profile stays reachable and its menu offers
 * Unblock. But search deliberately hides accounts you have blocked, so without
 * this list the single route back is remembering a handle forever. That is the
 * gap this closes, and the reason it is a plain list and not a moderation tool.
 *
 * It answers one question — who have I blocked — and never the reverse. Nothing
 * here, and nothing anywhere, tells someone that they were blocked.
 */
export function BlockedAccountsSettings() {
  const [accounts, setAccounts] = useState<SocialAccountSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  // Settled before the first paint when there is nothing to fetch: the mock
  // fallback has no social graph, and a spinner for a request that will never
  // be made is a lie.
  const [state, setState] = useState<"loading" | "ready" | "error">(() =>
    isApiConfigured() ? "loading" : "ready"
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirming, setConfirming] = useState<SocialAccountSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isApiConfigured()) {
      return;
    }

    let active = true;

    getBlockedAccounts()
      .then((page) => {
        if (!active) return;

        setAccounts(page.items);
        setNextCursor(page.nextCursor);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });

    return () => {
      active = false;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);

    try {
      const page = await getBlockedAccounts(nextCursor);
      setAccounts((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch {
      setNextCursor(nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  const unblock = useCallback(async (account: SocialAccountSummary) => {
    setPending(true);
    setError("");

    try {
      await unblockOwner(account.handle);
      setAccounts((current) =>
        current.filter((item) => item.handle !== account.handle)
      );
      setConfirming(null);
    } catch (caught) {
      setError(
        isApiClientError(caught)
          ? caught.message
          : "We couldn't update this. Please try again."
      );
    } finally {
      setPending(false);
    }
  }, []);

  // A settings page that has never been used for blocking should not grow a
  // section about it. Nothing is shown until there is something to show.
  if (state === "ready" && accounts.length === 0) {
    return null;
  }

  return (
    <FormSection
      description="People you've blocked can't see your profile or your Moments, and you won't see theirs. Your pets' Safety Profiles are not affected."
      id="blocked-accounts"
      title="Blocked accounts"
    >
      {state === "loading" ? (
        <p aria-busy="true" className="text-sm font-semibold text-pet-muted">
          Loading…
        </p>
      ) : null}

      {state === "error" ? (
        <p className="text-sm font-semibold text-pet-muted">
          We couldn&rsquo;t load this list right now. Please try again in a moment.
        </p>
      ) : null}

      {accounts.length > 0 ? (
        <ul className="space-y-2" data-testid="blocked-accounts-list">
          {accounts.map((account) => (
            <li
              className="flex min-w-0 items-center gap-3 rounded-[1.25rem] border border-pet-border bg-white p-3"
              key={account.handle || account.displayName}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-cream">
                {account.avatarThumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    className="h-full w-full object-cover"
                    src={account.avatarThumbnailUrl}
                  />
                ) : (
                  <Icon className="h-4 w-4 text-pet-muted" name="users" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-pet-ink">
                  {account.displayName}
                </span>
                {account.handle ? (
                  <a
                    className="block truncate text-xs font-bold text-pet-muted transition hover:text-pet-ink"
                    href={ownerSocialProfilePath(account.handle)}
                  >
                    @{account.handle}
                  </a>
                ) : null}
              </span>

              <button
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
                onClick={() => {
                  setError("");
                  setConfirming(account);
                }}
                type="button"
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {nextCursor ? (
        <div className="mt-4">
          <button
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-2 text-sm font-bold text-pet-ink transition hover:bg-pet-cream disabled:opacity-60"
            disabled={loadingMore}
            onClick={loadMore}
            type="button"
          >
            {loadingMore ? "Loading…" : "Show more"}
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        cancelLabel="Keep blocked"
        confirmDisabled={pending}
        confirmLabel="Unblock"
        message={
          confirming
            ? `${confirming.displayName} will be able to see your profile and Moments again. They will not start following you again on their own.`
            : ""
        }
        onCancel={() => {
          if (!pending) {
            setConfirming(null);
            setError("");
          }
        }}
        onConfirm={() => confirming && void unblock(confirming)}
        open={confirming !== null}
        title={confirming ? `Unblock ${confirming.displayName}?` : ""}
      >
        {error ? (
          <p
            className="text-sm font-bold text-[#a63c2e]"
            data-testid="blocked-accounts-error"
            role="status"
          >
            {error}
          </p>
        ) : null}
      </ConfirmDialog>
    </FormSection>
  );
}
