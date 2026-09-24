"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { CollaboratorPicker } from "@/components/social/CollaboratorPicker";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatMomentSubjects } from "@/lib/momentSubjects";
import {
  collaborationErrorMessage,
  getMomentCollaborations,
  inviteCollaborator,
  MAX_COLLABORATOR_HOUSEHOLDS,
  revokeCollaboration,
  type CollaborationInvite,
  type MomentCollaboration,
  type MomentCollaborationList,
} from "@/services/momentCollaborationService";

const statusLabel: Record<MomentCollaboration["status"], string> = {
  Pending: "Invitation sent",
  Accepted: "Joined",
  Declined: "Declined",
  Revoked: "Removed",
  Left: "Left",
  Expired: "Expired",
};

const limitCopy = `Maximum ${MAX_COLLABORATOR_HOUSEHOLDS} collaborator households for this Moment.`;
const publicOnlyCopy =
  "Collaborators can join public Moments. Choose Public to invite another household.";

/**
 * "Collaborators" in the Moment editor — separate from "Who's in this Moment?",
 * which stays the author's own pets.
 *
 * Creating: invitations are only queued here and sent after the Moment is
 * saved (the Moment must exist first, and a failed invitation never undoes
 * it). Editing: invitations, cancellations and removals apply straight away
 * and never touch the rest of the form.
 */
export function MomentCollaboratorsField(
  props:
    | {
        mode: "create";
        isPublic: boolean;
        invites: CollaborationInvite[];
        onInvitesChange: (invites: CollaborationInvite[]) => void;
        disabled?: boolean;
      }
    | {
        mode: "edit";
        isPublic: boolean;
        momentId: string;
      }
) {
  return (
    <section
      aria-labelledby="moment-collaborators-heading"
      className="grid gap-3 rounded-[1.25rem] border border-pet-border bg-pet-cream/60 p-4"
      data-testid="moment-collaborators-field"
    >
      <div>
        <h3 className="text-sm font-black text-pet-ink" id="moment-collaborators-heading">
          Collaborators
        </h3>
        <p className="mt-1 text-xs font-semibold leading-5 text-pet-muted">
          Invite another household to add their pets. They choose which pets join,
          and nothing appears until they accept. The Moment stays yours.
        </p>
      </div>
      {props.mode === "create" ? <QueuedInvites {...props} /> : <ManagedCollaborators {...props} />}
    </section>
  );
}

