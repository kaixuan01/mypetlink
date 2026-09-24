"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatMomentSubjects } from "@/lib/momentSubjects";
import {
  acceptCollaboration,
  collaborationErrorMessage,
  declineCollaboration,
  getMomentCollaborations,
  leaveCollaboration,
  type MomentCollaboration,
  type MomentCollaborationList,
} from "@/services/momentCollaborationService";

/**
 * The invited household's view of a collaboration, on the Moment's own page.
 *
 * Shown only to that household: an invitation to answer (choosing which of the
 * requested pets take part), or, once joined, the way to leave. Everybody else
 * — including the author, who manages collaborators from the Moment editor —
 * sees nothing here. Activity links to this page rather than answering
 * inline, because choosing pets needs the room.
 */
export function MomentCollaborationPanel({
  momentId,
  signedIn,
  onChanged,
}: {
  momentId: string;
  signedIn: boolean | null;
  /** Called after joining or leaving, so the Moment's attribution refreshes. */
  onChanged: () => void;
}) {
  const [list, setList] = useState<MomentCollaborationList | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    getMomentCollaborations(momentId)
      .then((next) => {
        if (active) setList(next);
      })
      .catch(() => {
        // Nothing to show: this viewer has no collaboration here, or it could
        // not be read. Either way the Moment itself is unaffected.
        if (active) setList(null);
      });
    return () => {
      active = false;
    };
  }, [momentId, signedIn]);

  const own = signedIn && list?.viewerRole === "invitee" ? list.items[0] ?? null : null;

  return (
    <>
      {own ? (
        own.status === "Pending" ? (
          <Invitation
            authorName={list?.author?.displayName ?? "A household"}
            collaboration={own}
            onAnswered={(next, message) => {
              setList(next);
              setAnnouncement(message);
              onChanged();
            }}
          />
        ) : own.status === "Accepted" ? (
          <Joined
            collaboration={own}
            onLeft={(next) => {
              setList(next);
              setAnnouncement("You left this Moment. Your pets no longer appear on it.");
              onChanged();
            }}
          />
        ) : null
      ) : null}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

function Invitation({
  authorName,
  collaboration,
  onAnswered,
}: {
  authorName: string;
  collaboration: MomentCollaboration;
  onAnswered: (list: MomentCollaborationList, message: string) => void;
}) {
  const headingId = useId();
  const errorId = useId();
  const declineRef = useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = useState(() => collaboration.pets.map((pet) => pet.publicSlug));
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDecline, setConfirmingDecline] = useState(false);

  async function accept() {
    setBusy("accept");
    setError(null);
    try {
      onAnswered(await acceptCollaboration(collaboration.id, selected), "You joined this Moment.");
    } catch (caught) {
      setError(collaborationErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    setError(null);
    try {
      const next = await declineCollaboration(collaboration.id);
      setConfirmingDecline(false);
      onAnswered(next, "Invitation declined.");
    } catch (caught) {
      setConfirmingDecline(false);
      setError(collaborationErrorMessage(caught));
      window.requestAnimationFrame(() => declineRef.current?.focus());
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="brand-card mt-4 rounded-[1.5rem] border border-pet-teal p-4 sm:p-5"
      data-testid="collaboration-invitation"
    >
      <h2 className="text-lg font-black text-pet-ink" id={headingId}>
        Collaboration invitation
      </h2>
      <p className="mt-1 text-sm font-semibold leading-6 text-pet-muted">
        {authorName} invited your household to join this Moment. Choose which of your pets
        take part. The Moment stays theirs; you can leave at any time.
      </p>
      <fieldset
        aria-describedby={error ? errorId : undefined}
        className="mt-3 grid gap-2"
        disabled={busy !== null}
      >
        <legend className="text-sm font-black text-pet-ink">Requested pets</legend>
        {collaboration.pets.map((pet) => {
          const checked = selected.includes(pet.publicSlug);
          return (
            <label
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-pet-border px-3 text-sm font-bold text-pet-ink has-[:checked]:border-pet-teal has-[:checked]:bg-[#e8f8f0]"
              key={pet.publicSlug}
            >
              <input
                checked={checked}
                className="h-4 w-4 shrink-0 accent-pet-teal"
                onChange={() =>
                  setSelected((current) =>
                    checked
                      ? current.filter((slug) => slug !== pet.publicSlug)
                      : [...current, pet.publicSlug]
                  )
                }
                type="checkbox"
              />
              {pet.name}
            </label>
          );
        })}
      </fieldset>
      {selected.length === 0 ? (
        <p className="mt-2 text-xs font-bold text-pet-muted">Choose at least one pet to join.</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm font-bold text-pet-coral" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="min-h-11 rounded-full bg-pet-teal px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy !== null || selected.length === 0}
          onClick={() => void accept()}
          type="button"
        >
          {busy === "accept" ? "Joining…" : "Accept selected"}
        </button>
        <button
          className="min-h-11 rounded-full border border-pet-border px-5 text-sm font-black text-pet-ink disabled:opacity-50"
          disabled={busy !== null}
          onClick={() => setConfirmingDecline(true)}
          ref={declineRef}
          type="button"
        >
          Decline
        </button>
      </div>
      <p className="mt-3 text-xs font-semibold text-pet-muted">
        This invitation expires on{" "}
        {new Date(collaboration.expiresAt).toLocaleDateString(undefined, {
          day: "numeric",
          month: "long",
        })}
        .
      </p>

      <ConfirmDialog
        cancelLabel="Keep invitation"
        confirmDisabled={busy !== null}
        confirmLabel={busy === "decline" ? "Declining…" : "Decline"}
        destructive
        message={`${authorName} will see that it was declined and can't invite your household to this Moment again.`}
        onCancel={() => {
          setConfirmingDecline(false);
          window.requestAnimationFrame(() => declineRef.current?.focus());
        }}
        onConfirm={() => void decline()}
        open={confirmingDecline}
        title="Decline this invitation?"
      />
    </section>
  );
}

function Joined({
  collaboration,
  onLeft,
}: {
  collaboration: MomentCollaboration;
  onLeft: (list: MomentCollaborationList) => void;
}) {
  const headingId = useId();
  const leaveRef = useRef<HTMLButtonElement | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pets = collaboration.pets.filter((pet) => pet.isAccepted).map((pet) => pet.name);

  async function leave() {
    setBusy(true);
    setError(null);
    try {
      const next = await leaveCollaboration(collaboration.id);
      setConfirming(false);
      onLeft(next);
    } catch (caught) {
      setConfirming(false);
      setError(collaborationErrorMessage(caught));
      window.requestAnimationFrame(() => leaveRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="brand-card mt-4 flex flex-wrap items-center gap-3 rounded-[1.5rem] p-4 sm:p-5"
      data-testid="collaboration-joined"
    >
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-black text-pet-ink" id={headingId}>
          Your household is in this Moment
        </h2>
        <p className="text-sm font-semibold text-pet-muted">
          {pets.length > 0 ? `With ${formatMomentSubjects(pets)}.` : null}
        </p>
        {error ? (
          <p className="mt-1 text-sm font-bold text-pet-coral" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <button
        className="min-h-11 rounded-full border border-pet-border px-4 text-sm font-black text-pet-coral"
        disabled={busy}
        onClick={() => setConfirming(true)}
        ref={leaveRef}
        type="button"
      >
        Leave collaboration
      </button>

      <ConfirmDialog
        confirmDisabled={busy}
        confirmLabel={busy ? "Leaving…" : "Leave"}
        destructive
        message="Your pets will no longer appear on this Moment, and your household can't rejoin it later."
        onCancel={() => {
          setConfirming(false);
          window.requestAnimationFrame(() => leaveRef.current?.focus());
        }}
        onConfirm={() => void leave()}
        open={confirming}
        title="Leave this Moment?"
      />
    </section>
  );
}
