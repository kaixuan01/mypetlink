import type { Metadata } from "next";
import { AdminPetsManager } from "@/components/admin/AdminPetsManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { EMPTY_ADMIN_DATA } from "@/services/adminService";

export const metadata: Metadata = {
  title: "Admin Pets",
};

export default function AdminPetsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Pet profiles"
        description="Review pet profiles, lifecycle status, Lost Mode, and linked smart tags."
      />
      <AdminPetsManager initialData={EMPTY_ADMIN_DATA} />
    </>
  );
}
