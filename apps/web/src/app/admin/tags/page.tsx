import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminTagsManager } from "@/components/admin/AdminTagsManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Admin Smart Tags",
};

export default function AdminTagsPage() {
  return (
    <>
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
        <AdminTagsManager />
      </Suspense>
    </>
  );
}
