import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminCommunityMomentsManager } from "@/components/admin/AdminCommunityMomentsManager";

export const metadata: Metadata = {
  title: "Admin Community Moments",
};

export default function CommunityMomentsPage() {
  return (
    <Suspense>
      <AdminCommunityMomentsManager />
    </Suspense>
  );
}
