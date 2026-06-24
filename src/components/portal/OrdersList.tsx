"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { getOrders } from "@/services/tagService";
import type { Pet, TagOrder } from "@/types";

type OrdersListProps = {
  pets: Pet[];
  initialOrders: TagOrder[];
};

const orderTone = {
  Received: "warm",
  Preparing: "teal",
  Delivered: "mint",
} as const;

export function OrdersList({ pets, initialOrders }: OrdersListProps) {
  const [orders, setOrders] = useState(initialOrders);
  const petMap = useMemo(
    () => new Map(pets.map((pet) => [pet.id, pet])),
    [pets]
  );

  useEffect(() => {
    let active = true;

    getOrders().then((response) => {
      if (active) {
        setOrders(response.data);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  if (!orders.length) {
    return (
      <EmptyState
        icon="record"
        title="No tag orders yet"
        description="Orders for MyPetLink QR Tags and MyPetLink QR + NFC Smart Tags will appear here."
        actionHref="/pets/pet_milo/tags/order"
        actionLabel="Order Physical Tag"
      />
    );
  }

  return (
    <div className="grid gap-4">
      {orders.map((order) => {
        const pet = petMap.get(order.petId);

        return (
          <article
            className="brand-card rounded-[1.75rem] p-5"
            key={order.id}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge tone={orderTone[order.status]}>{order.status}</Badge>
                <h2 className="mt-3 text-xl font-black text-pet-ink">
                  {order.tagType}
                </h2>
                <p className="mt-1 text-sm text-pet-muted">
                  {pet?.name ?? "Pet profile"} - {order.design}
                </p>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                <Icon name="record" className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <SummaryItem label="Order date" value={order.orderedDate} />
              <SummaryItem label="Price" value={order.estimatedPrice} />
              <SummaryItem label="Recipient" value={order.delivery.recipientName} />
              <SummaryItem
                label="Delivery area"
                value={`${order.delivery.city}, ${order.delivery.state}`}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] bg-pet-cream p-4">
      <p className="text-xs font-bold uppercase text-pet-muted">{label}</p>
      <p className="mt-1 font-bold text-pet-ink">{value || "Not set"}</p>
    </div>
  );
}
