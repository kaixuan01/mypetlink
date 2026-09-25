"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isApiClientError } from "@/services/apiClient";
import { blockOwner, type OwnerRelationship } from "@/services/socialGraphService";

export function HouseholdBlockDialog({
  open, handle, displayName, onClose, onBlocked, onAuthenticationRequired,
}: {
  open: boolean;
  handle: string;
  displayName: string;
  onClose: () => void;
  onBlocked: (relationship: OwnerRelationship) => void;
  onAuthenticationRequired?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      onBlocked(await blockOwner(handle));
      onClose();
    } catch (caught) {
      if (isApiClientError(caught) && caught.status === 401 && onAuthenticationRequired) {
        onClose();
        onAuthenticationRequired();
      } else {
        setError(isApiClientError(caught) ? caught.message : "We couldn't update this. Please try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <ConfirmDialog
      cancelLabel="Keep as is"
      confirmDisabled={pending}
      confirmLabel={pending ? "Blocking…" : "Block"}
      destructive
      message={`${displayName} won't be able to see your profile or your Moments, and you won't see theirs. If either of you follows the other, that stops now.`}
      onCancel={() => { if (!pending) { setError(null); onClose(); } }}
      onConfirm={() => void confirm()}
      open={open}
      title={`Block ${displayName}?`}
    >
      <p className="rounded-2xl bg-pet-cream p-3 text-sm font-semibold leading-6 text-pet-ink">
        This only affects sharing. Your pets&rsquo; Safety Profiles keep working exactly as they are, so anyone who finds a lost pet can still reach you.
      </p>
      {error ? <p className="mt-3 text-sm font-bold text-[#a63c2e]" data-testid="owner-profile-menu-error" role="status">{error}</p> : null}
    </ConfirmDialog>
  );
}
