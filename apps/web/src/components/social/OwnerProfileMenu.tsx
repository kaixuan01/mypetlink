"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import {
  getCurrentLocalDestination,
  ownerLoginPath,
} from "@/lib/authRedirect";
import { ownerSocialProfilePath } from "@/lib/routes";
import { isApiClientError } from "@/services/apiClient";
import {
  blockOwner,
  unblockOwner,
  type OwnerRelationship,
} from "@/services/socialGraphService";

type OwnerProfileMenuProps = {
  handle: string;
  displayName: string;
  relationship: OwnerRelationship;
  onChange: (relationship: OwnerRelationship) => void;
  signedIn: boolean | null;
  /** Test seam; production falls back to a normal same-origin login navigation. */
  onAuthenticationRequired?: (loginPath: string) => void;
};

/**
 * The quiet actions on a household's profile.
 *
 * Blocking lives here rather than beside Follow on purpose: it is rare, it is
 * heavy, and a prominent Block button invites misreading as a normal social
 * gesture. It is one step behind a menu and one step behind a confirmation.
 *
 * The confirmation says what blocking does NOT do, because the thing most
 * likely to frighten an owner is the fear that a social argument could cut off
 * the person who finds their lost pet. It cannot: Safety Profiles are a
 * different system and are untouched by anything here.
 */
export function OwnerProfileMenu({
  handle,
  displayName,
  relationship,
  onChange,
  signedIn,
  onAuthenticationRequired = navigateToLogin,
}: OwnerProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<"block" | "unblock" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const run = useCallback(
    async (action: "block" | "unblock") => {
      setPending(true);
      setError(null);

      try {
        const confirmed =
          action === "block"
            ? await blockOwner(handle)
            : await unblockOwner(handle);
        onChange(confirmed);
        setConfirming(null);
      } catch (caught) {
        if (isApiClientError(caught) && caught.status === 401) {
          setConfirming(null);
          setOpen(false);
          onAuthenticationRequired(
            ownerLoginPath(
              getCurrentLocalDestination(ownerSocialProfilePath(handle))
            )
          );
          return;
        }

        setError(
          isApiClientError(caught)
            ? caught.message
            : "We couldn't update this. Please try again."
        );
      } finally {
        setPending(false);
      }
    },
    [handle, onAuthenticationRequired, onChange]
  );

  if (signedIn === null || relationship.isSelf) {
    return null;
  }

  const blocked = relationship.hasBlocked;
  const signedOut = signedIn === false;

  return (
    <>
      <div className="relative">
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`More options for ${displayName}`}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-pet-border bg-white text-pet-muted transition hover:bg-pet-cream focus:outline-none focus:ring-2 focus:ring-pet-teal"
          data-testid="owner-profile-menu-trigger"
          onClick={() => setOpen((current) => !current)}
          ref={triggerRef}
          type="button"
        >
          <Icon className="h-4 w-4" name="more" />
        </button>

        {open ? (
          <div
            aria-label={`Options for ${displayName}`}
            className="absolute right-0 z-40 mt-2 w-56 rounded-2xl border border-pet-border bg-white p-1.5 shadow-xl"
            data-testid="owner-profile-menu"
            ref={menuRef}
            role="menu"
          >
            {signedOut ? (
              <Link
                className="flex min-h-10 w-full items-center rounded-xl px-3 text-left text-sm font-bold text-pet-ink transition hover:bg-pet-cream focus:bg-pet-cream focus:outline-none"
                data-testid="owner-profile-block-signin"
                href={ownerLoginPath(
                  getCurrentLocalDestination(ownerSocialProfilePath(handle))
                )}
                onClick={() => setOpen(false)}
                role="menuitem"
              >
                Sign in to block @{handle}
              </Link>
            ) : (
              <button
                className="flex min-h-10 w-full items-center rounded-xl px-3 text-left text-sm font-bold text-pet-ink transition hover:bg-pet-cream focus:bg-pet-cream focus:outline-none"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                  setConfirming(blocked ? "unblock" : "block");
                }}
                role="menuitem"
                type="button"
              >
                {blocked ? `Unblock @${handle}` : `Block @${handle}`}
              </button>
            )}
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        cancelLabel="Keep as is"
        confirmDisabled={pending}
        confirmLabel={confirming === "unblock" ? "Unblock" : "Block"}
        destructive={confirming === "block"}
        message={
          confirming === "unblock"
            ? `${displayName} will be able to see your profile and Moments again. They will not start following you again on their own.`
            : `${displayName} won't be able to see your profile or your Moments, and you won't see theirs. If either of you follows the other, that stops now.`
        }
        onCancel={() => {
          if (!pending) {
            setConfirming(null);
            setError(null);
          }
        }}
        onConfirm={() => confirming && void run(confirming)}
        open={confirming !== null}
        title={
          confirming === "unblock"
            ? `Unblock ${displayName}?`
            : `Block ${displayName}?`
        }
      >
        <div className="space-y-3">
          {confirming === "block" ? (
            <p className="rounded-2xl bg-pet-cream p-3 text-sm font-semibold leading-6 text-pet-ink">
              This only affects sharing. Your pets&rsquo; Safety Profiles keep
              working exactly as they are, so anyone who finds a lost pet can
              still reach you.
            </p>
          ) : null}

          {error ? (
            <p
              className="text-sm font-bold text-[#a63c2e]"
              data-testid="owner-profile-menu-error"
              role="status"
            >
              {error}
            </p>
          ) : null}
        </div>
      </ConfirmDialog>
    </>
  );
}

function navigateToLogin(path: string) {
  window.location.assign(path);
}
