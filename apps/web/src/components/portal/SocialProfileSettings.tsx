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

/** Which input a server-side field error belongs to, so focus can land on it. */
const fieldInputIds: Record<string, string> = {
  displayName: "social-display-name-input",
  bio: "social-bio-input",
  generalArea: "social-general-area-input",
};

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
  /** True while the owner is deliberately changing a handle they already hold. */
  const [handleEditing, setHandleEditing] = useState(false);

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

  /**
   * What actually stands between this owner and a live social profile.
   *
   * The server reports `canEnableSocial` from the profile it has STORED, which
   * is the right answer to "may this be enabled right now" and the wrong thing
   * to disable a switch with: the display name is usually the very field being
   * filled in when somebody first sets Social up, so the switch sat dead while
   * a perfectly good name was on screen, under helper text telling them to do
   * the thing they had just done.
   *
   * So the prerequisite is read from what the screen is about to save. The
   * handle is the exception and is deliberately read from stored state — it has
   * its own uniqueness, reservation, history and cooldown rules, so it is
   * claimed by its own button and never carried along by this one.
   */
  const persistedHandle = profile.handle.trim();
  const draftDisplayNameError = getSocialDisplayNameError(displayName);
  const missingPrerequisite: "handle" | "displayName" | null = !persistedHandle
    ? "handle"
    : draftDisplayNameError
      ? "displayName"
      : null;

  // Turning it OFF is a withdrawal and must never be gated on anything.
  const canToggleSocial = profile.isSocialEnabled || missingPrerequisite === null;

  const socialEnableHelperText =
    missingPrerequisite === "handle"
      ? "Choose and save a handle before turning on your social profile."
      : missingPrerequisite === "displayName"
        ? "Add a display name before turning on your social profile."
        : "Other owners can see your profile and the Moments you share publicly.";
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
      setHandleEditing(false);
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
      // The switches render from `profile`, which is only ever replaced by a
      // server response. Nothing below moves them, so a refused change cannot
      // leave a toggle claiming something the server did not accept.
      if (isApiClientError(error) && error.status === 409) {
        // Changed in another tab or on another device. Take the server's
        // version so the screen stops disagreeing with it; the typed draft is
        // replaced because it was written against a profile that no longer
        // exists.
        try {
          const current = await getOwnerSocialProfile();
          applyProfile(current.data);
        } catch {
          // Leave what is on screen; the message below still explains it.
        }

        setFieldErrors({});
        setSaveMessage(
          "Your social profile was changed somewhere else, so we've reloaded it. "
            + "Check it over and try again."
        );
        return;
      }

      if (isApiClientError(error) && error.status === 429) {
        setSaveMessage("That's a lot of changes at once. Please try again shortly.");
        return;
      }

      if (isApiClientError(error) && error.details) {
        const details: Record<string, string> = {};
        for (const [field, messages] of Object.entries(error.details)) {
          if (messages?.[0]) details[field] = messages[0];
        }
        setFieldErrors(details);

        // We know which field is wrong, so say that rather than a generic
        // failure, and put the cursor where the fix has to happen.
        const [firstField, firstMessage] = Object.entries(details)[0] ?? [];
        if (firstField && firstMessage) {
          setSaveMessage(firstMessage);
          document.getElementById(fieldInputIds[firstField] ?? "")?.focus();
          return;
        }
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
        title="Profile"
        description="Set up the name other pet owners see on MyPetLink."
      >
        <p className="text-sm font-semibold text-pet-muted">
          Sign in to set up your social profile.
        </p>
      </FormSection>
    );
  }

  return (
    <div className="grid gap-5">
    <FormSection
      id="social-profile"
      title="Profile"
      description="The name and picture other pet owners see when you share Moments."
    >
      <div className="grid gap-5">
        {/*
          The same guarantee, a quarter of the height. It matters, but it is
          reassurance rather than an instruction, and at its old size it was the
          first and largest thing on a screen about choosing a name.
        */}
        <p
          className="flex items-start gap-2 text-xs font-semibold leading-5 text-pet-muted"
          data-testid="social-privacy-note"
        >
          <Icon
            aria-hidden="true"
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pet-teal"
            name="shield"
          />
          <span>
            Community profile details are separate from finder contact details.
            Your phone number and email are never shown here.
          </span>
        </p>

        {loadError ? (
          <p className="rounded-2xl bg-pet-apricot p-4 text-sm font-bold text-pet-ink">
            {loadError}
          </p>
        ) : null}

        <div className="grid min-w-0 gap-2">
          <span className="text-sm font-bold text-pet-ink">Profile picture</span>
          {/*
            A visible native file input asserts a user-agent intrinsic width —
            wide enough for "Choose file / No file chosen" plus the file: button
            padding — and a flex item's default min-width:auto will not shrink
            below it. Left unchecked that floor propagates up the whole card.
            min-w-0 on both levels lets the chain shrink, w-full makes the input
            take the room it is given instead of the room it wants, and wrapping
            moves the control under the avatar before either has to be clipped.
          */}
          <div className="flex min-w-0 flex-wrap items-center gap-4">
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
            <div className="grid min-w-0 flex-1 basis-56 gap-1">
              {/*
                The native control is kept — it is what actually opens the file
                picker, and it is what assistive technology operates — but it is
                taken out of the visual layer. "Choose File / No file chosen" is
                a browser's wording in a browser's typeface, and it was the one
                thing on this screen that looked like an admin form rather than
                somebody's profile.
              */}
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={avatarBusy}
                id="social-avatar-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadAvatar(file);
                  // Clear it so choosing the same file twice still fires.
                  event.target.value = "";
                }}
                ref={avatarInputRef}
                type="file"
              />
              <button
                className="inline-flex min-h-11 w-fit min-w-0 items-center gap-2 rounded-full border border-pet-border bg-white px-4 text-sm font-bold text-pet-ink transition hover:bg-pet-cream disabled:opacity-60"
                disabled={avatarBusy}
                data-testid="social-avatar-button"
                onClick={() => avatarInputRef.current?.click()}
                type="button"
              >
                <Icon aria-hidden="true" className="h-4 w-4" name="plus" />
                {avatarBusy
                  ? "Uploading…"
                  : profile.avatarThumbnailUrl
                    ? "Change photo"
                    : "Add a photo"}
              </button>
              <span className="text-xs font-semibold text-pet-muted">
                JPG, PNG or WebP, up to 10 MB. We never use your Google picture
                unless you upload it here.
              </span>
            </div>
          </div>
        </div>

        {/*
          A handle somebody already owns is settled, not a form field waiting to
          be filled in. Leaving it as a permanently editable textbox made an
          established identity look unsaved every time the screen opened — and
          invited a rename nobody meant to start, which costs a 30-day cooldown.
          So it reads as a value until the owner asks to change it.

          Nothing about the rules changes here: uniqueness, reservations, the
          cooldown, the release hold and the protected names are all the
          server's, and claiming is still its own explicit action.
        */}
        {profile.handle && !handleEditing ? (
          <Field
            helperText={
              cooldownActive && cooldownUntil
                ? `You can change this again after ${cooldownUntil.toLocaleDateString()}.`
                : "People find you by this."
            }
            label="Handle"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span
                className="min-w-0 truncate text-base font-black text-pet-ink"
                data-testid="social-handle-value"
              >
                @{profile.handle}
              </span>
              <button
                className="inline-flex min-h-11 items-center rounded-full border border-pet-border bg-white px-4 text-sm font-bold text-pet-ink transition hover:bg-pet-cream disabled:opacity-60"
                data-testid="social-handle-change"
                disabled={cooldownActive}
                onClick={() => {
                  setHandleEditing(true);
                  setHandleState("idle");
                  setHandleMessage("");
                }}
                type="button"
              >
                Change handle
              </button>
            </div>
          </Field>
        ) : (
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
            label={profile.handle ? "Change handle" : "Choose your handle"}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span
                aria-hidden="true"
                className="text-sm font-black text-pet-muted"
              >
                @
              </span>
              <input
                className="min-h-12 w-full min-w-0 flex-1 basis-40 rounded-2xl border border-pet-border bg-white px-4 text-sm font-semibold text-pet-ink"
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
                {claiming ? "Saving…" : profile.handle ? "Save handle" : "Claim handle"}
              </CTAButton>
              {profile.handle ? (
                <button
                  className="min-h-11 text-sm font-bold text-pet-muted underline"
                  onClick={() => {
                    setHandleEditing(false);
                    setHandleInput(profile.handle);
                    setHandleState("idle");
                    setHandleMessage("");
                  }}
                  type="button"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </Field>
        )}

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

      </div>
    </FormSection>

    <FormSection
      id="social-visibility"
      title="Privacy & visibility"
      description="Who can find you, and whether new people can follow you."
    >
      <div className="grid gap-2">
          <SettingRow
            checked={profile.isSocialEnabled}
            control="switch"
            disabled={!loaded || saving || !canToggleSocial}
            helperText={socialEnableHelperText}
            id="social-enabled-switch"
            label="Turn on my social profile"
            onChange={(checked) => void saveProfile({ isSocialEnabled: checked })}
          />

          <SettingRow
            checked={profile.isDiscoverable}
            control="switch"
            disabled={!loaded || saving || !profile.isSocialEnabled}
            helperText={
              profile.isSocialEnabled
                ? "Let people who don't have your link find you when they browse or search."
                : // Kept, not erased — but nothing is discoverable while the
                  // profile itself is off, and a switch showing blue with no
                  // explanation would claim otherwise.
                  "This preference will apply when your social profile is turned on."
            }
            id="social-discoverable-switch"
            label="Show me in search and browsing"
            onChange={(checked) => void saveProfile({ isDiscoverable: checked })}
          />

          <SettingRow
            checked={profile.allowFollowers}
            control="switch"
            disabled={!loaded || saving || !profile.isSocialEnabled}
            helperText={
              profile.isSocialEnabled
                ? "Turn this off and nobody new can follow you."
                : "This preference will apply when your social profile is turned on."
            }
            id="social-allow-followers-switch"
            label="Let other owners follow me"
            onChange={(checked) => void saveProfile({ allowFollowers: checked })}
          />
        </div>
    </FormSection>

    <FormSection
      id="social-pets"
      title="Pets"
      description="Choose which of your pets appear alongside you in the community."
    >
      <PetSocialSettingsList ownerSocialEnabled={profile.isSocialEnabled} />
    </FormSection>

    <FormSection id="social-save" title="Save your details">
      <div className="grid gap-5">
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
    </div>
  );
}
