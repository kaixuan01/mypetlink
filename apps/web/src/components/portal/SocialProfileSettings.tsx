"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PetSocialSettingsList } from "@/components/portal/PetSocialSettingsList";
import { CTAButton } from "@/components/ui/CTAButton";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/ui/FormSection";
import { Icon } from "@/components/ui/Icon";
import { SettingRow } from "@/components/ui/SettingRow";
import {
  generalAreaMaxLength,
  getGeneralAreaError,
  getHandleShapeError,
  getSocialBioError,
  getSocialDisplayNameError,
  handleMaxLength,
  normalizeHandleForDisplay,
  socialBioMaxLength,
  socialDisplayNameMaxLength,
  suggestHandlesFromPetNames,
  suggestSocialDisplayName,
} from "@/lib/ownerSocialIdentity";
import { isApiClientError } from "@/services/apiClient";
import { isApiConfigured } from "@/services/apiConfig";
import { uploadMediaFile } from "@/services/mediaService";
import {
  checkOwnerHandleAvailability,
  claimOwnerHandle,
  emptyOwnerSocialProfile,
  getOwnerSocialProfile,
  updateOwnerSocialProfile,
  type OwnerSocialProfile,
} from "@/services/ownerSocialService";

type HandleState = "idle" | "checking" | "available" | "unavailable" | "invalid";

type SocialProfileSettingsProps = {
  /** Used only to suggest a friendly handle and display name. */
  petNames?: string[];
};

/**
 * Where an owner sets up the name people see on the social side of MyPetLink.
 *
 * Two things this screen must never do. It must not switch anything on by
 * itself — opening the page is not joining. And it must not present the social
 * name as the same thing as the name a finder sees, because they are different
 * decisions with different audiences.
 */
