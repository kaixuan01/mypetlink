import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminTagInventoryManager } from "@/components/admin/AdminTagInventoryManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Admin Tag Inventory",
};

export default function AdminTagInventoryPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Tag inventory"
        description="Generate tag codes and manage retail stock from printing through reseller delivery."
      />
      <Suspense
        fallback={
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">
            Loading tag inventory...
          </div>
        }
      >
        <AdminTagInventoryManager />
      </Suspense>
    </>
  );
}
