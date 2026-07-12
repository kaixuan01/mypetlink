import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminOrdersManager } from "@/components/admin/AdminOrdersManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { EMPTY_ADMIN_DATA } from "@/services/adminService";

export const metadata: Metadata = {
  title: "Admin Orders",
};

export default function AdminOrdersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Tag orders"
        description="Confirm manual payments and move orders through preparation, shipping, and delivery."
      />
      <Suspense
        fallback={
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">
            Loading orders...
          </div>
        }
      >
        <AdminOrdersManager initialData={EMPTY_ADMIN_DATA} />
      </Suspense>
    </>
  );
}
