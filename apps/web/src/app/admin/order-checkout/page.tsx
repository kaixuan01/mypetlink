import type { Metadata } from "next";
import { AdminOrderCheckoutSettingsManager } from "@/components/admin/AdminOrderCheckoutSettingsManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Order Checkout Settings" };

export default function AdminOrderCheckoutPage() {
  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Order checkout"
        description="Manage the unpaid payment window and review the automatic reservation-expiry status."
      />
      <AdminOrderCheckoutSettingsManager />
    </>
  );
}
