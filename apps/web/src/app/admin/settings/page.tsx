import type { Metadata } from "next";
import { AdminSettingsView } from "@/components/admin/AdminSettingsView";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Admin Settings",
};

export default function AdminSettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Operations settings"
        description="Order, payment, pricing, support, and company settings for MyPetLink operations."
      />
      <AdminSettingsView />
    </>
  );
}
