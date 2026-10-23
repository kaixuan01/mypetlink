"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { trackEvent } from "@/lib/analytics";
import { ownerRoutes } from "@/lib/routes";
import { addIsoDays } from "@/lib/weeklyRecap";
import type { WeeklyRecap } from "@/types";

/** A whole-page message: one honest sentence and, when useful, one action. */
export function RecapMessage({
  title,
  children,
  action,
  dataState,
  headingLevel = "h1",
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  dataState: string;
  /** h2 when the page's own header already carries the h1. */
  headingLevel?: "h1" | "h2";
}) {
  const Heading = headingLevel;

  return (
    <section
      className="grid gap-3 rounded-[1.375rem] border border-pet-border bg-white p-5 shadow-[0_8px_24px_rgba(13,27,61,0.05)] sm:p-6"
      data-recap-state={dataState}
      role={dataState === "error" ? "alert" : undefined}
    >
      <div>
        <Heading className="brand-heading text-xl font-bold text-pet-ink">{title}</Heading>
        <p className="mt-1.5 text-sm leading-6 text-pet-muted">{children}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </section>
  );
}

/**
 * Placeholders shaped like the page, so nothing jumps when it arrives. The
 * header keeps its own placeholder while only the week's sections reload.
 */
export function RecapLoading({ sectionsOnly = false }: { sectionsOnly?: boolean }) {
  const block = "animate-pulse rounded-2xl bg-pet-cream motion-reduce:animate-none";

  return (
    <div aria-busy="true" className="grid min-w-0 gap-5" data-recap-loading>
      <span className="sr-only" role="status">
        Loading the week
      </span>
      {sectionsOnly ? null : <div aria-hidden="true" className={`h-32 ${block} rounded-[1.5rem]`} />}
      <div
        aria-hidden="true"
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]"
      >
        <div className="rounded-[1.375rem] border border-pet-border bg-white p-4 sm:p-5">
          <div className={`h-6 w-28 ${block}`} />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <div className={`aspect-square ${block} ${key === 2 ? "hidden sm:block" : ""}`} key={key} />
            ))}
          </div>
        </div>
        <div className="grid gap-5">
          <div className="rounded-[1.375rem] border border-pet-border bg-white p-4 sm:p-5">
            <div className={`h-6 w-36 ${block}`} />
            <div className={`mt-4 h-14 ${block}`} />
          </div>
          <div className="rounded-[1.375rem] border border-pet-border bg-white p-4 sm:p-5">
            <div className={`h-6 w-24 ${block}`} />
            <div className={`mt-4 h-14 ${block}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A week with no Moments and no care logged. Warm, short, and one clear
 * thing to do. A past week also offers the current one, which may already
 * have something in it.
 */
export function RecapQuietWeek({
  recap,
  onShowThisWeek,
}: {
  recap: WeeklyRecap;
  onShowThisWeek: () => void;
}) {
  const lastCompleteWeek = addIsoDays(recap.latestWeekStart, -7);

  return (
    <section
      aria-labelledby="recap-quiet-title"
      className="grid gap-4 rounded-[1.375rem] border border-[#ffd9c7] bg-[#fff6f0] p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-6"
      data-recap-quiet
    >
      <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-pet-coral shadow-sm">
        <Icon className="h-7 w-7" name="paw" />
      </span>
      <div className="min-w-0">
        <h2 className="brand-heading text-lg font-bold text-pet-ink sm:text-xl" id="recap-quiet-title">
          {recap.isCurrentWeek ? `${recap.petName}'s week is just getting started.` : `A quiet week for ${recap.petName}.`}
        </h2>
        <p className="mt-1 text-sm leading-6 text-pet-muted">
          {recap.isCurrentWeek
            ? "Add a Moment — a sunny nap counts — and it will appear here."
            : "No Moments or care were logged that week."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-pet-teal bg-pet-teal px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#0f5fd0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
            href={ownerRoutes.petMomentCreate(recap.petId)}
            onClick={() => trackEvent("weekly_recap_action", { recap_action: "add_moment" })}
          >
            <Icon aria-hidden="true" className="h-4 w-4" name="plus" />
            Add Moment
          </Link>
          {!recap.isCurrentWeek && recap.weekStart === lastCompleteWeek ? (
            <button
              className="inline-flex min-h-11 items-center rounded-full px-2 text-sm font-bold text-pet-teal transition hover:text-[#0f5fd0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
              data-recap-show-this-week
              onClick={onShowThisWeek}
              type="button"
            >
              See this week so far
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
