"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { StatCard } from "@/components/ui/StatCard";
import {
  buildDashboardSummary,
  buildRecentActivity,
  getAdminData,
  type AdminData,
  type AdminActivityItem,
} from "@/services/adminService";

const quickActions = [
  { href: "/admin/payment-proofs", label: "Review Payment Proofs" },
  { href: "/admin/orders", label: "View Orders" },
  { href: "/admin/tags", label: "Manage Tags" },
  { href: "/admin/tag-inventory", label: "Generate Tag Codes" },
  { href: "/admin/tag-inventory", label: "View Tag Inventory" },
];

export function AdminDashboard({ initialData }: { initialData: AdminData }) {
  const [data, setData] = useState(initialData);

  useEffect(() => {
    let active = true;

    getAdminData().then((next) => {
      if (active) {
        setData(next);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => buildDashboardSummary(data), [data]);
  const activity = useMemo(() => buildRecentActivity(data), [data]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="users"
          label="Total owners"
          note="Owner accounts"
          value={summary.totalOwners}
        />
        <StatCard
          icon="pets"
          label="Total pets"
          note={`${summary.lostModePets} in Lost Mode`}
          tone="mint"
          value={summary.totalPets}
        />
        <StatCard
          icon="shield"
          label="Pending payment proofs"
          note="Awaiting manual review"
          tone="warm"
          value={summary.pendingPaymentProofs}
        />
        <StatCard
          icon="record"
          label="Orders in preparation"
          note="Confirmed or preparing"
          tone="teal"
          value={summary.ordersPreparing}
        />
        <StatCard
          icon="tag"
          label="Active smart tags"
          note="Scans open safety content"
          tone="mint"
          value={summary.activeTags}
        />
        <StatCard
          icon="tag"
          label="Lost / disabled tags"
          note="Not exposing owner contact"
          tone="warm"
          value={summary.lostOrDisabledTags}
        />
        <StatCard
          icon="qr"
          label="Unclaimed retail tags"
          note="Ready for activation"
          tone="soft"
          value={summary.unclaimedRetailTags}
        />
      </div>

      <AdminSection
        title="Quick actions"
        description="Common Phase 1 manual operations."
      >
        <div className="flex flex-wrap gap-2 p-4">
          {quickActions.map((action) => (
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-950 bg-slate-950 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-slate-800"
              href={action.href}
              key={action.label}
            >
              {action.label}
            </Link>
          ))}
        </div>
      </AdminSection>

      <div className="grid gap-4 xl:grid-cols-3">
        <ActivityList
          emptyText="No orders yet."
          items={activity.latestOrders}
          title="Latest orders"
        />
        <ActivityList
          emptyText="No payment proof submissions yet."
          items={activity.latestPaymentProofs}
          title="Latest payment proofs"
        />
        <ActivityList
          emptyText="No tag activity yet."
          items={activity.recentTags}
          title="Recent tag activity"
        />
      </div>
    </div>
  );
}

function ActivityList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: AdminActivityItem[];
  emptyText: string;
}) {
  return (
    <AdminSection title={title}>
      <div className="grid gap-2 p-4">
        {items.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-sm font-semibold text-slate-500">
            {emptyText}
          </p>
        ) : (
          items.map((item) => (
            <Link
              className="rounded-xl bg-slate-50 px-3 py-2.5 transition hover:bg-slate-100"
              href={item.href}
              key={item.id}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold text-slate-950">
                  {item.title}
                </span>
                <span className="shrink-0 text-xs font-semibold text-slate-400">
                  {item.date}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                {item.detail}
              </p>
            </Link>
          ))
        )}
      </div>
    </AdminSection>
  );
}
