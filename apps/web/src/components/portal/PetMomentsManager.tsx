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
import { AnalyticsEvent, trackEvent } from "@/lib/analytics";
import { getMemoryLimitState } from "@/lib/planLimits";
import { isArchivedPet } from "@/lib/petLifecycle";
import { normalizeMomentVisibility } from "@/lib/momentVisibility";
import { ownerRoutes } from "@/lib/routes";
import { isApiConfigured } from "@/services/apiConfig";
import {
  createPetMoment,
  deletePetMoment,
  getFriendlyMomentErrorMessage,
  getPetMoments,
  updatePetMoment,
} from "@/services/momentService";
import type {
  PetListItem,
  PetMoment,
  PetMomentPayload,
} from "@/types";

type PetMomentsManagerProps = {
  pet: PetListItem;
  initialMoments: PetMoment[];
};

type MomentEditorState =
  | { key: "new"; mode: "create" }
  | { key: string; mode: "edit"; moment: PetMoment };

const momentEditorHistoryKey = "myPetLinkMomentEditor";

function getRequestedEditorKey(petId: string) {
  const url = new URL(window.location.href);
  const edit = url.searchParams.get("edit")?.trim();

  if (edit) {
    return edit;
  }

  return url.pathname === ownerRoutes.petMomentNew(petId) ? "new" : null;
}

