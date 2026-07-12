import type { Metadata } from "next";
import { AdminPaymentProofsManager } from "@/components/admin/AdminPaymentProofsManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { EMPTY_ADMIN_DATA } from "@/services/adminService";

export const metadata: Metadata = {
  title: "Admin Payment Proofs",
};

export default function AdminPaymentProofsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Payment proof review"
        description="Review uploaded receipts and confirm payments manually."
      />
      <AdminPaymentProofsManager initialData={EMPTY_ADMIN_DATA} />
    </>
  );
}
