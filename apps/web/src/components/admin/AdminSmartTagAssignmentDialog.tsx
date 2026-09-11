"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useModalDialogFocus } from "@/lib/useModalDialogFocus";
import { listAdminOwners, type AdminOwner } from "@/services/adminOwnerService";
import { listAdminPetProfiles, type AdminPetProfile } from "@/services/adminPetProfileService";
import type {
  AdminSmartTag,
  AdminSmartTagAssignmentAction,
  AdminSmartTagAssignmentInput,
} from "@/services/adminSmartTagService";

type Props = {
  action: AdminSmartTagAssignmentAction;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (input: AdminSmartTagAssignmentInput) => void;
  tag: AdminSmartTag;
};

type LoadState = "idle" | "loading" | "loaded" | "failed";

const actionCopy: Record<AdminSmartTagAssignmentAction, { title: string; submit: string }> = {
  claim: { title: "Assign owner and pet", submit: "Confirm assignment" },
  "assign-pet": { title: "Assign pet", submit: "Assign pet" },
  "change-pet": { title: "Change assigned pet", submit: "Change assigned pet" },
  "unassign-pet": { title: "Unassign pet", submit: "Unassign pet" },
  transfer: { title: "Transfer ownership", submit: "Transfer ownership" },
};

export function AdminSmartTagAssignmentDialog({ action, busy, error, onCancel, onSubmit, tag }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const needsOwner = action === "claim" || action === "transfer";
  const needsPet = action !== "unassign-pet";
  const [ownerSearch, setOwnerSearch] = useState("");
  const [owners, setOwners] = useState<AdminOwner[]>([]);
  const [ownerId, setOwnerId] = useState(needsOwner ? "" : tag.ownerId ?? "");
  const [pets, setPets] = useState<AdminPetProfile[]>([]);
  const [petId, setPetId] = useState("");
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  // A failed load and an empty result are different answers to the admin's
  // question, so they are different states rather than both being an empty
  // array. "idle" means there is nothing to load yet (no owner chosen).
  const [ownersState, setOwnersState] = useState<LoadState>("idle");
  const [petsState, setPetsState] = useState<LoadState>(
    needsPet && !needsOwner && Boolean(tag.ownerId) ? "loading" : "idle"
  );
  const [reloadKey, setReloadKey] = useState(0);
  const retry = () => {
    // Move straight back to "loading" so the retry is visible rather than the
    // failure text lingering until the request resolves.
    if (ownersState === "failed") setOwnersState("loading");
    if (petsState === "failed") setPetsState("loading");
    setReloadKey((key) => key + 1);
  };

  useModalDialogFocus({ dialogRef, initialFocusRef: cancelRef, onEscape: () => { if (!busy) onCancel(); } });

  useEffect(() => {
    if (!needsOwner) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setOwnersState("loading");
      listAdminOwners({ page: 1, pageSize: 20, search: ownerSearch || undefined, status: "Active", sortBy: "name", sortDir: "asc" }, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setOwners(result.items);
          setOwnersState("loaded");
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setOwners([]);
          setOwnersState("failed");
        });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [needsOwner, ownerSearch, reloadKey]);

  useEffect(() => {
    if (!needsPet || !ownerId) return;
    const controller = new AbortController();
    listAdminPetProfiles({ page: 1, pageSize: 100, ownerId, lifecycle: "Active", sortBy: "name", sortDir: "asc" }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setPets(action === "change-pet" ? result.items.filter((pet) => pet.id !== tag.petId) : result.items);
        setPetsState("loaded");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setPets([]);
        setPetsState("failed");
      });
    return () => controller.abort();
  }, [action, needsPet, ownerId, tag.petId, reloadKey]);

  const selectedOwner = owners.find((owner) => owner.ownerUserId === ownerId);
  const selectedPet = pets.find((pet) => pet.id === petId);
  const requiresReason = action === "transfer" || (action === "unassign-pet" && tag.status === "Active");
  // Each entry is a requirement the backend also enforces, phrased as the step
  // the admin still has to take. Transfer is the case that matters: it is the
  // only action where a reason is mandatory, and an admin arriving from Assign
  // (where it is optional) has no other way to tell.
  const missing = [
    needsOwner && !ownerId ? (action === "transfer" ? "select a new owner" : "select an owner") : null,
    needsPet && !petId ? "select a pet" : null,
    requiresReason && reason.trim().length === 0 ? "add a reason" : null,
    action === "transfer" && !acknowledged ? "confirm you understand the impact" : null,
  ].filter((item): item is string => item !== null);
  const valid = missing.length === 0;

  const ownerPlaceholder = ownersState === "loading"
    ? "Loading owners…"
    : ownersState === "failed" ? "Owners could not be loaded" : "Select an owner";
  const petPlaceholder = !ownerId
    ? "Select an owner first"
    : petsState === "loading" ? "Loading pets…"
      : petsState === "failed" ? "Pets could not be loaded"
        : pets.length === 0 ? "No active pets" : "Select a pet";

  const impact = useMemo(() => {
    if (action === "unassign-pet") return "The owner keeps this tag, but its Physical Tag Scan Page will not open the previous pet's Safety Profile until another pet is assigned.";
    if (action === "transfer") return "The previous owner loses control of this tag. The new owner must activate it before finder contact is shown again.";
    if (action === "claim") return "This administrative claim links the tag without activating it. The owner must still complete activation.";
    return "The physical tag code, QR, NFC destination, scan history, and fulfilment record stay unchanged.";
  }, [action]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }} role="presentation">
      <div aria-labelledby="smart-tag-assignment-title" aria-modal="true" className="max-h-[min(48rem,calc(100dvh-2rem))] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl" ref={dialogRef} role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Smart Tag assignment</p>
            <h2 className="mt-1 text-xl font-black text-slate-950" id="smart-tag-assignment-title">{actionCopy[action].title}</h2>
            <p className="mt-1 break-all font-mono text-xs font-bold text-slate-500">{tag.tagCode}</p>
          </div>
          <button aria-label="Close assignment dialog" className="min-h-11 rounded-full border border-slate-200 px-4 text-sm font-extrabold" disabled={busy} onClick={onCancel} ref={cancelRef} type="button">Close</button>
        </div>

        <dl className="mt-5 grid gap-2 rounded-2xl bg-slate-50 p-4 text-sm">
          <Summary label="Current owner" value={tag.ownerName ? `${tag.ownerName}${tag.ownerEmail ? ` · ${tag.ownerEmail}` : ""}` : "No owner"} />
          <Summary label="Current pet" value={tag.petName ?? "No pet assigned"} />
          <Summary label="Lifecycle" value={tag.status} />
        </dl>

        <div className="mt-5 grid gap-4">
          {needsOwner ? (
            <>
              <label className="grid gap-1.5 text-sm font-bold text-slate-800">Find owner
                <input className="min-h-11 rounded-xl border border-slate-300 px-3 font-medium outline-none focus:border-pet-teal" onChange={(event) => setOwnerSearch(event.target.value)} placeholder="Search name or email" value={ownerSearch} />
              </label>
              <label className="grid gap-1.5 text-sm font-bold text-slate-800">New owner
                <select aria-describedby={ownersState === "failed" ? "smart-tag-owners-error" : undefined} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 font-medium outline-none focus:border-pet-teal" disabled={ownersState === "loading"} onChange={(event) => { const nextOwnerId = event.target.value; setPetId(""); setPets([]); setPetsState(nextOwnerId ? "loading" : "idle"); setOwnerId(nextOwnerId); }} value={ownerId}>
                  <option value="">{ownerPlaceholder}</option>
                  {owners.filter((owner) => action !== "transfer" || owner.ownerUserId !== tag.ownerId).map((owner) => <option key={owner.ownerUserId} value={owner.ownerUserId}>{owner.displayName} · {owner.email}</option>)}
                </select>
              </label>
              {ownersState === "failed" ? (
                <LoadFailure id="smart-tag-owners-error" message="Failed to load owners." onRetry={retry} />
              ) : null}
            </>
          ) : null}

          {needsPet ? (
            <>
            <label className="grid gap-1.5 text-sm font-bold text-slate-800">{action === "transfer" ? "New owner's pet" : "Pet"}
              <select aria-describedby={petsState === "failed" ? "smart-tag-pets-error" : undefined} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 font-medium outline-none focus:border-pet-teal" disabled={!ownerId || petsState === "loading"} onChange={(event) => setPetId(event.target.value)} value={petId}>
                <option value="">{petPlaceholder}</option>
                {pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name} · {pet.species}{pet.breed ? ` · ${pet.breed}` : ""}</option>)}
              </select>
            </label>
            {petsState === "failed" ? (
              <LoadFailure id="smart-tag-pets-error" message="Failed to load pets for this owner." onRetry={retry} />
            ) : null}
            {petsState === "loaded" && pets.length === 0 ? (
              <p className="text-sm font-semibold text-slate-600">This owner has no active pets.</p>
            ) : null}
            </>
          ) : null}

          {(requiresReason || action === "claim" || action === "change-pet") ? (
            <label className="grid gap-1.5 text-sm font-bold text-slate-800">Reason {requiresReason ? "(required)" : "(optional)"}
              <textarea aria-required={requiresReason} className="min-h-24 rounded-xl border border-slate-300 px-3 py-2 font-medium outline-none focus:border-pet-teal" maxLength={600} onChange={(event) => setReason(event.target.value)} placeholder="Add support context for the audit history" required={requiresReason} value={reason} />
            </label>
          ) : null}

          {(selectedOwner || selectedPet) ? <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950"><p className="font-black">New assignment</p><p className="mt-1 font-semibold">{selectedOwner?.displayName ?? tag.ownerName} · {selectedPet?.name ?? "No pet"}</p></div> : null}
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">{impact}</p>

          {action === "transfer" ? <label className="flex items-start gap-3 text-sm font-semibold text-slate-800"><input className="mt-1 size-4" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} type="checkbox" />I understand this transfers control to a different owner and requires new-owner activation.</label> : null}
          {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700" role="alert">{error}</p> : null}
        </div>

        {!valid && !busy ? (
          <p className="mt-5 text-sm font-semibold text-slate-600" id="smart-tag-assignment-missing">
            Still needed: {missing.join(", ")}.
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="min-h-11 rounded-full border border-slate-200 px-5 text-sm font-extrabold" disabled={busy} onClick={onCancel} type="button">Cancel</button>
          <button className={`min-h-11 rounded-full px-5 text-sm font-extrabold text-white disabled:opacity-50 ${action === "transfer" || action === "unassign-pet" ? "bg-red-700" : "bg-slate-950"}`} aria-describedby={valid ? undefined : "smart-tag-assignment-missing"} disabled={!valid || busy} onClick={() => onSubmit({ ownerId: needsOwner ? ownerId : undefined, petId: needsPet ? petId : undefined, reason: reason.trim() || undefined })} type="button">{busy ? "Saving…" : actionCopy[action].submit}</button>
        </div>
      </div>
    </div>
  );
}

/** Load failures are stated and recoverable, never shown as an empty list. */
function LoadFailure({ id, message, onRetry }: { id: string; message: string; onRetry: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-2 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700" id={id} role="alert">
      {message}
      <button className="min-h-11 rounded-full border border-red-200 px-3 font-extrabold underline-offset-2 hover:underline" onClick={onRetry} type="button">
        Try again
      </button>
    </p>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3"><dt className="font-bold text-slate-500">{label}</dt><dd className="min-w-0 break-words font-semibold text-slate-900">{value}</dd></div>;
}
