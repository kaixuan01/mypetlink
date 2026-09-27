"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CommentBodyWithMentions } from "@/components/social/CommentBodyWithMentions";
import { CommentMentionComposer } from "@/components/social/CommentMentionComposer";
import { CommunityReportDialog } from "@/components/social/CommunityReportDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { ownerLoginPath } from "@/lib/authRedirect";
import { commentRemovalMessage } from "@/lib/commentRemovalCopy";
import {
  clearCommentDraft,
  commentDraftStorage,
  hasCommentDraft,
  saveCommentDraft,
  takeCommentDraftContext,
} from "@/lib/commentDraftRecovery";
import { formatRelativeAge } from "@/lib/momentPublishedTime";
import { useDismissableMenu } from "@/lib/useDismissableMenu";
import {
  momentPath,
  ownerRoutes,
  ownerSocialProfilePath,
} from "@/lib/routes";
import {
  createMomentComment,
  deleteMomentComment,
  getMomentComments,
  getMomentReplies,
  supportsCommentReplies,
  linkedCommentId,
  MomentCommentError,
  type MomentComment,
  type MomentCommentViewer,
} from "@/services/momentCommentService";
import { readStoredAuthSession } from "@/services/authStorage";

type LoadState = "loading" | "ready" | "error" | "unavailable";