function QueuedInvites({
  isPublic,
  invites,
  onInvitesChange,
  disabled = false,
}: {
  isPublic: boolean;
  invites: CollaborationInvite[];
  onInvitesChange: (invites: CollaborationInvite[]) => void;
  disabled?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const addRef = useRef<HTMLButtonElement | null>(null);
  const full = invites.length >= MAX_COLLABORATOR_HOUSEHOLDS;

  return (
    <>
      {invites.length > 0 ? (
        <ul className="grid gap-2" aria-label="Invitations to send">
          {invites.map((invite) => (
            <li
              className="flex min-w-0 items-center gap-3 rounded-2xl border border-pet-border bg-white px-3 py-2"
              key={invite.household.handle}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-pet-ink">
                  {invite.household.displayName}
                </span>
                <span className="block truncate text-xs font-bold text-pet-muted">
                  {formatMomentSubjects(invite.pets.map((pet) => pet.name))} · sent when you save
                </span>
              </span>
              <button
                aria-label={`Don't invite ${invite.household.displayName}`}
                className="min-h-11 shrink-0 rounded-full px-3 text-sm font-black text-pet-coral"
                disabled={disabled}
                onClick={() => {
                  onInvitesChange(invites.filter((item) => item.household.handle !== invite.household.handle));
                  window.requestAnimationFrame(() => addRef.current?.focus());
                }}
                type="button"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!isPublic ? (
        <p className="text-sm font-semibold text-pet-muted">{publicOnlyCopy}</p>
      ) : picking ? (
        <CollaboratorPicker
          confirmLabel="Add invitation"
          excludeHandles={invites.map((invite) => invite.household.handle)}
          onCancel={() => {
            setPicking(false);
            window.requestAnimationFrame(() => addRef.current?.focus());
          }}
          onConfirm={(invite) => {
            onInvitesChange([...invites, invite]);
            setPicking(false);
            window.requestAnimationFrame(() => addRef.current?.focus());
          }}
        />
      ) : (
        <InviteButton
          buttonRef={addRef}
          disabled={disabled || full}
          note={full ? limitCopy : null}
          onClick={() => setPicking(true)}
        />
      )}
    </>
  );
}

function ManagedCollaborators({ momentId, isPublic }: { momentId: string; isPublic: boolean }) {
  const [list, setList] = useState<MomentCollaborationList | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<MomentCollaboration | null>(null);
  const [ending, setEnding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const addRef = useRef<HTMLButtonElement | null>(null);
  const actionRefs = useRef(new Map<string, HTMLButtonElement>());

  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    getMomentCollaborations(momentId)
      .then((next) => {
        if (!active) return;
        setList(next);
        setLoadFailed(false);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [momentId, reloadToken]);

  const reload = useCallback(() => {
    setLoadFailed(false);
    setList(null);
    setReloadToken((token) => token + 1);
  }, []);

  if (loadFailed) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-bold text-pet-ink">We couldn&rsquo;t load collaborators.</p>
        <button
          className="min-h-11 rounded-full border border-pet-teal px-4 text-sm font-black text-pet-teal"
          onClick={reload}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!list) {
    return (
      <p aria-busy="true" className="text-xs font-semibold text-pet-muted">
        Loading collaborators…
      </p>
    );
  }

  const joined = list.items.filter((item) => item.status === "Accepted");
  const invited = list.items.filter((item) => item.status === "Pending");
  const earlier = list.items.filter((item) => item.status !== "Accepted" && item.status !== "Pending");
  const note =
    list.inviteUnavailableReason === "limit-reached"
      ? limitCopy
      : list.inviteUnavailableReason === "moment-not-public" || !isPublic
        ? publicOnlyCopy
        : null;

  async function sendInvite(invite: CollaborationInvite) {
    setSending(true);
    setInviteError(null);
    try {
      setList(
        await inviteCollaborator(
          momentId,
          invite.household.handle,
          invite.pets.map((pet) => pet.publicSlug)
        )
      );
      setPicking(false);
      setAnnouncement(`Invitation sent to ${invite.household.displayName}.`);
      window.requestAnimationFrame(() => addRef.current?.focus());
    } catch (error) {
      setInviteError(collaborationErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  async function endCollaboration() {
    if (!confirming) return;
    const target = confirming;
    setEnding(true);
    setActionError(null);
    try {
      setList(await revokeCollaboration(momentId, target.id));
      setAnnouncement(
        target.status === "Pending"
          ? `Invitation to ${target.household.displayName} cancelled.`
          : `${target.household.displayName} removed from this Moment.`
      );
      setConfirming(null);
      window.requestAnimationFrame(() => addRef.current?.focus());
    } catch (error) {
      setActionError(collaborationErrorMessage(error));
      setConfirming(null);
      window.requestAnimationFrame(() => actionRefs.current.get(target.id)?.focus());
    } finally {
      setEnding(false);
    }
  }

  const row = (item: MomentCollaboration, action: "remove" | "cancel" | null) => {
    const pets = item.status === "Accepted"
      ? item.pets.filter((pet) => pet.isAccepted)
      : item.pets;
    return (
      <li
        className={`flex min-w-0 items-center gap-3 rounded-2xl border border-pet-border px-3 py-2 ${
          action ? "bg-white" : "bg-white/60"
        }`}
        data-status={item.status}
        key={item.id}
      >
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-black ${action ? "text-pet-ink" : "text-pet-muted"}`}>
            {item.household.displayName}
          </span>
          <span className="block truncate text-xs font-bold text-pet-muted">
            {formatMomentSubjects(pets.map((pet) => pet.name))}
          </span>
          <span className="block text-xs font-bold text-pet-muted">
            {statusLabel[item.status]}
            {item.status === "Pending"
              ? ` · expires ${new Date(item.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
              : ""}
          </span>
        </span>
        {action ? (
          <button
            className="min-h-11 shrink-0 rounded-full px-3 text-sm font-black text-pet-coral"
            onClick={() => setConfirming(item)}
            ref={(element) => {
              if (element) actionRefs.current.set(item.id, element);
              else actionRefs.current.delete(item.id);
            }}
            type="button"
          >
            {action === "remove" ? "Remove" : "Cancel invite"}
          </button>
        ) : null}
      </li>
    );
  };

  return (
    <>
      {joined.length > 0 ? (
        <div>
          <h4 className="text-xs font-black uppercase tracking-wide text-pet-muted">Joined</h4>
          <ul className="mt-1 grid gap-2">{joined.map((item) => row(item, "remove"))}</ul>
        </div>
      ) : null}
      {invited.length > 0 ? (
        <div>
          <h4 className="text-xs font-black uppercase tracking-wide text-pet-muted">Invited</h4>
          <ul className="mt-1 grid gap-2">{invited.map((item) => row(item, "cancel"))}</ul>
        </div>
      ) : null}
      {earlier.length > 0 ? (
        <div>
          <h4 className="text-xs font-black uppercase tracking-wide text-pet-muted">Earlier</h4>
          <ul className="mt-1 grid gap-2">{earlier.map((item) => row(item, null))}</ul>
        </div>
      ) : null}
      {list.items.length === 0 ? (
        <p className="text-xs font-semibold text-pet-muted">No collaborators yet.</p>
      ) : null}
      {actionError ? (
        <p className="text-sm font-bold text-pet-coral" role="alert">
          {actionError}
        </p>
      ) : null}

      {picking ? (
        <CollaboratorPicker
          busy={sending}
          confirmLabel="Send invitation"
          error={inviteError}
          momentId={momentId}
          onCancel={() => {
            setPicking(false);
            setInviteError(null);
            window.requestAnimationFrame(() => addRef.current?.focus());
          }}
          onConfirm={(invite) => void sendInvite(invite)}
        />
      ) : (
        <InviteButton
          buttonRef={addRef}
          disabled={!list.canInvite || !isPublic}
          note={note}
          onClick={() => setPicking(true)}
        />
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ConfirmDialog
        confirmDisabled={ending}
        confirmLabel={
          ending
            ? "Updating…"
            : confirming?.status === "Pending"
              ? "Cancel invite"
              : "Remove"
        }
        destructive
        message={
          confirming?.status === "Pending"
            ? "They won't be able to accept it. You can invite them again later."
            : "Their pets will no longer appear on this Moment. You can invite them again later."
        }
        onCancel={() => {
          const id = confirming?.id;
          setConfirming(null);
          window.requestAnimationFrame(() => {
            if (id) actionRefs.current.get(id)?.focus();
          });
        }}
        onConfirm={() => void endCollaboration()}
        open={Boolean(confirming)}
        title={
          confirming?.status === "Pending"
            ? `Cancel the invitation to ${confirming.household.displayName}?`
            : `Remove ${confirming?.household.displayName ?? "this household"} from this Moment?`
        }
      />
    </>
  );
}

function InviteButton({
  buttonRef,
  disabled,
  note,
  onClick,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  disabled: boolean;
  note: string | null;
  onClick: () => void;
}) {
  return (
    <div className="grid gap-1">
      <div>
        <button
          aria-describedby={note ? "moment-collaborators-note" : undefined}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-pet-teal px-4 text-sm font-black text-pet-teal disabled:cursor-not-allowed disabled:border-pet-border disabled:text-pet-muted"
          data-testid="invite-household"
          disabled={disabled}
          onClick={onClick}
          ref={buttonRef}
          type="button"
        >
          + Invite a household
        </button>
      </div>
      {note ? (
        <p className="text-xs font-semibold text-pet-muted" id="moment-collaborators-note">
          {note}
        </p>
      ) : null}
    </div>
  );
}
