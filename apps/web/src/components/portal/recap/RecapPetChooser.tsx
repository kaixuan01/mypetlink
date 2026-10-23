"use client";

import { Icon } from "@/components/ui/Icon";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { PetListItem } from "@/types";

/**
 * Which pet's week is shown. Only active pets are offered, and choosing one
 * opens its default week. The choice is visible, never made silently, and
 * never remembered between visits.
 */
export function RecapPetChooser({
  pets,
  value,
  onChange,
}: {
  pets: PetListItem[];
  value?: string;
  onChange: (petId: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3" data-recap-pet-chooser>
      <p className="shrink-0 text-sm font-semibold text-pet-muted" id="recap-pet-chooser-label">
        Show the week for
      </p>
      <div aria-labelledby="recap-pet-chooser-label" className="flex min-w-0 flex-wrap gap-2" role="group">
        {pets.map((pet) => {
          const selected = pet.id === value;
          return (
            <button
              aria-pressed={selected}
              className={[
                "inline-flex min-h-11 max-w-[14rem] items-center gap-2 rounded-full border py-1 pl-1 pr-4 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal",
                selected
                  ? "border-pet-teal bg-pet-teal text-white shadow-sm"
                  : "border-pet-border bg-white text-pet-ink hover:border-pet-teal/50 hover:bg-[#f4f9ff]",
              ].join(" ")}
              key={pet.id}
              onClick={() => onChange(pet.id)}
              title={pet.name}
              type="button"
            >
              <ChooserPhoto pet={pet} />
              <span className="truncate">{pet.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The pet's own photo, small; decorative beside its name. */
function ChooserPhoto({ pet }: { pet: PetListItem }) {
  const photoUrl = resolveMediaUrl(pet.photoUrl);

  return (
    <span
      aria-hidden="true"
      className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-white bg-pet-apricot text-pet-coral"
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-full w-full object-cover" decoding="async" src={photoUrl} />
      ) : (
        <Icon className="h-4 w-4" name="paw" />
      )}
    </span>
  );
}
