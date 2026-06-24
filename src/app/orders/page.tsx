import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { OrdersList } from "@/components/portal/OrdersList";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPets } from "@/services/petService";
import { getOrders } from "@/services/tagService";

export const metadata: Metadata = {
  title: "Orders",
};

export default async function OrdersPage() {
  const [pets, orders] = await Promise.all([getPets(), getOrders()]);

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Orders"
        title="Smart tag orders"
        description="Track QR tag and QR + NFC smart tag requests for your pets."
      />

      <OrdersList initialOrders={orders.data} pets={pets.data} />
    </AppLayout>
  );
}
