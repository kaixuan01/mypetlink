"use client";

import {
  useEffect,
  useRef,
  type Dispatch,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction,
  type TextareaHTMLAttributes,
} from "react";
import { LostModeControl } from "@/components/portal/LostModeControl";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/ui/FormSection";
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput";
import { SettingRow } from "@/components/ui/SettingRow";
import { safetyProfilesOwnerUiEnabled } from "@/lib/features";
import { ownerRoutes } from "@/lib/routes";
import { getSafetyProfileStatusView } from "@/lib/safetyProfile";
import type { Pet } from "@/types";
import {
  ContactSummary,
  TagListInput,
  TextInput,
  UrlDisplay,
} from "./PetFormControls";
import type { FormErrors, FormState, UpdateField } from "./PetFormTypes";

const MAX_ALLERGIES = 8;
const MAX_ALLERGY_LENGTH = 80;
const allergySuggestions = [
  "Chicken",
  "Beef",
  "Dairy",
  "Eggs",
  "Fish",
  "Penicillin",
  "Flea bites",
  "Pollen",
];

export function ContactSafetySection({
  contactLostModeRef,
  currentPet,
  errors,
  finderFullUrl,
  focusPetContactSection,
  form,
  mode,
  petContactSectionRef,
  safetyStatusView,
  setCurrentPet,
  setUseOwnerDefaults,
  updateField,
}: {
  contactLostModeRef: RefObject<HTMLDivElement | null>;
  currentPet: Pet | null;
  errors: FormErrors;
  finderFullUrl: string;
  focusPetContactSection: () => void;
  form: FormState;
  mode: "create" | "edit";
  petContactSectionRef: RefObject<HTMLDivElement | null>;
  safetyStatusView: ReturnType<typeof getSafetyProfileStatusView>;
  setCurrentPet: Dispatch<SetStateAction<Pet | null>>;
  setUseOwnerDefaults: (useDefaults: boolean) => void;
  updateField: UpdateField;
}) {
  function handleContactSourceKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    useDefaults: boolean
  ) {
    const direction = ["ArrowRight", "ArrowDown"].includes(event.key)
      ? 1
      : ["ArrowLeft", "ArrowUp"].includes(event.key)
        ? -1
        : 0;

    if (!direction) return;

    event.preventDefault();
    const nextUseDefaults = !useDefaults;
    setUseOwnerDefaults(nextUseDefaults);
    window.requestAnimationFrame(() => {
      petContactSectionRef.current
        ?.querySelector<HTMLInputElement>(
          `input[name="pet-contact-source"][value="${
            nextUseDefaults ? "owner-defaults" : "pet-specific"
          }"]`
        )
        ?.focus();
    });
  }

  return (
        <FormSection
          title="Contact & Safety"
          description="Help finders contact you if your pet is lost. Your full address is never shown."
        >
          <div className="grid min-w-0 gap-4">
            {mode === "edit" && currentPet ? (
              <div className="scroll-mt-24" ref={contactLostModeRef}>
                <LostModeControl
                  onPetChange={setCurrentPet}
                  pet={currentPet}
                  variant="compact"
                />
              </div>
            ) : null}

            {/* Owner-facing Safety Profile management is temporarily hidden
                while the feature is unreleased; the settings below (contact,
                finder visibility, safety information) stay available. */}
            {safetyProfilesOwnerUiEnabled ? (
            <div className="border-t border-pet-border pt-5 sm:rounded-[1.5rem] sm:border sm:bg-white sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black text-pet-ink">
                  Safety Profile
                </h2>
                <Badge tone={safetyStatusView.tone}>
                  {safetyStatusView.label}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-pet-muted">
                Help finders contact you if your pet is lost. This profile can
                be opened through a QR code, NFC tag, or direct link.
              </p>
              <div className="mt-4">
                <SettingRow
                  checked={form.qrSafetyEnabled}
                  control="switch"
                  helperText="When off, the Safety Profile stops showing your contact details to finders."
                  label="Safety Profile enabled"
                  onChange={(value) => updateField("qrSafetyEnabled", value)}
                />
              </div>
              {safetyStatusView.status === "contact-update-needed" ? (
                <section
                  aria-labelledby="safety-contact-warning-title"
                  className="mt-3 rounded-[1.25rem] border border-[#f0dfae] bg-[#fffbea] p-4"
                  role="status"
                >
                  <h3
                    className="text-sm font-black text-[#6b5500]"
                    id="safety-contact-warning-title"
                  >
                    Update your contact details
                  </h3>
                  <p className="mt-1 text-xs font-bold leading-5 text-[#856a00]">
                    Add a phone or WhatsApp number so finders can contact you
                    if your pet goes missing. Then make sure WhatsApp or phone
                    call is turned on under &quot;What finders can see&quot;.
                  </p>
                  <div className="mt-3">
                    {form.useOwnerDefaults ? (
                      <CTAButton
                        href={ownerRoutes.settingsOwnerContact}
                        icon="phone"
                        variant="secondary"
                      >
                        Update Contact
                      </CTAButton>
                    ) : (
                      <CTAButton
                        icon="phone"
                        onClick={focusPetContactSection}
                        variant="secondary"
                      >
                        Update Contact
                      </CTAButton>
                    )}
                  </div>
                </section>
              ) : null}
              {safetyStatusView.status === "off" ? (
                <p
                  className="mt-3 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted"
                  role="status"
                >
                  {safetyStatusView.description}
                </p>
              ) : null}
              <div className="mt-4">
                {currentPet && finderFullUrl ? (
                  <UrlDisplay label="Safety Profile link" url={finderFullUrl} />
                ) : null}
              </div>
            </div>
            ) : null}

            <div
              className="scroll-mt-24 border-t border-pet-border pt-5 sm:rounded-[1.5rem] sm:border sm:bg-white sm:p-5"
              ref={petContactSectionRef}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black text-pet-ink">
                      Emergency Contact
                    </h2>
                    <Badge tone={form.useOwnerDefaults ? "teal" : "warm"}>
                      {form.useOwnerDefaults
                        ? "Owner defaults"
                        : "Custom for this pet"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-pet-muted">
                    {form.useOwnerDefaults
                      ? "Using your contact details from Owner Settings."
                      : `Using different contact details for ${
                          form.name || "this pet"
                        }.`}
                  </p>
                  <p className="mt-2 text-xs font-semibold leading-5 text-pet-muted">
                    These settings only apply to {form.name || "this pet"}.
                    Owner defaults are managed in Owner Profile &amp; Contact.
                  </p>
                </div>
                {form.useOwnerDefaults ? (
                  <CTAButton
                    href={ownerRoutes.settingsOwnerContact}
                    icon="phone"
                    variant="outline"
                  >
                    Edit contact details
                  </CTAButton>
                ) : (
                  <CTAButton href={ownerRoutes.settings} variant="outline">
                    Owner Profile &amp; Contact
                  </CTAButton>
                )}
              </div>

              <ContactSummary
                generalArea={form.generalArea}
                ownerName={form.ownerName}
                phone={form.phone}
                whatsapp={form.whatsapp}
              />

              {mode === "edit" ? (
                <div className="mt-4">
                  <SettingRow
                    checked={form.showOwnerName}
                    control="checkbox"
                    helperText="Show the owner name to people viewing this pet's Public Profile or Safety Profile."
                    label="Show owner name"
                    onChange={(value) => updateField("showOwnerName", value)}
                  />
                </div>
              ) : null}

              <div
                aria-label="Contact source"
                className="mt-4 grid gap-3 sm:grid-cols-2"
                role="radiogroup"
              >
                <label
                  className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-left transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pet-teal ${
                    form.useOwnerDefaults
                      ? "border-pet-teal bg-[#e8f3ff] text-pet-teal"
                      : "border-pet-border bg-white text-pet-muted hover:bg-pet-cream"
                  }`}
                >
                  <input
                    checked={form.useOwnerDefaults}
                    className="sr-only"
                    name="pet-contact-source"
                    onChange={() => setUseOwnerDefaults(true)}
                    onKeyDown={(event) =>
                      handleContactSourceKeyDown(event, true)
                    }
                    type="radio"
                    value="owner-defaults"
                  />
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-xs font-black ${
                      form.useOwnerDefaults
                        ? "border-pet-teal bg-pet-teal text-white"
                        : "border-pet-border bg-white"
                    }`}
                  >
                    {form.useOwnerDefaults ? "✓" : ""}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-pet-ink">
                      Use account contact details
                    </span>
                    <span className="mt-1 block text-xs font-semibold leading-5 text-pet-muted">
                      Keep this pet in sync with Owner Settings.
                    </span>
                  </span>
                </label>
                <label
                  className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-left transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pet-teal ${
                    !form.useOwnerDefaults
                      ? "border-pet-teal bg-[#e8f3ff] text-pet-teal"
                      : "border-pet-border bg-white text-pet-muted hover:bg-pet-cream"
                  }`}
                >
                  <input
                    checked={!form.useOwnerDefaults}
                    className="sr-only"
                    name="pet-contact-source"
                    onChange={() => setUseOwnerDefaults(false)}
                    onKeyDown={(event) =>
                      handleContactSourceKeyDown(event, false)
                    }
                    type="radio"
                    value="pet-specific"
                  />
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-xs font-black ${
                      !form.useOwnerDefaults
                        ? "border-pet-teal bg-pet-teal text-white"
                        : "border-pet-border bg-white"
                    }`}
                  >
                    {!form.useOwnerDefaults ? "✓" : ""}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-pet-ink">
                      Use different contact details for this pet
                    </span>
                    <span className="mt-1 block text-xs font-semibold leading-5 text-pet-muted">
                      Enter contact details that only apply to this pet.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {!form.useOwnerDefaults ? (
              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <TextInput
                  error={errors.ownerName}
                  label="Owner display name"
                  maxLength={80}
                  onChange={(value) => updateField("ownerName", value)}
                  placeholder={`${form.name || "Your pet"}'s owner`}
                  value={form.ownerName}
                />
                <TextInput
                  error={errors.generalArea}
                  helper="Example: Petaling Jaya, Selangor."
                  label="General area"
                  maxLength={120}
                  onChange={(value) => updateField("generalArea", value)}
                  placeholder="Petaling Jaya, Selangor"
                  value={form.generalArea}
                />
                <PhoneNumberInput
                  error={errors.whatsapp}
                  helper="Optional, but useful for quick finder contact."
                  label="WhatsApp number"
                  onChange={(value) => updateField("whatsapp", value)}
                  value={form.whatsapp}
                />
                <PhoneNumberInput
                  error={errors.phone}
                  helper="Optional. Used for the call button on the Safety Profile."
                  label="Phone number"
                  onChange={(value) => updateField("phone", value)}
                  value={form.phone}
                />
              </div>
            ) : null}

            {mode === "edit" ? (
              <div className="min-w-0 border-t border-pet-border pt-5 sm:rounded-[1.5rem] sm:border sm:bg-white sm:p-5">
                <p className="text-sm font-black text-pet-ink">
                  What finders can see
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-pet-muted">
                  WhatsApp, phone, and emergency notes appear on the Safety
                  Profile. General area can also appear on the Public Profile.
                </p>
                <div className="mt-3 grid min-w-0 gap-2">
                  <SettingRow
                    checked={form.showWhatsapp}
                    control="switch"
                    label="WhatsApp"
                    onChange={(value) => updateField("showWhatsapp", value)}
                  />
                  <SettingRow
                    checked={form.showPhone}
                    control="switch"
                    label="Phone call"
                    onChange={(value) => updateField("showPhone", value)}
                  />
                  <SettingRow
                    checked={form.showGeneralArea}
                    control="switch"
                    helperText="Show the general area on this pet's Public Profile and Safety Profile."
                    label="General area"
                    onChange={(value) => updateField("showGeneralArea", value)}
                  />
                  <SettingRow
                    checked={form.showEmergencyNote}
                    control="switch"
                    label="Emergency note"
                    onChange={(value) => updateField("showEmergencyNote", value)}
                  />
                </div>
              </div>
            ) : null}

            <div className="min-w-0 border-t border-pet-border pt-5 sm:rounded-[1.5rem] sm:border sm:bg-white sm:p-5">
              <p className="text-sm font-black text-pet-ink">
                Safety information
              </p>
              <div className="mt-3 grid min-w-0 gap-4">
                <TagListInput
                  deferSuggestions
                  error={errors.allergies}
                  helper="Add anything finders, carers, or vets should avoid."
                  label="Allergies"
                  max={MAX_ALLERGIES}
                  maxLength={MAX_ALLERGY_LENGTH}
                  mobileLongValueLayout
                  onChange={(values) => updateField("allergies", values)}
                  placeholder="Add a known allergy"
                  suggestions={allergySuggestions}
                  values={form.allergies}
                />

                {mode === "edit" ? (
                  <div>
                    <SettingRow
                      checked={form.showAllergiesOnPublicProfile}
                      control="checkbox"
                      helperText="Allergies are always shown on the Safety Profile for pet safety. Turn this on to also show them on the Public Profile."
                      label="Show allergies on Public Profile"
                      onChange={(value) =>
                        updateField("showAllergiesOnPublicProfile", value)
                      }
                    />
                  </div>
                ) : null}

                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                  <Field
                    errorText={errors.safetyNote}
                    helperText="Helpful for anyone who finds your pet outside."
                    htmlFor="pet-safety-note"
                    label="Safety note / handling instructions"
                  >
                    <AutoGrowTextarea
                      id="pet-safety-note"
                      maxLength={260}
                      onChange={(event) =>
                        updateField("safetyNote", event.target.value)
                      }
                      placeholder="Friendly but nervous around traffic."
                      value={form.safetyNote}
                    />
                  </Field>

                  <Field
                    errorText={errors.emergencyNote}
                    helperText="Add anything urgent a finder should know before contacting you."
                    htmlFor="pet-emergency-note"
                    label="Emergency note"
                  >
                    <AutoGrowTextarea
                      id="pet-emergency-note"
                      maxLength={260}
                      onChange={(event) =>
                        updateField("emergencyNote", event.target.value)
                      }
                      placeholder="Keep shaded and contact owner first."
                      value={form.emergencyNote}
                    />
                  </Field>
                </div>
              </div>
            </div>
          </div>
        </FormSection>
  );
}

const AUTO_GROW_MIN_HEIGHT = 96;
const AUTO_GROW_MAX_HEIGHT = 240;

function AutoGrowTextarea({
  value,
  onInput,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) resizeAutoGrowTextarea(ref.current);
  }, [value]);

  return (
    <textarea
      {...props}
      className="brand-input min-h-24 max-h-60 resize-none"
      onInput={(event) => {
        resizeAutoGrowTextarea(event.currentTarget);
        onInput?.(event);
      }}
      ref={ref}
      value={value}
    />
  );
}

function resizeAutoGrowTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  const contentHeight = textarea.scrollHeight;
  textarea.style.height = `${Math.min(
    Math.max(contentHeight, AUTO_GROW_MIN_HEIGHT),
    AUTO_GROW_MAX_HEIGHT
  )}px`;
  textarea.style.overflowY =
    contentHeight > AUTO_GROW_MAX_HEIGHT ? "auto" : "hidden";
}
