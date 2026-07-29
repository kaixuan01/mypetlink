import type { Metadata } from "next";
import { AdminOperationalStatusView } from "@/components/admin/AdminOperationalStatusView";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Operational Status",
};

export default function AdminOperationalStatusPage() {
  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Operational status"
        description="A read-only view of how MyPetLink is currently set up and running."
      />
      <AdminOperationalStatusView />
    </>
  );
}
