"use client";

import type { PetListItem } from "@/types";

export const ALL_PETS = "all";

/**
 * Which pets Care coming up and Recent Moments are about. Shown only to
 * households with more than one active pet, always starting on All pets, and
 * never remembered between visits — the selection is plain to see, and never
 * made on the owner's behalf. It changes nothing above it: Lost Mode and the
 * pet cards stay in view whatever is chosen.
 */
export function DashboardPetFilter({
  pets,
  value,
  onChange,
}: {
  pets: PetListItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  const options = [
    { id: ALL_PETS, label: "All pets" },
    ...pets.map((pet) => ({ id: pet.id, label: pet.name })),
  ];

  return (
    <div
      className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
      data-dashboard-pet-filter
    >
      <p className="shrink-0 text-sm font-semibold text-pet-muted" id="dashboard-pet-filter-label">
        Show care and Moments for
      </p>
      <div
        aria-labelledby="dashboard-pet-filter-label"
        className="flex min-w-0 flex-wrap gap-2"
        role="group"
      >
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <button
              aria-pressed={selected}
              className={[
                "inline-flex min-h-11 max-w-[14rem] items-center rounded-full border px-4 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal",
                selected
                  ? "border-pet-teal bg-pet-teal text-white shadow-sm"
                  : "border-pet-border bg-white text-pet-ink hover:border-pet-teal/50 hover:bg-[#f4f9ff]",
              ].join(" ")}
              key={option.id}
              onClick={() => onChange(option.id)}
              title={option.label}
              type="button"
            >
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
