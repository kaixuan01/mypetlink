"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  collaborationErrorMessage,
  getCollaborationCandidates,
  type CollaborationCandidate,
  type CollaborationInvite,
} from "@/services/momentCollaborationService";

/**
 * Choose a household, then which of its pets to ask about.
 *
 * Households are the results; their pets are never offered as accounts of
 * their own. Before typing, the list is households you follow. Typing searches
 * those and discoverable households — a household that chose not to be found
 * does not appear here either.
 */
export function CollaboratorPicker({
  momentId,
  excludeHandles = [],
  confirmLabel,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  /** The Moment being edited, so households already invited are marked. */
  momentId?: string;
  /** Households already queued for a Moment not yet created. */
  excludeHandles?: string[];
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (invite: CollaborationInvite) => void;
  onCancel: () => void;
}) {
  const inputId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CollaborationCandidate[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [chosen, setChosen] = useState<CollaborationCandidate | null>(null);
  const [petSlugs, setPetSlugs] = useState<string[]>([]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    const term = query.trim();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadError(null);
      getCollaborationCandidates(term.length >= 2 ? term : "", momentId)
        .then((items) => {
          if (!active) return;
          setCandidates(items);
          setActiveIndex(items.length > 0 ? 0 : -1);
        })
        .catch((caught: unknown) => {
          if (!active) return;
          setCandidates([]);
          setLoadError(collaborationErrorMessage(caught));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, term.length >= 2 ? 250 : 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [momentId, query]);

  const excluded = new Set(excludeHandles.map((handle) => handle.toLowerCase()));
  const unavailableReason = (candidate: CollaborationCandidate) => {
    if (excluded.has(candidate.household.handle.toLowerCase())) return "Already added";
    if (candidate.invitationState === "Pending") return "Invitation waiting";
    if (candidate.invitationState === "Accepted") return "Already in this Moment";
    if (candidate.invitationState === "Unavailable") return "Can't be invited to this Moment again";
    if (candidate.pets.length === 0) return "No pets to invite";
    return null;
  };

  function choose(candidate: CollaborationCandidate) {
    if (unavailableReason(candidate)) return;
    setChosen(candidate);
    setPetSlugs([]);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(candidates.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      if (open && activeIndex >= 0 && candidates[activeIndex]) {
        event.preventDefault();
        choose(candidates[activeIndex]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    }
  }

  const activeId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  if (chosen) {
    const legendId = `${inputId}-pets`;
    return (
      <div className="grid gap-3 rounded-[1.25rem] border border-pet-border bg-white p-4" data-testid="collaborator-pets">
        <fieldset aria-describedby={error ? `${legendId}-error` : undefined} className="grid gap-2">
          <legend className="text-sm font-black text-pet-ink" id={legendId}>
            Which of {chosen.household.displayName}&rsquo;s pets are in this Moment?
          </legend>
          <p className="text-xs font-semibold text-pet-muted">
            They&rsquo;ll be asked first. Nothing appears on the Moment until they accept.
          </p>
          {chosen.pets.map((pet) => {
            const checked = petSlugs.includes(pet.publicSlug);
            return (
              <label
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-pet-border px-3 text-sm font-bold text-pet-ink has-[:checked]:border-pet-teal has-[:checked]:bg-[#e8f8f0]"
                key={pet.publicSlug}
              >
                <input
                  checked={checked}
                  className="h-4 w-4 shrink-0 accent-pet-teal"
                  disabled={busy}
                  onChange={() =>
                    setPetSlugs((current) =>
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
        {error ? (
          <p className="text-sm font-bold text-pet-coral" id={`${legendId}-error`} role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-11 rounded-full bg-pet-teal px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || petSlugs.length === 0}
            onClick={() =>
              onConfirm({
                household: chosen.household,
                pets: chosen.pets.filter((pet) => petSlugs.includes(pet.publicSlug)),
              })
            }
            type="button"
          >
            {busy ? "Sending…" : confirmLabel}
          </button>
          <button
            className="min-h-11 rounded-full border border-pet-border px-4 text-sm font-black text-pet-ink"
            disabled={busy}
            onClick={() => {
              setChosen(null);
              setOpen(true);
              window.requestAnimationFrame(() => inputRef.current?.focus());
            }}
            type="button"
          >
            Choose another household
          </button>
          <button
            className="min-h-11 rounded-full px-4 text-sm font-black text-pet-muted"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-[1.25rem] border border-pet-border bg-white p-4" data-testid="collaborator-picker">
      <label className="text-sm font-black text-pet-ink" htmlFor={inputId}>
        Find a household
      </label>
      <input
        aria-activedescendant={open ? activeId : undefined}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        autoComplete="off"
        className="brand-input"
        id={inputId}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder="Name or @handle"
        ref={inputRef}
        role="combobox"
        type="text"
        value={query}
      />
      <p aria-live="polite" className="sr-only">
        {loading ? "" : `${candidates.length} ${candidates.length === 1 ? "household" : "households"} found.`}
      </p>
      {open ? (
        <ul
          aria-label="Households"
          className="grid max-h-72 gap-1 overflow-y-auto"
          id={listboxId}
          role="listbox"
        >
          {candidates.map((candidate, index) => {
            const reason = unavailableReason(candidate);
            return (
              <li
                aria-disabled={reason ? true : undefined}
                aria-selected={index === activeIndex}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 ${
                  index === activeIndex ? "bg-pet-cream" : ""
                } ${reason ? "cursor-not-allowed opacity-60" : ""}`}
                id={`${listboxId}-option-${index}`}
                key={candidate.household.handle}
                onClick={() => choose(candidate)}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-cream">
                  {candidate.household.avatarThumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" className="h-full w-full object-cover" src={candidate.household.avatarThumbnailUrl} />
                  ) : (
                    <Icon aria-hidden="true" className="h-4 w-4 text-pet-muted" name="users" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-pet-ink">
                    {candidate.household.displayName}
                  </span>
                  <span className="block truncate text-xs font-bold text-pet-muted">
                    @{candidate.household.handle}
                    {candidate.pets.length > 0
                      ? ` · ${candidate.pets.map((pet) => pet.name).join(", ")}`
                      : ""}
                  </span>
                  {reason ? (
                    <span className="block text-xs font-bold text-pet-muted">{reason}</span>
                  ) : null}
                </span>
                {candidate.isFollowed ? (
                  <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-pet-teal">
                    Following
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {loading ? (
        <p className="text-xs font-semibold text-pet-muted">Searching…</p>
      ) : loadError ? (
        <p className="text-sm font-bold text-pet-coral" role="alert">
          {loadError}
        </p>
      ) : candidates.length === 0 ? (
        <p className="text-xs font-semibold text-pet-muted">
          {query.trim().length >= 2
            ? // Search never reveals a household that isn't discoverable, even by
              // its exact handle; following one is how it becomes invitable.
              "No households found. To invite a household that isn't listed, follow them from their Community profile first."
            : "Households you follow appear here. Type a name or @handle to search."}
        </p>
      ) : null}
      <div>
        <button
          className="min-h-11 rounded-full px-4 text-sm font-black text-pet-muted"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
