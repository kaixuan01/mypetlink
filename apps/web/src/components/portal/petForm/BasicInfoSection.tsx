"use client";

import { DateInput } from "@/components/ui/DateInput";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/ui/FormSection";
import { Select } from "@/components/ui/Select";
import {
  calculatePetAge,
  getEstimatedBirthYearOptions,
  MINIMUM_PET_BIRTH_YEAR,
  type PetAgeMode,
} from "@/lib/petAge";
import { MAX_PERSONALITY_TAGS } from "@/lib/petSuggestions";
import type { PetSpecies } from "@/types";
import {
  BioTemplateSheet,
  GenderSegmentedControl,
  TagListInput,
  TextInput,
} from "./PetFormControls";
import {
  BreedSelect,
  petAgeModeSelectOptions,
  petTypeSelectOptions,
} from "./PetSelectionControls";
import type { FormErrors, FormState, UpdateField } from "./PetFormTypes";

export function BasicInfoSection({
  bioSheetOpen,
  breeds,
  errors,
  foodSuggestions,
  form,
  handleNameChange,
  personalitySuggestions,
  setBioSheetOpen,
  toySuggestions,
  updateAgeInformationMode,
  updateBirthday,
  updateField,
  updateSpecies,
}: {
  bioSheetOpen: boolean;
  breeds: string[];
  errors: FormErrors;
  foodSuggestions: string[];
  form: FormState;
  handleNameChange: (value: string) => void;
  personalitySuggestions: string[];
  setBioSheetOpen: (open: boolean) => void;
  toySuggestions: string[];
  updateAgeInformationMode: (mode: PetAgeMode) => void;
  updateBirthday: (value: string) => void;
  updateField: UpdateField;
  updateSpecies: (species: PetSpecies) => void;
}) {
  return (
        <FormSection
          title="Basic Info"
          description="These details help friends, family, and finders recognize your pet quickly."
        >
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <Field
              errorText={errors.name}
              helperText="Use the name people normally call your pet."
              htmlFor="edit-pet-name"
              label="Pet name"
              required
            >
              <input
                className="brand-input"
                id="edit-pet-name"
                maxLength={60}
                onChange={(event) => handleNameChange(event.target.value)}
                placeholder="Milo"
                type="text"
                value={form.name}
              />
            </Field>

            <Field
              errorText={errors.species}
              id="edit-pet-type-field"
              label="Pet type"
              required
            >
              <Select
                id="edit-pet-type"
                onChange={updateSpecies}
                options={petTypeSelectOptions}
                searchLabel="Search pet type"
                searchPlaceholder="Search pet type"
                value={form.species}
              />
            </Field>

            {form.species === "Other" ? (
              <TextInput
                error={errors.customSpecies}
                helper="This is what people will see on the Public Profile and Safety Profile."
                id="edit-pet-custom-species"
                label="Enter pet type"
                maxLength={60}
                onChange={(value) => updateField("customSpecies", value)}
                placeholder="Example: Axolotl"
                value={form.customSpecies}
              />
            ) : null}

            <Field
              errorText={errors.breed}
              id="edit-pet-breed-field"
              label="Breed"
            >
              <BreedSelect
                breeds={breeds}
                id="edit-pet-breed"
                onChange={(value) => updateField("breed", value)}
                value={form.breed}
              />
            </Field>

            <Field
              errorText={errors.gender}
              id="edit-pet-gender-field"
              label="Gender"
            >
              <GenderSegmentedControl
                onChange={(value) => updateField("gender", value)}
                value={form.gender}
              />
            </Field>

            <TextInput
              error={errors.color}
              id="edit-pet-color"
              label="Color"
              maxLength={80}
              onChange={(value) => updateField("color", value)}
              placeholder="Brown and white"
              value={form.color}
            />

            <div className="grid min-w-0 gap-2">
              <Field id="edit-pet-age-mode-field" label="Age information">
                <Select
                  id="edit-pet-age-mode"
                  onChange={updateAgeInformationMode}
                  options={petAgeModeSelectOptions}
                  value={form.ageInformationMode}
                />
              </Field>
              {/* Compact calculated-age summary; intentionally not styled like
                  an input because it is not editable. */}
              <span className="text-xs font-semibold leading-5 text-pet-muted">
                Age shown on profiles:{" "}
                <span className="font-black text-pet-ink">
                  {
                    calculatePetAge({
                      birthday:
                        form.ageInformationMode === "ExactBirthday"
                          ? form.birthdayDate
                          : null,
                      estimatedBirthYear:
                        form.ageInformationMode === "EstimatedBirthYear"
                          ? Number(form.estimatedBirthYear) || null
                          : null,
                    }).displayLabel
                  }
                </span>
              </span>
            </div>

            {form.ageInformationMode === "ExactBirthday" ? (
              <Field
                errorText={errors.birthdayDate}
                helperText="Use this when you know your pet's full birth date."
                htmlFor="edit-pet-birthday"
                label="Exact birthday"
              >
                <DateInput
                  id="edit-pet-birthday"
                  max={new Date().toISOString().slice(0, 10)}
                  min={`${MINIMUM_PET_BIRTH_YEAR}-01-01`}
                  onChange={(event) => updateBirthday(event.target.value)}
                  value={form.birthdayDate}
                />
              </Field>
            ) : null}

            {form.ageInformationMode === "EstimatedBirthYear" ? (
              <Field
                errorText={errors.estimatedBirthYear}
                helperText="Use this when you only know approximately which year your pet was born. Their age will update automatically."
                htmlFor="edit-pet-estimated-birth-year"
                label="Estimated birth year"
              >
                <select
                  className="brand-input brand-select"
                  id="edit-pet-estimated-birth-year"
                  onChange={(event) =>
                    updateField("estimatedBirthYear", event.target.value)
                  }
                  value={form.estimatedBirthYear}
                >
                  <option value="">Choose a year</option>
                  {getEstimatedBirthYearOptions().map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {form.ageInformationMode === "Unknown" ? (
              <div className="rounded-[1.25rem] bg-pet-cream px-4 py-3 text-sm leading-6 text-pet-muted">
                Choose this when the birth date and estimated year are not known.
              </div>
            ) : null}
          </div>

          {/* About your pet: the bio spans the full content width so desktop
              never shows a lopsided half-empty column. */}
          <div className="mt-6 grid min-w-0 gap-2">
            <h3 className="text-base font-black text-pet-ink">
              About your pet
            </h3>
            <Field
              errorText={errors.bio}
              helperText="A few friendly details make the page feel personal."
              htmlFor="edit-pet-bio"
              label="Short bio / description"
            >
              <textarea
                className="brand-input min-h-32"
                id="edit-pet-bio"
                maxLength={320}
                onChange={(event) => updateField("bio", event.target.value)}
                placeholder="Milo is gentle, snack-loving, and happiest after evening walks."
                value={form.bio}
              />
            </Field>
            <button
              className="justify-self-start text-sm font-bold text-pet-teal underline-offset-2 hover:underline"
              onClick={() => setBioSheetOpen(true)}
              type="button"
            >
              Need inspiration?
            </button>
          </div>

          {/* Tag pickers continue the About your pet section: one balanced
              column per picker on wide screens, two on tablet, one on mobile. */}
          <div className="mt-5 min-w-0">
            <div className="grid min-w-0 content-start gap-5 md:grid-cols-2 xl:grid-cols-3">
              <TagListInput
                error={errors.personalityTags}
                label="Personality tags"
                max={MAX_PERSONALITY_TAGS}
                maxLength={30}
                onChange={(values) => updateField("personalityTags", values)}
                placeholder="Add your own tag"
                suggestions={personalitySuggestions}
                values={form.personalityTags}
              />
              <TagListInput
                error={errors.favoriteFoods}
                label="Favourite foods"
                max={3}
                onChange={(values) => updateField("favoriteFoods", values)}
                placeholder="Add a food"
                suggestions={foodSuggestions}
                values={form.favoriteFoods}
              />
              <TagListInput
                error={errors.favoriteToys}
                label="Favourite toys"
                max={3}
                onChange={(values) => updateField("favoriteToys", values)}
                placeholder="Add a toy"
                suggestions={toySuggestions}
                values={form.favoriteToys}
              />
            </div>
          </div>

          <BioTemplateSheet
            onClose={() => setBioSheetOpen(false)}
            onPick={(template) => {
              updateField("bio", template);
              setBioSheetOpen(false);
            }}
            open={bioSheetOpen}
            petName={form.name}
          />
        </FormSection>
  );
}
