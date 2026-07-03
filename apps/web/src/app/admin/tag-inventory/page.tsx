import type { Metadata } from "next";
import { AdminTagInventoryManager } from "@/components/admin/AdminTagInventoryManager";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAdminData } from "@/services/adminService";

export const metadata: Metadata = {
  title: "Admin Tag Inventory",
};

export default async function AdminTagInventoryPage() {
  const data = await getAdminData();

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Admin"
        title="Tag inventory"
        description="Generate tag codes and manage unclaimed retail stock for pet shops and resellers."
      />
      <AdminTagInventoryManager initialData={data} />
    </AdminLayout>
  );
}
