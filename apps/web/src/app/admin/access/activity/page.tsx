import type { Metadata } from "next";
import { AdminAccessActivityLog } from "@/components/admin/access/AdminAccessActivityLog";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Activity History",
};

export default function AdminAccessActivityPage() {
  return (
    <>
      <PageHeader
        compactOnMobile
        eyebrow="Access Management"
        title="Activity history"
        description="A record of changes to who can use the Admin Portal and what they can do."
      />
      <AdminAccessActivityLog />
    </>
  );
}
