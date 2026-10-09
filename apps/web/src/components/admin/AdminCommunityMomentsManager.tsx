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
  type ModerationDialogInput,
} from "@/components/admin/AdminCommunityModerationParts";
import { formatAdminDateTime } from "@/components/admin/adminDisplay";
import { AdminDataTable, type AdminColumn } from "@/components/admin/table/AdminDataTable";
import { AdminFilterBar, type AdminFilterDef } from "@/components/admin/table/AdminFilterBar";
import { AdminSearchInput } from "@/components/admin/table/AdminSearchInput";
import { useAdminTableQuery } from "@/components/admin/table/useAdminTableQuery";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { adminCapabilities, hasCapability } from "@/lib/adminCapabilities";
import { communityContentReasons } from "@/lib/communityModeration";
import { adminRoutes } from "@/lib/routes";
import { getAdminCapabilities } from "@/services/authService";
import { isApiClientError } from "@/services/apiClient";
import {
  directModerationErrorMessage,
  getCommunityMoment,
  listCommunityMoments,
  removeCommunityMoment,
  restoreCommunityMoment,
  type CommunityMomentDetail,
  type CommunityMomentStatus,
  type CommunityMomentSummary,
} from "@/services/adminCommunityModerationService";

const filterKeys = ["status"] as const;
const filterDefs: AdminFilterDef[] = [
  {
    type: "select",
    key: "status",
    label: "Status",
    options: [
      { value: "Active", label: "Not removed" },
      { value: "Removed", label: "Removed" },
    ],
  },
];

const statusLabels: Record<CommunityMomentStatus, string> = {
  Visible: "Visible",
  NotVisible: "Not shown in Community",
  Removed: "Removed",
};

function statusBadge(status: CommunityMomentStatus) {
  return <Badge tone={status === "Removed" ? "warm" : status === "Visible" ? "mint" : "soft"}>{statusLabels[status] ?? status}</Badge>;
}

type PendingAction = { kind: "remove" | "restore"; key: number };

/**
 * Community Moments for moderators: every shared Moment, newest first, with
 * its author, status and how much attention it has had — and, opened, the
 * Moment as it is now, its moderation history, and Remove or Restore.
 * Removing hides it from every public surface; nothing is deleted, and its
 * author is told why.
 */
