import type { Metadata } from "next";
import { AdminPaymentProofsManager } from "@/components/admin/AdminPaymentProofsManager";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAdminData } from "@/services/adminService";

export const metadata: Metadata = {
  title: "Admin Payment Proofs",
};

export default async function AdminPaymentProofsPage() {
  const data = await getAdminData();

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Admin"
        title="Payment proof review"
        description="Review uploaded receipts and confirm payments manually."
      />
      <AdminPaymentProofsManager initialData={data} />
    </AdminLayout>
  );
}
