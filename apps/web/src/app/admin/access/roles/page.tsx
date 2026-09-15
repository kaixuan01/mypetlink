import type { Metadata } from "next";
import { AdminAccessRolesManager } from "@/components/admin/access/AdminAccessRolesManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Roles",
};

export default function AdminAccessRolesPage() {
  return (
    <>
      <PageHeader
        compactOnMobile
        eyebrow="Access Management"
        title="Roles"
        description="Reusable sets of permissions. Give someone a role instead of choosing permissions one by one."
      />
      <AdminAccessRolesManager />
    </>
  );
}
