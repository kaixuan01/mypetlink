"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminActionButton, AdminDetailItem, AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { AdminEmptyPanel } from "@/components/admin/AdminStatus";
import { formatAdminDateTime } from "@/components/admin/adminDisplay";
import { AdminDataTable, type AdminColumn } from "@/components/admin/table/AdminDataTable";
import { AdminFilterBar, type AdminFilterDef } from "@/components/admin/table/AdminFilterBar";
import { useAdminTableQuery } from "@/components/admin/table/useAdminTableQuery";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { adminCapabilities, hasCapability } from "@/lib/adminCapabilities";
import { getAdminCapabilities } from "@/services/authService";
import { isApiClientError } from "@/services/apiClient";
import {
  actOnCommunityReport,
  getCommunityReport,
  listCommunityReports,
  moderationActions,
  moderationErrorMessage,
  reportReasons,
  type CommunityReportDetail,
  type CommunityReportFilters,
  type CommunityReportHistoryItem,
  type CommunityReportSummary,
  type ModerationAction,
} from "@/services/adminCommunityReportService";

const filterKeys = ["status", "targetType", "reason", "reportedOwnerId", "createdFrom", "createdTo"] as const;
const filterDefs: AdminFilterDef[] = [
  { type: "select", key: "status", label: "Status", options: [{ value: "Open", label: "Open" }, { value: "Resolved", label: "Resolved" }] },
  { type: "select", key: "targetType", label: "Target type", options: ["Comment", "Moment", "Household"].map((value) => ({ value, label: value })) },
  { type: "select", key: "reason", label: "Reason", options: Object.entries(reportReasons).map(([value, label]) => ({ value, label })), advanced: true },
  { type: "text", key: "reportedOwnerId", label: "Reported household ID", placeholder: "Household ID", advanced: true },
  { type: "date-range", key: "created", label: "Reported date", advanced: true },
];
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
const actionOrder: ModerationAction[] = ["Dismiss", "RemoveComment", "HideMoment", "UnhideMoment", "RestrictHousehold", "LiftRestriction"];

export function availableModerationActions(detail: CommunityReportDetail, access: ReturnType<typeof getAdminCapabilities>): ModerationAction[] {
  if (detail.involvesYou) return [];
  return actionOrder.filter((action) =>
    detail.availableActions.includes(action) &&
    hasCapability(access, moderationActions[action].capability === "resolve"
      ? adminCapabilities.communityReportsResolve
      : adminCapabilities.communityModerationEnforce)
  );
}

