"use client";

import { useState } from "react";
import { AdminDetailItem } from "@/components/admin/AdminPanels";
import { formatAdminDateTime } from "@/components/admin/adminDisplay";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  communityModerationReasonLabel,
  communityModerationReasons,
  type CommunityModerationReason,
} from "@/lib/communityModeration";
import {
  moderationHistoryLabel,
  restrictionDurations,
  type CommunityCurrentMoment,
  type CommunityRestrictionDuration,
  type ModerationHistoryItem,
} from "@/services/adminCommunityModerationService";

/**
 * Pieces shared by the Community moderation screens — the report review, the
 * Moments and Comments lists, and a household's moderation panel — so a
 * Moment, a history entry or a moderation decision reads the same wherever a
 * moderator meets it. Reported or removed words are always plain text, never
 * formatted content or links.
 */

export function householdName(name: string | null, handle: string | null, snapshot?: string) {
  return name || (handle ? `@${handle}` : snapshot || "Community identity unavailable");
}

export function PlainText({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-extrabold uppercase text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{value || "Not provided"}</p>
    </div>
  );
}

export function SafeMedia({ url, alt, type }: { url: string | null; alt: string; type: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Media preview unavailable.</p>;
  // The API provides public URLs; never construct storage paths from identifiers.
  if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) return <p className="text-sm text-slate-600">Media preview unavailable.</p>;
  if (type.toLowerCase().includes("video")) return <video className="max-h-72 w-full rounded-xl bg-slate-100" controls onError={() => setFailed(true)} src={url} aria-label={alt} />;
  // Plain img supports signed or public media URLs without Next image optimization.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="max-h-72 w-full rounded-xl bg-slate-100 object-contain" alt={alt} onError={() => setFailed(true)} src={url} />;
}

/** A Moment as it is now, with its media, for a moderator. */
export function CurrentMomentDetails({ moment }: { moment: CommunityCurrentMoment }) {
  return (
    <div className="grid gap-3">
      <PlainText label="Title" value={moment.title} />
      <PlainText label="Caption" value={moment.caption} />
      <AdminDetailItem label="Author" value={householdName(moment.author.displayName, moment.author.handle)} />
      <div className="grid gap-2 sm:grid-cols-2">
        <AdminDetailItem label="Owner visibility" value={moment.visibility} />
        <AdminDetailItem label="Published at" value={formatAdminDateTime(moment.publishedAt)} />
        <AdminDetailItem label="Archived" value={moment.archivedAt ? "Yes" : "No"} />
        <AdminDetailItem label="Removed by MyPetLink" value={moment.hidden ? `Yes · ${formatAdminDateTime(moment.hiddenAt)}` : "No"} />
        <AdminDetailItem label="Publicly visible" value={moment.publiclyVisible ? "Yes" : "No"} />
      </div>
      {moment.media.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {moment.media.map((item) => (
            <div className="min-w-0" key={item.mediaFileId}>
              <SafeMedia url={item.url} alt={item.altText || item.caption || "Moment media"} type={item.type} />
              {item.caption ? <p className="mt-1 break-words text-xs text-slate-600">{item.caption}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A household's or a piece of content's moderation history, newest first. */
export function ModerationHistoryList({
  items,
  total,
  emptyText = "No moderation actions yet.",
}: {
  items: ModerationHistoryItem[];
  total?: number;
  emptyText?: string;
}) {
  if (!items.length) return <p className="text-sm text-slate-500">{emptyText}</p>;

  return (
    <div className="grid gap-2">
      <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200" data-testid="moderation-history">
        {items.map((item) => {
          const reason = communityModerationReasonLabel(item.reason);
          return (
            <li className="grid min-w-0 gap-1 p-3 text-sm" key={item.id}>
              <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                <span className="font-black text-slate-900">{moderationHistoryLabel(item)}</span>
                <time className="whitespace-nowrap text-xs font-semibold text-slate-500" dateTime={item.createdAt}>
                  {formatAdminDateTime(item.createdAt)}
                </time>
              </div>
              <p className="break-words text-slate-700">
                {reason ? `Reason: ${reason} · ` : ""}
                {item.performedByName ? `By ${item.performedByName}` : "Ended automatically"}
                {item.restrictedUntil ? ` · Until ${formatAdminDateTime(item.restrictedUntil)}` : ""}
                {item.reportId ? " · From a report" : ""}
              </p>
              {item.internalRemark ? <PlainText label="Internal remark" value={item.internalRemark} /> : null}
              {item.contentSnapshot ? <PlainText label="Removed content" value={item.contentSnapshot} /> : null}
            </li>
          );
        })}
      </ol>
      {total !== undefined && total > items.length ? (
        <p className="text-xs text-slate-500">Showing the latest {items.length} of {total} entries.</p>
      ) : null}
    </div>
  );
}

export type ModerationDialogInput = {
  reason?: CommunityModerationReason;
  duration?: CommunityRestrictionDuration;
  remark: string;
};

/**
 * The confirmation every direct moderation action goes through: what will
 * happen, a reason when the household is told one, how long for a
 * restriction, and an optional internal remark only moderators ever see.
 * Mount it with a fresh key for each action so its fields start empty.
 */
export function ModerationActionDialog({
  title,
  message,
  confirmLabel,
  destructive = false,
  reasons,
  withDuration = false,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  /** When given, a reason must be chosen from these. */
  reasons?: CommunityModerationReason[];
  withDuration?: boolean;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (input: ModerationDialogInput) => void;
}) {
  const [reason, setReason] = useState<CommunityModerationReason | "">("");
  const [duration, setDuration] = useState<CommunityRestrictionDuration>("24h");
  const [remark, setRemark] = useState("");
  const missingReason = Boolean(reasons && !reason);

  return (
    <ConfirmDialog
      open
      title={title}
      message={message}
      confirmLabel={busy ? "Working…" : confirmLabel}
      confirmDisabled={busy || missingReason}
      destructive={destructive}
      onCancel={() => { if (!busy) onCancel(); }}
      onConfirm={() => {
        if (busy || missingReason) return;
        onConfirm({
          reason: reason || undefined,
          duration: withDuration ? duration : undefined,
          remark,
        });
      }}
    >
      <div className="grid gap-3">
        {reasons ? (
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Reason
            <select
              className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-pet-teal"
              onChange={(event) => setReason(event.target.value as CommunityModerationReason)}
              required
              value={reason}
            >
              <option value="">Choose a reason</option>
              {reasons.map((value) => (
                <option key={value} value={value}>{communityModerationReasons[value]}</option>
              ))}
            </select>
          </label>
        ) : null}
        {withDuration ? (
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            How long
            <select
              className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-pet-teal"
              onChange={(event) => setDuration(event.target.value as CommunityRestrictionDuration)}
              value={duration}
            >
              {(Object.keys(restrictionDurations) as CommunityRestrictionDuration[]).map((value) => (
                <option key={value} value={value}>{restrictionDurations[value]}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="grid gap-1 text-sm font-bold text-slate-700">
          Internal remark (optional)
          <textarea
            className="min-h-24 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-pet-teal"
            maxLength={1000}
            onChange={(event) => setRemark(event.target.value)}
            value={remark}
          />
          <span className="text-xs font-normal text-slate-500">Only moderators see this. It is never shown to the household.</span>
        </label>
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      </div>
    </ConfirmDialog>
  );
}
