"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useAdminOperationalData } from "@/components/admin/AdminOperationalContext";
import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminEmptyPanel, AdminStatusRow } from "@/components/admin/AdminStatus";
import { AttentionQueue, type AttentionQueueItem } from "@/components/admin/AttentionQueue";
import { adminRoutes } from "@/lib/routes";
import {
  buildDashboardSummary,
  buildRecentActivity,
  type AdminData,
  type AdminActivityItem,
} from "@/services/adminService";

export function AdminDashboard({ initialData }: { initialData: AdminData }) {
  const initial = useMemo(
    () => ({
      summary: buildDashboardSummary(initialData),
      activity: buildRecentActivity(initialData),
    }),
    [initialData]
  );
  const operational = useAdminOperationalData();
  const dashboard = operational.dashboard ?? initial;
  const error = operational.error;
  const { summary, activity } = dashboard;
  const attention: AttentionQueueItem[] = [
    {
      id: "payment-proofs",
      label: "Payment proofs awaiting review",
      count: summary.pendingPaymentProofs,
      detail: "Receipts and references waiting for a manual decision.",
      href: adminRoutes.paymentProofsAwaitingReview,
    },
    {
      id: "orders",
      label: "Orders requiring preparation or action",
      count: summary.ordersPreparing,
      detail: "Paid orders moving through preparation and dispatch.",
      href: adminRoutes.orders,
    },
  ];

  return (
    <div className="grid gap-4 sm:gap-5" data-testid="admin-dashboard">
      {error ? (
        <p className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]" role="alert">
          {error}
        </p>
      ) : null}

      <AdminSection compact title="Needs attention">
        <AttentionQueue
          emptyDescription="Current payment review and order preparation work is clear."
          items={attention}
        />
      </AdminSection>

      <AdminSection compact title="At a glance">
        <div className="grid md:grid-cols-2">
          <SummaryGroup title="Owners and pets">
            <AdminStatusRow label="Owners" value={summary.totalOwners} isZero={summary.totalOwners === 0} />
            <AdminStatusRow label="Pet profiles" value={summary.totalPets} isZero={summary.totalPets === 0} />
            <AdminStatusRow
              isZero={summary.lostModePets === 0}
              label="Lost Mode pets"
              tone={summary.lostModePets > 0 ? "warning" : "neutral"}
              value={summary.lostModePets}
            />
          </SummaryGroup>
          <SummaryGroup divided title="Smart tags">
            <AdminStatusRow label="Active" value={summary.activeTags} isZero={summary.activeTags === 0} />
            <AdminStatusRow label="Unclaimed retail stock" value={summary.unclaimedRetailTags} isZero={summary.unclaimedRetailTags === 0} />
            <AdminStatusRow
              isZero={summary.lostOrDisabledTags === 0}
              label="Lost or disabled"
              tone={summary.lostOrDisabledTags > 0 ? "warning" : "neutral"}
              value={summary.lostOrDisabledTags}
            />
          </SummaryGroup>
        </div>
      </AdminSection>

      <AdminSection compact title="Recent activity">
        <div className="grid lg:grid-cols-3">
          <ActivityList emptyText="No orders yet." items={activity.latestOrders} title="Recent orders" />
          <ActivityList divided emptyText="No payment proof submissions yet." items={activity.latestPaymentProofs} title="Recent payment proofs" />
          <ActivityList divided emptyText="No tag activity yet." items={activity.recentTags} title="Recent tag activity" />
        </div>
      </AdminSection>
    </div>
  );
}

function SummaryGroup({
  children,
  divided = false,
  title,
}: {
  children: ReactNode;
  divided?: boolean;
  title: string;
}) {
  return (
    <section className={`px-4 py-3 sm:px-5 sm:py-4 ${divided ? "border-t border-slate-200 md:border-l md:border-t-0" : ""}`}>
      <h3 className="mb-1 text-xs font-extrabold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

function ActivityList({
  title,
  items,
  emptyText,
  divided = false,
}: {
  title: string;
  items: AdminActivityItem[];
  emptyText: string;
  divided?: boolean;
}) {
  const headingId = `activity-${title.toLowerCase().replaceAll(" ", "-")}`;

  return (
    <section
      aria-labelledby={headingId}
      className={`min-w-0 px-4 py-3 sm:px-5 sm:py-4 ${divided ? "border-t border-slate-200 lg:border-l lg:border-t-0" : ""}`}
    >
      <h3 className="text-sm font-black text-slate-900" id={headingId}>{title}</h3>
      {items.length === 0 ? (
        <AdminEmptyPanel compact icon="record" title={emptyText} />
      ) : (
        <div className="mt-2 divide-y divide-slate-100">
          {items.map((item) => (
            <Link
              className="block py-2.5 transition first:pt-1 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1570ef]"
              href={item.href}
              key={item.id}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-bold text-slate-950">{item.title}</span>
                <span className="shrink-0 text-xs font-semibold text-slate-400">{item.date}</span>
              </div>
              <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{item.detail}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
