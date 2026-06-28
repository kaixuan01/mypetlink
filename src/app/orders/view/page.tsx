import type { Metadata } from "next";
import { Suspense } from "react";
import { AppLayout } from "@/components/layouts/AppLayout";
import { OrderViewClient } from "@/components/portal/OrderViewClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPets } from "@/services/petService";
import { getAllTags } from "@/services/tagService";

export const metadata: Metadata = {
  title: "Order",
};

export default async function OrderViewPage() {
  const [pets, tags] = await Promise.all([getPets(), getAllTags()]);

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Order detail"
        title="Order"
        description="Review your tag order, payment status, delivery information, and receipt."
      />
      <Suspense
        fallback={
          <div className="brand-card rounded-[1.75rem] p-6 text-sm font-semibold text-pet-muted">
            Loading your order...
          </div>
        }
      >
        <OrderViewClient initialTags={tags.data} pets={pets.data} />
      </Suspense>
    </AppLayout>
  );
}
