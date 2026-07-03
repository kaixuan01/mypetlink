import type { Metadata } from "next";
import { AdminSettingsView } from "@/components/admin/AdminSettingsView";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Admin Settings",
};

export default function AdminSettingsPage() {
  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Admin"
        title="Operations settings"
        description="Order, payment, pricing, support, and company settings for MyPetLink operations."
      />
      <AdminSettingsView />
    </AdminLayout>
  );
}
