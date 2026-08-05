import type { Metadata } from "next";
import { AdminBusinessIdentityManager } from "@/components/admin/AdminBusinessIdentityManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Business Identity" };

export default function AdminBusinessIdentityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Business identity"
        description="The business name, registration, address and payment details printed on customer receipts and business documents."
      />
      <AdminBusinessIdentityManager />
    </>
  );
}
