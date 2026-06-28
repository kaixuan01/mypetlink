"use client";

import Link from "next/link";
import { useState } from "react";
import {
  getQrStatusBadge,
  getSmartTagStatusBadge,
} from "@/components/portal/ProfileAccessStatus";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { ownerRoutes } from "@/lib/routes";
import type { Pet, PetTag } from "@/types";

type PetCardProps = {
  pet: Pet;
  tags?: PetTag[];
};

const moreLinks = (petId: string) => [
  { label: "Edit profile", href: ownerRoutes.petEdit(petId) },
  { label: "QR safety page", href: ownerRoutes.petQr(petId) },
  { label: "Care records", href: ownerRoutes.petRecords(petId) },
  { label: "Moments", href: ownerRoutes.petMoments(petId) },
  { label: "Smart tags", href: ownerRoutes.petTags(petId) },
  { label: "Order tag", href: ownerRoutes.petTagOrder(petId) },
];

export function PetCard({ pet, tags = [] }: PetCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const qrBadge = getQrStatusBadge(pet.qrStatus, pet.qrSafetyPath);
  const tagBadge = getSmartTagStatusBadge(tags);

  return (
    <article className="brand-card flex flex-col rounded-[1.75rem] p-5">
      <div className="flex items-start gap-4">
        <PetAvatar pet={pet} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-black text-pet-ink">{pet.name}</h3>
            <Badge tone={qrBadge.tone}>{qrBadge.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-pet-muted">
            {pet.species} - {pet.breed} - {pet.ageLabel}
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-pet-cream px-3 py-1 text-xs font-bold text-pet-muted">
            <Icon name="tag" className="h-3.5 w-3.5 text-pet-teal" />
            {tagBadge.label}
          </div>
          {pet.emergencyNote ? (
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-pet-muted">
              {pet.emergencyNote}
            </p>
          ) : null}
        </div>
      </div>

      <div className="relative mt-auto flex items-center gap-3 pt-5">
        <CTAButton href={ownerRoutes.petProfile(pet.id)} fullWidth>
          Manage
        </CTAButton>
        <CTAButton
          href={pet.publicProfilePath}
          variant="secondary"
          target="_blank"
          rel="noopener noreferrer"
          fullWidth
        >
          Public Profile
        </CTAButton>
        <button
          aria-expanded={menuOpen}
          aria-label="More actions"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-pet-border bg-white text-pet-muted transition hover:bg-pet-cream"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          <Icon name="settings" className="h-5 w-5" />
        </button>

        {menuOpen ? (
          <>
            <button
              aria-hidden="true"
              className="fixed inset-0 z-20 cursor-default"
              onClick={() => setMenuOpen(false)}
              tabIndex={-1}
              type="button"
            />
            <div className="absolute bottom-14 right-0 z-30 w-52 overflow-hidden rounded-[1.25rem] border border-pet-border bg-white p-1 shadow-xl shadow-[#0d1b3d]/10">
              {moreLinks(pet.id).map((link) => (
                <Link
                  className="block rounded-[0.9rem] px-4 py-2.5 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
                  href={link.href}
                  key={link.href}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}