export function AdminCommunityMomentsManager() {
  const access = getAdminCapabilities();
  const canEnforce = hasCapability(access, adminCapabilities.communityModerationEnforce);
  const { query, actions, hasActiveFilters } = useAdminTableQuery({
    filterKeys,
    defaultSortBy: "published",
    allowedSortIds: ["published"],
    allowedFilterValues: { status: ["Active", "Removed"] },
  });
  const momentId = actions.getExtraParam("moment");
  const [listRevision, setListRevision] = useState(0);
  const [detailRevision, setDetailRevision] = useState(0);
  const [list, setList] = useState<{ key: string; items: CommunityMomentSummary[]; total: number; error: string } | null>(null);
  const [detail, setDetail] = useState<{ key: string; moment: CommunityMomentDetail | null; error: string; unavailable: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const request = useMemo(() => ({
    page: query.page,
    pageSize: query.pageSize,
    status: query.filters.status,
    search: query.search || undefined,
  }), [query]);
  const listKey = `${JSON.stringify(request)}#${listRevision}`;
  const detailKey = `${momentId}#${detailRevision}`;

  useEffect(() => {
    const controller = new AbortController();
    listCommunityMoments(request, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setList({ key: listKey, ...result, error: "" }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setList({
          key: listKey, items: [], total: 0,
          error: isApiClientError(error) && error.status === 403
            ? "You no longer have access to Community moderation."
            : "Couldn’t load Community Moments.",
        });
      });
    return () => controller.abort();
  }, [listKey, request]);

  useEffect(() => {
    if (!momentId) return;
    const controller = new AbortController();
    getCommunityMoment(momentId, controller.signal)
      .then((moment) => { if (!controller.signal.aborted) setDetail({ key: detailKey, moment, error: "", unavailable: false }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDetail({
          key: detailKey, moment: null,
          error: isApiClientError(error) && error.status === 404 ? ""
            : isApiClientError(error) && error.status === 403 ? "You no longer have access to Community moderation."
            : "Couldn’t load this Moment.",
          unavailable: isApiClientError(error) && error.status === 404,
        });
      });
    return () => controller.abort();
  }, [detailKey, momentId]);

  const currentList = list?.key === listKey ? list : null;
  const currentDetail = detail?.key === detailKey ? detail : null;
  const active = currentDetail?.moment ?? null;
  const refresh = useCallback(() => {
    setListRevision((revision) => revision + 1);
    setDetailRevision((revision) => revision + 1);
  }, []);
  const open = (id: string) => {
    setPending(null);
    setNotice("");
    actions.setExtraParam("moment", id);
  };
  const close = () => {
    setPending(null);
    actions.setExtraParam("moment", null);
    setListRevision((revision) => revision + 1);
  };
  const requestAction = (kind: PendingAction["kind"]) => {
    setDialogError("");
    setPending({ kind, key: Date.now() });
  };

  const submit = async (input: ModerationDialogInput) => {
    if (busyRef.current || !pending || !active) return;
    busyRef.current = true;
    setBusy(true);
    setDialogError("");
    try {
      if (pending.kind === "remove") {
        if (!input.reason) return;
        await removeCommunityMoment(active.moment.id, input.reason, input.remark);
        setNotice("Moment removed. Its author has been told why.");
      } else {
        await restoreCommunityMoment(active.moment.id, input.remark);
        setNotice("Moment restored. It shows again wherever its owner’s settings allow.");
      }
      setPending(null);
      refresh();
    } catch (error) {
      const message = directModerationErrorMessage(error);
      if (isApiClientError(error) && (error.status === 403 || error.status === 409)) {
        setPending(null);
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

  const columns: AdminColumn<CommunityMomentSummary>[] = [
    {
      id: "moment",
      header: "Moment",
      cell: (row) => (
        <span className="grid min-w-0 gap-0.5">
          <span className="break-words font-bold text-slate-900">{row.title}</span>
          {row.captionPreview ? <span className="break-words text-xs text-slate-600">{row.captionPreview}</span> : null}
        </span>
      ),
    },
    { id: "author", header: "Author", cell: (row) => householdName(row.author.displayName, row.author.handle) },
    { id: "pet", header: "Pet", cell: (row) => row.petName ?? "—" },
    { id: "published", header: "Published at", cell: (row) => <span className="whitespace-nowrap">{formatAdminDateTime(row.publishedAt)}</span> },
    { id: "status", header: "Status", cell: (row) => statusBadge(row.status) },
    { id: "likes", header: "Likes", cell: (row) => String(row.likeCount) },
    { id: "comments", header: "Comments", cell: (row) => String(row.commentCount) },
  ];

  const canAct = (action: string) => canEnforce && Boolean(active?.availableActions.includes(action));

  return (
    <>
      <PageHeader compactOnMobile eyebrow="Admin · Community" title="Moments" description="Review Moments shared publicly and remove any that break the Community Guidelines." />
      {notice ? <div className="mb-4" role="status"><AdminNotice>{notice}</AdminNotice></div> : null}
      {momentId ? (
        <div className="grid min-w-0 gap-4">
          <div><AdminActionButton onClick={close}>← Back to Moments</AdminActionButton></div>
          {!currentDetail ? <div role="status" className="animate-pulse rounded-2xl bg-white p-6 text-sm text-slate-600">Loading Moment…</div> : null}
          {currentDetail?.unavailable ? <AdminSection title="Moment unavailable"><AdminEmptyPanel title="This Moment isn’t available any more." /></AdminSection> : null}
          {currentDetail?.error ? <AdminSection title="Moment unavailable"><div className="p-5"><p role="alert">{currentDetail.error}</p><AdminActionButton onClick={refresh}>Try again</AdminActionButton></div></AdminSection> : null}
          {active ? (
            <>
              <AdminSection title="Moment" description="As it is now. Removing it hides it from Community and the pet’s Share Profile; its owner keeps it in the Owner Portal.">
                <div className="grid gap-3 p-4">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <AdminDetailItem label="Pet" value={active.petName ?? "—"} />
                    <AdminDetailItem label="Likes" value={String(active.likeCount)} />
                    <AdminDetailItem label="Comments" value={String(active.commentCount)} />
                  </div>
                  <CurrentMomentDetails moment={active.moment} />
                  <div className="flex flex-wrap gap-2">
                    <Link className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-bold text-pet-teal underline" href={`${adminRoutes.communityComments}?momentId=${encodeURIComponent(active.moment.id)}`}>
                      View this Moment’s comments
                    </Link>
                    <Link className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-bold text-pet-teal underline" href={adminRoutes.owner(active.moment.author.ownerId)}>
                      Open the author’s household
                    </Link>
                  </div>
                </div>
              </AdminSection>
              <AdminSection title="Moderation" description="Every action is recorded with who took it, when and why.">
                <div className="grid gap-3 p-4">
                  <div className="flex flex-wrap gap-2">
                    {canAct("RemoveMoment") ? <AdminActionButton tone="danger" onClick={() => requestAction("remove")}>Remove Moment</AdminActionButton> : null}
                    {canAct("RestoreMoment") ? <AdminActionButton onClick={() => requestAction("restore")}>Restore Moment</AdminActionButton> : null}
                  </div>
                  {active.availableActions.length === 0 ? <p className="text-sm text-slate-600">Another moderator needs to act on this Moment because it involves your own household.</p> : null}
                  {active.availableActions.length > 0 && !canEnforce ? <p className="text-sm text-slate-600">Removing or restoring Moments needs Community enforcement access.</p> : null}
                  <ModerationHistoryList items={active.history} />
                </div>
              </AdminSection>
            </>
          ) : null}
        </div>
      ) : (
        <AdminSection title="Shared Moments" description="Public Moments and Moments removed by MyPetLink. Private Moments are never listed.">
          <AdminFilterBar
            searchSlot={<AdminSearchInput label="Search titles" onChange={actions.setSearch} placeholder="Search Moment titles" value={query.search} />}
            filters={filterDefs}
            values={query.filters}
            hasActiveFilters={hasActiveFilters}
            onFilterChange={actions.setFilter}
            onFiltersChange={actions.setFilters}
            onClearAll={actions.clearAllFilters}
          />
          <AdminDataTable
            columns={columns}
            rows={currentList?.items ?? []}
            rowKey={(row) => row.id}
            loading={!currentList}
            error={currentList?.error}
            onRetry={refresh}
            emptyTitle={hasActiveFilters ? "No Moments match these filters." : "No shared Moments yet."}
            emptyDescription={hasActiveFilters ? "Try changing or clearing the filters above." : "Moments shared publicly will appear here."}
            page={query.page}
            pageSize={query.pageSize}
            total={currentList?.total ?? 0}
            onPageChange={actions.setPage}
            onPageSizeChange={actions.setPageSize}
            onRowOpen={(row) => open(row.id)}
            rowOpenLabel="View Moment"
          />
        </AdminSection>
      )}
      {pending && active ? (
        <ModerationActionDialog
          key={pending.key}
          title={pending.kind === "remove" ? "Remove Moment" : "Restore Moment"}
          message={pending.kind === "remove"
            ? "This Moment will be hidden from Community and the pet’s Share Profile. Nothing is deleted: its owner still has it in the Owner Portal, and is told it was removed and why."
            : "This Moment will show again wherever its owner’s current settings allow. Its owner isn’t sent anything."}
          confirmLabel={pending.kind === "remove" ? "Remove Moment" : "Restore Moment"}
          destructive={pending.kind === "remove"}
          reasons={pending.kind === "remove" ? communityContentReasons : undefined}
          busy={busy}
          error={dialogError}
          onCancel={() => setPending(null)}
          onConfirm={(input) => void submit(input)}
        />
      ) : null}
    </>
  );
}
