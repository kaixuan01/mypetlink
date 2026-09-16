"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ownerLoginPath } from "@/lib/authRedirect";
import { ownerRoutes, socialRoutes } from "@/lib/routes";
import { getPets } from "@/services/petService";

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
  const [resolving, setResolving] = useState<"create" | "profile" | null>(null);

  /**
   * Share a Moment.
   *
   * With no pets there is nothing to write a Moment about, so the honest
   * destination is adding one — not an editor with an empty pet picker. With
   * one pet it opens that pet's editor directly; with several it opens Moments,
   * where the pet is chosen first and the editor's own multi-pet selector takes
   * over from there.
   */
  const openCreate = useCallback(async () => {
    setResolving("create");

    try {
      const response = await getPets();
      const pets = response.data ?? [];

      if (pets.length === 0) {
        router.push(ownerRoutes.petNew);
        return;
      }

      router.push(
        pets.length === 1
          ? ownerRoutes.petMomentNew(pets[0].id)
          : ownerRoutes.moments
      );
    } catch {
      router.push(ownerRoutes.moments);
    } finally {
      setResolving(null);
    }
  }, [router]);

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
    openOwnProfile,
    signInFor,
    resolving,
    socialHome: socialRoutes.feed,
  };
}
