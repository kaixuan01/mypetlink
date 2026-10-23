"use client";

import type { RefObject } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  addIsoDays,
  formatWeekRange,
  formatWeekRangeSpoken,
  isQuietWeek,
} from "@/lib/weeklyRecap";
import type { WeeklyRecap } from "@/types";

const weekButtonClass =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-pet-border bg-white text-pet-ink transition hover:border-pet-teal/50 hover:bg-[#f4f9ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-pet-border disabled:hover:bg-white";

/**
 * The recap's title, its week, and the arrows to the weeks either side.
 * The arrows say which week they open, and stop at the first and last week a
 * recap can show rather than offering a week that would only fail.
 */
export function RecapWeekHeader({
  petName,
  recap,
  headingRef,
  onChangeWeek,
}: {
  petName: string;
  recap: WeeklyRecap | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onChangeWeek: (direction: "previous" | "next") => void;
}) {
  const previousStart = recap ? addIsoDays(recap.weekStart, -7) : "";
  const nextStart = recap ? addIsoDays(recap.weekStart, 7) : "";
  const canGoBack = Boolean(recap && previousStart >= recap.earliestWeekStart);
  const canGoForward = Boolean(recap && nextStart <= recap.latestWeekStart);

  return (
    <header
      className="flex min-w-0 flex-col gap-4 rounded-[1.5rem] bg-gradient-to-br from-white to-[#fff3ea] p-4 shadow-[0_8px_24px_rgba(13,27,61,0.05)] ring-1 ring-pet-border sm:flex-row sm:items-end sm:justify-between sm:p-6"
      data-recap-header
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-pet-teal sm:text-sm">
          <Icon aria-hidden="true" className="h-4 w-4" name="paw" />
          Weekly recap
        </p>
        <h1
          className="brand-heading mt-1.5 break-words text-2xl font-bold leading-tight text-pet-ink outline-none [overflow-wrap:anywhere] sm:text-3xl"
          data-recap-title
          ref={headingRef}
          tabIndex={-1}
        >
          {`${petName}'s week`}
        </h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-pet-muted">
          {recap ? (
            <>
              <span data-recap-range>{formatWeekRange(recap.weekStart, recap.weekEnd)}</span>
              {recap.isCurrentWeek ? (
                <span className="rounded-full bg-[#e8f3ff] px-2.5 py-0.5 text-xs font-extrabold text-pet-teal">
                  This week so far
                </span>
              ) : null}
            </>
          ) : (
            <span aria-hidden="true" className="inline-block h-4 w-32 animate-pulse rounded-full bg-pet-cream motion-reduce:animate-none" />
          )}
        </p>
        {recap ? (
          <p className="mt-2 max-w-xl text-sm leading-6 text-pet-muted" data-recap-summary>
            {summarize(recap)}
          </p>
        ) : null}
      </div>

      <nav aria-label="Choose a week" className="flex shrink-0 items-center gap-2">
        <button
          aria-label={
            canGoBack && recap
              ? `Previous week, ${formatWeekRangeSpoken(previousStart, addIsoDays(previousStart, 6))}`
              : "No earlier weeks to show"
          }
          className={weekButtonClass}
          data-recap-previous
          disabled={!canGoBack}
          onClick={() => onChangeWeek("previous")}
          type="button"
        >
          <Icon aria-hidden="true" className="h-5 w-5 rotate-90" name="chevron" />
        </button>
        <span className="min-w-[5.5rem] text-center text-xs font-bold text-pet-muted" aria-hidden="true">
          {recap?.isCurrentWeek ? "This week" : recap ? weeksAgoLabel(recap) : ""}
        </span>
        <button
          aria-label={
            canGoForward && recap
              ? `Next week, ${formatWeekRangeSpoken(nextStart, addIsoDays(nextStart, 6))}`
              : "This is the latest week"
          }
          className={weekButtonClass}
          data-recap-next
          disabled={!canGoForward}
          onClick={() => onChangeWeek("next")}
          type="button"
        >
          <Icon aria-hidden="true" className="h-5 w-5 -rotate-90" name="chevron" />
        </button>
      </nav>
    </header>
  );
}

/** One plain sentence about the week, from exact counts only. */
function summarize(recap: WeeklyRecap) {
  if (isQuietWeek(recap)) {
    return recap.isCurrentWeek
      ? `Nothing added for ${recap.petName} yet this week.`
      : `A quiet week for ${recap.petName}.`;
  }

  const parts = [
    recap.moments.total
      ? `${recap.moments.total} ${recap.moments.total === 1 ? "Moment" : "Moments"}`
      : "",
    recap.care.logged.total
      ? `${recap.care.logged.total} care ${recap.care.logged.total === 1 ? "record" : "records"} logged`
      : "",
  ].filter(Boolean);

  return `${parts.join(" and ")} ${recap.isCurrentWeek ? "so far this week" : "this week"}.`;
}

function weeksAgoLabel(recap: WeeklyRecap) {
  const weeks = Math.round(
    (Date.parse(recap.latestWeekStart) - Date.parse(recap.weekStart)) / (7 * 86_400_000)
  );
  return weeks === 1 ? "Last week" : `${weeks} weeks ago`;
}
