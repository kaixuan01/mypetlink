/**
 * Keeps one unsent Comment across a sign-in, and only across a sign-in.
 *
 * A draft is written here for exactly one reason: the account's session ended
 * while the reader was posting it. It is never written while someone is simply
 * typing, never sent anywhere, and never put in a URL — the sign-in return
 * carries only `/moments/{id}#comments`.
 *
 * Tab-scoped `sessionStorage`, one slot, a short lifetime, and bound to both the
 * Moment and the account that wrote it: a different Moment never receives it,
 * and a different account signing in on the same tab never sees it. Restoring
 * consumes it, so it cannot come back a second time.
 */

export const COMMENT_DRAFT_STORAGE_KEY = "mypetlink_comment_draft_v1";
export const COMMENT_DRAFT_MAX_AGE_MS = 30 * 60 * 1000;
const MAX_BODY_LENGTH = 500;

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredCommentDraft = {
  momentId: string;
  userId: string;
  body: string;
  savedAt: string;
};

/** The tab's session storage, or null where the browser refuses it. */
export function commentDraftStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveCommentDraft(
  storage: DraftStorage | null,
  draft: { momentId: string; userId: string; body: string },
  now = new Date()
) {
  const body = draft.body.slice(0, MAX_BODY_LENGTH);

  if (!storage || !draft.momentId || !draft.userId || !body.trim()) {
    return false;
  }

  try {
    storage.setItem(
      COMMENT_DRAFT_STORAGE_KEY,
      JSON.stringify({
        momentId: draft.momentId,
        userId: draft.userId,
        body,
        savedAt: now.toISOString(),
      } satisfies StoredCommentDraft)
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns and removes the draft saved for this Moment by this account.
 *
 * A stale, unreadable or other-account draft is discarded. A draft for a
 * different Moment is left alone for that Moment and not returned here.
 */
export function takeCommentDraft(
  storage: DraftStorage | null,
  target: { momentId: string; userId: string | null | undefined },
  now = new Date()
) {
  if (!storage || !target.userId) {
    return null;
  }

  try {
    const raw = storage.getItem(COMMENT_DRAFT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredCommentDraft>;
    const savedAt = new Date(parsed.savedAt ?? "").getTime();
    const age = now.getTime() - savedAt;

    if (
      typeof parsed.momentId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.body !== "string" ||
      !parsed.body.trim() ||
      !Number.isFinite(savedAt) ||
      age < 0 ||
      age > COMMENT_DRAFT_MAX_AGE_MS ||
      parsed.userId !== target.userId
    ) {
      storage.removeItem(COMMENT_DRAFT_STORAGE_KEY);
      return null;
    }

    if (parsed.momentId !== target.momentId) {
      return null;
    }

    storage.removeItem(COMMENT_DRAFT_STORAGE_KEY);
    return parsed.body.slice(0, MAX_BODY_LENGTH);
  } catch {
    try {
      storage.removeItem(COMMENT_DRAFT_STORAGE_KEY);
    } catch {
      // Storage that refuses to read may refuse to write too.
    }
    return null;
  }
}

/** Whether a recoverable draft is waiting for this Moment (read-only). */
export function hasCommentDraft(storage: DraftStorage | null, momentId: string) {
  if (!storage) return false;

  try {
    const raw = storage.getItem(COMMENT_DRAFT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<StoredCommentDraft>;
    return parsed.momentId === momentId && Boolean(parsed.body?.trim());
  } catch {
    return false;
  }
}

export function clearCommentDraft(storage: DraftStorage | null) {
  try {
    storage?.removeItem(COMMENT_DRAFT_STORAGE_KEY);
  } catch {
    // Nothing to clean up in storage the browser will not open.
  }
}
