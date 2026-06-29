"use client";

import { useEffect, useState } from "react";
import { PetCard } from "@/components/portal/PetCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ownerRoutes } from "@/lib/routes";
import { getPets } from "@/services/petService";
import { getAllTags, getOrders } from "@/services/tagService";
import type { Pet, PetTag, TagOrder } from "@/types";

type PetListProps = {
  initialPets: Pet[];
  initialTags: PetTag[];
  initialOrders: TagOrder[];
};

export function PetList({
  initialPets,
  initialTags,
  initialOrders,
}: PetListProps) {
  const [pets, setPets] = useState(initialPets);
  const [tags, setTags] = useState(initialTags);
  const [orders, setOrders] = useState(initialOrders);

  useEffect(() => {
    let active = true;

    Promise.all([getPets(), getAllTags(), getOrders()]).then(
      ([petsResponse, tagsResponse, ordersResponse]) => {
        if (!active) {
          return;
        }

        setPets(petsResponse.data);
        setTags(tagsResponse.data);
        setOrders(ordersResponse.data);
      }
    );

    return () => {
      active = false;
    };
  }, []);

  const tagsByPet = new Map<string, PetTag[]>();
  for (const tag of tags) {
    if (!tag.petId) {
      continue;
    }

    tagsByPet.set(tag.petId, [...(tagsByPet.get(tag.petId) ?? []), tag]);
  }

  if (!pets.length) {
    return (
      <EmptyState
        title="No pets yet"
        description="Create your first profile to generate a safe QR page."
        actionHref={ownerRoutes.petNew}
        actionLabel="Add Pet"
      />
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {pets.map((pet) => (
        <PetCard
          key={pet.id}
          orders={orders.filter((order) => order.petId === pet.id)}
          pet={pet}
          tags={tagsByPet.get(pet.id) ?? []}
        />
      ))}
    </div>
  );
}
