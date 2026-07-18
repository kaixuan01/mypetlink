"use client";

import { useModalDialogFocus } from "@/lib/useModalDialogFocus";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AdminDetailItem } from "@/components/admin/AdminPanels";
import { formatAdminDate, formatAdminDateTime } from "@/components/admin/adminDisplay";
import { Badge } from "@/components/ui/Badge";
import { adminRoutes } from "@/lib/routes";
import {
  getAdminOwnerPlanDetail,
  planStatusLabels,
  usageStateLabels,
  type AdminOwnerPlan,
  type AdminOwnerPlanDetail,
  type AdminUsageState,
} from "@/services/adminPlanService";

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

// Usage meter that always communicates state in text; the bar is decorative.
function UsageMeter({
  label,
  used,
  limit,
  state,
  detail,
}: {
  label: string;
  used: number;
  limit: number;
  state: AdminUsageState;
  detail?: string;
}) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-900">{label}</span>
        <span className="text-sm font-black text-slate-900">
          {used} / {limit > 0 ? limit : "—"}
          <span className="ms-2 font-bold text-slate-500">{usageStateLabels[state]}</span>
        </span>
      </div>
      {detail ? (
        <p className="mt-0.5 text-xs font-semibold text-slate-500">{detail}</p>
      ) : null}
      <div aria-hidden="true" className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${
            state === "Over" ? "bg-[#d06a5b]" : state === "Within" ? "bg-pet-teal" : "bg-[#d99a3d]"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function EntitlementRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <li className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
      <span className="font-bold text-slate-900">{label}</span>
      <span className={`font-extrabold ${enabled ? "text-[#2e7d5b]" : "text-slate-400"}`}>
        {enabled ? "Included" : "Not included"}
      </span>
    </li>
  );
}

