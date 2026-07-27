import type { Metadata } from "next";
import { AdminDeliveryRatesManager } from "@/components/admin/AdminDeliveryRatesManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Admin Delivery Rates" };

export default function AdminDeliveryRatesPage() {
  return <>
    <PageHeader eyebrow="Admin" title="Delivery rates" description="Manage Malaysia delivery fees and free-delivery thresholds by zone." />
    <AdminDeliveryRatesManager />
  </>;
}
