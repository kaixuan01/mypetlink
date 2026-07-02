"use client";

import { useEffect, useState } from "react";
import { PetCard } from "@/components/portal/PetCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedTabs, type SegmentedTab } from "@/components/ui/SegmentedTabs";
import {
  getPetsByFilter,
  type PetLifecycleFilter,
} from "@/lib/petLifecycle";
import { ownerRoutes } from "@/lib/routes";
import { getPets } from "@/services/petService";
import { getAllTags, getOrders } from "@/services/tagService";
import type { Pet, PetTag, TagOrder } from "@/types";

type PetListProps = {
  initialPets: Pet[];
  initialTags: PetTag[];
  initialOrders: TagOrder[];
};

const petFilterTabs: (SegmentedTab & { id: PetLifecycleFilter })[] = [
  { id: "active", label: "Active" },
  { id: "memorial", label: "Memorial" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
];

export function PetList({
  initialPets,
  initialTags,
  initialOrders,
}: PetListProps) {
  const [pets, setPets] = useState(initialPets);
  const [tags, setTags] = useState(initialTags);
  const [orders, setOrders] = useState(initialOrders);
  const [filter, setFilter] = useState<PetLifecycleFilter>("active");

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

  const visiblePets = getPetsByFilter(pets, filter);

  const empty = getPetEmptyState(filter);

  return (
    <div className="grid gap-5">
      <SegmentedTabs
        ariaLabel="Filter pet profiles"
        activeId={filter}
        onChange={(id) => setFilter(id as PetLifecycleFilter)}
        tabs={petFilterTabs}
      />

      {visiblePets.length ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {visiblePets.map((pet) => (
            <PetCard
              key={pet.id}
              onPetUpdated={(updatedPet) =>
                setPets((current) =>
                  current.map((item) =>
                    item.id === updatedPet.id ? updatedPet : item
                  )
                )
              }
              orders={orders.filter((order) => order.petId === pet.id)}
              pet={pet}
              tags={tagsByPet.get(pet.id) ?? []}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={empty.title}
          description={empty.description}
          actionHref={empty.actionHref}
          actionLabel={empty.actionLabel}
        />
      )}
    </div>
  );
}

function getPetEmptyState(filter: PetLifecycleFilter) {
  if (filter === "archived") {
    return {
      title: "No archived profiles yet.",
      description:
        "Profiles you archive will appear here, while memories and records stay saved.",
    };
  }

  if (filter === "memorial") {
    return {
      title: "No memorial profiles.",
      description:
        "When a pet has passed away, Memorial Mode keeps their memories in one gentle place.",
    };
  }

  return {
    title: "No active profiles in this view.",
    description:
      "Add a pet profile or restore one from Archived when you want it back in your main list.",
    actionHref: ownerRoutes.petNew,
    actionLabel: "Add Pet",
  };
}