// Slide-over with the operational plan record for one owner: current plan,
// usage against enforced limits, entitlements, overrides, and plan history.
export function AdminOwnerPlanDetailDrawer({
  summary,
  onClose,
}: {
  summary: AdminOwnerPlan;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [detail, setDetail] = useState<AdminOwnerPlanDetail | null>(null);
  const [detailError, setDetailError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    getAdminOwnerPlanDetail(summary.ownerUserId, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setDetail(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setDetailError(true);
      });

    return () => controller.abort();
  }, [summary.ownerUserId]);

  useModalDialogFocus({ dialogRef, onEscape: onClose });

  const item = detail?.item ?? summary;
  const hasOverride = item.hasOverride || item.grandfathered;

  return (
    <div
      aria-label={`Plan details for ${summary.displayName}`}
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-pet-ink/35 backdrop-blur-sm"
      role="dialog"
    >
      <button
        aria-label="Close plan details"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl" ref={dialogRef}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-extrabold uppercase text-slate-400">Owner plan</p>
            <h2 className="text-xl font-black text-slate-950">{item.displayName}</h2>
            <p className="break-all text-sm font-semibold text-slate-500">{item.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="teal">{item.planName}</Badge>
              <Badge tone="soft">Assigned</Badge>
              {hasOverride ? <Badge tone="warm">Manual override</Badge> : null}
            </div>
          </div>
          <button
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="grid gap-4 p-5">
          <section className="grid grid-cols-2 gap-2">
            <AdminDetailItem label="Plan" value={`${item.planName} (${item.planCode})`} />
            <AdminDetailItem
              label="Plan availability"
              value={planStatusLabels[item.planStatus] ?? item.planStatus}
            />
            <AdminDetailItem label="Effective since" value={formatAdminDate(item.assignedAt)} />
            <AdminDetailItem label="Last updated" value={formatAdminDateTime(item.updatedAt)} />
            {detail?.plan ? (
              <AdminDetailItem label="Price" value={detail.plan.priceLabel} />
            ) : null}
            {detail?.plan?.billingNote ? (
              <AdminDetailItem label="Billing" value={detail.plan.billingNote} />
            ) : null}
          </section>

          <section>
            <h3 className="text-sm font-black text-slate-900">Usage</h3>
            <div className="mt-2 grid gap-2">
              <UsageMeter
                detail={
                  detail
                    ? `${item.petCount} total: ${item.activePetCount} active, ${detail.memorialPetCount} memorial, ${detail.archivedPetCount} archived. Only active pets count toward the limit.`
                    : "Only active pets count toward the limit."
                }
                label="Active pet profiles"
                limit={item.maxPets}
                state={item.petUsageState}
                used={item.activePetCount}
              />
              <UsageMeter
                detail={`${item.totalMemoryCount} memories across all pets. The limit applies per pet.`}
                label="Memories on the busiest pet"
                limit={item.maxMemoriesPerPet}
                state={item.memoryUsageState}
                used={item.highestMemoriesOnPet}
              />
              <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">Care records</span>
                  <span className="font-black text-slate-900">
                    {item.careRecordCount} / {item.maxCareRecords > 0 ? item.maxCareRecords : "—"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  Shown for reference. Care records are not limited yet.
                </p>
              </div>
              {detail ? (
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">Stored media</span>
                    <span className="font-black text-slate-900">
                      {detail.readyMediaFileCount} file{detail.readyMediaFileCount === 1 ? "" : "s"} ·{" "}
                      {formatBytes(detail.readyMediaStorageBytes)}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
            {item.petUsageState === "Over" || item.memoryUsageState === "Over" ? (
              <p className="mt-2 rounded-xl bg-[#fff7ec] px-3 py-2 text-xs font-semibold text-[#8a5a1d]">
                This owner is above a current limit from early access or a support
                allowance. Existing pets and memories always remain safe — limits
                only apply to creating new ones.
              </p>
            ) : null}
          </section>

          {detail?.plan ? (
            <section>
              <h3 className="text-sm font-black text-slate-900">Plan entitlements</h3>
              <ul className="mt-2 grid gap-1.5">
                <EntitlementRow enabled={detail.plan.allowsSmartTagAddOns} label="Smart Tag add-ons" />
                <EntitlementRow enabled={detail.plan.allowsFoundReports} label="Found reports" />
                <EntitlementRow enabled={detail.plan.allowsAdvancedThemes} label="Advanced themes" />
                <EntitlementRow enabled={detail.plan.scanHistoryDays > 0} label="Scan history" />
                <EntitlementRow enabled={detail.plan.maxFamilyMembers > 0} label="Family access" />
              </ul>
            </section>
          ) : null}

          <section>
            <h3 className="text-sm font-black text-slate-900">Manual overrides</h3>
            {hasOverride ? (
              <div className="mt-2 grid gap-2">
                {detail?.overrideNotes ? (
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                    {detail.overrideNotes}
                  </p>
                ) : null}
                {item.grandfathered ? (
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                    Legacy allowance from early access
                    {detail?.grandfatheredAt
                      ? ` recorded ${formatAdminDate(detail.grandfatheredAt)}`
                      : ""}
                    .
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm font-semibold text-slate-500">
                No manual overrides on this account.
              </p>
            )}
          </section>

          <section className="flex flex-wrap gap-1.5">
            <Link
              className="inline-flex min-h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50"
              href={adminRoutes.owner(item.ownerUserId)}
            >
              View Owner
            </Link>
            <Link
              className="inline-flex min-h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50"
              href={adminRoutes.petsForOwner(item.ownerUserId)}
            >
              View Pet Profiles
            </Link>
            <Link
              className="inline-flex min-h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50"
              href={adminRoutes.ordersForOwner(item.ownerUserId)}
            >
              View Orders
            </Link>
          </section>

          <section>
            <h3 className="text-sm font-black text-slate-900">Plan history</h3>
            {detailError ? (
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Plan history is not available right now.
              </p>
            ) : !detail ? (
              <p className="mt-2 text-sm font-semibold text-slate-500" role="status">
                Loading history…
              </p>
            ) : detail.history.length === 0 ? (
              <p className="mt-2 text-sm font-semibold text-slate-500">
                No plan changes recorded for this owner.
              </p>
            ) : (
              <ol className="mt-2 grid gap-1.5">
                {detail.history.map((entry, index) => (
                  <li
                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm"
                    key={`${entry.label}-${entry.createdAt}-${index}`}
                  >
                    <span className="font-bold text-slate-900">
                      {entry.label}
                      <span className="block text-xs font-semibold text-slate-500">{entry.actor}</span>
                    </span>
                    <span className="shrink-0 font-semibold text-slate-500">
                      {formatAdminDateTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <p className="rounded-xl bg-[#f0f7ff] px-3 py-2 text-xs font-semibold text-[#1b4f9c]">
            Plans cannot be changed from this screen yet. Premium is not on sale,
            so there is no upgrade, downgrade, or billing action to take.
          </p>
        </div>
      </aside>
    </div>
  );
}
