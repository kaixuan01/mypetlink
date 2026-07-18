import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminPaymentProofsManager } from "@/components/admin/AdminPaymentProofsManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Admin Payment Proofs",
};

export default function AdminPaymentProofsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Payment proof review"
        description="Review uploaded receipts and confirm payments manually."
      />
      <Suspense
        fallback={
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">
            Loading payment proofs...
          </div>
        }
      >
        <AdminPaymentProofsManager />
      </Suspense>
    </>
  );
}
