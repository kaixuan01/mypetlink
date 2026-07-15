"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MomentEditorDialog } from "@/components/portal/MomentEditorDialog";
import { CTAButton } from "@/components/ui/CTAButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getMemoryLimitState } from "@/lib/planLimits";
import { isArchivedPet } from "@/lib/petLifecycle";
import { ownerRoutes } from "@/lib/routes";
import {
  createPetMoment,
  getFriendlyMomentErrorMessage,
  getPetMoments,
} from "@/services/momentService";
import type { Pet, PetMomentPayload } from "@/types";

export function PetMomentForm({ pet }: { pet: Pet }) {
  const router = useRouter();
  const archivedPet = isArchivedPet(pet);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirtyRef = useRef(dirty);
  const closingRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    let active = true;

    getPetMoments(pet.id)
      .then((response) => {
        if (active) setMemoryCount(response.data.length);
      })
      .catch((caught) => {
        if (active) setLoadError(getFriendlyMomentErrorMessage(caught));
      });

    return () => {
      active = false;
    };
  }, [pet.id]);

  const finishNavigation = useCallback(() => {
    router.replace(ownerRoutes.petMoments(pet.id));
  }, [pet.id, router]);

  const closeEditor = useCallback(() => {
    closingRef.current = true;
    if (window.history.state?.myPetLinkMomentCreateGuard) {
      window.history.back();
    } else {
      finishNavigation();
    }
  }, [finishNavigation]);

  const requestClose = useCallback(() => {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    closeEditor();
  }, [closeEditor, dirty]);

  async function handleSubmit(payload: PetMomentPayload) {
    if (
      archivedPet ||
      (memoryCount !== null && !getMemoryLimitState(memoryCount).canCreate)
    ) {
      return;
    }

    setIsSubmitting(true);
    setFormError("");
    try {
      await createPetMoment(pet.id, payload);
      setDirty(false);
      closeEditor();
    } catch (caught) {
      setFormError(getFriendlyMomentErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  const editorReady =
    !archivedPet &&
    !loadError &&
    memoryCount !== null &&
    getMemoryLimitState(memoryCount).canCreate;

  useEffect(() => {
    if (!editorReady) {
      return undefined;
    }

    if (!window.history.state?.myPetLinkMomentCreateGuard) {
      window.history.pushState(
        { ...window.history.state, myPetLinkMomentCreateGuard: true },
        "",
        window.location.href
      );
    }

    function handlePopState() {
      if (closingRef.current) {
        finishNavigation();
        return;
      }

      if (dirtyRef.current) {
        window.history.pushState(
          { ...window.history.state, myPetLinkMomentCreateGuard: true },
          "",
          window.location.href
        );
        setConfirmDiscard(true);
      } else {
        finishNavigation();
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [editorReady, finishNavigation]);

  if (archivedPet) {
    return (
      <section className="brand-soft-card rounded-[1.75rem] p-6">
        <p className="text-sm font-bold uppercase text-pet-teal">Archived profile</p>
        <h2 className="mt-3 text-2xl font-black text-pet-ink">
          Restore this profile before adding new memories.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-pet-muted">
          Existing memories stay safe with the archived profile, but new memory
          creation is paused while the profile is archived.
        </p>
        <CTAButton className="mt-6" href={ownerRoutes.petMoments(pet.id)} icon="heart">
          View Existing Memories
        </CTAButton>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="brand-card rounded-[1.75rem] p-6">
        <p className="text-sm font-bold uppercase text-pet-teal">Could not check memories</p>
        <h2 className="mt-2 text-2xl font-black text-pet-ink">
          This pet&apos;s memory allowance is temporarily unavailable.
        </h2>
        <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-pet-muted">{loadError}</p>
      </section>
    );
  }

  if (memoryCount === null) {
    return (
      <div className="brand-card rounded-[1.75rem] p-6">
        <p className="text-sm font-semibold text-pet-muted">Checking this pet&apos;s memory allowance...</p>
      </div>
    );
  }

  const memoryLimit = getMemoryLimitState(memoryCount);
  if (!memoryLimit.canCreate) {
    return (
      <section className="brand-soft-card rounded-[1.75rem] p-6">
        <p className="text-sm font-bold uppercase text-pet-teal">Free memory limit</p>
        <h2 className="mt-3 text-2xl font-black text-pet-ink">More memories are coming with Premium.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-pet-muted">{memoryLimit.message}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <CTAButton href={ownerRoutes.petMoments(pet.id)} icon="heart">View Existing Memories</CTAButton>
          <CTAButton href={ownerRoutes.petProfile(pet.id)} variant="secondary">Manage {pet.name}</CTAButton>
        </div>
      </section>
    );
  }

  return (
    <>
      <MomentEditorDialog
        error={formError}
        mode="create"
        onDirtyChange={setDirty}
        onRequestClose={requestClose}
        onSubmit={handleSubmit}
        petName={pet.name}
        submitting={isSubmitting}
      />
      <ConfirmDialog
        confirmLabel="Discard changes"
        message="Your unsaved moment details and media selections will be lost."
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          setDirty(false);
          closeEditor();
        }}
        open={confirmDiscard}
        title="Discard this moment?"
      />
    </>
  );
}
