"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { activatePath, ownerRoutes, tagPath } from "@/lib/routes";
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
  Unassigned: "soft",
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
  const [disableTagTarget, setDisableTagTarget] = useState<PetTag | null>(null);
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

  async function handleDisable() {
    if (!disableTagTarget) {
      return;
    }

    const response = await disableTag(disableTagTarget.id);

    if (response.data) {
      setTags((current) =>
        current.map((tag) =>
          tag.id === disableTagTarget.id ? response.data! : tag
        )
      );
    }

    setDisableTagTarget(null);
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
        actionHref={petId ? ownerRoutes.petTagOrder(petId) : ownerRoutes.petNew}
        actionLabel="Order Physical Tag"
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {tags.map((tag) => {
          const linkedPet = tag.petId ? petMap.get(tag.petId) : undefined;
          const productName = tag.hasNfc
            ? "MyPetLink QR + NFC Smart Tag"
            : "MyPetLink QR Pet Tag";
          const isUnassigned = tag.status === "Unassigned";
          const replacementHref = tag.petId
            ? ownerRoutes.petTagOrder(tag.petId, {
                type: tag.hasNfc ? "nfc" : "qr",
                replacementFor: tag.id,
              })
            : "";

          return (
            <article
              className="brand-card rounded-[1.75rem] p-5"
              key={tag.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Badge tone={statusTone[tag.status]}>{tag.status}</Badge>
                  <p className="mt-3 text-xs font-bold uppercase text-pet-muted">
                    Tag code
                  </p>
                  <h2 className="text-2xl font-black tracking-wide text-pet-ink">
                    {tag.tagCode}
                  </h2>
                  <p className="mt-1 text-sm text-pet-muted">
                    {productName} - {tag.shape}
                  </p>
                </div>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                  <Icon name="tag" className="h-5 w-5" />
                </span>
              </div>

              <dl className="mt-5 grid gap-3 text-sm">
                {[
                  ["Linked pet", linkedPet?.name ?? "Not linked yet"],
                  ["Ordered date", tag.orderedDate ?? "Not ordered yet"],
                  ["Delivered date", tag.deliveredDate ?? "Not delivered yet"],
                  ["Last scanned", tag.lastScannedAt ?? "No scans yet"],
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
                  href={tagPath(tag.tagCode)}
                  icon="qr"
                  variant="secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                  fullWidth
                >
                  View Tag
                </CTAButton>
                {isUnassigned ? (
                  <CTAButton
                    href={activatePath(tag.tagCode)}
                    icon="paw"
                    fullWidth
                  >
                    Activate Tag
                  </CTAButton>
                ) : (
                  <>
                    {replacementHref ? (
                      <CTAButton href={replacementHref} icon="tag" fullWidth>
                        Order Replacement Tag
                      </CTAButton>
                    ) : null}
                    <button
                      className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-transparent px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={tag.status === "Disabled"}
                      onClick={() => setDisableTagTarget(tag)}
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
                  </>
                )}
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
            {lostTag.petId ? (
              <Link
                className="mt-4 block text-center text-sm font-bold text-pet-coral underline"
                href={ownerRoutes.petTagOrder(lostTag.petId, {
                  replacementFor: lostTag.id,
                })}
              >
                Order Replacement Tag
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {disableTagTarget ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-end bg-pet-ink/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
          role="dialog"
        >
          <div className="w-full max-w-lg rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem] sm:p-6">
            <h2 className="text-2xl font-black text-pet-ink">
              Disable this tag?
            </h2>
            <p className="mt-3 text-sm leading-6 text-pet-muted">
              This tag will stop opening {(disableTagTarget.petId ? petMap.get(disableTagTarget.petId)?.name : undefined) ?? "your pet"}&apos;s safety page.
              You can order a replacement tag anytime.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
                onClick={() => setDisableTagTarget(null)}
                type="button"
              >
                Keep Tag Active
              </button>
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#ffd2c9] bg-[#ffe8e3] px-5 py-3 text-sm font-bold text-[#a63c2e] transition hover:bg-[#ffd8cf]"
                onClick={handleDisable}
                type="button"
              >
                Disable Tag
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
