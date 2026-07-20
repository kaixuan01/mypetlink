import type { Metadata } from "next";
import { AdminTagProductsManager } from "@/components/admin/AdminTagProductsManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Admin Tag Products" };

export default function AdminTagProductsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Tag products"
        description="Manage customer-facing products, production SKUs, prices, and automatic promotions."
      />
      <AdminTagProductsManager />
    </>
  );
}
