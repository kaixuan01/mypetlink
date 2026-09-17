"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MomentEditorDialog } from "@/components/portal/MomentEditorDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CTAButton } from "@/components/ui/CTAButton";
import { FormDialog } from "@/components/ui/FormDialog";
import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { AnalyticsEvent, trackEvent } from "@/lib/analytics";
import { ownerRoutes } from "@/lib/routes";
import { isApiClientError } from "@/services/apiClient";
import { createPetMoment } from "@/services/momentService";
import { getPets } from "@/services/petService";
import type { PetListItem, PetMomentPayload } from "@/types";

type CommunityMomentComposerProps = {
  onClose: () => void;
  /** Fired after a Moment is created, so the surface underneath can refresh. */
  onCreated?: () => void;
};

/**
 * Share a Moment, without leaving Community.
 *
 * Share used to be a navigation: it fetched the owner's pets and pushed them
 * into the Owner Portal — a pet's Moments page with one pet, the Moments index
 * with several, Add a pet with none. Every one of those is a different half of
 * the product, so pressing Share in a feed dropped you out of Community and
 * left you to find your way back.
 *
 * It is a dialog now, and the dialog is the Owner Portal's own editor. That
 * matters more than it sounds: the validation, the media uploader, the
 * multi-pet rules, the audience control, the payload and the create call are
 * all the ones that already existed. Community supplies the two things the
 * portal gets from its route — which pets exist, and which one this Moment is
 * about — and nothing else about writing a Moment is decided twice.
 *
 * `FormDialog` is what makes it responsive: a centred panel from `sm` up and a
 * full-height surface on a phone, sized against the keyboard inset, which is
 * what a form with media and a caption box needs there.
 */
export function CommunityMomentComposer({
  onClose,
  onCreated,
}: CommunityMomentComposerProps) {
  const [pets, setPets] = useState<PetListItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [primaryPetId, setPrimaryPetId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  /*
    Pets are resolved when the composer opens rather than on every route, so the
    Community shell does not make an owner request just in case. The shell
    mounts this only while it is open, which is also what clears a closed
    draft: reopening is a new Moment, not the ghost of an abandoned one.
  */
  useEffect(() => {
    // No synchronous reset needed: this component is mounted fresh each time
    // the composer opens, so its state already starts clean.
    let active = true;

    getPets()
      .then((response) => {
        if (!active) return;

        const owned = response.data ?? [];
        setPets(owned);
        // One pet is not a choice. Asking anyway would be a question with one
        // answer standing between somebody and the thing they pressed.
        setPrimaryPetId((current) => current ?? owned[0]?.id ?? null);
      })
      .catch(() => {
        if (!active) return;
        setPets([]);
        setLoadFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const primaryPet = useMemo(
    () => pets?.find((pet) => pet.id === primaryPetId),
    [pets, primaryPetId]
  );
  const otherPets = useMemo(
    () => (pets ?? []).filter((pet) => pet.id !== primaryPetId),
    [pets, primaryPetId]
  );

  const requestClose = useCallback(() => {
    // Typing is work. Losing it to a mis-tapped backdrop is the kind of small
    // betrayal people remember, so a started draft asks first — and an
    // untouched one never does.
    if (dirty && !submitting) {
      setConfirmingDiscard(true);
      return;
    }

    onClose();
  }, [dirty, onClose, submitting]);

  async function handleSubmit(payload: PetMomentPayload) {
    if (!primaryPet || submitting) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await createPetMoment(primaryPet.id, payload);

      trackEvent(AnalyticsEvent.MomentCreated, { source: "community" });
      onCreated?.();
      onClose();
    } catch (caught) {
      // The draft stays exactly as it was. A failed upload or a rejected field
      // is a reason to try again, not a reason to retype everything.
      setError(
        isApiClientError(caught) && caught.message
          ? caught.message
          : "We couldn't share this Moment. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (pets === null) {
    return (
      <FormDialog
        maxWidthClassName="sm:max-w-2xl"
        onRequestClose={onClose}
        open
        title="Share a Moment"
      >
        <p
          aria-busy="true"
          className="text-sm font-semibold text-pet-muted"
          data-testid="composer-loading"
        >
          Getting your pets ready…
        </p>
      </FormDialog>
    );
  }

  if (pets.length === 0) {
    return (
      <FormDialog
        maxWidthClassName="sm:max-w-lg"
        onRequestClose={onClose}
        open
        title="Share a Moment"
      >
        {/*
          A Moment is about a pet, so there is nothing to write yet. Adding one
          is in the other half of the app, and that is the honest answer rather
          than an editor with an empty pet picker — the prerequisite genuinely
          does not exist. The way back to Community is the dialog's own close.
        */}
        <div className="text-center" data-testid="composer-needs-pet">
          <LinkoMascot
            alt="Linko the MyPetLink mascot waving"
            className="mx-auto"
            pose="wave"
            size={80}
          />
          <p className="mt-3 text-sm font-bold text-pet-ink">
            {loadFailed
              ? "We couldn't check your pets just now."
              : "Add a pet before sharing your first Moment."}
          </p>
          <p className="mx-auto mt-1 max-w-xs text-sm font-semibold leading-6 text-pet-muted">
            {loadFailed
              ? "Please try again in a moment."
              : "Every Moment is about a pet, so there needs to be one first."}
          </p>
          {loadFailed ? null : (
            <div className="mt-4">
              <CTAButton href={ownerRoutes.petNew}>Add a pet</CTAButton>
            </div>
          )}
        </div>
      </FormDialog>
    );
  }

  return (
    <>
      <MomentEditorDialog
        /*
          Community's words, not the portal's: the nav item says Share, so the
          dialog says Share. 768px rather than the management editor's 896 —
          wide enough for the two-column fields, narrow enough to read as a
          compose box rather than a settings screen.
        */
        dialogTitle="Share a Moment"
        /*
          Names the pet, which the portal's title used to do ("Add a moment for
          Mochi") and Community's does not. With one pet nothing else on the
          screen would say who this is about: the subject selector hides itself
          when there is no second pet to choose.
        */
        dialogDescription={
          primaryPet ? `A Moment for ${primaryPet.name}.` : undefined
        }
        error={error}
        maxWidthClassName="sm:max-w-3xl"
        mode="create"
        onDirtyChange={setDirty}
        onPrimaryPetChange={pets.length > 1 ? setPrimaryPetId : undefined}
        onRequestClose={requestClose}
        onSubmit={handleSubmit}
        otherPets={otherPets}
        petName={primaryPet?.name ?? ""}
        primaryPet={primaryPet}
        primaryPetOptions={pets.length > 1 ? pets : undefined}
        submitLabel="Share Moment"
        submitting={submitting}
      />

      {confirmingDiscard ? (
        <ConfirmDialog
          cancelLabel="Keep editing"
          confirmLabel="Discard"
          destructive
          message="You haven't shared this Moment yet. Closing now will lose what you have written."
          onCancel={() => setConfirmingDiscard(false)}
          onConfirm={() => {
            setConfirmingDiscard(false);
            onClose();
          }}
          open
          title="Discard this Moment?"
        />
      ) : null}
    </>
  );
}
