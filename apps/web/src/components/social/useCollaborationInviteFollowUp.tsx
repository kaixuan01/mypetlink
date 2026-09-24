"use client";

import { useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  sendCollaborationInvites,
  type CollaborationInvite,
} from "@/services/momentCollaborationService";

type Failure = { invite: CollaborationInvite; message: string };

/**
 * Sends the invitations queued while a Moment was being written, once it
 * exists. The Moment is already saved and stays saved: a failed invitation is
 * offered again here, never a reason to undo it.
 */
export function useCollaborationInviteFollowUp() {
  const [pending, setPending] = useState<{ momentId: string; failed: Failure[] } | null>(null);
  const [retrying, setRetrying] = useState(false);

  /** Resolves true when every invitation went out. */
  const sendAfterCreate = useCallback(
    async (momentId: string, invites: CollaborationInvite[]) => {
      if (invites.length === 0) return true;
      const { failed } = await sendCollaborationInvites(momentId, invites);
      if (failed.length === 0) return true;
      setPending({ momentId, failed });
      return false;
    },
    []
  );

  const retry = useCallback(async () => {
    if (!pending) return;
    setRetrying(true);
    try {
      const { failed } = await sendCollaborationInvites(
        pending.momentId,
        pending.failed.map((item) => item.invite)
      );
      setPending(failed.length > 0 ? { momentId: pending.momentId, failed } : null);
    } finally {
      setRetrying(false);
    }
  }, [pending]);

  const households = pending?.failed.map((item) => item.invite.household.displayName) ?? [];
  const reason = pending?.failed[0]?.message ?? "";

  const dialog = (
    <ConfirmDialog
      cancelLabel="Done"
      confirmDisabled={retrying}
      confirmLabel={retrying ? "Sending…" : "Try again"}
      message={`Your Moment is saved. We couldn't send the invitation${
        households.length === 1 ? "" : "s"
      } to ${households.join(", ")}. ${reason} You can also invite them later from this Moment's editor.`}
      onCancel={() => setPending(null)}
      onConfirm={() => void retry()}
      open={Boolean(pending)}
      title="Some invitations weren't sent"
    />
  );

  return { sendAfterCreate, dialog, open: Boolean(pending) };
}
