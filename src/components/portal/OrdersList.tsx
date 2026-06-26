"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { ownerRoutes } from "@/lib/routes";
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
  const [openOrderId, setOpenOrderId] = useState("");
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
    const orderHref = pets[0]
      ? ownerRoutes.petTagOrder(pets[0].id)
      : ownerRoutes.petNew;

    return (
      <EmptyState
        icon="record"
        title="No tag orders yet"
        description="Orders for MyPetLink QR Tags and QR + NFC Smart Tags will appear here with order number, delivery summary, View Order, and replacement actions."
        actionHref={orderHref}
        actionLabel="Order Physical Tag"
      />
    );
  }

  return (
    <div className="grid gap-4">
      {orders.map((order) => {
        const pet = petMap.get(order.petId);
        const replacementType = order.tagType.includes("NFC") ? "nfc" : "qr";
        const replacementHref = ownerRoutes.petTagOrder(order.petId, {
          type: replacementType,
        });
        const deliverySummary = [
          order.delivery.addressLine1,
          order.delivery.postcode,
          order.delivery.city,
          order.delivery.state,
        ]
          .filter(Boolean)
          .join(", ");

        return (
          <article
            className="brand-card rounded-[1.75rem] p-5"
            key={order.id}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge tone={orderTone[order.status]}>{order.status}</Badge>
                <h2 className="mt-3 text-xl font-black text-pet-ink">
                  {order.id}
                </h2>
                <p className="mt-1 text-sm text-pet-muted">
                  {pet?.name ?? "Pet profile"} - {order.tagType}
                </p>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                <Icon name="record" className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <SummaryItem label="Ordered date" value={order.orderedDate} />
              <SummaryItem label="Tag type" value={order.tagType} />
              <SummaryItem label="Status" value={order.status} />
              <SummaryItem
                label="Delivery summary"
                value={deliverySummary}
              />
            </div>

            {openOrderId === order.id ? (
              <div className="mt-4 grid gap-3 rounded-[1.25rem] bg-pet-cream p-4 md:grid-cols-3">
                <SummaryItem label="Shape" value={order.shape} />
                <SummaryItem label="Price" value={order.estimatedPrice} />
                <SummaryItem
                  label="Recipient"
                  value={order.delivery.recipientName}
                />
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
                onClick={() =>
                  setOpenOrderId((current) =>
                    current === order.id ? "" : order.id
                  )
                }
                type="button"
              >
                {openOrderId === order.id ? "Hide Order" : "View Order"}
              </button>
              {order.status === "Delivered" ? (
                <CTAButton href={replacementHref} icon="tag" variant="outline">
                  Order Replacement
                </CTAButton>
              ) : null}
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
