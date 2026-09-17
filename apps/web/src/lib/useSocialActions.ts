"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ownerLoginPath } from "@/lib/authRedirect";
import { ownerRoutes, socialRoutes } from "@/lib/routes";

/**
 * The two navigation actions that cannot be a plain link.
 *
 * Both depend on something only the server knows — whether this owner has pets,
 * and whether they have claimed a handle — and both would be broken links if we
 * guessed. So they resolve when somebody actually presses them, which also
 * keeps the shell from making a social request on every route just in case.
 */
export function useSocialActions() {
  const router = useRouter();
  const [composerOpen, setComposerOpen] = useState(false);

  /**
   * Share a Moment.
   *
   * This used to be a navigation. It fetched the owner's pets and pushed them
   * into the Owner Portal — a pet's Moments page with one, the Moments index
   * with several, Add a pet with none — which meant pressing Share in a feed
   * dropped somebody out of Community and left them to find the way back. The
   * two contexts are different products: Community Share is writing something,
   * My Pets → Moments is managing an archive.
   *
   * It opens the composer in place instead, and the composer resolves the pets
   * itself. Nothing here needs the server any more, so nothing here waits.
   */
  const openCreate = useCallback(() => {
    setComposerOpen(true);
  }, []);

  const closeCreate = useCallback(() => {
    setComposerOpen(false);
  }, []);

  /**
   * My profile.
   *
   * An owner who has not set up a social identity has no /u/ address yet, and
   * sending them to one would be an invalid route. They go to the settings
   * section where they choose a handle instead.
   */
  /**
   * The owner's own profile, inside Community.
   *
   * This used to fetch the profile, work out the handle and push the owner to
   * the PUBLIC /u/{handle} page — which has no sidebar, no bottom bar and no
   * Community chrome, so opening your own profile felt like leaving the product
   * to look at yourself from outside. Worse, an owner who had not set Social up
   * was sent to Owner Settings, in the other half of the app entirely.
   *
   * It is now a plain navigation. The destination knows how to render itself,
   * including the not-set-up and switched-off cases, so there is nothing to
   * resolve first and nothing to wait for.
   */
  const openOwnProfile = useCallback(() => {
    router.push(ownerRoutes.socialProfile);
  }, [router]);

  /** For a signed-out visitor pressing a control that needs an account. */
  const signInFor = useCallback(
    (returnTo: string) => router.push(ownerLoginPath(returnTo)),
    [router]
  );

  return {
    openCreate,
    closeCreate,
    composerOpen,
    openOwnProfile,
    signInFor,
    socialHome: socialRoutes.feed,
  };
}
