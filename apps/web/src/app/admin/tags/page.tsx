import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminTagsManager } from "@/components/admin/AdminTagsManager";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAdminData } from "@/services/adminService";

export const metadata: Metadata = {
  title: "Admin Smart Tags",
};

export default async function AdminTagsPage() {
  const data = await getAdminData();

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Admin"
        title="Smart tags"
        description="Manage physical tags, their pet bindings, and their scan behavior."
      />
      <Suspense
        fallback={
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">
            Loading tags...
          </div>
        }
      >
        <AdminTagsManager initialData={data} />
      </Suspense>
    </AdminLayout>
  );
}
