"use client";

import { ImageUploadField } from "@/components/portal/ImageUploadField";
import { DateInput } from "@/components/ui/DateInput";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/ui/FormSection";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
import {
  getEstimatedBirthYearOptions,
  MINIMUM_PET_BIRTH_YEAR,
  type PetAgeMode,
} from "@/lib/petAge";
import type { PetSpecies } from "@/types";
import { TextInput } from "./PetFormControls";
import {
  BreedSelect,
  petAgeModeSelectOptions,
  petTypeSelectOptions,
} from "./PetSelectionControls";
import type { FormErrors, FormState, UpdateField } from "./PetFormTypes";

export function CreatePetDetailsSection({
  breeds,
  errors,
  form,
  handleNameChange,
  setProfilePhotoFile,
  updateAgeInformationMode,
  updateBirthday,
  updateField,
  updateSpecies,
}: {
  breeds: string[];
  errors: FormErrors;
  form: FormState;
  handleNameChange: (value: string) => void;
  setProfilePhotoFile: (file: File | undefined) => void;
  updateAgeInformationMode: (mode: PetAgeMode) => void;
  updateBirthday: (value: string) => void;
  updateField: UpdateField;
  updateSpecies: (species: PetSpecies) => void;
}) {
  return (
        <FormSection
          title="Pet details"
          description="Start with the basics. Everything else can be added after this pet is saved."
        >
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <div className="md:col-span-2" data-create-field="photoUrl">
              <ImageUploadField
                label="Add a photo"
                helper="Optional. You can add or change this any time."
                shape="square"
                value={form.photoUrl}
                onChange={(dataUrl) => updateField("photoUrl", dataUrl)}
                onFileSelected={setProfilePhotoFile}
                emptyIcon={<Icon name="paw" className="h-5 w-5" />}
              />
            </div>

            <div data-create-field="name">
              <Field
                errorText={errors.name}
                helperText="Use the name people normally call your pet."
                htmlFor="create-pet-name"
                label="Pet name"
                required
              >
                <input
                  className="brand-input"
                  id="create-pet-name"
                  maxLength={60}
                  onChange={(event) => handleNameChange(event.target.value)}
                  placeholder="Milo"
                  type="text"
                  value={form.name}
                />
              </Field>
            </div>

            <div data-create-field="species">
              <Field
                errorText={errors.species}
                id="create-pet-type-field"
                label="Pet type"
                required
              >
                <Select
                  id="create-pet-type"
                  onChange={updateSpecies}
                  options={petTypeSelectOptions}
                  searchLabel="Search pet type"
                  searchPlaceholder="Search pet type"
                  value={form.species}
                />
              </Field>
            </div>

            {form.species === "Other" ? (
              <div data-create-field="customSpecies">
                <TextInput
                  error={errors.customSpecies}
                  id="create-pet-custom-species"
                  label="Enter pet type"
                  maxLength={60}
                  onChange={(value) => updateField("customSpecies", value)}
                  placeholder="Example: Axolotl"
                  value={form.customSpecies}
                />
              </div>
            ) : null}

            <div data-create-field="breed">
              <Field
                errorText={errors.breed}
                helperText="Optional. Leave this blank if you are not sure."
                id="create-pet-breed-field"
                label="Breed"
              >
                <BreedSelect
                  breeds={breeds}
                  id="create-pet-breed"
                  onChange={(value) => updateField("breed", value)}
                  value={form.breed}
                />
              </Field>
            </div>

            <div data-create-field="ageInformationMode">
              <Field id="create-pet-age-mode-field" label="Age information">
                <Select
                  id="create-pet-age-mode"
                  onChange={updateAgeInformationMode}
                  options={petAgeModeSelectOptions}
                  value={form.ageInformationMode}
                />
              </Field>
            </div>

            {form.ageInformationMode === "ExactBirthday" ? (
              <div data-create-field="birthdayDate">
                <Field
                  errorText={errors.birthdayDate}
                  helperText="Use this when you know your pet's full birth date."
                  htmlFor="create-pet-birthday"
                  label="Exact birthday"
                >
                  <DateInput
                    id="create-pet-birthday"
                    max={new Date().toISOString().slice(0, 10)}
                    min={`${MINIMUM_PET_BIRTH_YEAR}-01-01`}
                    onChange={(event) => updateBirthday(event.target.value)}
                    value={form.birthdayDate}
                  />
                </Field>
              </div>
            ) : null}

            {form.ageInformationMode === "EstimatedBirthYear" ? (
              <div data-create-field="estimatedBirthYear">
                <Field
                  errorText={errors.estimatedBirthYear}
                  helperText="Use this when you only know approximately which year your pet was born."
                  htmlFor="create-pet-estimated-birth-year"
                  label="Estimated birth year"
                >
                  <select
                    className="brand-input brand-select"
                    id="create-pet-estimated-birth-year"
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
              </div>
            ) : null}

            {form.ageInformationMode === "Unknown" ? (
              <div className="rounded-[1.25rem] bg-pet-cream px-4 py-3 text-sm leading-6 text-pet-muted">
                You can add a birthday or estimated year later.
              </div>
            ) : null}
          </div>
        </FormSection>
  );
}
