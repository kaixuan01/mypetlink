import type { Metadata } from "next";
import { AdminUsersManager } from "@/components/admin/AdminUsersManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Admin Users",
};

export default function AdminUsersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Owners"
        description="Review pet owner accounts, their profiles, and their tag orders."
      />
      <AdminUsersManager />
    </>
  );
}
