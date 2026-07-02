import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { OrdersList } from "@/components/portal/OrdersList";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPets } from "@/services/petService";
import { getAllTags, getOrders } from "@/services/tagService";

export const metadata: Metadata = {
  title: "Orders",
};

export default async function OrdersPage() {
  const [pets, orders, tags] = await Promise.all([
    getPets(),
    getOrders(),
    getAllTags(),
  ]);

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Orders"
        title="Smart tag orders"
        description="Track QR tag and QR + NFC smart tag requests for your pets."
      />

      <OrdersList
        initialOrders={orders.data}
        initialTags={tags.data}
        pets={pets.data}
      />
    </AppLayout>
  );
}