function getEditorUrl(editorKey?: string) {
  const url = new URL(window.location.href);
  if (editorKey) {
    url.searchParams.set("edit", editorKey);
  } else {
    url.searchParams.delete("edit");
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function getCanonicalEditorUrl(petId: string, editorKey: string) {
  return ownerRoutes.petMoments(petId, { edit: editorKey });
}

function historyStateWithoutEditor() {
  const state = window.history.state;
  if (!state || typeof state !== "object") {
    return {};
  }

  const parentState = { ...state };
  delete parentState[momentEditorHistoryKey];
  return parentState;
}

function updateEditorHistory(
  editorKey?: string,
  mode: "push" | "replace" = "replace",
  nextUrl = getEditorUrl(editorKey)
) {
  const state = {
    ...(editorKey ? window.history.state : historyStateWithoutEditor()),
    ...(editorKey ? { [momentEditorHistoryKey]: editorKey } : {}),
  };
  if (mode === "push") {
    window.history.pushState(state, "", nextUrl);
  } else {
    window.history.replaceState(state, "", nextUrl);
  }
}

function ensureEditorHistoryEntry(petId: string, editorKey: string) {
  if (window.history.state?.[momentEditorHistoryKey] === editorKey) {
    return;
  }

  const compatibilityRoute =
    window.location.pathname === ownerRoutes.petMomentNew(petId);
  const parentUrl = compatibilityRoute
    ? ownerRoutes.petMoments(petId)
    : getEditorUrl(undefined);
  const editorUrl = compatibilityRoute
    ? getCanonicalEditorUrl(petId, editorKey)
    : getEditorUrl(editorKey);

  updateEditorHistory(undefined, "replace", parentUrl);
  updateEditorHistory(editorKey, "push", editorUrl);
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
  const [editor, setEditor] = useState<MomentEditorState | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PetMoment | null>(null);
  const momentsRef = useRef(moments);
  const editorRef = useRef(editor);
  const editorDirtyRef = useRef(editorDirty);
  const memoryLimit = getMemoryLimitState(moments.length);
  const canCreateMemory = memoryLimit.canCreate && !archivedPet;
  const counts = useMemo(
    () => ({
      shared: moments.filter(
        (moment) => normalizeMomentVisibility(moment.visibility) === "Public"
      ).length,
      onlyMe: moments.filter(
        (moment) => normalizeMomentVisibility(moment.visibility) === "Private"
      ).length,
      timeline: moments.filter((moment) => moment.showInLifeTimeline).length,
    }),
    [moments]
  );

  useEffect(() => {
    momentsRef.current = moments;
    editorRef.current = editor;
    editorDirtyRef.current = editorDirty;
  }, [editor, editorDirty, moments]);

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

  const clearEditor = useCallback(() => {
    setEditor(null);
    setEditorDirty(false);
    setFormError("");
  }, []);

  const showEditor = useCallback((nextEditor: MomentEditorState) => {
    setEditor(nextEditor);
    setEditorDirty(false);
    setConfirmDiscard(false);
    setActionError("");
    setFormError("");
    setSuccess("");
  }, []);

  const editorForKey = useCallback(
    (editorKey: string): MomentEditorState | null => {
      if (editorKey === "new") {
        return canCreateMemory ? { key: "new", mode: "create" } : null;
      }

      const moment = momentsRef.current.find((item) => item.id === editorKey);
      return moment ? { key: moment.id, mode: "edit", moment } : null;
    },
    [canCreateMemory]
  );

  const openCreateForm = useCallback(() => {
    if (!canCreateMemory) {
      return;
    }

    showEditor({ key: "new", mode: "create" });
    updateEditorHistory("new", "push");
  }, [canCreateMemory, showEditor]);

  const openEditForm = useCallback(
    (moment: PetMoment) => {
      showEditor({ key: moment.id, mode: "edit", moment });
      updateEditorHistory(moment.id, "push");
    },
    [showEditor]
  );

  const closeEditor = useCallback(() => {
    if (window.history.state?.[momentEditorHistoryKey]) {
      window.history.back();
      return;
    }

    const compatibilityRoute =
      window.location.pathname === ownerRoutes.petMomentNew(pet.id);
    updateEditorHistory(
      undefined,
      "replace",
      compatibilityRoute
        ? ownerRoutes.petMoments(pet.id)
        : getEditorUrl(undefined)
    );
    clearEditor();
  }, [clearEditor, pet.id]);

  const requestEditorClose = useCallback(() => {
    if (editorDirty) {
      setConfirmDiscard(true);
      return;
    }
    closeEditor();
  }, [closeEditor, editorDirty]);

  async function handleEditorSubmit(payload: PetMomentPayload) {
    const currentEditor = editorRef.current;
    if (!currentEditor) {
      return;
    }

    setIsSubmitting(true);
    setSuccess("");
    setActionError("");
    setFormError("");

    try {
      if (currentEditor.mode === "create") {
        const response = await createPetMoment(pet.id, payload);
        setMoments((current) => [
          response.data,
          ...current.filter((moment) => moment.id !== response.data.id),
        ]);
        setSuccess("Moment added.");
        trackEvent(AnalyticsEvent.MomentCreated, { source: "owner_portal" });
      } else {
        const response = await updatePetMoment(
          currentEditor.moment.id,
          payload,
          pet.id
        );
        const savedMoment = response.data;

        if (savedMoment) {
          setMoments((current) =>
            current.map((moment) =>
              moment.id === currentEditor.moment.id ? savedMoment : moment
            )
          );
          setSuccess("Moment updated.");
        }
      }

      editorDirtyRef.current = false;
      setEditorDirty(false);
      closeEditor();
    } catch (caught) {
      setFormError(getFriendlyMomentErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (loading) {
      return;
    }

    const editorKey = getRequestedEditorKey(pet.id);
    if (!editorKey || editorRef.current?.key === editorKey) {
      return;
    }

    const requestedEditor = editorForKey(editorKey);
    if (!requestedEditor) {
      if (
        editorKey === "new" &&
        window.location.pathname === ownerRoutes.petMomentNew(pet.id)
      ) {
        updateEditorHistory(
          undefined,
          "replace",
          ownerRoutes.petMoments(pet.id)
        );
      }
      return;
    }

    ensureEditorHistoryEntry(pet.id, editorKey);
    queueMicrotask(() => showEditor(requestedEditor));
  }, [editorForKey, loading, moments, pet.id, showEditor]);

  useEffect(() => {
    function handlePopState() {
      const requestedKey = getRequestedEditorKey(pet.id);
      const currentEditor = editorRef.current;

      if (!requestedKey && currentEditor) {
        if (editorDirtyRef.current) {
          updateEditorHistory(currentEditor.key, "push");
          setConfirmDiscard(true);
        } else {
          clearEditor();
        }
        return;
      }

      if (requestedKey && currentEditor?.key !== requestedKey) {
        if (currentEditor && editorDirtyRef.current) {
          updateEditorHistory(currentEditor.key, "push");
          setConfirmDiscard(true);
          return;
        }

        const requestedEditor = editorForKey(requestedKey);
        if (requestedEditor) {
          showEditor(requestedEditor);
        }
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [clearEditor, editorForKey, pet.id, showEditor]);

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
    canCreate: canCreateMemory,
    onCreate: canCreateMemory ? openCreateForm : undefined,
  });

  return (
    <>
      <section
        className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4"
        data-moment-stats
      >
        <div
          className="brand-card rounded-[1.25rem] p-4 md:rounded-[1.5rem] md:p-5"
          data-moment-stat
        >
          <p className="text-xs font-bold text-pet-muted sm:text-sm">
            Total moments
          </p>
          <p className="mt-1 text-2xl font-black text-pet-ink md:mt-2 md:text-3xl">
            {moments.length}
          </p>
        </div>
        <div
          className="brand-card rounded-[1.25rem] p-4 md:rounded-[1.5rem] md:p-5"
          data-moment-stat
        >
          <p className="text-xs font-bold text-pet-muted sm:text-sm">
            Shared moments
          </p>
          <p className="mt-1 text-2xl font-black text-pet-ink md:mt-2 md:text-3xl">
            {counts.shared}
          </p>
        </div>
        <div
          className="brand-card rounded-[1.25rem] p-4 md:rounded-[1.5rem] md:p-5"
          data-moment-stat
        >
          <p className="text-xs font-bold text-pet-muted sm:text-sm">
            Life Timeline
          </p>
          <p className="mt-1 text-2xl font-black text-pet-ink md:mt-2 md:text-3xl">
            {counts.timeline}
          </p>
        </div>
        <div
          className="brand-card rounded-[1.25rem] p-4 md:rounded-[1.5rem] md:p-5"
          data-moment-stat
        >
          <p className="text-xs font-bold text-pet-muted sm:text-sm">Only me</p>
          <p className="mt-1 text-2xl font-black text-pet-ink md:mt-2 md:text-3xl">
            {counts.onlyMe}
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
              Keep every Moment in one chronological gallery. Audience and Life
              Timeline placement stay separate.
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
            actionOnClick={canCreateMemory ? openCreateForm : undefined}
            actionLabel="Add Moment"
          />
        )}
      </section>

      {editor ? (
        <MomentEditorDialog
          error={formError}
          initialMoment={editor.mode === "edit" ? editor.moment : undefined}
          key={editor.key}
          mode={editor.mode}
          onDirtyChange={setEditorDirty}
          onRequestClose={requestEditorClose}
          onSubmit={handleEditorSubmit}
          petName={pet.name}
          submitting={isSubmitting}
        />
      ) : null}

      <ConfirmDialog
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        message="Your unsaved moment changes and media selections will be lost."
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          editorDirtyRef.current = false;
          setEditorDirty(false);
          // Let the nested dialog release its inert parent before focus returns
          // from the editor to the Moment card action that opened it.
          window.setTimeout(closeEditor, 0);
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
