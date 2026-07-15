"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MomentEditorDialog } from "@/components/portal/MomentEditorDialog";
import { PetMomentCard } from "@/components/portal/PetMomentCard";
import { useOwnerHeaderPageContext } from "@/components/portal/OwnerHeaderActions";
import { CTAButton } from "@/components/ui/CTAButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { getMemoryLimitState } from "@/lib/planLimits";
import { isArchivedPet } from "@/lib/petLifecycle";
import { ownerRoutes } from "@/lib/routes";
import { isApiConfigured } from "@/services/apiConfig";
import {
  deletePetMoment,
  getFriendlyMomentErrorMessage,
  getPetMoments,
  updatePetMoment,
} from "@/services/momentService";
import type {
  Pet,
  PetMoment,
  PetMomentPayload,
} from "@/types";

type PetMomentsManagerProps = {
  pet: Pet;
  initialMoments: PetMoment[];
};

function updateEditQuery(momentId?: string, mode: "push" | "replace" = "replace") {
  const url = new URL(window.location.href);
  if (momentId) {
    url.searchParams.set("edit", momentId);
  } else {
    url.searchParams.delete("edit");
  }
  const state = {
    ...window.history.state,
    myPetLinkMomentEdit: Boolean(momentId),
  };
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (mode === "push") {
    window.history.pushState(state, "", nextUrl);
  } else {
    window.history.replaceState(state, "", nextUrl);
  }
}

