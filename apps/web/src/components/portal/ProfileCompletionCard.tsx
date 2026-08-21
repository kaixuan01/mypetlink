"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnalyticsEvent, trackEvent } from "@/lib/analytics";
import type {
  ProfileCompletionItem,
  ProfileCompletionItemId,
  ProfileCompletionResult,
} from "@/lib/profileCompletion";
import { getPublicProfilePath } from "@/lib/routes";
import type { Pet, PetListItem } from "@/types";

type ProfileCompletionCardProps = {
  pet: Pet | PetListItem;
  completion: ProfileCompletionResult;
  compact?: boolean;
  isFirstPet?: boolean;
  suppressedItems?: ProfileCompletionItemId[];
};

export function ProfileCompletionCard({
  pet,
  completion,
  compact = false,
  isFirstPet = false,
  suppressedItems = [],
}: ProfileCompletionCardProps) {
  const viewed = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const completedConfirmationKey = `mypetlink-profile-completion-confirmed:${pet.id}`;
  const [showCompletedConfirmation, setShowCompletedConfirmation] = useState(
    !completion.isComplete
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!completion.isComplete) {
        setShowCompletedConfirmation(true);
        return;
      }

      const wasShown = Boolean(
        window.sessionStorage.getItem(completedConfirmationKey)
      );
      setShowCompletedConfirmation(!wasShown);
      if (!wasShown) {
        window.sessionStorage.setItem(completedConfirmationKey, "1");
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [completedConfirmationKey, completion.isComplete]);

  useEffect(() => {
    if (
      viewed.current ||
      completion.items.length === 0 ||
      (completion.isComplete && !showCompletedConfirmation)
    ) {
      return;
    }
    viewed.current = true;
    trackEvent(AnalyticsEvent.CompletionPromptViewed, {
      surface: "owner_portal",
    });
  }, [completion.isComplete, completion.items.length, showCompletedConfirmation]);

  const incompleteItems = useMemo(
    () =>
      completion.items
        .filter(
          (item) =>
            !item.isComplete && !suppressedItems.includes(item.id)
        )
        .sort((left, right) => right.weight - left.weight),
    [completion.items, suppressedItems]
  );

  if (completion.items.length === 0) return null;

  if (completion.isComplete) {
    if (compact || !showCompletedConfirmation) return null;
    return (
      <section
        aria-label={`${pet.name}'s profile progress`}
        className="brand-soft-card min-w-0 rounded-[1.75rem] p-5 sm:p-6"
      >
        <p className="text-sm font-bold leading-6 text-pet-ink">
          {pet.name}&apos;s profile has everything it needs. You can keep adding
          moments and care details whenever you like.
        </p>
      </section>
    );
  }

  if (compact) {
    const nextItem = incompleteItems[0];
    if (!nextItem) return null;

    return (
      <section
        aria-labelledby={`completion-${pet.id}-compact`}
        className="brand-soft-card min-w-0 rounded-[1.5rem] p-4 sm:p-5"
        data-profile-completion="compact"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              className="break-words text-base font-black leading-6 text-pet-ink"
              id={`completion-${pet.id}-compact`}
            >
              Add more about {pet.name}
            </h2>
            <p className="mt-1 text-sm font-semibold text-pet-muted">
              {completion.percentage}% complete
            </p>
          </div>
          <CompletionAction item={nextItem} />
        </div>
        <Progress percentage={completion.percentage} />
      </section>
    );
  }

  const completedItems = completion.items.filter((item) => item.isComplete);
  const nextItem = incompleteItems[0];
  const remaining = incompleteItems.length;

  return (
    <section
      aria-labelledby={`completion-${pet.id}`}
      className="brand-soft-card min-w-0 rounded-[1.75rem] p-5 sm:p-6"
      data-profile-completion="full"
    >
      <h2
        className="break-words text-lg font-black leading-7 text-pet-ink sm:text-xl"
        id={`completion-${pet.id}`}
      >
        {isFirstPet
          ? `Finish ${pet.name}'s profile`
          : `Add more about ${pet.name}`}
      </h2>
      <p className="mt-1 text-sm font-semibold text-pet-muted">
        {completion.percentage}% complete
      </p>
      <Progress percentage={completion.percentage} />

      {/* Default to the single next step; the full checklist is one tap away. */}
      {nextItem ? (
        <div className="mt-4 flex min-w-0 items-center gap-3 rounded-[1rem] border border-pet-border bg-white px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold uppercase tracking-wide text-pet-muted">
              {remaining === 1 ? "1 thing left" : `${remaining} things left`}
            </span>
            <span className="mt-0.5 block break-words text-sm font-bold text-pet-ink">
              {nextItem.actionLabel}
            </span>
          </span>
          <CompletionAction item={nextItem} />
        </div>
      ) : null}

      <button
        aria-controls={`completion-steps-${pet.id}`}
        aria-expanded={expanded}
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-extrabold text-pet-teal transition hover:text-[#0f5fd0]"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        {expanded ? "Hide profile steps" : "View all profile steps"}
      </button>

      {expanded ? (
        <ul className="mt-3 grid gap-2.5" id={`completion-steps-${pet.id}`}>
          {completedItems.map((item) => (
            <li
              className="flex min-w-0 items-center gap-3 rounded-[1rem] bg-white/65 px-3 py-2.5 text-sm font-bold text-pet-muted"
              key={item.id}
            >
              <span
                aria-hidden="true"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#dff6e8] text-xs text-pet-sage"
              >
                ✓
              </span>
              <span className="min-w-0 break-words">{item.label}</span>
              <span className="sr-only">Complete</span>
            </li>
          ))}
          {incompleteItems.map((item) => (
            <li
              className="flex min-w-0 items-center gap-3 rounded-[1rem] border border-pet-border bg-white px-3 py-2"
              key={item.id}
            >
              <span
                aria-hidden="true"
                className="h-6 w-6 shrink-0 rounded-full border-2 border-pet-border"
              />
              <span className="min-w-0 flex-1 break-words text-sm font-bold text-pet-ink">
                {item.label}
              </span>
              <CompletionAction item={item} />
            </li>
          ))}
        </ul>
      ) : null}

      {completion.isReadyToShare ? (
        <div className="mt-4 border-t border-pet-border pt-4 text-sm font-semibold text-pet-muted">
          <span>{pet.name}&apos;s profile is ready to share. </span>
          <Link
            className="inline-flex min-h-10 items-center font-black text-pet-teal transition hover:text-[#0f5fd0]"
            href={getPublicProfilePath(pet)}
            rel="noopener noreferrer"
            target="_blank"
          >
            View Public Profile
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function Progress({ percentage }: { percentage: number }) {
  return (
    <div
      aria-hidden="true"
      className="mt-2.5 h-2 overflow-hidden rounded-full bg-white"
    >
      <div
        className="h-full rounded-full bg-pet-teal transition-[width]"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

function CompletionAction({ item }: { item: ProfileCompletionItem }) {
  return (
    <Link
      aria-label={item.actionLabel}
      className="inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full border border-pet-teal bg-white px-3 text-xs font-black text-pet-teal transition hover:bg-[#e8f3ff]"
      href={item.href}
      onClick={() =>
        trackEvent(AnalyticsEvent.CompletionActionClicked, {
          surface: "owner_portal",
          completion_item: item.id,
        })
      }
    >
      Add
    </Link>
  );
}
