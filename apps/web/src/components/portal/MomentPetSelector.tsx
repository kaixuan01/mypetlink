"use client";

import { PetAvatar } from "@/components/ui/PetAvatar";
import type { PetListItem } from "@/types";

type MomentPetSelectorProps = {
  /** The pet the Moment was created from. Always a subject; never removable. */
  primaryPet: PetListItem;
  /** The owner's other pets, which may be added as additional subjects. */
  otherPets: PetListItem[];
  selectedPetIds: string[];
  onChange: (petIds: string[]) => void;
  disabled?: boolean;
};

/**
 * Chooses which of the owner's pets a Moment is about.
 *
 * Two deliberate behaviours:
 *
 * The primary pet is shown but cannot be unselected. A Moment created from
 * Mochi's page belongs to Mochi — it owns the Moment's place in that pet's
 * timeline and its plan allowance — and letting a checkbox quietly move it
 * elsewhere would be surprising.
 *
 * This is a plain list of the owner's own pets, not a search-and-tag field.
 * Phase 1 only permits tagging pets you own, the Free plan allows three, and a
 * type-ahead over three names would be ceremony rather than help.
 */
export function MomentPetSelector({
  primaryPet,
  otherPets,
  selectedPetIds,
  onChange,
  disabled = false,
}: MomentPetSelectorProps) {
  // With no second pet there is no choice to make, so the control would be a
  // question with one answer.
  if (otherPets.length === 0) {
    return null;
  }

  function toggle(petId: string) {
    onChange(
      selectedPetIds.includes(petId)
        ? selectedPetIds.filter((id) => id !== petId)
        : [...selectedPetIds, petId]
    );
  }

  return (
    <fieldset className="min-w-0 rounded-2xl border border-pet-border bg-pet-cream p-4">
      <legend className="px-1 text-sm font-bold text-pet-ink">
        Who&apos;s in this Moment?
      </legend>
      <p className="mt-1 px-1 text-xs font-semibold leading-5 text-pet-muted">
        It will appear on each pet&apos;s profile, and still counts as one Moment.
      </p>

      <ul className="mt-3 grid gap-2">
        <li>
          <span
            className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-white px-3 py-2 text-left"
            data-testid="moment-subject-primary"
          >
            <PetAvatar pet={primaryPet} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-pet-ink">
                {primaryPet.name}
              </span>
              <span className="block text-xs font-semibold text-pet-muted">
                This Moment belongs to {primaryPet.name}
              </span>
            </span>
          </span>
        </li>

        {otherPets.map((pet) => {
          const checked = selectedPetIds.includes(pet.id);

          return (
            <li key={pet.id}>
              <label
                className={`flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-left transition ${
                  checked ? "bg-[#e8f3ff]" : "bg-white hover:bg-pet-apricot"
                } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <input
                  checked={checked}
                  className="h-5 w-5 shrink-0 accent-[#1570ef]"
                  disabled={disabled}
                  onChange={() => toggle(pet.id)}
                  type="checkbox"
                  value={pet.id}
                />
                <PetAvatar pet={pet} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-pet-ink">
                  {pet.name}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
