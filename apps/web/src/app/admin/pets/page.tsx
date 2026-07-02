import type { Metadata } from "next";
import { AdminPetsManager } from "@/components/admin/AdminPetsManager";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAdminData } from "@/services/adminService";

export const metadata: Metadata = {
  title: "Admin Pets",
};

export default async function AdminPetsPage() {
  const data = await getAdminData();

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Admin"
        title="Pet profiles"
        description="Review pet profiles, lifecycle status, Lost Mode, and linked smart tags."
      />
      <AdminPetsManager initialData={data} />
    </AdminLayout>
  );
}
