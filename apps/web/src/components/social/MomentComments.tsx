"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { ownerLoginPath } from "@/lib/authRedirect";
import {
  clearCommentDraft,
  commentDraftStorage,
  hasCommentDraft,
  saveCommentDraft,
  takeCommentDraft,
} from "@/lib/commentDraftRecovery";
import { formatRelativeAge } from "@/lib/momentPublishedTime";
import {
  momentPath,
  ownerRoutes,
  ownerSocialProfilePath,
} from "@/lib/routes";
import {
  createMomentComment,
  deleteMomentComment,
  getMomentComments,
  MomentCommentError,
  type MomentComment,
  type MomentCommentViewer,
} from "@/services/momentCommentService";
import { readStoredAuthSession } from "@/services/authStorage";

type LoadState = "loading" | "ready" | "error" | "unavailable";

export function MomentComments({
  momentId,
  initialCount,
  onCountChange,
}: {
  momentId: string;
  initialCount: number;
  onCountChange: (count: number) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const menuTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const handledHashRef = useRef<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [items, setItems] = useState<MomentComment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [viewer, setViewer] = useState<MomentCommentViewer>({
    canComment: false,
    requirement: "signIn",
    identity: null,
  });
  const [count, setCount] = useState(initialCount);
  const [loadMorePending, setLoadMorePending] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [draftKept, setDraftKept] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<MomentComment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErrorId, setDeleteErrorId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  const updateCount = useCallback(
    (value: number) => {
      setCount(value);
      onCountChange(value);
    },
    [onCountChange]
  );

  useEffect(() => {
    let active = true;

    getMomentComments(momentId)
      .then((page) => {
        if (!active) return;
        // The API pages from the newest end; the conversation reads forward.
        setItems([...page.items].reverse());
        setNextCursor(page.nextCursor);
        setViewer(page.viewer);
        updateCount(page.commentCount);
        setLoadedAt(Date.now());
        // A Comment interrupted by an ended session comes back only to the
        // same account on the same Moment, and is never sent on its own.
        const storage = commentDraftStorage();
        if (page.viewer.canComment) {
          const restored = takeCommentDraft(storage, {
            momentId,
            userId: readStoredAuthSession()?.user.id,
          });
          if (restored) {
            setDraft(restored);
            setDraftRestored(true);
            setAnnouncement("Your unsent comment was restored.");
          }
        } else {
          setDraftKept(hasCommentDraft(storage, momentId));
        }
        setState("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState(
          error instanceof MomentCommentError && error.reason === "unavailable"
            ? "unavailable"
            : "error"
        );
      });

    return () => {
      active = false;
    };
  }, [momentId, reloadToken, updateCount]);

  useEffect(() => {
    if (state !== "ready" || typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#comment-") || handledHashRef.current === hash) return;

    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    handledHashRef.current = hash;
    requestAnimationFrame(() => target.scrollIntoView({ block: "center" }));
  }, [items, state]);

  const loadEarlier = useCallback(async () => {
    if (!nextCursor || loadMorePending) return;
    setLoadMorePending(true);
    setLoadMoreError(false);
    try {
      const page = await getMomentComments(momentId, nextCursor);
      const older = [...page.items].reverse();
      setItems((current) => {
        const existing = new Set(current.map((item) => item.id));
        return [...older.filter((item) => !existing.has(item.id)), ...current];
      });
      setNextCursor(page.nextCursor);
      setViewer(page.viewer);
      updateCount(page.commentCount);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadMorePending(false);
    }
  }, [loadMorePending, momentId, nextCursor, updateCount]);

  const submit = useCallback(async () => {
    if (posting || !draft.trim() || !viewer.canComment) return;
    setPosting(true);
    setComposerError(null);
    // Read before posting: an ended session is cleared on the way to the
    // error, and the draft must stay bound to the account that wrote it.
    const authorUserId = readStoredAuthSession()?.user.id ?? null;
    try {
      const result = await createMomentComment(momentId, draft);
      setItems((current) =>
        current.some((item) => item.id === result.comment.id)
          ? current
          : [...current, result.comment]
      );
      updateCount(result.commentCount);
      setDraft("");
      setDraftRestored(false);
      clearCommentDraft(commentDraftStorage());
      setAnnouncement("Comment posted.");
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (error) {
      if (error instanceof MomentCommentError) {
        setComposerError(error.message);
        if (error.reason === "session") {
          if (authorUserId) {
            setDraftKept(
              saveCommentDraft(commentDraftStorage(), {
                momentId,
                userId: authorUserId,
                body: draft,
              })
            );
          }
          setViewer({ canComment: false, requirement: "signIn", identity: null });
        } else if (error.reason === "community-profile") {
          setViewer({
            canComment: false,
            requirement: "communityProfile",
            identity: null,
          });
        } else if (error.reason === "unavailable") {
          setState("unavailable");
        }
      } else {
        setComposerError("We couldn’t post your comment. Please try again.");
      }
    } finally {
      setPosting(false);
    }
  }, [draft, momentId, posting, updateCount, viewer.canComment]);

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  };

  const confirmDelete = useCallback(async () => {
    if (!confirming || deleting) return;
    setDeleting(true);
    setDeleteErrorId(null);
    const index = items.findIndex((item) => item.id === confirming.id);
    const focusId = items[index + 1]?.id ?? items[index - 1]?.id ?? null;
    try {
      const result = await deleteMomentComment(momentId, confirming.id);
      const action = confirming.viewerDeleteAction;
      setItems((current) => current.filter((item) => item.id !== confirming.id));
      updateCount(result.commentCount);
      setConfirming(null);
      setMenuId(null);
      setAnnouncement(action === "remove" ? "Comment removed." : "Comment deleted.");
      requestAnimationFrame(() => {
        if (focusId) {
          document.getElementById(`comment-${focusId}`)?.focus();
        } else {
          headingRef.current?.focus();
        }
      });
    } catch {
      const triggerId = confirming.id;
      setDeleteErrorId(confirming.id);
      setConfirming(null);
      setMenuId(null);
      requestAnimationFrame(() => menuTriggerRefs.current.get(triggerId)?.focus());
    } finally {
      setDeleting(false);
    }
  }, [confirming, deleting, items, momentId, updateCount]);

  const loginHref = ownerLoginPath(`${momentPath(momentId)}#comments`);

  return (
    <section
      aria-busy={state === "loading"}
      className="brand-card mt-4 rounded-[1.5rem] p-4 sm:p-5"
      id="comments"
    >
      <h2
        className="text-lg font-black text-pet-ink outline-none"
        ref={headingRef}
        tabIndex={-1}
      >
        Comments <span className="text-pet-muted">· {count}</span>
      </h2>

      {state === "loading" ? <CommentSkeletons /> : null}

      {state === "error" ? (
        <div className="mt-4 rounded-2xl border border-pet-border bg-pet-cream p-4">
          <p className="text-sm font-bold text-pet-ink">We couldn’t load comments.</p>
          <button
            className="mt-3 min-h-11 rounded-full border border-pet-teal px-4 text-sm font-black text-pet-teal"
            onClick={() => {
              setState("loading");
              setReloadToken((value) => value + 1);
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {state === "unavailable" ? (
        <p className="mt-4 text-sm font-bold text-pet-muted">
          This Moment isn’t available any more.
        </p>
      ) : null}

      {state === "ready" ? (
        <>
          {nextCursor ? (
            <div className="mt-4">
              <button
                className="min-h-11 rounded-full border border-pet-border px-4 text-sm font-black text-pet-teal disabled:opacity-60"
                disabled={loadMorePending}
                onClick={loadEarlier}
                type="button"
              >
                {loadMorePending ? "Loading…" : "Show earlier comments"}
              </button>
              {loadMoreError ? (
                <p className="mt-2 text-sm font-bold text-pet-coral" role="alert">
                  We couldn’t load earlier comments. Please try again.
                </p>
              ) : null}
            </div>
          ) : null}

          {items.length === 0 ? (
            <p className="mt-5 text-sm font-semibold text-pet-muted">No comments yet.</p>
          ) : (
            <ol className="mt-4 space-y-4" data-testid="comment-list">
              {items.map((comment) => (
                <CommentRow
                  comment={comment}
                  deleteError={deleteErrorId === comment.id}
                  key={comment.id}
                  menuOpen={menuId === comment.id}
                  now={loadedAt}
                  onConfirm={() => setConfirming(comment)}
                  onMenu={() =>
                    setMenuId((current) => (current === comment.id ? null : comment.id))
                  }
                  setMenuTrigger={(element) => {
                    if (element) menuTriggerRefs.current.set(comment.id, element);
                    else menuTriggerRefs.current.delete(comment.id);
                  }}
                />
              ))}
            </ol>
          )}

          <div className="mt-5 border-t border-pet-border pt-4">
            {viewer.canComment ? (
              <div className="flex gap-3">
                <HouseholdAvatar author={viewer.identity} />
                <div className="min-w-0 flex-1">
                  <label className="text-sm font-black text-pet-ink" htmlFor="comment-body">
                    Add a comment
                  </label>
                  {draftRestored ? (
                    <p className="mt-1 text-sm font-semibold text-pet-muted">
                      Your unsent comment is back. Press Send when you’re ready.
                    </p>
                  ) : null}
                  <textarea
                    aria-describedby="comment-help comment-error"
                    aria-invalid={Boolean(composerError)}
                    className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-pet-border bg-white px-3 py-3 text-base font-semibold text-pet-ink outline-none focus:border-pet-teal"
                    disabled={posting}
                    id="comment-body"
                    maxLength={500}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={onComposerKeyDown}
                    ref={textareaRef}
                    value={draft}
                  />
                  <div className="mt-2 flex min-h-11 items-center justify-between gap-3">
                    <span className="text-xs font-bold text-pet-muted" id="comment-help">
                      {draft.length >= 400 ? `${draft.length} / 500` : "Ctrl or ⌘ + Enter to send"}
                    </span>
                    <button
                      className="min-h-11 rounded-full bg-pet-teal px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={posting || !draft.trim()}
                      onClick={() => void submit()}
                      type="button"
                    >
                      {posting ? "Posting…" : "Send"}
                    </button>
                  </div>
                  <p
                    className="mt-1 text-sm font-bold text-pet-coral"
                    id="comment-error"
                    role={composerError ? "alert" : undefined}
                  >
                    {composerError}
                  </p>
                </div>
              </div>
            ) : viewer.requirement === "communityProfile" ? (
              <Link
                className="inline-flex min-h-11 items-center rounded-full border border-pet-teal px-4 text-sm font-black text-pet-teal"
                href={ownerRoutes.socialProfile}
              >
                Set up your Community profile to comment
              </Link>
            ) : (
              <>
                {draftKept ? (
                  <p className="mb-3 text-sm font-semibold text-pet-muted">
                    We’ve kept your comment. Sign in to finish posting it.
                  </p>
                ) : null}
                <Link
                  className="inline-flex min-h-11 items-center rounded-full border border-pet-teal px-4 text-sm font-black text-pet-teal"
                  href={loginHref}
                >
                  Sign in to comment
                </Link>
              </>
            )}
          </div>
        </>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ConfirmDialog
        confirmDisabled={deleting}
        confirmLabel={
          deleting
            ? confirming?.viewerDeleteAction === "remove"
              ? "Removing…"
              : "Deleting…"
            : confirming?.viewerDeleteAction === "remove"
              ? "Remove comment"
              : "Delete comment"
        }
        destructive
        message="This comment will be permanently removed."
        onCancel={() => {
          const triggerId = confirming?.id;
          setConfirming(null);
          setMenuId(null);
          requestAnimationFrame(() => {
            if (triggerId) menuTriggerRefs.current.get(triggerId)?.focus();
          });
        }}
        onConfirm={() => void confirmDelete()}
        open={Boolean(confirming)}
        title={
          confirming?.viewerDeleteAction === "remove"
            ? "Remove this comment?"
            : "Delete your comment?"
        }
      />
    </section>
  );
}

function CommentRow({
  comment,
  now,
  menuOpen,
  deleteError,
  onMenu,
  onConfirm,
  setMenuTrigger,
}: {
  comment: MomentComment;
  now: number;
  menuOpen: boolean;
  deleteError: boolean;
  onMenu: () => void;
  onConfirm: () => void;
  setMenuTrigger: (element: HTMLButtonElement | null) => void;
}) {
  const action = comment.viewerDeleteAction === "remove" ? "Remove comment" : "Delete comment";

  return (
    <li
      className="flex scroll-mt-24 gap-3 outline-none"
      id={`comment-${comment.id}`}
      tabIndex={-1}
    >
      <HouseholdAvatar author={comment.author} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Link
              className="font-black text-pet-ink hover:text-pet-teal"
              href={ownerSocialProfilePath(comment.author.handle)}
            >
              {comment.author.displayName}
            </Link>
            <span className="ml-1 text-xs font-bold text-pet-muted">
              @{comment.author.handle}
            </span>
            <time className="ml-2 text-xs font-semibold text-pet-muted" dateTime={comment.createdAt}>
              {formatRelativeAge(comment.createdAt, now)}
            </time>
          </div>

          {comment.viewerDeleteAction ? (
            <div className="relative shrink-0">
              <button
                aria-expanded={menuOpen}
                aria-label={`Comment actions for ${comment.author.displayName}`}
                className="grid h-11 w-11 place-items-center rounded-full text-pet-muted hover:bg-pet-cream"
                onClick={onMenu}
                ref={setMenuTrigger}
                type="button"
              >
                <Icon className="h-5 w-5" name="more" />
              </button>
              {menuOpen ? (
                <div className="absolute right-0 z-20 min-w-40 rounded-xl border border-pet-border bg-white p-1 shadow-lg">
                  <button
                    className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-black text-pet-coral hover:bg-pet-cream"
                    onClick={onConfirm}
                    type="button"
                  >
                    {action}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="mt-1 whitespace-pre-line break-words text-sm font-semibold leading-6 text-pet-ink">
          {comment.body}
        </p>
        {deleteError ? (
          <p className="mt-1 text-sm font-bold text-pet-coral" role="alert">
            We couldn’t remove this comment. Please try again.
          </p>
        ) : null}
      </div>
    </li>
  );
}

function HouseholdAvatar({
  author,
}: {
  author: MomentCommentViewer["identity"];
}) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-cream">
      {author?.avatarThumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-full w-full object-cover" src={author.avatarThumbnailUrl} />
      ) : (
        <Icon aria-hidden="true" className="h-5 w-5 text-pet-muted" name="users" />
      )}
    </span>
  );
}

function CommentSkeletons() {
  return (
    <div className="mt-5 space-y-4" data-testid="comments-loading">
      {[0, 1, 2].map((item) => (
        <div className="flex gap-3" key={item}>
          <span className="h-11 w-11 shrink-0 rounded-full bg-pet-border/60" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-1/3 rounded-full bg-pet-border/60" />
            <span className="block h-3 w-4/5 rounded-full bg-pet-border/40" />
          </span>
        </div>
      ))}
      <span className="sr-only">Loading comments</span>
    </div>
  );
}
