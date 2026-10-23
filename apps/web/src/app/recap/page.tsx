import type { Metadata } from "next";
import Link from "next/link";
import { AppLayout } from "@/components/layouts/AppLayout";
import { WeeklyRecapClient } from "@/components/portal/recap/WeeklyRecapClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { weeklyRecapEnabled } from "@/lib/features";
import { ownerRoutes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Weekly Recap",
};

/**
 * One pet's Weekly Recap. A fixed page; the pet and week are read from the
 * address on the client, so it serves any pet under static export.
 */
export default function WeeklyRecapPage() {
  if (!weeklyRecapEnabled) {
    return (
      <AppLayout>
        <PageHeader
          description="A look back at each pet's week is on its way."
          eyebrow="Weekly recap"
          title="Weekly recaps aren't available yet"
        />
        <Link
          className="inline-flex min-h-11 items-center rounded-full border border-pet-teal/35 bg-white px-4 text-sm font-bold text-pet-teal transition hover:border-pet-teal hover:bg-[#e8f3ff]"
          href={ownerRoutes.dashboard}
        >
          Back to Home
        </Link>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <WeeklyRecapClient />
    </AppLayout>
  );
}
