"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AdminActionButton, AdminDetailItem, AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { AdminEmptyPanel } from "@/components/admin/AdminStatus";
import {
  CurrentMomentDetails,
  householdName,
  ModerationActionDialog,
  ModerationHistoryList,
  PlainText,
  type ModerationDialogInput,
} from "@/components/admin/AdminCommunityModerationParts";
import { formatAdminDateTime } from "@/components/admin/adminDisplay";
import { AdminDataTable, type AdminColumn } from "@/components/admin/table/AdminDataTable";
import { AdminFilterBar, type AdminFilterDef } from "@/components/admin/table/AdminFilterBar";
import { useAdminTableQuery } from "@/components/admin/table/useAdminTableQuery";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { adminCapabilities, hasCapability } from "@/lib/adminCapabilities";
import { adminReplyThreadImpact } from "@/lib/commentRemovalCopy";
import { communityContentReasons } from "@/lib/communityModeration";
import { adminRoutes } from "@/lib/routes";
import { getAdminCapabilities } from "@/services/authService";
import { isApiClientError } from "@/services/apiClient";
import {
  directModerationErrorMessage,
  getCommunityComment,
  listCommunityComments,
  removeCommunityComment,
  type CommunityCommentContext,
  type CommunityCommentStatus,
  type CommunityCommentSummary,
} from "@/services/adminCommunityModerationService";

const filterKeys = ["status", "kind", "momentId"] as const;
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const filterDefs: AdminFilterDef[] = [
  {
    type: "select",
    key: "status",
    label: "Status",
    options: [
      { value: "Active", label: "Not removed" },
      { value: "Removed", label: "Removed or deleted" },
    ],
  },
  {
    type: "select",
    key: "kind",
    label: "Type",
    options: [
      { value: "Comment", label: "Comments" },
      { value: "Reply", label: "Replies" },
    ],
  },
  { type: "text", key: "momentId", label: "Moment ID", placeholder: "Moment ID", advanced: true },
];

const statusLabels: Record<CommunityCommentStatus, string> = {
  Active: "Active",
  RemovedByMyPetLink: "Removed by MyPetLink",
  DeletedByAuthor: "Deleted by author",
  DeletedByMomentAuthor: "Deleted by Moment owner",
};

const removerLabels: Record<string, string> = {
  Author: "Its author",
  MomentAuthor: "The Moment’s owner",
  MyPetLink: "MyPetLink",
};

function statusBadge(status: CommunityCommentStatus) {
  return <Badge tone={status === "Active" ? "mint" : status === "RemovedByMyPetLink" ? "warm" : "soft"}>{statusLabels[status] ?? status}</Badge>;
}

/**
 * Comments and Replies for moderators, newest first: who wrote what, on which
 * Moment, and whether it still stands — and, opened, the comment in context
 * (its Moment, the comment a reply answers, the thread) with Remove.
 * Removing wipes the text everywhere public, the same as any removal; the
 * words are kept only in the household's moderation history, and its author
 * is told why.
 */
