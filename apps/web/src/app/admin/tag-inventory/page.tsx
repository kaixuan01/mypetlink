import type { Metadata } from "next";
import { AdminTagInventoryManager } from "@/components/admin/AdminTagInventoryManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { EMPTY_ADMIN_DATA } from "@/services/adminService";

export const metadata: Metadata = {
  title: "Admin Tag Inventory",
};

export default function AdminTagInventoryPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Tag inventory"
        description="Generate tag codes and manage unclaimed retail stock for pet shops and resellers."
      />
      <AdminTagInventoryManager initialData={EMPTY_ADMIN_DATA} />
    </>
  );
}
