import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminMerchantSalesWorkspace } from "@/components/admin/merchantSales/AdminMerchantSalesWorkspace";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Merchant Sales" };

export default function AdminMerchantSalesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Commerce"
        title="Merchant sales"
        description="Business customers, quotations, orders, invoices and receipts for bulk Smart Tag sales."
      />
      {/* The workspace reads its section and open record from the URL. */}
      <Suspense fallback={null}>
        <AdminMerchantSalesWorkspace />
      </Suspense>
    </>
  );
}
