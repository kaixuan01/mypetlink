import type { Metadata } from "next";
import { AdminAccessUsersManager } from "@/components/admin/access/AdminAccessUsersManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Admin Users",
};

export default function AdminAccessUsersPage() {
  return (
    <>
      <PageHeader
        compactOnMobile
        eyebrow="Access Management"
        title="Admin users"
        description="Who can sign in to the Admin Portal, and what each of them is allowed to do."
      />
      <AdminAccessUsersManager />
    </>
  );
}
