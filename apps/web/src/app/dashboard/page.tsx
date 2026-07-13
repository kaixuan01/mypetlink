import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { DashboardClient } from "@/components/portal/DashboardClient";

export const metadata: Metadata = {
  title: "Owner Dashboard",
};

export default function DashboardPage() {
  return (
    <AppLayout>
      <DashboardClient
        initialMoments={[]}
        initialOrders={[]}
        initialPets={[]}
        initialRecords={[]}
        initialTags={[]}
      />
    </AppLayout>
  );
}
