import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPlansManager } from "@/components/admin/AdminPlansManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Admin Plans",
};

export default function AdminPlansPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Plans"
        description="Review plan packages, their limits, and how each owner's usage compares."
      />
      <Suspense
        fallback={
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">
            Loading plans...
          </div>
        }
      >
        <AdminPlansManager />
      </Suspense>
    </>
  );
}
