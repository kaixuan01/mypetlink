"use client";

import type { ComponentProps, KeyboardEvent } from "react";
import { ImageUploadField } from "@/components/portal/ImageUploadField";
import { CoverPhoto } from "@/components/ui/CoverPhoto";
import { FormSection } from "@/components/ui/FormSection";
import { Icon } from "@/components/ui/Icon";
import { PetAvatar } from "@/components/ui/PetAvatar";
import type { CoverCropMetrics } from "@/lib/coverCrop";
import { petProfileThemes, type PetProfileTheme } from "@/lib/petProfileThemes";
import {
  CoverPositionControl,
  getCoverAxisDescription,
  ThemeOptionCard,
  ThemePreviewPanel,
} from "./PetFormControls";
import type { FormState, UpdateField } from "./PetFormTypes";

export function AppearanceSection({
  coverCropMetrics,
  form,
  hasUnsavedCoverPositionChange,
  hasUnsavedThemeChange,
  previewPet,
  selectedTheme,
  setCoverCropMetrics,
  setCoverPhotoFile,
  setProfilePhotoFile,
  updateField,
}: {
  coverCropMetrics: CoverCropMetrics | null;
  form: FormState;
  hasUnsavedCoverPositionChange: boolean;
  hasUnsavedThemeChange: boolean;
  previewPet: ComponentProps<typeof PetAvatar>["pet"];
  selectedTheme: PetProfileTheme;
  setCoverCropMetrics: (metrics: CoverCropMetrics | null) => void;
  setCoverPhotoFile: (file: File | undefined) => void;
  setProfilePhotoFile: (file: File | undefined) => void;
  updateField: UpdateField;
}) {
  function handleThemeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const navigationKeys = [
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "Home",
      "End",
    ];

    if (!navigationKeys.includes(event.key)) {
      return;
    }

    const radios = Array.from(
      event.currentTarget.querySelectorAll<HTMLInputElement>(
        'input[name="profile-theme"]'
      )
    );
    const currentIndex = radios.indexOf(event.target as HTMLInputElement);

    if (currentIndex < 0 || radios.length === 0) {
      return;
    }

    event.preventDefault();
    const lastIndex = radios.length - 1;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? lastIndex
          : event.key === "ArrowRight" || event.key === "ArrowDown"
            ? (currentIndex + 1) % radios.length
            : (currentIndex - 1 + radios.length) % radios.length;
    const nextRadio = radios[nextIndex];

    nextRadio?.focus();
    nextRadio?.click();
  }

  return (
    <FormSection
      title="Appearance"
      description={`Customize the photos and theme shown on ${
        form.name || "your pet"
      }'s public profile and safety page.`}
    >
      <div className="grid min-w-0 gap-6">
        <section
          aria-labelledby="appearance-photos-heading"
          className="grid min-w-0 gap-4"
        >
          <h3
            className="text-base font-black text-pet-ink"
            id="appearance-photos-heading"
          >
            Photos
          </h3>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <div className="min-w-0 [&_button]:min-h-11">
              <ImageUploadField
                label="Profile photo"
                helper="Used for this pet's avatar across the portal and public pages."
                shape="square"
                value={form.photoUrl}
                onChange={(dataUrl) => updateField("photoUrl", dataUrl)}
                onFileSelected={setProfilePhotoFile}
                emptyIcon={<Icon name="paw" className="h-5 w-5" />}
              />
            </div>

            <div className="min-w-0 [&_button]:min-h-11">
              <ImageUploadField
                label="Cover photo"
                helper="A warm wide banner for the public profile."
                value={form.coverUrl}
                onChange={(dataUrl) => {
                  updateField("coverUrl", dataUrl);
                  if (dataUrl !== form.coverUrl) {
                    updateField("coverPositionX", 50);
                    updateField("coverPositionY", 50);
                  }
                }}
                onFileSelected={setCoverPhotoFile}
              />
            </div>
          </div>

          <section
            aria-labelledby="cover-preview-heading"
            className="grid min-w-0 gap-4 border-y border-pet-border py-5 sm:rounded-[1.5rem] sm:border sm:bg-white sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3
                  className="text-base font-black text-pet-ink"
                  id="cover-preview-heading"
                >
                  Cover preview &amp; position
                </h3>
                <p className="mt-1 text-xs font-semibold leading-5 text-pet-muted">
                  Adjust the same cover view that appears on the Public Share
                  Profile.
                </p>
              </div>
              {form.coverUrl ? (
                <button
                  className="min-h-11 rounded-full border border-pet-border bg-white px-4 text-xs font-black text-pet-ink transition hover:border-pet-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
                  onClick={() => {
                    updateField("coverPositionX", 50);
                    updateField("coverPositionY", 50);
                  }}
                  type="button"
                >
                  Reset to Centre
                </button>
              ) : null}
            </div>

            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)] lg:items-start">
              <div className="brand-soft-card min-w-0 overflow-hidden rounded-[1.5rem]">
                <CoverPhoto
                  alt={`${form.name || "Your pet"} public profile cover preview`}
                  fallbackStyle={{ background: selectedTheme.gradients.cover }}
                  onCropMetricsChange={setCoverCropMetrics}
                  positionX={form.coverPositionX}
                  positionY={form.coverPositionY}
                  src={form.coverUrl}
                />
                <div className="px-5 pb-5 text-center">
                  <div className="-mt-12 flex justify-center">
                    <span className="rounded-full border-4 border-white">
                      <PetAvatar pet={previewPet} size="lg" />
                    </span>
                  </div>
                  <p className="mt-3 font-black text-pet-ink">
                    {form.name || "Your pet"}
                  </p>
                  <p className="mt-1 text-sm text-pet-muted">
                    Public Share Profile preview
                  </p>
                </div>
              </div>

              {form.coverUrl ? (
                <fieldset className="grid min-w-0 gap-3 border-0 p-0 sm:gap-4 sm:rounded-[1.25rem] sm:border sm:border-pet-border sm:bg-pet-cream sm:p-4">
                  <legend className="pr-2 text-sm font-black text-pet-ink sm:px-1">
                    Adjust cover position
                  </legend>
                  <p className="text-xs font-semibold leading-5 text-pet-muted">
                    Move the focus until your pet sits naturally in the banner.
                  </p>
                  <CoverPositionControl
                    axis="Horizontal"
                    description={getCoverAxisDescription(
                      coverCropMetrics,
                      "Horizontal"
                    )}
                    disabled={!coverCropMetrics?.canMoveX}
                    onChange={(value) => updateField("coverPositionX", value)}
                    value={form.coverPositionX}
                  />
                  <CoverPositionControl
                    axis="Vertical"
                    description={getCoverAxisDescription(
                      coverCropMetrics,
                      "Vertical"
                    )}
                    disabled={!coverCropMetrics?.canMoveY}
                    onChange={(value) => updateField("coverPositionY", value)}
                    value={form.coverPositionY}
                  />
                  {hasUnsavedCoverPositionChange ? (
                    <p className="rounded-[1rem] bg-[#fffbea] px-3 py-2 text-xs font-bold leading-5 text-[#856a00]">
                      Save changes to keep this cover position.
                    </p>
                  ) : null}
                </fieldset>
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-pet-border bg-pet-cream p-4 text-sm font-semibold leading-6 text-pet-muted">
                  Add a cover photo to adjust its horizontal and vertical
                  position.
                </div>
              )}
            </div>
          </section>
        </section>

        <div aria-hidden="true" className="border-t border-pet-border" />

        <section
          aria-labelledby="appearance-theme-heading"
          className="grid min-w-0 gap-4"
        >
          <h3
            className="text-base font-black text-pet-ink"
            id="appearance-theme-heading"
          >
            Profile Theme
          </h3>
          <div
            aria-labelledby="appearance-theme-heading"
            className="grid min-w-0 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-5"
            onKeyDown={handleThemeKeyDown}
            role="radiogroup"
          >
            {petProfileThemes.map((theme) => (
              <ThemeOptionCard
                key={theme.id}
                name={form.name || "Your pet"}
                onSelect={() => updateField("profileTheme", theme.id)}
                selected={form.profileTheme === theme.id}
                theme={theme}
              />
            ))}
          </div>

          {hasUnsavedThemeChange ? (
            <p className="rounded-[1rem] bg-[#fffbea] px-4 py-3 text-xs font-bold text-[#856a00]">
              Save changes to update {form.name || "your pet"}&apos;s public
              profile and Safety Profile.
            </p>
          ) : null}

          <ThemePreviewPanel
            petName={form.name || "Your pet"}
            theme={selectedTheme}
          />
        </section>
      </div>
    </FormSection>
  );
}
