import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminTagProductsManager } from "@/components/admin/AdminTagProductsManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Admin Tag Catalog" };

export default function AdminTagProductsPage() {
  return (
    <>
      <PageHeader
        compactOnMobile
        eyebrow="Catalog"
        title="Tag catalog"
        description="Manage customer-facing products, production SKUs, prices, automatic promotions, and catalog settings."
      />
      {/* The manager reads its tab and open product/SKU from the URL. */}
      <Suspense fallback={null}>
        <AdminTagProductsManager />
      </Suspense>
    </>
  );
}
