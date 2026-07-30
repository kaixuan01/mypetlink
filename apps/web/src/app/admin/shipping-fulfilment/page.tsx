import type { Metadata } from "next";
import { AdminShippingFulfilmentManager } from "@/components/admin/AdminShippingFulfilmentManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Shipping and Fulfilment Settings" };

export default function AdminShippingFulfilmentPage() {
  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Shipping and fulfilment"
        description="Manage parcel sender details, packing defaults and the couriers available during manual fulfilment."
      />
      <AdminShippingFulfilmentManager />
    </>
  );
}
