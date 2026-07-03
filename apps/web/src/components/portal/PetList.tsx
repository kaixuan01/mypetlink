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
import { isApiConfigured } from "@/services/apiConfig";
import {
  getFriendlyApiErrorMessage,
  getPets,
} from "@/services/petService";
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
  const apiMode = isApiConfigured();
  const [pets, setPets] = useState<Pet[]>(apiMode ? [] : initialPets);
  const [tags, setTags] = useState<PetTag[]>(apiMode ? [] : initialTags);
  const [orders, setOrders] = useState<TagOrder[]>(apiMode ? [] : initialOrders);
  const [filter, setFilter] = useState<PetLifecycleFilter>("active");
  const [loading, setLoading] = useState(apiMode);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    async function loadPets() {
      try {
        const petsResponse = await getPets();

        if (!active) {
          return;
        }

        setPets(petsResponse.data);

        if (apiMode) {
          setTags([]);
          setOrders([]);
          return;
        }

        const [tagsResponse, ordersResponse] = await Promise.all([
          getAllTags(),
          getOrders(),
        ]);

        if (!active) {
          return;
        }

        setTags(tagsResponse.data);
        setOrders(ordersResponse.data);
      } catch (caught) {
        if (active) {
          setError(getFriendlyApiErrorMessage(caught));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPets();

    return () => {
      active = false;
    };
  }, [apiMode]);

  const tagsByPet = new Map<string, PetTag[]>();
  for (const tag of tags) {
    if (!tag.petId) {
      continue;
    }

    tagsByPet.set(tag.petId, [...(tagsByPet.get(tag.petId) ?? []), tag]);
  }

  if (loading) {
    return (
      <div className="brand-card rounded-[1.75rem] p-6">
        <p className="text-sm font-semibold text-pet-muted">
          Loading your pet profiles...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <section className="brand-card rounded-[1.75rem] p-6">
        <p className="text-sm font-bold uppercase text-pet-teal">
          Could not load pets
        </p>
        <h2 className="mt-2 text-2xl font-black text-pet-ink">
          Your pet list is temporarily unavailable.
        </h2>
        <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-pet-muted">
          {error}
        </p>
        <button
          className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
          onClick={() => window.location.reload()}
          type="button"
        >
          Try Again
        </button>
      </section>
    );
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
