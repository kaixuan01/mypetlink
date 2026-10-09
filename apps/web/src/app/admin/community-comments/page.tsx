import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminCommunityCommentsManager } from "@/components/admin/AdminCommunityCommentsManager";

export const metadata: Metadata = {
  title: "Admin Community Comments",
};

export default function CommunityCommentsPage() {
  return (
    <Suspense>
      <AdminCommunityCommentsManager />
    </Suspense>
  );
}
