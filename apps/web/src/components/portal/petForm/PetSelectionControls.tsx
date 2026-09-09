"use client";

import { useMemo, useState } from "react";
import {
  Select,
  type SelectOption,
  type SelectProps,
} from "@/components/ui/Select";
import {
  CUSTOM_BREED_OPTION,
  FALLBACK_BREEDS,
  type BreedEntry,
} from "@/data/breeds";
import { getPetTypeGroupLabel, PET_TYPE_OPTIONS } from "@/lib/petDisplay";
import type { PetAgeMode } from "@/lib/petAge";
import type { PetSpecies } from "@/types";

/**
 * Pet types in group order, with the group name searchable.
 *
 * The shared Select renders one flat listbox, and inserting heading rows into
 * it would break the option indexing its keyboard navigation depends on. So
 * grouping is expressed the two ways that cost no accessibility: the options
 * are ordered group by group, and each carries its group as a search keyword,
 * so typing "reptile" or "small" narrows to that cluster.
 */
export const petTypeSelectOptions: readonly SelectOption<PetSpecies>[] =
  PET_TYPE_OPTIONS.map((value) => ({
    label: value,
    value,
    keywords: [getPetTypeGroupLabel(value)],
  }));

export const petAgeModeSelectOptions: readonly SelectOption<PetAgeMode>[] = [
  { label: "Exact birthday", value: "ExactBirthday" },
  { label: "Estimated birth year", value: "EstimatedBirthYear" },
  { label: "Unknown", value: "Unknown" },
];

type BreedSelectAccessibilityProps = Pick<
  SelectProps<string>,
  | "id"
  | "required"
  | "aria-label"
  | "aria-labelledby"
  | "aria-describedby"
  | "aria-invalid"
  | "aria-required"
>;

type BreedSelectProps = BreedSelectAccessibilityProps & {
  breeds: readonly BreedEntry[];
  value: string;
  onChange: (value: string) => void;
};

// Breed keeps its product-specific Other/custom-value semantics here while the
// trigger, filtering, and keyboard interaction come from the shared Select.
export function BreedSelect({
  breeds,
  value,
  onChange,
  ...accessibilityProps
}: BreedSelectProps) {
  const options = useMemo(() => {
    const seen = new Set<string>();
    const merged: SelectOption<string>[] = [];

    // Mixed breed and Unknown lead because they are the commonest answers and
    // a long species list would otherwise bury them. Other closes the list as
    // the escape hatch.
    const entries: BreedEntry[] = [
      ...FALLBACK_BREEDS,
      ...breeds,
      { value: CUSTOM_BREED_OPTION },
    ];

    for (const entry of entries) {
      const key = entry.value.toLocaleLowerCase();
      if (seen.has(key)) continue;

      seen.add(key);
      merged.push({
        label: entry.label ?? entry.value,
        value: entry.value,
        keywords: entry.keywords,
      });
    }

    return merged;
  }, [breeds]);
  const [otherSelected, setOtherSelected] = useState(false);
  const savedValueIsCustom =
    Boolean(value) && !options.some((option) => option.value === value);
  const customMode = otherSelected || savedValueIsCustom;

  function selectBreed(nextValue: string) {
    if (nextValue === CUSTOM_BREED_OPTION) {
      setOtherSelected(true);
      onChange("");
      return;
    }

    setOtherSelected(false);
    onChange(nextValue);
  }

  return (
    <div className="grid min-w-0 gap-2">
      <Select
        {...accessibilityProps}
        emptyMessage="No matching breeds. Choose Other to enter a breed."
        onChange={selectBreed}
        options={options}
        placeholder="Select breed"
        searchLabel="Search breed"
        searchPlaceholder="Search breed"
        value={customMode ? CUSTOM_BREED_OPTION : value || null}
      />

      {customMode ? (
        <input
          aria-describedby={accessibilityProps["aria-describedby"]}
          aria-invalid={accessibilityProps["aria-invalid"]}
          aria-label="Enter breed"
          className="brand-input"
          maxLength={160}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter breed"
          type="text"
          value={value}
        />
      ) : null}
    </div>
  );
}
