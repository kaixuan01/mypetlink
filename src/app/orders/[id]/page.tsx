import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { OrderDetailView } from "@/components/portal/OrderDetailView";
import { PageHeader } from "@/components/ui/PageHeader";
import { staticOrderParams } from "@/data/staticRouteParams";
import { formatOrderNumber } from "@/lib/orders";
import { getPets } from "@/services/petService";
import { getAllTags, getOrder } from "@/services/tagService";

type OrderDetailPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticOrderParams();
}

export async function generateMetadata({
  params,
}: OrderDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const order = await getOrder(id);

  return {
    title: order.data ? `${formatOrderNumber(order.data)} Order` : "Order",
  };
}

export default async function OrderDetailPage({
  params,
}: OrderDetailPageProps) {
  const { id } = await params;
  const [order, pets, tags] = await Promise.all([
    getOrder(id),
    getPets(),
    getAllTags(),
  ]);
  const orderNumber = order.data ? formatOrderNumber(order.data) : "Order";

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Order detail"
        title={orderNumber}
        description="Review tag order details, manual payment status, delivery information, and receipt availability."
      />

      <OrderDetailView
        initialOrder={order.data}
        initialTags={tags.data}
        orderKey={id}
        pets={pets.data}
      />
    </AppLayout>
  );
}
