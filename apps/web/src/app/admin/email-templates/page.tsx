import type { Metadata } from "next";
import { AdminEmailTemplatesManager } from "@/components/admin/AdminEmailTemplatesManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Email Templates",
};

export default function AdminEmailTemplatesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Email templates"
        description="Choose which customer emails MyPetLink sends. Turning one on only affects new events."
      />
      <AdminEmailTemplatesManager />
    </>
  );
}
