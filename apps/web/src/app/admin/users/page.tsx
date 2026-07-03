import type { Metadata } from "next";
import { AdminUsersManager } from "@/components/admin/AdminUsersManager";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAdminData } from "@/services/adminService";

export const metadata: Metadata = {
  title: "Admin Users",
};

export default async function AdminUsersPage() {
  const data = await getAdminData();

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Admin"
        title="Owners"
        description="Review pet owner accounts, their profiles, and their tag orders."
      />
      <AdminUsersManager initialData={data} />
    </AdminLayout>
  );
}
