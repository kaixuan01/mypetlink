"use client";

import { ImageUploadField } from "@/components/portal/ImageUploadField";
import { DateInput } from "@/components/ui/DateInput";
import { FormSection } from "@/components/ui/FormSection";
import { Icon } from "@/components/ui/Icon";
import {
  getEstimatedBirthYearOptions,
  MINIMUM_PET_BIRTH_YEAR,
  type PetAgeMode,
} from "@/lib/petAge";
import type { PetSpecies } from "@/types";
import {
  BreedSelector,
  Field,
  PetTypeSelector,
  TextInput,
} from "./PetFormControls";
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
                error={errors.name}
                helper="Use the name people normally call your pet."
                label="Pet name"
              >
                <input
                  className="brand-input"
                  maxLength={60}
                  onChange={(event) => handleNameChange(event.target.value)}
                  placeholder="Milo"
                  type="text"
                  value={form.name}
                />
              </Field>
            </div>

            <div data-create-field="species">
              <Field error={errors.species} label="Pet type">
                <PetTypeSelector onChange={updateSpecies} value={form.species} />
              </Field>
            </div>

            {form.species === "Other" ? (
              <div data-create-field="customSpecies">
                <TextInput
                  error={errors.customSpecies}
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
                error={errors.breed}
                helper="Optional. Leave this blank if you are not sure."
                label="Breed"
              >
                <BreedSelector
                  breeds={breeds}
                  onChange={(value) => updateField("breed", value)}
                  value={form.breed}
                />
              </Field>
            </div>

            <div data-create-field="ageInformationMode">
              <Field label="Age information">
                <select
                  className="brand-input brand-select"
                  onChange={(event) =>
                    updateAgeInformationMode(event.target.value as PetAgeMode)
                  }
                  value={form.ageInformationMode}
                >
                  <option value="ExactBirthday">Exact birthday</option>
                  <option value="EstimatedBirthYear">Estimated birth year</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </Field>
            </div>

            {form.ageInformationMode === "ExactBirthday" ? (
              <div data-create-field="birthdayDate">
                <Field
                  error={errors.birthdayDate}
                  helper="Use this when you know your pet's full birth date."
                  label="Exact birthday"
                >
                  <DateInput
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
                  error={errors.estimatedBirthYear}
                  helper="Use this when you only know approximately which year your pet was born."
                  label="Estimated birth year"
                >
                  <select
                    className="brand-input brand-select"
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
