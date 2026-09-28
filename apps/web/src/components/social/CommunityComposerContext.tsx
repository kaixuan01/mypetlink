"use client";

import { createContext, useContext } from "react";

/**
 * Opens Community's Share a Moment composer from inside a page.
 *
 * The composer belongs to the shell (`AppLayout`), which mounts it above
 * whichever page is open, so the sidebar, the phone bar and any page all open
 * the same one. A page that offers "Share a Moment" asks for it here rather
 * than linking somewhere and hoping: the own-profile empty state once linked
 * to Home, which is not what its label promised.
 *
 * Null outside the signed-in shell. A caller renders no Share action then —
 * there is nothing to share into without an account.
 */
const CommunityComposerContext = createContext<(() => void) | null>(null);

export const CommunityComposerProvider = CommunityComposerContext.Provider;

export function useOpenCommunityComposer(): (() => void) | null {
  return useContext(CommunityComposerContext);
}
