"use client";

import { useSearchParams } from "next/navigation";
import { OrderDetailView } from "@/components/portal/OrderDetailView";
import type { Pet, PetTag } from "@/types";

type OrderViewClientProps = {
  pets: Pet[];
  initialTags: PetTag[];
};

// Reads the order number from the query string (?order=MPL-ORD-...) so a single
// static page can render any order — including runtime-created orders that were
// never pre-rendered. The order itself is resolved on the client by
// OrderDetailView via getOrder().
export function OrderViewClient({ pets, initialTags }: OrderViewClientProps) {
  const orderKey = useSearchParams().get("order") ?? "";

  return (
    <OrderDetailView
      initialOrder={null}
      initialTags={initialTags}
      orderKey={orderKey}
      pets={pets}
    />
  );
}
