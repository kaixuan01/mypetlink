"use client";

import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import { DateInput } from "@/components/ui/DateInput";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/ui/FormSection";
import { SettingRow } from "@/components/ui/SettingRow";
import { getPublicProfileShareVersion } from "@/lib/publicProfileSocial";
import { slugifyPetSlug } from "@/services/petService";
import type { Pet } from "@/types";
import { PrivacyGroup } from "./PetFormControls";
import type { FormErrors, FormState, UpdateField } from "./PetFormTypes";

export function SharingPrivacySection({
  currentPet,
  errors,
  form,
  mode,
  shareProfilePet,
  updateField,
}: {
  currentPet: Pet | null;
  errors: FormErrors;
  form: FormState;
  mode: "create" | "edit";
  shareProfilePet: Pet | null;
  updateField: UpdateField;
}) {
  return (
        <FormSection
          title="Sharing & Privacy"
          description="Share your pet's profile, photos, memories, and life timeline with friends and family."
        >
          <div className="grid min-w-0 gap-4">
            {mode === "edit" && currentPet?.lifecycleStatus === "Memorial" ? (
              <div className="border-t border-pet-border pt-5 sm:rounded-[1.5rem] sm:border sm:bg-white sm:p-5">
                <h2 className="text-lg font-black text-pet-ink">
                  Memorial details
                </h2>
                <p className="mt-1 text-sm leading-6 text-pet-muted">
                  Add a date and tribute for {form.name || "this pet"}&apos;s memorial profile.
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <Field
                    errorText={errors.passedAwayDate}
                    helperText="Optional. Share this only if it feels right for you."
                    htmlFor="pet-passed-away-date"
                    label="Date of passing, optional"
                  >
                    <DateInput
                      id="pet-passed-away-date"
                      onChange={(event) =>
                        updateField("passedAwayDate", event.target.value)
                      }
                      value={form.passedAwayDate}
                    />
                  </Field>
                  <Field
                    errorText={errors.memorialMessage}
                    helperText="A gentle note for friends and family. Maximum 240 characters."
                    htmlFor="pet-memorial-message"
                    label="Memorial message, optional"
                  >
                    <textarea
                      className="brand-input min-h-28"
                      id="pet-memorial-message"
                      maxLength={240}
                      onChange={(event) =>
                        updateField("memorialMessage", event.target.value)
                      }
                      placeholder={`${form.name || "This pet"} is lovingly remembered.`}
                      value={form.memorialMessage}
                    />
                  </Field>
                  <div className="lg:col-span-2">
                    <SettingRow
                      checked={form.showMemorialOnPublicProfile}
                      control="checkbox"
                      label="Show this memorial on the public profile"
                      onChange={(value) =>
                        updateField("showMemorialOnPublicProfile", value)
                      }
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {mode === "edit" ? (
              <div className="border-t border-pet-border pt-5 sm:rounded-[1.5rem] sm:border sm:bg-white sm:p-5">
                <SettingRow
                  checked={form.publicProfileEnabled}
                  control="switch"
                  helperText="When off, the shareable page is hidden. Your Safety Profile stays available for finders."
                  label="Public Profile enabled"
                  onChange={(value) => updateField("publicProfileEnabled", value)}
                />
                {!form.publicProfileEnabled ? (
                  <p
                    className="mt-3 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted"
                    role="status"
                  >
                    The Public Profile page is hidden from visitors. This does
                    not affect the Safety Profile finders see.
                  </p>
                ) : null}
              </div>
            ) : null}

            {mode === "edit" ? (
              <PrivacyGroup title="What appears on the public profile">
                <div>
                  <SettingRow
                    checked={form.showCareBadges}
                    control="checkbox"
                    helperText="Visitors can see the type and date of care records you choose to share."
                    label="Show care history on Public Profile"
                    onChange={(value) => updateField("showCareBadges", value)}
                  />
                </div>
                <SettingRow
                  checked={form.showMoments}
                  control="checkbox"
                  label="Show public memories"
                  onChange={(value) => updateField("showMoments", value)}
                />
                <SettingRow
                  checked={form.showTimeline}
                  control="checkbox"
                  label="Show Life Timeline"
                  onChange={(value) => updateField("showTimeline", value)}
                />
                <SettingRow
                  checked={form.showBirthdayOnTimeline}
                  control="checkbox"
                  label="Show birthday in Life Timeline"
                  onChange={(value) =>
                    updateField("showBirthdayOnTimeline", value)
                  }
                />
              </PrivacyGroup>
            ) : null}

            {shareProfilePet ? (
              <ShareProfileLink
                copyButtonFullWidth
                path={shareProfilePet.publicProfilePath}
                petName={shareProfilePet.name}
                shareVersion={getPublicProfileShareVersion(shareProfilePet)}
              />
            ) : null}

            <details
              className="border-t border-pet-border sm:rounded-[1.5rem] sm:border sm:bg-white"
              open={Boolean(errors.slug) || undefined}
            >
              <summary className="min-h-11 cursor-pointer py-4 text-sm font-bold text-pet-muted select-none sm:px-5">
                Customize link
              </summary>
              <div className="grid gap-3 pb-5 sm:px-5">
                <Field
                  errorText={errors.slug}
                  helperText="This becomes the public page address."
                  htmlFor="pet-profile-slug"
                  label="Custom public profile link name"
                  required
                >
                  <input
                    className="brand-input"
                    id="pet-profile-slug"
                    maxLength={70}
                    onChange={(event) =>
                      updateField("slug", slugifyPetSlug(event.target.value))
                    }
                    placeholder="milo"
                    type="text"
                    value={form.slug}
                  />
                </Field>
              </div>
            </details>
          </div>
        </FormSection>
  );
}