export function AdminCommunityCommentsManager() {
  const access = getAdminCapabilities();
  const canResolve = hasCapability(access, adminCapabilities.communityReportsResolve);
  const { query, actions, hasActiveFilters } = useAdminTableQuery({
    filterKeys,
    defaultSortBy: "created",
    allowedSortIds: ["created"],
    allowedFilterValues: { status: ["Active", "Removed"], kind: ["Comment", "Reply"] },
  });
  const commentId = actions.getExtraParam("comment");
  const [listRevision, setListRevision] = useState(0);
  const [detailRevision, setDetailRevision] = useState(0);
  const [list, setList] = useState<{ key: string; items: CommunityCommentSummary[]; total: number; error: string } | null>(null);
  const [detail, setDetail] = useState<{ key: string; context: CommunityCommentContext | null; error: string; unavailable: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const [pendingKey, setPendingKey] = useState<number | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const invalidMoment = Boolean(query.filters.momentId && !guid.test(query.filters.momentId));
  const request = useMemo(() => ({
    page: query.page,
    pageSize: query.pageSize,
    status: query.filters.status,
    kind: query.filters.kind,
    momentId: invalidMoment ? undefined : query.filters.momentId,
  }), [query, invalidMoment]);
  const listKey = `${JSON.stringify(request)}#${listRevision}`;
  const detailKey = `${commentId}#${detailRevision}`;

  useEffect(() => {
    if (invalidMoment) return;
    const controller = new AbortController();
    listCommunityComments(request, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setList({ key: listKey, ...result, error: "" }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setList({
          key: listKey, items: [], total: 0,
          error: isApiClientError(error) && error.status === 403
            ? "You no longer have access to Community moderation."
            : "Couldn’t load Community comments.",
        });
      });
    return () => controller.abort();
  }, [listKey, request, invalidMoment]);

  useEffect(() => {
    if (!commentId) return;
    const controller = new AbortController();
    getCommunityComment(commentId, controller.signal)
      .then((context) => { if (!controller.signal.aborted) setDetail({ key: detailKey, context, error: "", unavailable: false }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDetail({
          key: detailKey, context: null,
          error: isApiClientError(error) && error.status === 404 ? ""
            : isApiClientError(error) && error.status === 403 ? "You no longer have access to Community moderation."
            : "Couldn’t load this comment.",
          unavailable: isApiClientError(error) && error.status === 404,
        });
      });
    return () => controller.abort();
  }, [detailKey, commentId]);

  const currentList = list?.key === listKey ? list : null;
  const currentDetail = detail?.key === detailKey ? detail : null;
  const active = currentDetail?.context ?? null;
  const isReply = Boolean(active?.comment.parentCommentId);
  const kindLabel = isReply ? "reply" : "comment";
  const refresh = useCallback(() => {
    setListRevision((revision) => revision + 1);
    setDetailRevision((revision) => revision + 1);
  }, []);
  const open = (id: string) => {
    setPendingKey(null);
    setNotice("");
    actions.setExtraParam("comment", id);
  };
  const close = () => {
    setPendingKey(null);
    actions.setExtraParam("comment", null);
    setListRevision((revision) => revision + 1);
  };

  const submit = async (input: ModerationDialogInput) => {
    if (busyRef.current || !active || !input.reason) return;
    busyRef.current = true;
    setBusy(true);
    setDialogError("");
    try {
      await removeCommunityComment(active.comment.id, input.reason, input.remark);
      setPendingKey(null);
      setNotice(`The ${kindLabel} was removed. Its author has been told why.`);
      refresh();
    } catch (error) {
      const message = directModerationErrorMessage(error);
      if (isApiClientError(error) && (error.status === 403 || error.status === 409)) {
        setPendingKey(null);
        setNotice(message);
        refresh();
      } else {
        setDialogError(message);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const columns: AdminColumn<CommunityCommentSummary>[] = [
    {
      id: "content",
      header: "Content",
      cell: (row) => (
        <span className="block max-w-md break-words text-slate-900">
          {row.body ?? <span className="italic text-slate-500">Text removed</span>}
        </span>
      ),
    },
    { id: "kind", header: "Type", cell: (row) => <Badge tone="teal">{row.kind}</Badge> },
    { id: "author", header: "Author", cell: (row) => householdName(row.author.displayName, row.author.handle) },
    { id: "moment", header: "Moment", cell: (row) => <span className="break-words">{row.momentTitle}</span> },
    { id: "created", header: "Created at", cell: (row) => <span className="whitespace-nowrap">{formatAdminDateTime(row.createdAt)}</span> },
    { id: "status", header: "Status", cell: (row) => statusBadge(row.status) },
  ];

  return (
    <>
      <PageHeader compactOnMobile eyebrow="Admin · Community" title="Comments" description="Review comments and replies in context and remove any that break the Community Guidelines." />
      {notice ? <div className="mb-4" role="status"><AdminNotice>{notice}</AdminNotice></div> : null}
      {commentId ? (
        <div className="grid min-w-0 gap-4">
          <div><AdminActionButton onClick={close}>← Back to comments</AdminActionButton></div>
          {!currentDetail ? <div role="status" className="animate-pulse rounded-2xl bg-white p-6 text-sm text-slate-600">Loading comment…</div> : null}
          {currentDetail?.unavailable ? <AdminSection title="Comment unavailable"><AdminEmptyPanel title="This comment isn’t available any more." /></AdminSection> : null}
          {currentDetail?.error ? <AdminSection title="Comment unavailable"><div className="p-5"><p role="alert">{currentDetail.error}</p><AdminActionButton onClick={refresh}>Try again</AdminActionButton></div></AdminSection> : null}
          {active ? (
            <>
              <AdminSection title={isReply ? "Reply" : "Comment"}>
                <div className="grid gap-3 p-4">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <AdminDetailItem label="Author" value={householdName(active.comment.author.displayName, active.comment.author.handle)} />
                    <AdminDetailItem label="Created at" value={formatAdminDateTime(active.comment.createdAt)} />
                    <AdminDetailItem label="Publicly visible" value={active.comment.publiclyVisible ? "Yes" : "No"} />
                    {active.comment.removed ? <AdminDetailItem label="Removed by" value={removerLabels[active.comment.removedBy ?? ""] ?? "Unavailable"} /> : null}
                    {active.comment.removedAt ? <AdminDetailItem label="Removed at" value={formatAdminDateTime(active.comment.removedAt)} /> : null}
                  </div>
                  {active.comment.removed
                    ? <p className="text-sm text-slate-600">The text of a removed {kindLabel} is gone. If MyPetLink removed it, the words are kept in the moderation history below.</p>
                    : <PlainText label="Text" value={active.comment.body} />}
                  <Link className="inline-flex min-h-10 w-fit items-center rounded-full px-3 text-sm font-bold text-pet-teal underline" href={adminRoutes.owner(active.comment.author.ownerId)}>
                    Open the author’s household
                  </Link>
                </div>
              </AdminSection>
              {active.comment.parentComment ? (
                <AdminSection title="The comment this replies to">
                  <div className="grid gap-2 p-4">
                    <AdminDetailItem label="Author" value={householdName(active.comment.parentComment.author.displayName, active.comment.parentComment.author.handle)} />
                    {active.comment.parentComment.removed || active.comment.parentComment.body == null
                      ? <p className="text-sm text-slate-600">This comment has been removed.</p>
                      : <PlainText label="Text" value={active.comment.parentComment.body} />}
                  </div>
                </AdminSection>
              ) : null}
              <AdminSection title={`Replies in this thread (${active.threadReplyTotal})`}>
                <div className="p-4">
                  {active.threadReplies.length === 0 ? <p className="text-sm text-slate-500">No replies.</p> : (
                    <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                      {active.threadReplies.map((reply) => (
                        <li className={`grid gap-1 p-3 text-sm ${reply.id === active.comment.id ? "bg-amber-50" : ""}`} key={reply.id}>
                          <span className="font-bold text-slate-900">
                            {householdName(reply.author.displayName, reply.author.handle)}
                            <span className="ml-2 text-xs font-semibold text-slate-500">{formatAdminDateTime(reply.createdAt)}</span>
                            {reply.id === active.comment.id ? <span className="ml-2 text-xs font-black uppercase text-amber-800">Reviewing</span> : null}
                          </span>
                          <span className="whitespace-pre-wrap break-words text-slate-800">{reply.removed ? <span className="italic text-slate-500">Removed</span> : reply.body}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </AdminSection>
              <AdminSection title="Moment">
                <div className="p-4">
                  {active.moment ? <CurrentMomentDetails moment={active.moment} /> : <p className="text-sm text-slate-600">This Moment isn’t available any more.</p>}
                </div>
              </AdminSection>
              <AdminSection title="Moderation" description="Every action is recorded with who took it, when and why.">
                <div className="grid gap-3 p-4">
                  {active.availableActions.includes("RemoveComment") && canResolve ? (
                    <div><AdminActionButton tone="danger" onClick={() => { setDialogError(""); setPendingKey(Date.now()); }}>Remove {kindLabel}</AdminActionButton></div>
                  ) : null}
                  {!active.comment.removed && active.availableActions.length === 0 ? <p className="text-sm text-slate-600">Another moderator needs to act on this because it involves your own household.</p> : null}
                  <ModerationHistoryList items={active.history} />
                </div>
              </AdminSection>
            </>
          ) : null}
        </div>
      ) : (
        <AdminSection title="Comments and replies" description="Newest first. Removed or deleted comments keep their place without their text.">
          <AdminFilterBar
            searchSlot={<span className="text-sm font-semibold text-slate-600">Filter comments</span>}
            filters={filterDefs}
            values={query.filters}
            hasActiveFilters={hasActiveFilters}
            onFilterChange={actions.setFilter}
            onFiltersChange={actions.setFilters}
            onClearAll={actions.clearAllFilters}
          />
          {invalidMoment ? (
            <p className="p-5 text-sm font-semibold text-red-700" role="alert">Enter a valid Moment ID.</p>
          ) : (
            <AdminDataTable
              columns={columns}
              rows={currentList?.items ?? []}
              rowKey={(row) => row.id}
              loading={!currentList}
              error={currentList?.error}
              onRetry={refresh}
              emptyTitle={hasActiveFilters ? "No comments match these filters." : "No comments yet."}
              emptyDescription={hasActiveFilters ? "Try changing or clearing the filters above." : "Comments and replies will appear here."}
              page={query.page}
              pageSize={query.pageSize}
              total={currentList?.total ?? 0}
              onPageChange={actions.setPage}
              onPageSizeChange={actions.setPageSize}
              onRowOpen={(row) => open(row.id)}
              rowOpenLabel="View context"
            />
          )}
        </AdminSection>
      )}
      {pendingKey !== null && active ? (
        <ModerationActionDialog
          key={pendingKey}
          title={`Remove ${kindLabel}`}
          message={[
            `This ${kindLabel} will no longer be publicly visible and its text is removed everywhere public. Its author is told it was removed and why.`,
            !isReply ? adminReplyThreadImpact(active.comment.replyCount) : null,
          ].filter(Boolean).join(" ")}
          confirmLabel={`Remove ${kindLabel}`}
          destructive
          reasons={communityContentReasons}
          busy={busy}
          error={dialogError}
          onCancel={() => setPendingKey(null)}
          onConfirm={(input) => void submit(input)}
        />
      ) : null}
    </>
  );
}
