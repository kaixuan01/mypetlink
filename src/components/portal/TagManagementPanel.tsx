"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import {
  disableTag,
  getAllTags,
  getPetTags,
  reportTagLost,
} from "@/services/tagService";
import type { Pet, PetTag, TagStatus } from "@/types";

type TagManagementPanelProps = {
  pets: Pet[];
  initialTags: PetTag[];
  petId?: string;
};

const statusTone: Record<TagStatus, "warm" | "mint" | "teal" | "soft" | "danger"> = {
  Pending: "warm",
  Preparing: "teal",
  Delivered: "mint",
  Active: "mint",
  Disabled: "soft",
  Lost: "danger",
  Replaced: "soft",
};

export function TagManagementPanel({
  pets,
  initialTags,
  petId,
}: TagManagementPanelProps) {
  const [tags, setTags] = useState(initialTags);
  const [lostTag, setLostTag] = useState<PetTag | null>(null);
  const petMap = useMemo(
    () => new Map(pets.map((pet) => [pet.id, pet])),
    [pets]
  );

  useEffect(() => {
    let active = true;
    const request = petId ? getPetTags(petId) : getAllTags();

    request.then((response) => {
      if (active) {
        setTags(response.data);
      }
    });

    return () => {
      active = false;
    };
  }, [petId]);

  async function handleDisable(tagId: string) {
    const response = await disableTag(tagId);

    if (response.data) {
      setTags((current) =>
        current.map((tag) => (tag.id === tagId ? response.data! : tag))
      );
    }
  }

  async function handleReportLost() {
    if (!lostTag) {
      return;
    }

    const response = await reportTagLost(lostTag.id);

    if (response.data) {
      setTags((current) =>
        current.map((tag) => (tag.id === lostTag.id ? response.data! : tag))
      );
    }

    setLostTag(null);
  }

  if (!tags.length) {
    return (
      <EmptyState
        icon="tag"
        title="No physical tags yet"
        description="Order a MyPetLink QR Tag or MyPetLink QR + NFC Smart Tag so your pet's profile is easy to open if they are found."
        actionHref={petId ? `/pets/${petId}/tags/order` : "/pets/pet_milo/tags/order"}
        actionLabel="Order Physical Tag"
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {tags.map((tag) => {
          const pet = petMap.get(tag.petId);
          const replacementHref = `/pets/${tag.petId}/tags/order?replacementFor=${tag.id}&type=${
            tag.tagType === "MyPetLink QR + NFC Smart Tag" ? "nfc" : "qr"
          }`;

          return (
            <article
              className="brand-card rounded-[1.75rem] p-5"
              key={tag.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Badge tone={statusTone[tag.status]}>{tag.status}</Badge>
                  <h2 className="mt-3 text-xl font-black text-pet-ink">
                    {tag.tagType}
                  </h2>
                  <p className="mt-1 text-sm text-pet-muted">{tag.design}</p>
                </div>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                  <Icon name="tag" className="h-5 w-5" />
                </span>
              </div>

              <dl className="mt-5 grid gap-3 text-sm">
                {[
                  ["Tag code", tag.tagCode],
                  ["Linked pet", pet?.name ?? "Pet profile"],
                  ["Ordered date", tag.orderedDate],
                  ["Delivered date", tag.deliveredDate ?? "Not delivered yet"],
                  ["Last scanned", tag.lastScannedDate ?? "No scans yet"],
                ].map(([label, value]) => (
                  <div
                    className="rounded-[1.25rem] bg-pet-cream p-4"
                    key={label}
                  >
                    <dt className="text-xs font-bold uppercase text-pet-muted">
                      {label}
                    </dt>
                    <dd className="mt-1 font-bold text-pet-ink">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <CTAButton
                  href={`/t/${tag.tagCode}`}
                  icon="qr"
                  variant="secondary"
                  fullWidth
                >
                  View Tag
                </CTAButton>
                <CTAButton href={replacementHref} icon="tag" fullWidth>
                  Order Replacement Tag
                </CTAButton>
                <button
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-transparent px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={tag.status === "Disabled"}
                  onClick={() => handleDisable(tag.id)}
                  type="button"
                >
                  Disable Tag
                </button>
                <button
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#ffd2c9] bg-[#fff4f1] px-5 py-3 text-sm font-bold text-[#a63c2e] transition hover:bg-[#ffe8e3] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={tag.status === "Lost" || tag.status === "Replaced"}
                  onClick={() => setLostTag(tag)}
                  type="button"
                >
                  Report Lost
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {lostTag ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-end bg-pet-ink/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
          role="dialog"
        >
          <div className="w-full max-w-lg rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem] sm:p-6">
            <h2 className="text-2xl font-black text-pet-ink">
              Report this tag lost?
            </h2>
            <p className="mt-3 text-sm leading-6 text-pet-muted">
              This will disable the old tag so it can no longer open your
              pet&apos;s profile.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
                onClick={() => setLostTag(null)}
                type="button"
              >
                Keep Tag
              </button>
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#ffd2c9] bg-[#ffe8e3] px-5 py-3 text-sm font-bold text-[#a63c2e] transition hover:bg-[#ffd8cf]"
                onClick={handleReportLost}
                type="button"
              >
                Report Lost
              </button>
            </div>
            <Link
              className="mt-4 block text-center text-sm font-bold text-pet-coral underline"
              href={`/pets/${lostTag.petId}/tags/order?replacementFor=${lostTag.id}`}
            >
              Order Replacement Tag
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
