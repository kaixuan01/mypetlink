import type { Metadata } from "next";
import { AdminPlansView } from "@/components/admin/AdminPlansView";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Admin Plans",
};

export default function AdminPlansPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Plans"
        description="Review plan names, prices, billing notes, and included features."
      />
      <AdminPlansView />
    </>
  );
}