function dateBoundary(value: string | undefined, end = false) {
  if (!value || !date.test(value)) return undefined;
  const parsed = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function reasonLabel(value: string) {
  return reportReasons[value as keyof typeof reportReasons] ?? value;
}

function stateBadge(value: string) {
  return <Badge tone={value === "Open" ? "warm" : "mint"}>{value}</Badge>;
}

function householdName(name: string | null, handle: string | null, snapshot?: string) {
  return name || (handle ? `@${handle}` : snapshot || "Community identity unavailable");
}

export function AdminCommunityReportsManager() {
  const access = getAdminCapabilities();
  const { query, actions, hasActiveFilters } = useAdminTableQuery({
    filterKeys,
    defaultSortBy: "queue",
    allowedSortIds: ["queue"],
    allowedFilterValues: {
      status: ["Open", "Resolved"],
      targetType: ["Comment", "Moment", "Household"],
      reason: Object.keys(reportReasons),
    },
  });
  const reportId = actions.getExtraParam("report");
  const [listRevision, setListRevision] = useState(0);
  const [detailRevision, setDetailRevision] = useState(0);
  const [list, setList] = useState<{ key: string; items: CommunityReportSummary[]; total: number; error: string } | null>(null);
  const [detail, setDetail] = useState<{ key: string; report: CommunityReportDetail | null; error: string; unavailable: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<ModerationAction | null>(null);
  const [note, setNote] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const invalidHousehold = Boolean(query.filters.reportedOwnerId && !guid.test(query.filters.reportedOwnerId));
  const invalidDates = Boolean(
    (query.filters.createdFrom && !dateBoundary(query.filters.createdFrom)) ||
    (query.filters.createdTo && !dateBoundary(query.filters.createdTo, true)) ||
    (query.filters.createdFrom && query.filters.createdTo && query.filters.createdFrom > query.filters.createdTo)
  );
  const request = useMemo<CommunityReportFilters>(() => ({
    page: query.page,
    pageSize: query.pageSize,
    status: query.filters.status,
    targetType: query.filters.targetType,
    reason: query.filters.reason,
    reportedOwnerId: invalidHousehold ? undefined : query.filters.reportedOwnerId,
    createdFrom: dateBoundary(query.filters.createdFrom),
    createdTo: dateBoundary(query.filters.createdTo, true),
  }), [query, invalidHousehold]);
  const listKey = `${JSON.stringify(request)}#${listRevision}`;
  const detailKey = `${reportId}#${detailRevision}`;

  useEffect(() => {
    if (invalidHousehold || invalidDates) return;
    const controller = new AbortController();
    listCommunityReports(request, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setList({ key: listKey, ...result, error: "" }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setList({
        key: listKey, items: [], total: 0,
        error: isApiClientError(error) && error.status === 403
          ? "You no longer have access to Community reports."
          : "Couldn’t load Community reports.",
      }); });
    return () => controller.abort();
  }, [listKey, invalidHousehold, invalidDates, request]);

  useEffect(() => {
    if (!reportId) return;
    const controller = new AbortController();
    getCommunityReport(reportId, controller.signal)
      .then((report) => { if (!controller.signal.aborted) setDetail({ key: detailKey, report, error: "", unavailable: false }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDetail({
          key: detailKey, report: null,
          error: isApiClientError(error) && error.status === 404 ? ""
            : isApiClientError(error) && error.status === 403 ? "You no longer have access to Community reports."
            : "Couldn’t load this report.",
          unavailable: isApiClientError(error) && error.status === 404,
        });
      });
    return () => controller.abort();
  }, [detailKey, reportId]);

  const currentList = list?.key === listKey ? list : null;
  const currentDetail = detail?.key === detailKey ? detail : null;
  const activeReport = currentDetail?.report;
  const refresh = useCallback(() => {
    setListRevision((revision) => revision + 1);
    setDetailRevision((revision) => revision + 1);
  }, []);
  const open = (id: string) => {
    setPending(null);
    setNotice("");
    actions.setExtraParam("report", id);
  };
  const close = () => {
    setPending(null);
    actions.setExtraParam("report", null);
    setListRevision((revision) => revision + 1);
  };
  const requestAction = (action: ModerationAction) => {
    setNote("");
    setDialogError("");
    setPending(action);
  };
  const submit = async () => {
    if (busyRef.current || !pending || !activeReport || !availableModerationActions(activeReport, access).includes(pending)) return;
    if (!note.trim()) { setDialogError("Enter an internal moderator note before continuing."); return; }
    if (note.trim().length > 1000) { setDialogError("Keep the internal moderator note within 1,000 characters."); return; }
    busyRef.current = true;
    setBusy(true);
    setDialogError("");
    const action = pending;
    try {
      const result = await actOnCommunityReport(activeReport.id, action, note, activeReport.rowVersion);
      setPending(null);
      setNotice(result.outcome === "AlreadyInEffect"
        ? `${action === "RemoveComment" ? "The Comment was already removed" : "The change was already in effect"}; the report was resolved accordingly.`
        : `${moderationActions[action].label} completed.${result.reportsResolved > 0 ? ` ${result.reportsResolved} report${result.reportsResolved === 1 ? "" : "s"} resolved.` : ""}`);
      refresh();
    } catch (error) {
      const message = moderationErrorMessage(error);
      if (isApiClientError(error) && (error.status === 403 || error.status === 409 || error.code === "moderation_action_not_applicable")) {
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

  const columns: AdminColumn<CommunityReportSummary>[] = [
    { id: "reported", header: "Reported", cell: (row) => <span className="font-bold text-slate-900">{householdName(row.reportedHousehold.displayName, row.reportedHousehold.handle, row.snapshotDisplayName)}</span> },
    { id: "target", header: "Target", cell: (row) => <Badge tone="teal">{row.targetType}</Badge> },
    { id: "reason", header: "Reason", cell: (row) => reasonLabel(row.reason) },
    { id: "status", header: "Status", cell: (row) => stateBadge(row.status) },
    { id: "open", header: "Open reports", cell: (row) => row.openReportsOnTarget },
    { id: "created", header: "Reported at", cell: (row) => <span className="whitespace-nowrap">{formatAdminDateTime(row.createdAt)}</span> },
    { id: "reviewed", header: "Reviewed at", cell: (row) => <span className="whitespace-nowrap">{formatAdminDateTime(row.reviewedAt)}</span> },
  ];

  return (
    <>
      <PageHeader compactOnMobile eyebrow="Admin · Community" title="Community Reports" description="Review reports, inspect the original evidence and decide what action is appropriate." />
      {notice ? <div className="mb-4" role="status"><AdminNotice>{notice}</AdminNotice></div> : null}
      {reportId ? (
        <ReportDetail
          report={activeReport ?? null}
          state={currentDetail}
          access={access}
          onClose={close}
          onOpen={open}
          onRefresh={refresh}
          onAction={requestAction}
        />
      ) : (
        <AdminSection title="Report queue" description="Open reports appear first, followed by the newest reviewed reports.">
          <AdminFilterBar
            searchSlot={<span className="text-sm font-semibold text-slate-600">Filter reports</span>}
            filters={filterDefs}
            values={query.filters}
            hasActiveFilters={hasActiveFilters}
            onFilterChange={actions.setFilter}
            onFiltersChange={actions.setFilters}
            onClearAll={actions.clearAllFilters}
          />
          {invalidHousehold || invalidDates ? (
            <p className="p-5 text-sm font-semibold text-red-700" role="alert">{invalidHousehold ? "Enter a valid reported household ID." : "Check the reported date range."}</p>
          ) : (
            <AdminDataTable
              columns={columns}
              rows={currentList?.items ?? []}
              rowKey={(row) => row.id}
              loading={!currentList}
              error={currentList?.error}
              onRetry={refresh}
              emptyTitle={hasActiveFilters ? "No reports match these filters." : "No Community reports yet."}
              emptyDescription={hasActiveFilters ? "Try changing or clearing the filters above." : "New reports will appear here."}
              page={query.page}
              pageSize={query.pageSize}
              total={currentList?.total ?? 0}
              onPageChange={actions.setPage}
              onPageSizeChange={actions.setPageSize}
              onRowOpen={(row) => open(row.id)}
              rowOpenLabel="View report"
            />
          )}
        </AdminSection>
      )}
      <ConfirmDialog
        open={Boolean(pending && activeReport)}
        title={pending ? moderationActions[pending].label : "Confirm action"}
        message={pending ? moderationActions[pending].explanation : ""}
        confirmLabel={busy ? "Working…" : pending ? moderationActions[pending].label : "Confirm"}
        confirmDisabled={busy || !note.trim()}
        destructive={pending ? moderationActions[pending].destructive : false}
        onCancel={() => { if (!busy) setPending(null); }}
        onConfirm={() => void submit()}
      >
        <label className="grid gap-1 text-sm font-bold text-slate-700">
          Internal moderator note
          <textarea
            className="min-h-28 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-pet-teal"
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
          <span className="text-xs font-normal text-slate-500">Required. Visible only to moderators. Up to 1,000 characters.</span>
        </label>
        {dialogError ? <p className="mt-2 text-sm text-red-700" role="alert">{dialogError}</p> : null}
      </ConfirmDialog>
    </>
  );
}

function ReportDetail({ report, state, access, onClose, onOpen, onRefresh, onAction }: {
  report: CommunityReportDetail | null;
  state: { report: CommunityReportDetail | null; error: string; unavailable: boolean } | null;
  access: ReturnType<typeof getAdminCapabilities>;
  onClose: () => void;
  onOpen: (id: string) => void;
  onRefresh: () => void;
  onAction: (action: ModerationAction) => void;
}) {
  return (
    <div className="grid min-w-0 gap-4">
      <div><AdminActionButton onClick={onClose}>← Back to report queue</AdminActionButton></div>
      {!state ? <div role="status" className="animate-pulse rounded-2xl bg-white p-6 text-sm text-slate-600">Loading report…</div> : null}
      {state?.unavailable ? <AdminSection title="Report unavailable"><AdminEmptyPanel title="Report not found or no longer available." /></AdminSection> : null}
      {state?.error ? <AdminSection title="Report unavailable"><div className="p-5"><p role="alert">{state.error}</p><AdminActionButton onClick={onRefresh}>Try again</AdminActionButton></div></AdminSection> : null}
      {report ? (
        <>
          <AdminSection title="Report">
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <AdminDetailItem label="Target" value={report.targetType} />
              <AdminDetailItem label="Reason" value={reasonLabel(report.reason)} />
              <div className="rounded-xl bg-slate-50 px-3 py-2.5"><p className="text-xs font-bold uppercase text-slate-500">Status</p>{stateBadge(report.status)}</div>
              <AdminDetailItem label="Reported at" value={formatAdminDateTime(report.createdAt)} />
              <AdminDetailItem label="Resolution" value={report.resolution ?? "Not yet reviewed"} />
              <AdminDetailItem label="Reviewed at" value={formatAdminDateTime(report.reviewedAt)} />
              <AdminDetailItem label="Reviewer" value={report.reviewedByName ?? "Not yet reviewed"} />
              <AdminDetailItem label="Open reports about this content" value={String(report.openReportsOnTarget)} />
            </div>
            <div className="grid gap-3 px-4 pb-4">
              <PlainText label="Report details" value={report.details} />
              {report.reviewNote ? <PlainText label="Internal moderator note" value={report.reviewNote} /> : null}
            </div>
          </AdminSection>
          <AdminSection title="Reported content · Current state" description="This is the content and Community state now. It may differ from the evidence below.">
            <div className="grid gap-3 p-4">
              <HouseholdState report={report} />
              {report.targetType === "Comment" ? (
                <>
                  <h3 className="font-black text-slate-900">Comment</h3>
                  {report.currentComment ? (
                    <div className="grid gap-2">
                      <p className="text-sm font-bold">{report.currentComment.removed ? "Comment already removed" : "Comment present"} · {report.currentComment.publiclyVisible ? "Publicly visible" : "Not publicly visible"}</p>
                      {!report.currentComment.removed ? <PlainText label="Current body" value={report.currentComment.body} /> : null}
                      {report.currentComment.removed ? <AdminDetailItem label="Removed by" value={report.currentComment.removedBy ?? "Unavailable"} /> : null}
                      {report.currentComment.removedAt ? <AdminDetailItem label="Removed at" value={formatAdminDateTime(report.currentComment.removedAt)} /> : null}
                    </div>
                  ) : <p className="text-sm text-slate-600">Comment no longer available.</p>}
                  <h3 className="font-black text-slate-900">Parent Moment</h3>
                  <MomentState report={report} />
                </>
              ) : report.targetType === "Moment" ? <MomentState report={report} /> : null}
            </div>
          </AdminSection>
          <AdminSection title="Evidence at time of report" description="Preserved when the report was filed. This may not reflect the content now.">
            <div className="grid gap-3 p-4">
              <AdminDetailItem label="Community name at report" value={report.evidence.displayName} />
              <AdminDetailItem label="Handle at report" value={report.evidence.handle ? `@${report.evidence.handle}` : "Unavailable"} />
              {report.evidence.title ? <PlainText label="Moment title at report" value={report.evidence.title} /> : null}
              <PlainText label={report.targetType === "Comment" ? "Comment text at report" : report.targetType === "Moment" ? "Moment caption at report" : "Community profile at report"} value={report.evidence.text} />
              {report.targetType === "Moment" ? <AdminNotice>Only the title and caption were preserved when this report was filed. Media shown in Current state may have changed.</AdminNotice> : null}
              {report.evidence.avatarUrl ? <SafeMedia url={report.evidence.avatarUrl} alt="Community avatar at report" type="image" /> : null}
            </div>
          </AdminSection>
          <AdminSection title="Prior report history">
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              <History title="Reports about this content" items={report.targetHistory} total={report.targetHistoryTotal} onOpen={onOpen} />
              <History title="Reports involving this household" items={report.householdHistory} total={report.householdHistoryTotal} onOpen={onOpen} />
            </div>
          </AdminSection>
          <AdminSection title="Moderation actions" description="Decisions and Community restrictions are recorded with an internal note.">
            <div className="p-4">
              {report.involvesYou ? <p role="alert" className="text-sm font-semibold text-amber-800">This report involves your household. Moderation actions are unavailable.</p> : null}
              <div className="flex flex-wrap gap-2">
                {availableModerationActions(report, access).map((action) => <AdminActionButton key={action} tone={moderationActions[action].destructive ? "danger" : "neutral"} onClick={() => onAction(action)}>{moderationActions[action].label}</AdminActionButton>)}
              </div>
              {!report.involvesYou && availableModerationActions(report, access).length === 0 ? <p className="text-sm text-slate-600">No moderation actions are available for this report.</p> : null}
            </div>
          </AdminSection>
        </>
      ) : null}
    </div>
  );
}

function PlainText({ label, value }: { label: string; value: string | null }) {
  return <div className="min-w-0 rounded-xl bg-slate-50 p-3"><p className="text-xs font-extrabold uppercase text-slate-500">{label}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{value || "Not provided"}</p></div>;
}

function HouseholdState({ report }: { report: CommunityReportDetail }) {
  const household = report.reportedHousehold;
  return <div className="grid gap-2 sm:grid-cols-2">
    <AdminDetailItem label="Current Community name" value={household.displayName ?? "Unavailable"} />
    <AdminDetailItem label="Current handle" value={household.handle ? `@${household.handle}` : "Unavailable"} />
    <AdminDetailItem label="Community setting" value={household.communityEnabled ? "On" : "Off"} />
    <AdminDetailItem label="Community restriction" value={household.communityRestricted ? "Restricted" : "Not restricted"} />
    <AdminDetailItem label="Account" value={household.accountActive ? "Active" : "Inactive"} />
    <AdminDetailItem label="Public Community visibility" value={report.householdPubliclyVisible ? "Visible" : "Not visible"} />
  </div>;
}

function MomentState({ report }: { report: CommunityReportDetail }) {
  const moment = report.currentMoment;
  if (!moment) return <p className="text-sm text-slate-600">Moment no longer available.</p>;
  return <div className="grid gap-3">
    <PlainText label="Current title" value={moment.title} />
    <PlainText label="Current caption" value={moment.caption} />
    <div className="grid gap-2 sm:grid-cols-2">
      <AdminDetailItem label="Owner visibility" value={moment.visibility} />
      <AdminDetailItem label="Archived" value={moment.archivedAt ? "Yes" : "No"} />
      <AdminDetailItem label="Deleted" value={moment.deleted ? "Yes" : "No"} />
      <AdminDetailItem label="Moderation hide" value={moment.hidden ? "Hidden by MyPetLink" : "Not hidden"} />
      <AdminDetailItem label="Publicly visible" value={moment.publiclyVisible ? "Yes" : "No"} />
    </div>
    {moment.media.length ? <div className="grid gap-3 sm:grid-cols-2">{moment.media.map((item) => <div className="min-w-0" key={item.mediaFileId}><SafeMedia url={item.url} alt={item.altText || item.caption || "Moment media"} type={item.type} />{item.caption ? <p className="mt-1 break-words text-xs text-slate-600">{item.caption}</p> : null}</div>)}</div> : null}
  </div>;
}

function SafeMedia({ url, alt, type }: { url: string | null; alt: string; type: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Media preview unavailable.</p>;
  // The API provides public URLs; never construct storage paths from identifiers.
  if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) return <p className="text-sm text-slate-600">Media preview unavailable.</p>;
  if (type.toLowerCase().includes("video")) return <video className="max-h-72 w-full rounded-xl bg-slate-100" controls onError={() => setFailed(true)} src={url} aria-label={alt} />;
  // Plain img supports signed or public media URLs without Next image optimization.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="max-h-72 w-full rounded-xl bg-slate-100 object-contain" alt={alt} onError={() => setFailed(true)} src={url} />;
}

function History({ title, items, total, onOpen }: { title: string; items: CommunityReportHistoryItem[]; total: number; onOpen: (id: string) => void }) {
  return <div className="min-w-0 rounded-xl border border-slate-200 p-3">
    <h3 className="text-sm font-black text-slate-900">{title} ({total})</h3>
    {!items.length ? <p className="mt-2 text-sm text-slate-500">No prior reports.</p> : <ul className="mt-2 divide-y divide-slate-100">{items.map((item) => <li className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2 text-sm" key={item.id}><span className="min-w-0 break-words">{item.targetType} · {reasonLabel(item.reason)} · {item.status} · {formatAdminDateTime(item.createdAt)}</span><button className="min-h-10 rounded-full px-3 text-xs font-bold text-pet-teal underline" onClick={() => onOpen(item.id)} type="button">View report</button></li>)}</ul>}
  </div>;
}
