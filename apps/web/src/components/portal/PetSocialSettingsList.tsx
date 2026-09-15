"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingRow } from "@/components/ui/SettingRow";
import { isApiClientError } from "@/services/apiClient";
import {
  getPetSocialSettings,
  updatePetSocialSettings,
  type PetSocialSettings,
} from "@/services/petSocialSettingsService";

type PetSocialSettingsListProps = {
  /**
   * Whether the household's own Social profile is on. The pets below are
   * meaningless without it, so the list reads it rather than owning it.
   */
  ownerSocialEnabled: boolean;
};

/**
 * Which of an owner's pets are in MyPetLink Social, and which may be found.
 *
 * Two decisions per pet, deliberately not one. Being on somebody's profile and
 * being offered to strangers who are browsing are different things, and an
 * owner who is happy with the first is not necessarily happy with the second.
 *
 * Nothing here switches anything on by itself, and nothing here reaches outside
 * Social: a pet's Public Profile, its Safety Profile, its contact details and
 * its Smart Tag are all somewhere else and stay exactly as they were.
 */
export function PetSocialSettingsList({
  ownerSocialEnabled,
}: PetSocialSettingsListProps) {
  const [pets, setPets] = useState<PetSocialSettings[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [savingPetId, setSavingPetId] = useState("");
  const [message, setMessage] = useState("");

  // Reloading is an event — a retry click, or recovering from a conflict — so
  // the state it sets is set from a callback, never from an effect body.
  const load = useCallback(async () => {
    try {
      const response = await getPetSocialSettings();
      setPets(response.data.pets);
      setLoadError("");
    } catch {
      setLoadError("We couldn't load your pets just now.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await getPetSocialSettings();
        if (!active) return;
        setPets(response.data.pets);
        setLoadError("");
      } catch {
        if (!active) return;
        setLoadError("We couldn't load your pets just now.");
      } finally {
        if (active) setLoaded(true);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function save(pet: PetSocialSettings, update: Partial<PetSocialSettings>) {
    setSavingPetId(pet.petId);
    setMessage("");

    try {
      const response = await updatePetSocialSettings(pet.petId, {
        isSocialEnabled: update.isSocialEnabled ?? pet.isSocialEnabled,
        isDiscoverable: update.isDiscoverable ?? pet.isDiscoverable,
        rowVersion: pet.rowVersion,
      });

      // Only ever the server's answer. Showing the switch as moved before the
      // server agreed would tell somebody their pet is private when it is not.
      setPets((current) =>
        current.map((item) =>
          item.petId === pet.petId ? { ...item, ...response.data } : item
        )
      );
    } catch (error) {
      if (isApiClientError(error) && error.status === 409) {
        setMessage(
          `${pet.name}'s sharing settings were changed somewhere else. We've reloaded them.`
        );
        await load();
        return;
      }

      if (isApiClientError(error) && error.status === 429) {
        setMessage("That's a lot of changes at once. Please try again shortly.");
        return;
      }

      setMessage(
        isApiClientError(error)
          ? error.message
          : `We couldn't update ${pet.name} just now. Please try again in a moment.`
      );
    } finally {
      setSavingPetId("");
    }
  }

  if (!loaded) {
    return (
      <p className="text-sm font-semibold text-pet-muted" data-testid="pet-social-loading">
        Loading your pets…
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="grid gap-2" data-testid="pet-social-error">
        <p className="text-sm font-semibold text-pet-muted">{loadError}</p>
        <button
          className="justify-self-start text-sm font-bold text-pet-ink underline"
          onClick={() => void load()}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <p className="text-sm font-semibold text-pet-muted" data-testid="pet-social-empty">
        Add a pet and you can choose whether to share them here.
      </p>
    );
  }

  return (
    <div className="grid gap-4" data-testid="pet-social-list">
      <div className="grid gap-1">
        <h3 className="text-base font-extrabold text-pet-ink">Your pets</h3>
        <p className="text-sm font-semibold text-pet-muted">
          Choose which of your pets to share. Each one is a separate choice, and
          none of this changes their Safety Profile or contact details.
        </p>
      </div>

      {!ownerSocialEnabled ? (
        <p
          className="rounded-2xl bg-pet-surface px-4 py-3 text-sm font-semibold text-pet-muted"
          data-testid="pet-social-master-off"
        >
          Turn on your social profile above to share pets with the MyPetLink
          community. We&apos;ll remember the choices you make here.
        </p>
      ) : null}

      {pets.map((pet) => {
        const busy = savingPetId === pet.petId;
        const blockedByPublicProfile =
          !pet.canEnableSocial && pet.missingRequirements.includes("publicProfile");
        const blockedByLifecycle =
          !pet.canEnableSocial && pet.missingRequirements.includes("lifecycle");

        return (
          <div
            className="grid min-w-0 gap-2 rounded-2xl border border-pet-border p-4"
            data-testid="pet-social-row"
            key={pet.petId}
          >
            {/*
              min-w-0 on the row: `truncate` sets white-space: nowrap, which
              makes the name's min-content the whole unwrapped string. Without
              a shrinkable chain above it that width becomes the card's floor,
              and a pet with a long name pushes the settings card off screen
              rather than getting an ellipsis.
            */}
            <div className="flex min-w-0 items-center gap-3">
              {pet.photoThumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                  src={pet.photoThumbnailUrl}
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="h-10 w-10 shrink-0 rounded-full bg-pet-surface"
                />
              )}
              <span className="min-w-0 truncate text-base font-extrabold text-pet-ink">
                {pet.name}
              </span>
            </div>

            <SettingRow
              checked={pet.isSocialEnabled}
              control="switch"
              disabled={
                busy ||
                !ownerSocialEnabled ||
                (!pet.isSocialEnabled && !pet.canEnableSocial)
              }
              helperText={
                blockedByLifecycle
                  ? `Only an active pet can be shared on MyPetLink Social.`
                  : blockedByPublicProfile
                    ? `Turn on ${pet.name}'s Public Profile first, on their profile page.`
                    : `Show ${pet.name} on your social profile and in the Moments you share.`
              }
              id={`pet-social-enabled-${pet.petId}`}
              label={`Show ${pet.name} on MyPetLink Social`}
              onChange={(checked) => void save(pet, { isSocialEnabled: checked })}
            />

            <SettingRow
              checked={pet.isDiscoverable}
              control="switch"
              disabled={busy || !ownerSocialEnabled || !pet.isSocialEnabled}
              helperText={
                pet.isSocialEnabled
                  ? `Let people who don't have your link find ${pet.name} when they browse or search.`
                  : `Available once ${pet.name} is shared on MyPetLink Social.`
              }
              id={`pet-social-discoverable-${pet.petId}`}
              label={`Let people find ${pet.name} when browsing`}
              onChange={(checked) => void save(pet, { isDiscoverable: checked })}
            />
          </div>
        );
      })}

      {message ? (
        <p
          aria-live="polite"
          className="text-sm font-bold text-pet-muted"
          data-testid="pet-social-message"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
