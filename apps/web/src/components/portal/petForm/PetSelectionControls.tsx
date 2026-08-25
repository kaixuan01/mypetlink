"use client";

import { useMemo, useState } from "react";
import {
  Select,
  type SelectOption,
  type SelectProps,
} from "@/components/ui/Select";
import { PET_TYPE_OPTIONS } from "@/lib/petDisplay";
import type { PetAgeMode } from "@/lib/petAge";
import type { PetSpecies } from "@/types";

export const petTypeSelectOptions: readonly SelectOption<PetSpecies>[] =
  PET_TYPE_OPTIONS.map((value) => ({ label: value, value }));

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
  breeds: string[];
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

    for (const option of [...breeds, "Mixed breed", "Unknown", "Other"]) {
      const key = option.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({ label: option, value: option });
      }
    }

    return merged;
  }, [breeds]);
  const [otherSelected, setOtherSelected] = useState(false);
  const savedValueIsCustom =
    Boolean(value) && !options.some((option) => option.value === value);
  const customMode = otherSelected || savedValueIsCustom;

  function selectBreed(nextValue: string) {
    if (nextValue === "Other") {
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
        value={customMode ? "Other" : value || null}
      />

      {customMode ? (
        <input
          aria-describedby={accessibilityProps["aria-describedby"]}
          aria-invalid={accessibilityProps["aria-invalid"]}
          aria-label="Enter breed"
          className="brand-input"
          maxLength={80}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter breed"
          type="text"
          value={value}
        />
      ) : null}
    </div>
  );
}