type ReplyTarget = {
  parentId: string;
  target: MomentComment;
  isReply: boolean;
};
type ReplyThread = {
  expanded: boolean;
  items: MomentComment[];
  posted: MomentComment[];
  nextCursor: string | null;
  loaded: boolean;
  loading: boolean;
  error: boolean;
};
const emptyThread = (): ReplyThread => ({
  expanded: true,
  items: [],
  posted: [],
  nextCursor: null,
  loaded: false,
  loading: false,
  error: false,
});
function mergeComments(items: MomentComment[], added: MomentComment[]) {
  return [...new Map([...items, ...added].map((comment) => [comment.id, comment])).values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function MomentComments({
  momentId,
  initialCount,
  onCountChange,
}: {
  momentId: string;
  initialCount: number;
  onCountChange: (count: number) => void;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const replyTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const replyRequests = useRef(new Set<string>());
  const writeRevision = useRef(new Map<string, number>());
  const countRevision = useRef(0);
  const removedIds = useRef(new Set<string>());
  const generation = useRef(0);
  const postingRef = useRef(false);
  const replyDraftTouched = useRef(false);
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
  const [replyDraft, setReplyDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [replyUnavailable, setReplyUnavailable] = useState(false);
  const [threads, setThreads] = useState<Record<string, ReplyThread>>({});
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const [posting, setPosting] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [draftKept, setDraftKept] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<MomentComment | null>(null);
  const [reporting, setReporting] = useState<MomentComment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErrorId, setDeleteErrorId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
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
    generation.current += 1;
    replyRequests.current.clear();
    const revision = countRevision.current;

    // A `#comment-{id}` link asks the first page to reach down to that
    // Comment; the API bounds how far, and ignores anything this viewer
    // cannot already see.
    const anchor =
      typeof window === "undefined" ? null : linkedCommentId(window.location.hash);

    getMomentComments(momentId, undefined, { anchor })
      .then(async (loaded) => {
        if (!active) return;
        let page = loaded;
        const restored = page.viewer.canComment ? takeCommentDraftContext(commentDraftStorage(), {
          momentId, userId: readStoredAuthSession()?.user.id,
        }) : null;
        if (restored?.parentCommentId && !page.items.some((item) => item.id === restored.parentCommentId)) {
          try { page = await getMomentComments(momentId, undefined, { anchor: restored.parentCommentId }); }
          catch { /* A saved parent is never promoted into a Comment. */ }
          if (!active) return;
        }
        const freshThreads: Record<string, ReplyThread> = {};
        const anchorParent = page.anchorParentCommentId ?? restored?.parentCommentId;
        const parent = page.items.find((item) => item.id === anchorParent && supportsCommentReplies(item));
        let restoredTarget: MomentComment | undefined;
        if (parent) {
          try {
            const replies = await getMomentReplies(momentId, parent.id, undefined, { anchor: page.anchorParentCommentId ? anchor : restored?.replyToCommentId });
            if (!active) return;
            freshThreads[parent.id] = { ...emptyThread(), items: replies.items, nextCursor: replies.nextCursor, loaded: true };
            page = { ...page, items: page.items.map((item) => item.id === parent.id ? { ...item, replyCount: replies.replyCount } : item) };
            restoredTarget = replies.items.find((item) => item.id === restored?.replyToCommentId);
          } catch (error) {
            if (!active) return;
            if (error instanceof MomentCommentError && error.reason === "parent-unavailable") {
              page = { ...page, items: page.items.filter((item) => item.id !== parent.id) };
              try {
                const latest = await getMomentComments(momentId);
                if (!active) return;
                page = { ...latest, items: latest.items.filter((item) => item.id !== parent.id) };
              } catch {
                // Keep the parent hidden even if the total cannot be rechecked.
              }
            } else freshThreads[parent.id] = { ...emptyThread(), error: true };
          }
        }
        if (!active) return;
        setThreads(freshThreads);
        setLoadMorePending(false);
        setLoadMoreError(false);
        // The API pages from the newest end; the conversation reads forward.
        setItems([...page.items].reverse());
        setNextCursor(page.nextCursor);
        setViewer(page.viewer);
        if (revision === countRevision.current) updateCount(page.commentCount);
        setLoadedAt(Date.now());
        // A Comment interrupted by an ended session comes back only to the
        // same account on the same Moment, and is never sent on its own.
        const storage = commentDraftStorage();
        if (page.viewer.canComment) {
          if (restored) {
            if (restored.parentCommentId) {
              setDraft(restored.topLevelBody);
              const visibleParent = page.items.find((item) => item.id === restored.parentCommentId && supportsCommentReplies(item));
              if (visibleParent) {
                setReplyTarget({ parentId: visibleParent.id, target: restoredTarget ?? visibleParent, isReply: Boolean(restoredTarget) });
                setReplyDraft(restored.body);
                replyDraftTouched.current = true;
                setReplyUnavailable(false);
                setDraftRestored(true);
                setAnnouncement("Your unsent reply was restored.");
              } else {
                setReplyTarget(null);
                setReplyDraft("");
                setRecoveryNotice("The comment you were replying to is no longer available.");
              }
            } else {
              setDraft(restored.body);
              setDraftRestored(true);
              setAnnouncement("Your unsent comment was restored.");
            }
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
      generation.current += 1;
    };
  }, [momentId, reloadToken, updateCount]);

  useEffect(() => {
    if (state !== "ready" || typeof window === "undefined") return;
    const hash = window.location.hash;
    if (handledHashRef.current === hash) return;
    const linked = linkedCommentId(hash);
    if (!linked && hash !== "#comments") return;
    handledHashRef.current = hash;

    const target = linked ? document.getElementById(`comment-${linked}`) : null;
    requestAnimationFrame(() => {
      if (target) {
        target.scrollIntoView({ block: "center" });
        target.focus({ preventScroll: true });
        setHighlightId(linked);
      } else {
        // The thread renders after the Moment, so the browser's own jump to
        // the fragment has usually already missed. A Comment that is gone,
        // hidden from this viewer or too old for a link to reach lands on
        // the thread.
        sectionRef.current?.scrollIntoView({ block: "start" });
      }

      // The fragment has done its job; take it off this history entry. A
      // Moment page is served from the export's fallback shell, and when Back
      // returns to it from another page the router re-enters it with a full
      // load of the same URL. With a fragment still attached, the browser
      // treats that load as an in-page jump instead, and the previous page
      // stays on screen. Next copies its own history state across this call.
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`
      );
    });
  }, [items, state]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = window.setTimeout(() => setHighlightId(null), 2500);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  const loadEarlier = useCallback(async () => {
    if (!nextCursor || loadMorePending) return;
    const epoch = generation.current;
    const revision = countRevision.current;
    setLoadMorePending(true);
    setLoadMoreError(false);
    try {
      const page = await getMomentComments(momentId, nextCursor);
      if (epoch !== generation.current) return;
      const older = [...page.items].reverse();
      setItems((current) => {
        const existing = new Set(current.map((item) => item.id));
        return [...older.filter((item) => !existing.has(item.id) && !removedIds.current.has(item.id)), ...current];
      });
      setNextCursor(page.nextCursor);
      setViewer(page.viewer);
      if (revision === countRevision.current) updateCount(page.commentCount);
    } catch {
      if (epoch === generation.current) setLoadMoreError(true);
    } finally {
      if (epoch === generation.current) setLoadMorePending(false);
    }
  }, [loadMorePending, momentId, nextCursor, updateCount]);

  const loadReplies = async (parentId: string, cursor?: string) => {
    if (replyRequests.current.has(parentId)) return;
    const epoch = generation.current;
    const revision = writeRevision.current.get(parentId) ?? 0;
    replyRequests.current.add(parentId);
    setThreads((current) => ({ ...current, [parentId]: { ...(current[parentId] ?? emptyThread()), loading: true, error: false } }));
    try {
      let page = await getMomentReplies(momentId, parentId, cursor);
      if (epoch !== generation.current) return;
      // A lower public count means cached rows may no longer be readable.
      // Restart that thread from the current public page instead of retaining
      // rows from an older visibility state alongside the next page.
      const reconcile = Boolean(cursor) && page.replyCount < (items.find((item) => item.id === parentId)?.replyCount ?? 0)
        && revision === (writeRevision.current.get(parentId) ?? 0);
      if (reconcile) {
        setThreads((current) => current[parentId] ? { ...current, [parentId]: { ...current[parentId], items: [], posted: [], nextCursor: null, loaded: false } } : current);
        page = await getMomentReplies(momentId, parentId);
        if (epoch !== generation.current) return;
        // Replies reads carry a thread count only. Recheck the total after a
        // visibility change without reloading the Moment or dropping the UI.
        const countAtRead = countRevision.current;
        try {
          const comments = await getMomentComments(momentId, undefined, { anchor: parentId });
          if (epoch !== generation.current) return;
          if (countAtRead === countRevision.current) updateCount(comments.commentCount);
        } catch {
          // The refreshed Reply page is still usable; retain the last known total.
        }
        if (epoch !== generation.current) return;
      }
      setThreads((current) => {
        if (!current[parentId]) return current;
        const thread = current[parentId];
        return { ...current, [parentId]: {
          ...thread,
          items: mergeComments(cursor && !reconcile ? thread.items : [], page.items).filter((item) => !removedIds.current.has(item.id)),
          posted: cursor && !reconcile ? thread.posted : thread.posted.filter((item) => !page.items.some((reply) => reply.id === item.id)),
          nextCursor: page.nextCursor, loaded: true, loading: false, error: false,
        } };
      });
      if (revision === (writeRevision.current.get(parentId) ?? 0)) setItems((current) => current.map((item) => item.id === parentId ? { ...item, replyCount: page.replyCount } : item));
      setAnnouncement(`${page.items.length} ${page.items.length === 1 ? "reply" : "replies"} loaded.`);
    } catch (error) {
      if (epoch !== generation.current) return;
      if (error instanceof MomentCommentError && error.reason === "parent-unavailable") {
        setItems((current) => current.filter((item) => item.id !== parentId));
        setThreads((current) => { const next = { ...current }; delete next[parentId]; return next; });
        if (replyTarget?.parentId === parentId) setReplyUnavailable(true);
        setReloadToken((value) => value + 1);
      } else setThreads((current) => current[parentId] ? { ...current, [parentId]: { ...current[parentId], loading: false, error: true } } : current);
    } finally {
      if (epoch === generation.current) replyRequests.current.delete(parentId);
    }
  };

  const toggleReplies = (parent: MomentComment) => {
    const thread = threads[parent.id];
    setThreads((current) => ({ ...current, [parent.id]: { ...(current[parent.id] ?? emptyThread()), expanded: !current[parent.id]?.expanded } }));
    if (!thread?.expanded && !thread?.loaded) void loadReplies(parent.id);
  };

  const beginReply = (parent: MomentComment, target: MomentComment) => {
    if (!viewer.canComment || postingRef.current) return;
    const isReply = target.id !== parent.id;
    setReplyTarget({ parentId: parent.id, target, isReply });
    setReplyUnavailable(false);
    setComposerError(null);
    setDraftRestored(false);
    if (isReply && target.author.handle.toLowerCase() !== viewer.identity?.handle.toLowerCase() && !replyDraft.trim() && !replyDraftTouched.current) setReplyDraft(`@${target.author.handle} `);
    setThreads((current) => ({ ...current, [parent.id]: { ...(current[parent.id] ?? { ...emptyThread(), loaded: (parent.replyCount ?? 0) === 0 }), expanded: true } }));
    if (!threads[parent.id]?.loaded && (parent.replyCount ?? 0) > 0) void loadReplies(parent.id);
    requestAnimationFrame(() => { textareaRef.current?.focus({ preventScroll: true }); textareaRef.current?.scrollIntoView({ block: "nearest" }); });
  };

  const cancelReply = () => {
    const triggerId = replyTarget?.target.id;
    const parentId = replyTarget?.parentId;
    setReplyTarget(null);
    setReplyDraft("");
    replyDraftTouched.current = false;
    setReplyUnavailable(false);
    setComposerError(null);
    setDraftRestored(false);
    requestAnimationFrame(() => (replyTriggerRefs.current.get(triggerId ?? "") ?? replyTriggerRefs.current.get(parentId ?? ""))?.focus());
  };

  const submit = useCallback(async () => {
    const body = replyTarget ? replyDraft : draft;
    if (postingRef.current || !body.trim() || !viewer.canComment || (replyTarget && (replyUnavailable || !items.some((item) => item.id === replyTarget.parentId)))) return;
    postingRef.current = true;
    const epoch = generation.current;
    setPosting(true);
    setComposerError(null);
    // Read before posting: an ended session is cleared on the way to the
    // error, and the draft must stay bound to the account that wrote it.
    const authorUserId = readStoredAuthSession()?.user.id ?? null;
    try {
      const result = replyTarget ? await createMomentComment(momentId, body, replyTarget.parentId) : await createMomentComment(momentId, body);
      if (epoch !== generation.current) return;
      if (replyTarget) {
        const parentId = replyTarget.parentId;
        writeRevision.current.set(parentId, (writeRevision.current.get(parentId) ?? 0) + 1);
        setThreads((current) => ({ ...current, [parentId]: {
          ...(current[parentId] ?? emptyThread()), expanded: true,
          posted: mergeComments(current[parentId]?.posted ?? [], [result.comment]),
        } }));
        setItems((current) => current.map((item) => item.id === parentId ? { ...item, replyCount: result.parentReplyCount ?? item.replyCount } : item));
        setReplyDraft("");
        replyDraftTouched.current = false;
      } else {
        setItems((current) =>
        current.some((item) => item.id === result.comment.id)
          ? current
          : [...current, result.comment]
      );
        setDraft("");
      }
      countRevision.current += 1;
      updateCount(result.commentCount);
      setDraftRestored(false);
      clearCommentDraft(commentDraftStorage());
      setAnnouncement(replyTarget ? "Reply posted." : "Comment posted.");
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (error) {
      if (epoch !== generation.current) return;
      if (error instanceof MomentCommentError) {
        setComposerError(error.reason === "error" && replyTarget ? "Couldn’t post reply. Please try again." : error.message);
        if (error.reason === "session") {
          if (authorUserId) {
            setDraftKept(
              saveCommentDraft(commentDraftStorage(), {
                momentId,
                userId: authorUserId,
                body,
                parentCommentId: replyTarget?.parentId,
                replyToCommentId: replyTarget?.isReply ? replyTarget.target.id : null,
                topLevelBody: replyTarget ? draft : "",
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
        } else if (error.reason === "parent-unavailable" || error.reason === "parent-invalid") {
          setReplyUnavailable(true);
          setReloadToken((value) => value + 1);
        }
      } else {
        setComposerError(replyTarget ? "Couldn’t post reply. Please try again." : "We couldn’t post your comment. Please try again.");
      }
    } finally {
      setPosting(false);
      postingRef.current = false;
    }
  }, [draft, replyDraft, replyTarget, replyUnavailable, items, momentId, updateCount, viewer.canComment]);

  const confirmDelete = async () => {
    if (!confirming || deleting) return;
    setDeleting(true);
    setDeleteErrorId(null);
    const index = items.findIndex((item) => item.id === confirming.id);
    const focusId = confirming.parentCommentId ?? items[index + 1]?.id ?? items[index - 1]?.id ?? null;
    const epoch = generation.current;
    try {
      const result = await deleteMomentComment(momentId, confirming.id);
      if (epoch !== generation.current) return;
      const action = confirming.viewerDeleteAction;
      setItems((current) => current.filter((item) => item.id !== confirming.id));
      removedIds.current.add(confirming.id);
      const parentId = result.parentCommentId ?? confirming.parentCommentId;
      if (parentId) {
        writeRevision.current.set(parentId, (writeRevision.current.get(parentId) ?? 0) + 1);
        setThreads((current) => current[parentId] ? { ...current, [parentId]: { ...current[parentId], items: current[parentId].items.filter((item) => item.id !== confirming.id), posted: current[parentId].posted.filter((item) => item.id !== confirming.id) } } : current);
        setItems((current) => current.map((item) => item.id === parentId ? { ...item, replyCount: result.parentReplyCount ?? item.replyCount } : item));
      } else {
        setThreads((current) => { const next = { ...current }; delete next[confirming.id]; return next; });
        if (replyTarget?.parentId === confirming.id) setReplyUnavailable(true);
      }
      countRevision.current += 1;
      updateCount(result.commentCount);
      setConfirming(null);
      setMenuId(null);
      setAnnouncement(`${parentId ? "Reply" : "Comment"} ${action === "remove" ? "removed" : "deleted"}.`);
      requestAnimationFrame(() => {
        if (focusId) {
          document.getElementById(`comment-${focusId}`)?.focus();
        } else {
          headingRef.current?.focus();
        }
      });
    } catch {
      if (epoch !== generation.current) return;
      const triggerId = confirming.id;
      setDeleteErrorId(confirming.id);
      setConfirming(null);
      setMenuId(null);
      requestAnimationFrame(() => menuTriggerRefs.current.get(triggerId)?.focus());
    } finally {
      setDeleting(false);
    }
  };

  const closeMenu = () => setMenuId(null);
  const loginHref = ownerLoginPath(`${momentPath(momentId)}#comments`);
  const body = replyTarget ? replyDraft : draft;
  const parentMissing = Boolean(replyTarget) && !items.some((item) => item.id === replyTarget?.parentId);
  const activeComposerError = parentMissing ? "This comment is no longer available." : composerError;
  const composer = (
    <div className="mt-5 border-t border-pet-border pt-4" data-testid="active-comment-composer">
      {viewer.canComment ? (
        <div className="flex gap-3">
          <HouseholdAvatar author={viewer.identity} compact={Boolean(replyTarget)} />
          <div className="min-w-0 flex-1">
            {replyTarget ? <p className="mb-2 break-words text-sm font-black text-pet-ink">{replyTarget.isReply ? `Replying to @${replyTarget.target.author.handle}` : `Reply to ${replyTarget.target.author.displayName}`}</p> : null}
            {draftRestored ? <p className="mt-1 text-sm font-semibold text-pet-muted">Your unsent {replyTarget ? "reply" : "comment"} is back. Press Send when you’re ready.</p> : null}
            <CommentMentionComposer
              key={replyTarget ? `${replyTarget.parentId}:${replyTarget.target.id}` : "comment"}
              disabled={posting}
              hasError={Boolean(activeComposerError)}
              errorText={activeComposerError}
              helpText={body.length >= 400 ? `${body.length} / 500` : "Ctrl or ⌘ + Enter to send"}
              label={replyTarget ? "Add a reply" : "Add a comment"}
              inputRef={textareaRef}
              momentId={momentId}
              onChange={replyTarget ? (value) => { replyDraftTouched.current = true; setReplyDraft(value); } : setDraft}
              onSubmit={() => void submit()}
              value={body}
            >
              <div className="flex flex-wrap gap-2">
                {replyTarget ? <button className="min-h-11 rounded-full px-3 text-sm font-black text-pet-muted" disabled={posting} onClick={cancelReply} type="button">Cancel reply</button> : null}
                <button className="min-h-11 rounded-full bg-pet-teal px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={posting || !body.trim() || parentMissing || (Boolean(replyTarget) && replyUnavailable)} onClick={() => void submit()} type="button">{posting ? "Posting…" : "Send"}</button>
              </div>
            </CommentMentionComposer>
          </div>
        </div>
      ) : viewer.requirement === "communityProfile" ? (
        <Link className="inline-flex min-h-11 items-center rounded-full border border-pet-teal px-4 text-sm font-black text-pet-teal" href={ownerRoutes.socialProfile}>Set up your Community profile to comment</Link>
      ) : (
        <>
          {draftKept ? <p className="mb-3 text-sm font-semibold text-pet-muted">We’ve kept your {replyTarget ? "reply" : "comment"}. Sign in to finish posting it.</p> : null}
          <Link className="inline-flex min-h-11 items-center rounded-full border border-pet-teal px-4 text-sm font-black text-pet-teal" href={loginHref}>Sign in to comment</Link>
        </>
      )}
    </div>
  );

  function renderRow(comment: MomentComment, parent: MomentComment = comment, children?: ReactNode) {
    return <CommentRow
      comment={comment}
      deleteError={deleteErrorId === comment.id}
      highlighted={highlightId === comment.id}
      key={comment.id}
      menuOpen={menuId === comment.id}
      now={loadedAt}
      onCloseMenu={closeMenu}
      onConfirm={() => setConfirming(comment)}
      onReport={() => { setMenuId(null); setReporting(comment); }}
      canReport={viewer.canComment && Boolean(viewer.identity) && viewer.identity?.handle.toLowerCase() !== comment.author.handle.toLowerCase()}
      canReply={viewer.canComment && Boolean(viewer.identity) && supportsCommentReplies(parent)}
      onReply={() => beginReply(parent, comment)}
      setReplyTrigger={(element) => { if (element) replyTriggerRefs.current.set(comment.id, element); else replyTriggerRefs.current.delete(comment.id); }}
      onMenu={() => setMenuId((current) => current === comment.id ? null : comment.id)}
      setMenuTrigger={(element) => { if (element) menuTriggerRefs.current.set(comment.id, element); else menuTriggerRefs.current.delete(comment.id); }}
    >{children}</CommentRow>;
  }

  return (
    <section
      aria-busy={state === "loading"}
      aria-labelledby="comments-heading"
      className="brand-card mt-4 scroll-mt-24 rounded-[1.5rem] p-4 sm:p-5"
      id="comments"
      ref={sectionRef}
    >
      <h2
        className="text-lg font-black text-pet-ink outline-none"
        id="comments-heading"
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
              {items.map((comment) => {
                const thread = threads[comment.id];
                const posted = (thread?.posted ?? []).filter((reply) => !thread?.items.some((item) => item.id === reply.id));
                const remaining = Math.max(0, (comment.replyCount ?? 0) - (thread?.items.length ?? 0) - posted.length);
                return renderRow(comment, comment, <div className="ml-11 min-w-0 sm:ml-14" data-testid="comment-thread-context">
                  {supportsCommentReplies(comment) && ((comment.replyCount ?? 0) > 0 || thread?.expanded) ? <button
                    aria-controls={`replies-${comment.id}`}
                    aria-expanded={Boolean(thread?.expanded)}
                    aria-label={`${thread?.expanded ? "Hide replies" : `View ${comment.replyCount} ${comment.replyCount === 1 ? "reply" : "replies"}`} to ${comment.author.displayName}'s comment`}
                    className="min-h-11 rounded-full pr-3 text-sm font-black text-pet-teal"
                    onClick={() => toggleReplies(comment)} type="button"
                  >{thread?.expanded ? "Hide replies" : `View ${comment.replyCount} ${comment.replyCount === 1 ? "reply" : "replies"}`}</button> : null}
                  <div aria-busy={Boolean(thread?.loading)} hidden={!thread?.expanded} id={`replies-${comment.id}`}>
                    {thread?.expanded ? <>
                      <ol aria-label={`Replies to ${comment.author.displayName}'s comment`} className="space-y-3" data-testid="reply-list">
                        {thread.items.map((reply) => renderRow(reply, comment))}
                        {thread.nextCursor && !thread.error ? <li><button className="min-h-11 rounded-full pr-3 text-sm font-black text-pet-teal" disabled={thread.loading} onClick={() => void loadReplies(comment.id, thread.nextCursor!)} type="button">{thread.loading ? "Loading replies…" : remaining > 0 ? `View ${remaining} more ${remaining === 1 ? "reply" : "replies"}` : "View more replies"}</button></li> : null}
                        {posted.map((reply) => renderRow(reply, comment))}
                      </ol>
                      {thread.loading && !thread.loaded ? <p className="py-3 text-sm font-semibold text-pet-muted" role="status">Loading replies…</p> : null}
                      {thread.error ? <div className="py-2"><p className="text-sm font-semibold text-pet-muted" role="alert">We couldn’t load replies.</p><button className="min-h-11 rounded-full pr-3 text-sm font-black text-pet-teal" onClick={() => void loadReplies(comment.id, thread.loaded ? thread.nextCursor ?? undefined : undefined)} type="button">Try again</button></div> : null}
                    </> : null}
                  </div>
                  {replyTarget?.parentId === comment.id ? composer : null}
                </div>);
              })}
            </ol>
          )}

          {recoveryNotice ? <p className="mt-3 text-sm font-semibold text-pet-muted" role="status">{recoveryNotice}</p> : null}
          {!replyTarget || !items.some((item) => item.id === replyTarget.parentId) ? composer : null}
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
              ? `Remove ${confirming?.parentCommentId ? "reply" : "comment"}`
              : `Delete ${confirming?.parentCommentId ? "reply" : "comment"}`
        }
        destructive
        message={commentRemovalMessage(
          confirming?.viewerDeleteAction === "remove" ? "remove" : "delete",
          Boolean(confirming?.parentCommentId),
          confirming?.replyCount,
        )}
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
            ? `Remove this ${confirming?.parentCommentId ? "reply" : "comment"}?`
            : `Delete your ${confirming?.parentCommentId ? "reply" : "comment"}?`
        }
      />
      {reporting ? <CommunityReportDialog
        onClose={() => { const id = reporting.id; setReporting(null); requestAnimationFrame(() => menuTriggerRefs.current.get(id)?.focus()); }}
        open
        report={{ type: "comment", target: reporting.id, household: reporting.author, isReply: Boolean(reporting.parentCommentId) }}
        onBlocked={() => setReloadToken((value) => value + 1)}
      /> : null}
    </section>
  );
}

function CommentRow({
  comment,
  now,
  menuOpen,
  deleteError,
  highlighted,
  onCloseMenu,
  onMenu,
  onConfirm,
  onReport,
  canReport,
  setMenuTrigger,
  canReply,
  onReply,
  setReplyTrigger,
  children,
}: {
  comment: MomentComment;
  now: number;
  menuOpen: boolean;
  deleteError: boolean;
  highlighted: boolean;
  onCloseMenu: () => void;
  onMenu: () => void;
  onConfirm: () => void;
  onReport: () => void;
  canReport: boolean;
  setMenuTrigger: (element: HTMLButtonElement | null) => void;
  canReply: boolean;
  onReply: () => void;
  setReplyTrigger: (element: HTMLButtonElement | null) => void;
  children?: ReactNode;
}) {
  const isReply = Boolean(comment.parentCommentId);
  const noun = isReply ? "reply" : "comment";
  const action = `${comment.viewerDeleteAction === "remove" ? "Remove" : "Delete"} ${noun}`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuPanelId = `comment-actions-${comment.id}`;

  // Escape returns focus to the trigger; a pointer elsewhere leaves it where
  // the reader put it. Only one row's menu is open at a time (`menuId`).
  useDismissableMenu({
    menuRef,
    onClose: (returnFocus) => {
      onCloseMenu();
      if (returnFocus) triggerRef.current?.focus();
    },
    open: menuOpen,
    triggerRef,
  });

  return (
    <li
      className={`scroll-mt-24 rounded-xl motion-safe:transition-[outline-color] ${
        highlighted
          ? "outline-2 outline-offset-4 outline-pet-teal"
          : "outline-none"
      }`}
      data-highlighted={highlighted || undefined}
      data-testid={isReply ? "reply-row" : "comment-row"}
      id={`comment-${comment.id}`}
      tabIndex={-1}
    >
      <div className={`flex ${isReply ? "gap-2" : "gap-3"}`}>
      <HouseholdAvatar author={comment.author} compact={isReply} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {/*
              On touch screens the name's hit area grows to ~44px through a
              pseudo-element, mostly upward into the gap between Comments, so
              the row keeps its compact look and the first line of the body
              stays tappable text.
            */}
            <Link
              className="relative font-black text-pet-ink hover:text-pet-teal pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-top-3.5 pointer-coarse:after:-bottom-1.5 pointer-coarse:after:content-['']"
              data-testid="comment-author-link"
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

          {comment.viewerDeleteAction || canReport ? (
            <div className="relative shrink-0">
              <button
                aria-controls={menuOpen ? menuPanelId : undefined}
                aria-expanded={menuOpen}
                aria-label={`${isReply ? "Reply" : "Comment"} actions for ${comment.author.displayName}`}
                className="grid h-11 w-11 place-items-center rounded-full text-pet-muted hover:bg-pet-cream"
                onClick={onMenu}
                ref={(element) => {
                  triggerRef.current = element;
                  setMenuTrigger(element);
                }}
                type="button"
              >
                <Icon className="h-5 w-5" name="more" />
              </button>
              {menuOpen ? (
                <div
                  className="absolute right-0 z-20 min-w-40 rounded-xl border border-pet-border bg-white p-1 shadow-lg"
                  id={menuPanelId}
                  ref={menuRef}
                >
                  {canReport ? <button
                    className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-black text-pet-ink hover:bg-pet-cream"
                    onClick={onReport}
                    type="button"
                  >Report {noun}</button> : null}
                  {comment.viewerDeleteAction ? <button
                    className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-black text-pet-coral hover:bg-pet-cream"
                    onClick={onConfirm}
                    type="button"
                  >
                    {action}
                  </button> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="mt-1 whitespace-pre-line break-words text-sm font-semibold leading-6 text-pet-ink">
          <CommentBodyWithMentions body={comment.body} mentions={comment.mentions} />
        </p>
        {canReply ? <button aria-label={`Reply to ${comment.author.displayName}`} className="min-h-11 rounded-full pr-3 text-xs font-black text-pet-muted hover:text-pet-teal" onClick={onReply} ref={setReplyTrigger} type="button">Reply</button> : null}
        {deleteError ? (
          <p className="mt-1 text-sm font-bold text-pet-coral" role="alert">
            We couldn’t remove this {noun}. Please try again.
          </p>
        ) : null}
      </div>
      </div>
      {children}
    </li>
  );
}

function HouseholdAvatar({
  author,
  compact = false,
}: {
  author: MomentCommentViewer["identity"];
  compact?: boolean;
}) {
  return (
    <span className={`grid ${compact ? "h-8 w-8" : "h-11 w-11"} shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-cream`}>
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