export function PetMomentsManager({
  pet,
  initialMoments,
}: PetMomentsManagerProps) {
  const apiMode = isApiConfigured();
  const archivedPet = isArchivedPet(pet);
  const [moments, setMoments] = useState<PetMoment[]>(
    apiMode ? [] : initialMoments
  );
  const [editingMoment, setEditingMoment] = useState<PetMoment | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PetMoment | null>(null);
  const momentsRef = useRef(moments);
  const editingMomentRef = useRef(editingMoment);
  const editDirtyRef = useRef(editDirty);
  const memoryLimit = getMemoryLimitState(moments.length);
  const canCreateMemory = memoryLimit.canCreate && !archivedPet;
  const counts = useMemo(
    () => ({
      publicProfile: moments.filter(
        (moment) =>
          moment.visibility === "Public" && moment.showOnPublicProfile
      ).length,
      private: moments.filter((moment) => moment.visibility === "Private").length,
      family: moments.filter((moment) => moment.visibility === "Family Only")
        .length,
      timeline: moments.filter(
        (moment) =>
          moment.visibility === "Public" && moment.showInLifeTimeline
      ).length,
    }),
    [moments]
  );

  useEffect(() => {
    momentsRef.current = moments;
    editingMomentRef.current = editingMoment;
    editDirtyRef.current = editDirty;
  }, [editDirty, editingMoment, moments]);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        setLoading(true);
        setLoadError("");
      }
    });

    getPetMoments(pet.id)
      .then((response) => {
        if (active) {
          setMoments(response.data);
        }
      })
      .catch((caught) => {
        if (active) {
          setLoadError(getFriendlyMomentErrorMessage(caught));
          setMoments([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [pet.id]);

  useEffect(() => {
    const editId = new URL(window.location.href).searchParams.get("edit");
    if (!editId || editingMoment?.id === editId) {
      return;
    }

    const target = moments.find((moment) => moment.id === editId);
    if (!target) {
      return;
    }

    queueMicrotask(() => {
      setEditingMoment(target);
      setEditDirty(false);
      setActionError("");
      setFormError("");
      setSuccess("");
    });
  }, [editingMoment?.id, moments]);

  function openEditForm(moment: PetMoment, updateRoute = true) {
    setEditingMoment(moment);
    setEditDirty(false);
    setActionError("");
    setFormError("");
    setSuccess("");
    if (updateRoute) updateEditQuery(moment.id, "push");
  }

  async function handleEditSubmit(payload: PetMomentPayload) {
    if (!editingMoment) {
      return;
    }

    setIsSubmitting(true);
    setSuccess("");
    setActionError("");
    setFormError("");

    try {
      const response = await updatePetMoment(editingMoment.id, payload, pet.id);

      const savedMoment = response.data;

      if (savedMoment) {
        setMoments((current) =>
          current.map((moment) =>
            moment.id === editingMoment.id ? savedMoment : moment
          )
        );
        setSuccess("Moment updated.");
      }

      updateEditQuery(undefined, "replace");
      setEditDirty(false);
      setEditingMoment(null);
    } catch (caught) {
      setFormError(getFriendlyMomentErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  const closeEditForm = useCallback(() => {
    updateEditQuery(undefined, "replace");
    setEditingMoment(null);
    setEditDirty(false);
    setFormError("");
  }, []);

  const requestEditClose = useCallback(() => {
    if (editDirty) {
      setConfirmDiscard(true);
      return;
    }
    closeEditForm();
  }, [closeEditForm, editDirty]);

  useEffect(() => {
    function handlePopState() {
      const editId = new URL(window.location.href).searchParams.get("edit");
      const current = editingMomentRef.current;

      if (!editId && current) {
        if (editDirtyRef.current) {
          updateEditQuery(current.id, "push");
          setConfirmDiscard(true);
        } else {
          setEditingMoment(null);
        }
        return;
      }

      if (editId && current?.id !== editId) {
        const target = momentsRef.current.find((moment) => moment.id === editId);
        if (target) {
          setEditingMoment(target);
          setEditDirty(false);
          setActionError("");
          setFormError("");
          setSuccess("");
        }
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    try {
      const response = await deletePetMoment(deleteTarget.id);

      if (response.data.deleted) {
        setMoments((current) =>
          current.filter((item) => item.id !== deleteTarget.id)
        );
        setActionError("");
        setSuccess("Moment deleted.");
      }
    } catch (caught) {
      setSuccess("");
      setActionError(getFriendlyMomentErrorMessage(caught));
    } finally {
      setDeleteTarget(null);
    }
  }

  useOwnerHeaderPageContext({
    section: "moments",
    petId: pet.id,
    status: loading ? "loading" : loadError ? "error" : "ready",
    itemCount: moments.length,
    canCreate: canCreateMemory,
  });

  return (
    <>
      <section className="grid gap-4 md:grid-cols-4">
        <div className="brand-card rounded-[1.5rem] p-5">
          <p className="text-sm font-bold text-pet-muted">Recent moments</p>
          <p className="mt-2 text-3xl font-black text-pet-ink">
            {moments.length}
          </p>
        </div>
        <div className="brand-card rounded-[1.5rem] p-5">
          <p className="text-sm font-bold text-pet-muted">
            Public memories
          </p>
          <p className="mt-2 text-3xl font-black text-pet-ink">
            {counts.publicProfile}
          </p>
        </div>
        <div className="brand-card rounded-[1.5rem] p-5">
          <p className="text-sm font-bold text-pet-muted">Life Timeline</p>
          <p className="mt-2 text-3xl font-black text-pet-ink">
            {counts.timeline}
          </p>
        </div>
        <div className="brand-card rounded-[1.5rem] p-5">
          <p className="text-sm font-bold text-pet-muted">Private memories</p>
          <p className="mt-2 text-3xl font-black text-pet-ink">
            {counts.private + counts.family}
          </p>
        </div>
      </section>

      <section className="brand-card mt-6 rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-pet-ink">
              Moments and Life Timeline
            </h2>
            <p className="mt-1 text-sm leading-6 text-pet-muted">
              Pet Memories are the public gallery. Life Timeline is built from
              public moments you mark as milestones.
            </p>
            {archivedPet ? (
              <p className="mt-3 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
                Archived pet profiles keep existing memories safe, but new
                memories can be added after the profile is restored.
              </p>
            ) : !memoryLimit.canCreate ? (
              <p className="mt-3 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
                {memoryLimit.message}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <CTAButton
              href={ownerRoutes.petTimeline(pet.id)}
              icon="heart"
              variant="secondary"
            >
              View Life Timeline
            </CTAButton>
          </div>
        </div>
      </section>

      {success ? (
        <div
          className="mt-6 rounded-[1.25rem] border border-pet-mint bg-[#e8f8f0] p-4 text-sm font-bold text-pet-sage"
          role="status"
        >
          {success}
        </div>
      ) : null}

      {actionError ? (
        <div
          className="mt-6 rounded-[1.25rem] border border-[#f3b4a8] bg-[#fff1ee] p-4 text-sm font-bold text-[#a63c2e]"
          role="alert"
        >
          {actionError}
        </div>
      ) : null}

      <section className="mt-6">
        {loading ? (
          <div className="brand-card rounded-[1.75rem] p-6">
            <p className="text-sm font-semibold text-pet-muted">
              Loading pet memories...
            </p>
          </div>
        ) : loadError ? (
          <section className="brand-card rounded-[1.75rem] p-6">
            <p className="text-sm font-bold uppercase text-pet-teal">
              Could not load memories
            </p>
            <h2 className="mt-2 text-2xl font-black text-pet-ink">
              {pet.name}&apos;s memories are temporarily unavailable.
            </h2>
            <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-pet-muted">
              {loadError}
            </p>
            <CTAButton
              className="mt-5"
              onClick={() => window.location.reload()}
              variant="secondary"
            >
              Try Again
            </CTAButton>
          </section>
        ) : moments.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {moments.map((moment) => (
              <PetMomentCard
                key={moment.id}
                moment={moment}
                onDelete={() => setDeleteTarget(moment)}
                onEdit={() => openEditForm(moment)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="heart"
            title="No pet moments yet"
            description="Add your pet's first little moment and keep it safe in their profile."
            actionHref={
              canCreateMemory ? ownerRoutes.petMomentNew(pet.id) : undefined
            }
            actionLabel="Add Moment"
          />
        )}
      </section>

      {editingMoment ? (
        <MomentEditorDialog
          error={formError}
          initialMoment={editingMoment}
          key={editingMoment.id}
          mode="edit"
          onDirtyChange={setEditDirty}
          onRequestClose={requestEditClose}
          onSubmit={handleEditSubmit}
          petName={pet.name}
          submitting={isSubmitting}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel="Discard changes"
        message="Your unsaved moment changes and media selections will be lost."
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          closeEditForm();
        }}
        open={confirmDiscard}
        title="Discard your changes?"
      />

      <ConfirmDialog
        confirmLabel="Delete memory"
        destructive
        message={
          deleteTarget
            ? `Delete this memory from ${pet.name}'s profile? This action cannot be undone.`
            : ""
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        open={Boolean(deleteTarget)}
        title="Delete memory?"
      />
    </>
  );
}