export function SocialProfileSettings({ petNames = [] }: SocialProfileSettingsProps) {
  const [profile, setProfile] = useState<OwnerSocialProfile>(emptyOwnerSocialProfile);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [handleInput, setHandleInput] = useState("");
  const [handleState, setHandleState] = useState<HandleState>("idle");
  const [handleMessage, setHandleMessage] = useState("");
  const [claiming, setClaiming] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [generalArea, setGeneralArea] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [loadedAt, setLoadedAt] = useState(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const availabilityRequestRef = useRef(0);

  const applyProfile = useCallback((next: OwnerSocialProfile) => {
    setProfile(next);
    setDisplayName(next.displayName);
    setBio(next.bio);
    setGeneralArea(next.generalArea);
    setHandleInput(next.handle);
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await getOwnerSocialProfile();
        if (!active) return;
        applyProfile(response.data);
      } catch (error) {
        if (!active) return;
        setLoadError(
          isApiClientError(error)
            ? error.message
            : "We couldn't load your social profile. Please try again in a moment."
        );
      } finally {
        if (active) {
          setLoadedAt(Date.now());
          setLoaded(true);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [applyProfile]);

  const handleSuggestions = suggestHandlesFromPetNames(petNames);
  const displayNameSuggestion = suggestSocialDisplayName(petNames);
  const cooldownUntil = profile.handleChangeAvailableAt
    ? new Date(profile.handleChangeAvailableAt)
    : null;

  // Reading the clock during render is impure, and a cooldown is measured in
  // days, so comparing against the time the profile was loaded is both correct
  // and stable across re-renders.
  const cooldownActive = Boolean(
    cooldownUntil && cooldownUntil.getTime() > loadedAt
  );

  async function checkAvailability(value: string) {
    const shapeError = getHandleShapeError(value);

    if (shapeError) {
      setHandleState("invalid");
      setHandleMessage(shapeError);
      return;
    }

    if (normalizeHandleForDisplay(value).toLowerCase() === profile.handle.toLowerCase()) {
      setHandleState("idle");
      setHandleMessage("");
      return;
    }

    const requestId = availabilityRequestRef.current + 1;
    availabilityRequestRef.current = requestId;
    setHandleState("checking");
    setHandleMessage("");

    try {
      const response = await checkOwnerHandleAvailability(normalizeHandleForDisplay(value));
      if (availabilityRequestRef.current !== requestId) return;

      setHandleState(response.data ? "available" : "unavailable");
      setHandleMessage(
        response.data
          ? "That handle is available."
          : "That handle isn't available. Try another one."
      );
    } catch {
      if (availabilityRequestRef.current !== requestId) return;
      setHandleState("idle");
      setHandleMessage("We couldn't check that handle. Try again in a moment.");
    }
  }

  async function saveHandle() {
    const shapeError = getHandleShapeError(handleInput);

    if (shapeError) {
      setHandleState("invalid");
      setHandleMessage(shapeError);
      return;
    }

    setClaiming(true);
    setHandleMessage("");

    try {
      const response = await claimOwnerHandle(normalizeHandleForDisplay(handleInput));
      applyProfile(response.data);
      setHandleState("idle");
      setHandleMessage("Handle saved.");
    } catch (error) {
      setHandleState("unavailable");
      setHandleMessage(
        isApiClientError(error)
          ? error.message
          : "We couldn't save that handle. Please try again in a moment."
      );
    } finally {
      setClaiming(false);
    }
  }

  async function saveProfile(overrides: Partial<OwnerSocialProfile> = {}) {
    const errors: Record<string, string> = {};
    const nextDisplayName = overrides.displayName ?? displayName;

    // A display name is only required once the profile is actually on; until
    // then an owner can fill the form in any order they like.
    const wantsEnabled = overrides.isSocialEnabled ?? profile.isSocialEnabled;

    if (wantsEnabled || nextDisplayName.trim()) {
      const displayNameError = getSocialDisplayNameError(nextDisplayName);
      if (displayNameError) errors.displayName = displayNameError;
    }

    const bioError = getSocialBioError(bio);
    if (bioError) errors.bio = bioError;

    const areaError = getGeneralAreaError(generalArea);
    if (areaError) errors.generalArea = areaError;

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setSaveMessage("");
      return;
    }

    setSaving(true);
    setSaveMessage("");

    try {
      const response = await updateOwnerSocialProfile({
        displayName: nextDisplayName,
        bio,
        generalArea,
        isSocialEnabled: overrides.isSocialEnabled ?? profile.isSocialEnabled,
        isDiscoverable: overrides.isDiscoverable ?? profile.isDiscoverable,
        allowFollowers: overrides.allowFollowers ?? profile.allowFollowers,
        rowVersion: profile.rowVersion,
      });
      applyProfile(response.data);
      setSaveMessage("Saved.");
    } catch (error) {
      if (isApiClientError(error) && error.details) {
        const details: Record<string, string> = {};
        for (const [field, messages] of Object.entries(error.details)) {
          if (messages?.[0]) details[field] = messages[0];
        }
        setFieldErrors(details);
      }

      setSaveMessage(
        isApiClientError(error)
          ? error.message
          : "We couldn't save your changes. Please try again in a moment."
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    setAvatarBusy(true);
    setSaveMessage("");

    try {
      await uploadMediaFile({
        file,
        category: "OwnerAvatar",
        cleanupOnFailure: true,
      });
      const refreshed = await getOwnerSocialProfile();
      applyProfile(refreshed.data);
    } catch (error) {
      setSaveMessage(
        isApiClientError(error)
          ? error.message
          : "We couldn't upload that picture. Please try again in a moment."
      );
    } finally {
      setAvatarBusy(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  if (!isApiConfigured()) {
    return (
      <FormSection
        id="social-profile"
        title="Your social profile"
        description="Set up the name other pet owners see on MyPetLink."
      >
        <p className="text-sm font-semibold text-pet-muted">
          Sign in to set up your social profile.
        </p>
      </FormSection>
    );
  }

  return (
    <FormSection
      id="social-profile"
      title="Your social profile"
      description="The name and picture other pet owners see when you share Moments."
    >
      <div className="grid gap-5">
        <div className="rounded-2xl bg-[#e8f3ff] p-4">
          <p className="flex items-start gap-2 text-sm font-semibold leading-6 text-pet-ink">
            <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-pet-teal" />
            <span>
              This is separate from the contact details shown to someone who
              finds your pet. Your social profile never shows your phone number,
              your email, or the name on your account.
            </span>
          </p>
        </div>

        {loadError ? (
          <p className="rounded-2xl bg-pet-apricot p-4 text-sm font-bold text-pet-ink">
            {loadError}
          </p>
        ) : null}

        <div className="grid gap-2">
          <span className="text-sm font-bold text-pet-ink">Profile picture</span>
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-cream">
              {profile.avatarThumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className="h-full w-full object-cover"
                  src={profile.avatarThumbnailUrl}
                />
              ) : (
                <Icon name="pets" className="h-6 w-6 text-pet-muted" />
              )}
            </span>
            <div className="grid gap-1">
              <input
                accept="image/jpeg,image/png,image/webp"
                className="text-sm font-semibold text-pet-muted file:mr-3 file:rounded-full file:border-0 file:bg-pet-teal file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
                disabled={avatarBusy}
                id="social-avatar-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadAvatar(file);
                }}
                ref={avatarInputRef}
                type="file"
              />
              <span className="text-xs font-semibold text-pet-muted">
                {avatarBusy
                  ? "Uploading…"
                  : "JPG, PNG or WebP, up to 10 MB. We never use your Google picture unless you upload it here."}
              </span>
            </div>
          </div>
        </div>

        <Field
          errorText={
            handleState === "invalid" || handleState === "unavailable"
              ? handleMessage
              : undefined
          }
          helperText={
            cooldownActive && cooldownUntil
              ? `You can change your handle again after ${cooldownUntil.toLocaleDateString()}.`
              : handleState === "available"
                ? handleMessage
                : "Letters, numbers, underscores and dots. People find you by this."
          }
          label="Handle"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="text-sm font-black text-pet-muted"
            >
              @
            </span>
            <input
              className="min-h-12 w-full min-w-0 rounded-2xl border border-pet-border bg-white px-4 text-sm font-semibold text-pet-ink"
              disabled={cooldownActive || claiming}
              id="social-handle-input"
              maxLength={handleMaxLength}
              onBlur={(event) => void checkAvailability(event.target.value)}
              onChange={(event) => {
                setHandleInput(event.target.value);
                setHandleState("idle");
                setHandleMessage("");
              }}
              placeholder={handleSuggestions[0] ?? "mochiandcoco"}
              type="text"
              value={handleInput}
            />
            <CTAButton
              disabled={cooldownActive || claiming || !handleInput.trim()}
              onClick={() => void saveHandle()}
              type="button"
              variant="secondary"
            >
              {claiming ? "Saving…" : "Save handle"}
            </CTAButton>
          </div>
        </Field>

        {handleSuggestions.length > 0 && !profile.handle ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-pet-muted">Ideas:</span>
            {handleSuggestions.map((suggestion) => (
              <button
                className="rounded-full border border-pet-border bg-white px-3 py-1 text-xs font-bold text-pet-teal transition hover:bg-pet-cream"
                key={suggestion}
                onClick={() => {
                  setHandleInput(suggestion);
                  void checkAvailability(suggestion);
                }}
                type="button"
              >
                @{suggestion}
              </button>
            ))}
          </div>
        ) : null}

        <Field
          errorText={fieldErrors.displayName}
          helperText={
            displayNameSuggestion && !displayName
              ? `Many owners use something like "${displayNameSuggestion}".`
              : "Shown above your Moments. A household name works well."
          }
          label="Display name"
        >
          <input
            className="min-h-12 w-full min-w-0 rounded-2xl border border-pet-border bg-white px-4 text-sm font-semibold text-pet-ink"
            id="social-display-name-input"
            maxLength={socialDisplayNameMaxLength}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder={displayNameSuggestion || "Mochi & Coco's Family"}
            type="text"
            value={displayName}
          />
        </Field>

        <Field errorText={fieldErrors.bio} label="About you" optional>
          <textarea
            className="min-h-24 w-full min-w-0 rounded-2xl border border-pet-border bg-white p-4 text-sm font-semibold text-pet-ink"
            id="social-bio-input"
            maxLength={socialBioMaxLength}
            onChange={(event) => setBio(event.target.value)}
            placeholder="Two cats, one very patient sofa."
            value={bio}
          />
        </Field>

        <Field
          errorText={fieldErrors.generalArea}
          helperText="A neighbourhood and city, like Bangsar, Kuala Lumpur. Never your street address."
          label="General area"
          optional
        >
          <input
            className="min-h-12 w-full min-w-0 rounded-2xl border border-pet-border bg-white px-4 text-sm font-semibold text-pet-ink"
            id="social-general-area-input"
            maxLength={generalAreaMaxLength}
            onChange={(event) => setGeneralArea(event.target.value)}
            placeholder="Bangsar, Kuala Lumpur"
            type="text"
            value={generalArea}
          />
        </Field>

        <div className="grid gap-2">
          <SettingRow
            checked={profile.isSocialEnabled}
            control="switch"
            disabled={!loaded || saving || (!profile.isSocialEnabled && !profile.canEnableSocial)}
            helperText={
              profile.canEnableSocial || profile.isSocialEnabled
                ? "Other owners can see your profile and the Moments you share publicly."
                : "Choose a handle and a display name first."
            }
            id="social-enabled-switch"
            label="Turn on my social profile"
            onChange={(checked) => void saveProfile({ isSocialEnabled: checked })}
          />

          <SettingRow
            checked={profile.isDiscoverable}
            control="switch"
            disabled={!loaded || saving || !profile.isSocialEnabled}
            helperText="Let people who don't have your link find you when they browse or search."
            id="social-discoverable-switch"
            label="Show me in search and browsing"
            onChange={(checked) => void saveProfile({ isDiscoverable: checked })}
          />

          <SettingRow
            checked={profile.allowFollowers}
            control="switch"
            disabled={!loaded || saving || !profile.isSocialEnabled}
            helperText="Turn this off and nobody new can follow you."
            id="social-allow-followers-switch"
            label="Let other owners follow me"
            onChange={(checked) => void saveProfile({ allowFollowers: checked })}
          />
        </div>

        <PetSocialSettingsList ownerSocialEnabled={profile.isSocialEnabled} />

        <div className="flex flex-wrap items-center gap-3">
          <CTAButton
            disabled={saving || !loaded}
            onClick={() => void saveProfile()}
            type="button"
          >
            {saving ? "Saving…" : "Save social profile"}
          </CTAButton>
          {saveMessage ? (
            <span className="text-sm font-bold text-pet-muted">{saveMessage}</span>
          ) : null}
        </div>
      </div>
    </FormSection>
  );
}
