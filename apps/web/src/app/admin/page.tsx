import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { PageHeader } from "@/components/ui/PageHeader";
import { EMPTY_ADMIN_DATA } from "@/services/adminService";

export const metadata: Metadata = {
  title: "Admin Overview",
};

export default function AdminPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Operations overview"
        description="Track owners, pets, payment proofs, orders, and smart tags from one workspace."
      />
      <AdminDashboard initialData={EMPTY_ADMIN_DATA} />
    </>
  );
}
