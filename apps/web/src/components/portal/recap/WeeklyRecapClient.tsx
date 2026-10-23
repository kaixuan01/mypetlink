"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RecapCare, RecapComingUp } from "@/components/portal/recap/RecapCare";
import { RecapMoments } from "@/components/portal/recap/RecapMoments";
import { RecapPetChooser } from "@/components/portal/recap/RecapPetChooser";
import {
  RecapLoading,
  RecapMessage,
  RecapQuietWeek,
} from "@/components/portal/recap/RecapStates";
import { RecapWeekHeader } from "@/components/portal/recap/RecapWeekHeader";
import { PanelRetry } from "@/components/portal/dashboard/DashboardPanel";
import { Icon } from "@/components/ui/Icon";
import { trackEvent, type AnalyticsRecapSource } from "@/lib/analytics";
import { getCurrentLocalDestination, ownerLoginPath } from "@/lib/authRedirect";
import { getMalaysiaTodayIsoDate } from "@/lib/careRecordStatus";
import { getActivePets, isActivePet } from "@/lib/petLifecycle";
import { ownerRoutes } from "@/lib/routes";
import {
  addIsoDays,
  formatWeekRangeSpoken,
  getMalaysiaWeekStart,
  isQuietWeek,
  resolveRequestedWeek,
  WEEKLY_RECAP_WEEKS_OF_HISTORY,
} from "@/lib/weeklyRecap";
import { isAbortError, isApiClientError } from "@/services/apiClient";
import { canUseApi } from "@/services/apiConfig";
import { getAuthSessionKey, subscribeAuthSession } from "@/services/authStorage";
import { getPets } from "@/services/petService";
import { getWeeklyRecap } from "@/services/weeklyRecapService";
import type { PetListItem, WeeklyRecap } from "@/types";

type PetsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; pets: PetListItem[] };

type RecapState =
  | { status: "loading" }
  /** `refreshFailed`: a background refresh failed; the week shown is the last one read. */
  | { status: "ready"; recap: WeeklyRecap; refreshFailed?: boolean }
  | { status: "unavailable" }
  | { status: "not-found" }
  | { status: "error" };

type Selection = { petId?: string; week?: string; source: AnalyticsRecapSource };

/** What is on screen, for refreshes started by the browser rather than by React. */
type Shown = { petId: string; weekStart?: string };

type RevalidateReason = "return" | "midnight" | "day";

/**
 * Returns closer together than this are one return. Focus and
 * visibilitychange arrive together, and switching tabs back and forth should
 * not read the week again and again.
 */
export const RECAP_REVALIDATE_MIN_INTERVAL_MS = 2_000;

/**
 * After Malaysia's day turns, how many reads may try to catch the server up
 * before the page waits for the owner to come back. The second waits this
 * long, for a browser clock that runs ahead of the server's.
 */
const DAY_CHANGE_READS = 2;
export const RECAP_DAY_CHANGE_RETRY_MS = 5 * 60_000;

/**
 * Which sign-in this browser holds: the shared session key, stable across a
 * token refresh and new at every sign-in, even the same person's. The local
 * preview has no session and is always the same one.
 */
function currentSessionKey() {
  if (!canUseApi()) return "local";
  return getAuthSessionKey();
}

function isAuthLoss(error: unknown) {
  return isApiClientError(error) && (error.status === 401 || error.status === 403);
}

function readSelection(): Selection {
  const params = new URL(window.location.href).searchParams;
  const from = params.get("from");
  return {
    petId: params.get("pet") ?? undefined,
    week: resolveRequestedWeek(params.get("week")),
    source: from === "dashboard" || from === "pet_hub" ? from : "direct",
  };
}

/**
 * One pet's week, for its owner: the Moments about it, the care logged in
 * it, what it left undone, and what is coming up. The pet and week live in
 * the address (replaced, not pushed, so Back still leaves the recap), and the
 * server decides every date. A failed read is always an error with a retry —
 * never a quiet week.
 *
 * The week is read again, in the background and for the same pet and week,
 * when the owner comes back to the tab (focus, visibility, a page restored
 * from the back-forward cache) and when Malaysia's day turns while the tab is
 * open — care may have been logged or a Moment changed elsewhere, and every
 * status is the server's view of today. One read at a time, at most one per
 * return, and no polling. A day change is never lost: whenever a read
 * settles, an answer for an earlier day than Malaysia's today is followed by
 * one more read (and, if the server still disagrees, one delayed retry).
 *
 * <b>Signed out means nothing private stays.</b> A 401/403 from either read,
 * the stored sign-in no longer being the one this page loaded for (checked
 * whenever a read settles), or any sign-in change reported by the shared
 * session lifecycle (`subscribeAuthSession`: a sign-out here or in another
 * tab, a failed token refresh, another account, or the same person signing
 * out and straight back in) clears every pet, name, photo and week from the
 * page at once; reads that were on their way are cancelled, and any answer
 * that still arrives is ignored. A new sign-in starts over from nothing. The
 * portal around this page (AuthGuard) reacts to the same signal.
 */
export function WeeklyRecapClient() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [petsState, setPetsState] = useState<PetsState>({ status: "loading" });
  const [recapState, setRecapState] = useState<RecapState>({ status: "loading" });
  const [announcement, setAnnouncement] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  // Changes whenever a session ends or begins, so every read starts again.
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterLoadRef = useRef(false);
  const openedTrackedRef = useRef(false);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const lastSettledRef = useRef(0);
  const shownRef = useRef<Shown | null>(null);
  // The Malaysia day of the answer on screen, set as each answer arrives
  // rather than after it renders, so a timer firing in between sees it.
  const asOfRef = useRef<string | undefined>(undefined);
  const dayReadsRef = useRef<{ key: string; count: number }>({ key: "", count: 0 });
  const dayTimerRef = useRef<number | undefined>(undefined);
  const sessionKeyRef = useRef<string | null | undefined>(undefined);
  const sessionGenerationRef = useRef(0);
  const signedOutRef = useRef(false);
  const revalidateRef = useRef<(reason: RevalidateReason) => void>(() => {});

  const clearDayTimer = useCallback(() => {
    if (dayTimerRef.current !== undefined) window.clearTimeout(dayTimerRef.current);
    dayTimerRef.current = undefined;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    sessionKeyRef.current = currentSessionKey();
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      clearDayTimer();
    };
  }, [clearDayTimer]);

  useEffect(() => {
    queueMicrotask(() => setSelection(readSelection()));
    function restore() {
      setSelection(readSelection());
    }
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  /**
   * The session ended or changed hands: forget every private thing on the
   * page and make every read in progress worthless. Idempotent.
   */
  const endSession = useCallback(() => {
    sessionGenerationRef.current += 1;
    requestRef.current += 1;
    controllerRef.current?.abort();
    inFlightRef.current = false;
    shownRef.current = null;
    asOfRef.current = undefined;
    clearDayTimer();
    if (!mountedRef.current) return;
    if (!signedOutRef.current) {
      signedOutRef.current = true;
      setSignedOut(true);
    }
    setPetsState({ status: "loading" });
    setRecapState({ status: "loading" });
  }, [clearDayTimer]);

  /** Whether the sign-in this page was loaded for is still the one stored. */
  const sessionStillOurs = useCallback(() => {
    const key = currentSessionKey();
    return Boolean(key) && key === sessionKeyRef.current;
  }, []);

  // Every sign-in change ends this page's session — even the same person
  // signing out and straight back in, which a comparison of user ids missed.
  // Each change is handled from its own before/after, in order, so changes
  // queued while the page was busy are not collapsed into "nothing changed".
  useEffect(() => {
    return subscribeAuthSession((change) => {
      endSession();
      if (change.next === null) return;

      // A new sign-in: start over from nothing, for that sign-in.
      sessionKeyRef.current = change.next;
      signedOutRef.current = false;
      setSignedOut(false);
      openedTrackedRef.current = true;
      setSessionEpoch((epoch) => epoch + 1);
    });
  }, [endSession]);

  const loadPets = useCallback(
    async (quietly = false) => {
      const generation = sessionGenerationRef.current;
      if (!quietly) setPetsState({ status: "loading" });
      try {
        const pets = (await getPets()).data;
        if (!mountedRef.current || generation !== sessionGenerationRef.current) return;
        if (!sessionStillOurs()) {
          endSession();
          return;
        }
        setPetsState({ status: "ready", pets });
      } catch (error) {
        if (!mountedRef.current || generation !== sessionGenerationRef.current) return;
        if (isAuthLoss(error) || !sessionStillOurs()) {
          endSession();
          return;
        }
        // A quiet refresh keeps the pets already shown.
        if (!quietly) setPetsState({ status: "error" });
      }
    },
    [endSession, sessionStillOurs]
  );

  useEffect(() => {
    if (signedOutRef.current) return;
    queueMicrotask(() => void loadPets());
  }, [loadPets, sessionEpoch]);

  const pets = petsState.status === "ready" ? petsState.pets : [];
  const activePets = getActivePets(pets);
  const requestedPet = selection?.petId
    ? pets.find((pet) => pet.id === selection.petId)
    : undefined;
  const petMissing = Boolean(selection?.petId) && petsState.status === "ready" && !requestedPet;
  const petInactive = Boolean(requestedPet) && !isActivePet(requestedPet);
  const pet = selection?.petId ? (requestedPet && isActivePet(requestedPet) ? requestedPet : undefined) : activePets[0];

  /**
   * When a read settles: if its day is behind Malaysia's today, the day
   * turned while it was out (or the server's clock is behind), so read once
   * more. Bounded per day change, so differing clocks cannot loop.
   */
  const followDayChange = useCallback(
    (answeredFor: string | undefined) => {
      if (!answeredFor || signedOutRef.current || !mountedRef.current) return;
      const today = getMalaysiaTodayIsoDate();
      if (today <= answeredFor) return;
      const key = `${answeredFor}|${today}`;
      const reads = dayReadsRef.current.key === key ? dayReadsRef.current.count : 0;
      if (reads >= DAY_CHANGE_READS) return;
      clearDayTimer();
      dayTimerRef.current = window.setTimeout(
        () => revalidateRef.current("day"),
        reads === 0 ? 0 : RECAP_DAY_CHANGE_RETRY_MS
      );
    },
    [clearDayTimer]
  );

  /**
   * Reads one week. `show` replaces the page with placeholders (a new pet or
   * week); `refresh` keeps the week on screen until the new answer arrives
   * and, if it fails, keeps it with a quiet note. Only the newest read of the
   * current session may change the page.
   */
  const loadRecap = useCallback(
    async (petId: string, week: string | undefined, mode: "show" | "refresh" = "show") => {
      const request = ++requestRef.current;
      const generation = sessionGenerationRef.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      inFlightRef.current = true;
      if (mode === "show") setRecapState({ status: "loading" });
      const current = () =>
        request === requestRef.current &&
        generation === sessionGenerationRef.current &&
        mountedRef.current;
      let answeredFor = asOfRef.current;
      try {
        const recap = await getWeeklyRecap(petId, week, { signal: controller.signal });
        if (!current()) return;
        if (!sessionStillOurs()) {
          endSession();
          return;
        }
        asOfRef.current = recap.asOfDate;
        answeredFor = recap.asOfDate;
        setRecapState({ status: "ready", recap });
      } catch (error) {
        if (!current() || isAbortError(error)) return;
        if (isAuthLoss(error) || !sessionStillOurs()) {
          endSession();
          return;
        }
        if (isApiClientError(error) && error.status === 404) {
          setRecapState({ status: "not-found" });
        } else if (isApiClientError(error) && error.code === "weekly_recap_unavailable") {
          setRecapState({ status: "unavailable" });
        } else if (mode === "refresh") {
          // Keep the week shown and say it may be out of date.
          setRecapState((shown) =>
            shown.status === "ready" ? { ...shown, refreshFailed: true } : { status: "error" }
          );
        } else {
          setRecapState({ status: "error" });
        }
      } finally {
        if (request === requestRef.current && generation === sessionGenerationRef.current) {
          inFlightRef.current = false;
          lastSettledRef.current = Date.now();
          followDayChange(answeredFor);
        }
      }
    },
    [endSession, followDayChange, sessionStillOurs]
  );

  const petId = pet?.id;
  const week = selection?.week;
  useEffect(() => {
    if (!petId || signedOutRef.current) return;
    queueMicrotask(() => void loadRecap(petId, week));
    // A newer pet or week makes any answer still on its way stale; the next
    // read also outnumbers it, so a late answer is dropped either way.
    return () => controllerRef.current?.abort();
  }, [loadRecap, petId, week, sessionEpoch]);

  const shownWeekStart = recapState.status === "ready" ? recapState.recap.weekStart : undefined;
  const asOfDate = recapState.status === "ready" ? recapState.recap.asOfDate : undefined;
  useEffect(() => {
    // A refresh asks for the week on screen — never the default again — so a
    // Monday turning over does not move the owner to another week.
    shownRef.current = petId ? { petId, weekStart: shownWeekStart ?? week } : null;
  }, [petId, shownWeekStart, week]);

  const revalidate = useCallback(
    (reason: RevalidateReason) => {
      if (signedOutRef.current || document.visibilityState !== "visible") return;
      if (!sessionStillOurs()) {
        // Signed out in this tab without a storage event reaching us.
        endSession();
        return;
      }
      const shown = shownRef.current;
      if (!shown || inFlightRef.current) return;
      const today = getMalaysiaTodayIsoDate();
      const dayTurned = Boolean(asOfRef.current) && today > (asOfRef.current as string);
      // The midnight timer and a day-change follow-up only matter while the
      // answer on screen is for an earlier day; a read for today already
      // happened — perhaps on the return that came with it.
      if (reason !== "return" && !dayTurned) return;
      if (
        reason === "return" &&
        !dayTurned &&
        Date.now() - lastSettledRef.current < RECAP_REVALIDATE_MIN_INTERVAL_MS
      ) {
        return;
      }

      // The week on screen may have left the history window overnight; open
      // the default week rather than ask for one the server refuses.
      const earliest = addIsoDays(getMalaysiaWeekStart(), -7 * WEEKLY_RECAP_WEEKS_OF_HISTORY);
      if (shown.weekStart && shown.weekStart < earliest) {
        window.history.replaceState(window.history.state, "", ownerRoutes.weeklyRecap(shown.petId));
        setSelection((current) => (current ? { ...current, week: undefined } : current));
        return;
      }

      if (dayTurned) {
        const key = `${asOfRef.current}|${today}`;
        const previous = dayReadsRef.current;
        dayReadsRef.current = { key, count: previous.key === key ? previous.count + 1 : 1 };
      }
      clearDayTimer();
      void loadPets(true);
      void loadRecap(shown.petId, shown.weekStart, "refresh");
    },
    [clearDayTimer, endSession, loadPets, loadRecap, sessionStillOurs]
  );

  useEffect(() => {
    revalidateRef.current = revalidate;
  }, [revalidate]);

  useEffect(() => {
    const onReturn = () => revalidate("return");
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) revalidate("return");
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [revalidate]);

  // Malaysia's midnight while the tab stays open: statuses and "today" move
  // on. One timer for the next midnight after the answer on screen; none
  // when that midnight has already passed (the settled read's day check, or
  // a return to the tab, covers it).
  useEffect(() => {
    if (!asOfDate || signedOut) return;
    const delay = Date.parse(`${addIsoDays(asOfDate, 1)}T00:00:00+08:00`) + 1_000 - Date.now();
    if (!(delay > 0)) return;
    const timer = window.setTimeout(() => revalidate("midnight"), delay);
    return () => window.clearTimeout(timer);
  }, [asOfDate, revalidate, signedOut]);

  // Once per visit: how the recap was reached and what it showed. A pet with
  // no recap (not found, not active, no pets at all) is never read, so its
  // visit settles as soon as the pets have loaded.
  const noRecapToRead = petsState.status === "ready" && !pet;
  useEffect(() => {
    if (openedTrackedRef.current || !selection || signedOut) return;
    if (recapState.status === "loading" && !noRecapToRead) return;
    openedTrackedRef.current = true;
    trackEvent("weekly_recap_opened", {
      source: selection.source,
      recap_state:
        recapState.status === "ready"
          ? isQuietWeek(recapState.recap)
            ? "quiet"
            : "has_activity"
          : recapState.status === "error"
            ? "error"
            : "unavailable",
    });
  }, [noRecapToRead, recapState, selection, signedOut]);

  // After a week or pet change, move focus to the new heading and say what
  // is now shown, so keyboard and screen-reader users are not left behind.
  useEffect(() => {
    if (recapState.status !== "ready" || !focusAfterLoadRef.current) return;
    focusAfterLoadRef.current = false;
    headingRef.current?.focus();
    queueMicrotask(() =>
      setAnnouncement(`Showing ${recapState.recap.petName}'s week, ${spokenRange(recapState.recap)}.`)
    );
  }, [recapState]);

  function navigate(next: { petId?: string; week?: string }) {
    if (!selection) return;
    const nextSelection = { ...selection, ...next };
    const url = new URL(window.location.href);
    url.search = "";
    const target = new URL(
      ownerRoutes.weeklyRecap(nextSelection.petId, { week: nextSelection.week }),
      url.origin
    );
    window.history.replaceState(window.history.state, "", `${target.pathname}${target.search}`);
    focusAfterLoadRef.current = true;
    setSelection(nextSelection);
  }

  function changeWeek(direction: "previous" | "next") {
    if (recapState.status !== "ready") return;
    const { recap } = recapState;
    const target = addIsoDays(recap.weekStart, direction === "previous" ? -7 : 7);
    if (target < recap.earliestWeekStart || target > recap.latestWeekStart) return;
    trackEvent("weekly_recap_week_changed", { direction });
    navigate({ petId: recap.petId, week: target });
  }

  function retry() {
    if (petId) void loadRecap(petId, week);
  }

  function retryRefresh() {
    const shown = shownRef.current;
    if (shown) void loadRecap(shown.petId, shown.weekStart, "refresh");
  }

  // Before anything else: a page whose session ended shows nothing of it.
  if (signedOut) {
    return (
      <RecapMessage
        action={
          <Link
            className={actionLinkClass}
            href={ownerLoginPath(getCurrentLocalDestination(ownerRoutes.dashboard))}
          >
            Sign in again
          </Link>
        }
        dataState="signed-out"
        title="You've been signed out."
      >
        Sign in again to see this page.
      </RecapMessage>
    );
  }

  if (petsState.status === "loading" || !selection) {
    return <RecapLoading />;
  }

  if (petsState.status === "error") {
    return (
      <RecapMessage
        action={<PanelRetry label="Try again" onClick={() => void loadPets()} />}
        dataState="error"
        title="We couldn't load your pets right now."
      >
        Your pets and Moments are safe. Please try again in a moment.
      </RecapMessage>
    );
  }

  if (!activePets.length) {
    return (
      <RecapMessage
        action={
          <Link className={actionLinkClass} href={pets.length ? ownerRoutes.pets : ownerRoutes.petNew}>
            {pets.length ? "View your pets" : "Add your first pet"}
          </Link>
        }
        dataState="no-pets"
        title={pets.length ? "Weekly recaps are for active pets." : "Add a pet to see its week."}
      >
        {pets.length
          ? "Each active pet gets a look back at its week — its Moments and its care."
          : "Once your pet is here, you can look back at each week of Moments and care."}
      </RecapMessage>
    );
  }

  const chooser =
    activePets.length > 1 || petMissing || petInactive ? (
      <RecapPetChooser
        onChange={(id) => navigate({ petId: id, week: undefined })}
        pets={activePets}
        value={pet?.id}
      />
    ) : null;

  if (!pet || recapState.status === "not-found" || recapState.status === "unavailable") {
    const unavailable = petInactive || recapState.status === "unavailable";
    return (
      <div className="grid min-w-0 gap-5" data-recap-root>
        <RecapMessage
          dataState={unavailable ? "unavailable" : "not-found"}
          title={
            unavailable
              ? "Weekly recaps are not available for this pet."
              : "We couldn't find that pet."
          }
        >
          {unavailable
            ? "Recaps look back at the week of an active pet."
            : "It may have been removed, or the link may be out of date."}{" "}
          {activePets.length ? "Choose one of your pets below." : null}
        </RecapMessage>
        {chooser}
      </div>
    );
  }

  const recap = recapState.status === "ready" ? recapState.recap : null;

  return (
    <div className="grid min-w-0 gap-5" data-recap-root>
      <p aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>

      {pet.lostModeEnabled ? <LostModeNotice petId={pet.id} petName={pet.name} /> : null}

      <RecapWeekHeader
        headingRef={headingRef}
        onChangeWeek={changeWeek}
        petName={recap?.petName ?? pet.name}
        recap={recap}
      />

      {chooser}

      {recapState.status === "loading" ? (
        <RecapLoading sectionsOnly />
      ) : recapState.status === "error" || !recap ? (
        <RecapMessage
          action={<PanelRetry label="Try again" onClick={retry} />}
          dataState="error"
          headingLevel="h2"
          title={`We couldn't load ${pet.name}'s week right now.`}
        >
          Your Moments and care records are safe. Please try again in a moment.
        </RecapMessage>
      ) : (
        <>
          {recapState.status === "ready" && recapState.refreshFailed ? (
            <div
              className="flex flex-col gap-2 rounded-xl border border-[#ffd5cf] bg-[#fff6f3] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              data-recap-refresh-failed
              role="status"
            >
              <p className="text-sm font-semibold text-[#8f3025]">
                We couldn&apos;t refresh this week just now. What you see may be out of date.
              </p>
              <PanelRetry label="Refresh" onClick={retryRefresh} />
            </div>
          ) : null}
          <RecapBody
            onChangeWeek={() => navigate({ petId: recap.petId, week: recap.latestWeekStart })}
            recap={recap}
          />
        </>
      )}
    </div>
  );
}

function RecapBody({ recap, onChangeWeek }: { recap: WeeklyRecap; onChangeWeek: () => void }) {
  const quiet = isQuietWeek(recap);

  return (
    <div className="grid min-w-0 gap-5" data-recap-body data-recap-state={quiet ? "quiet" : "has-activity"}>
      {quiet ? <RecapQuietWeek onShowThisWeek={onChangeWeek} recap={recap} /> : null}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] xl:items-start">
        {quiet ? null : <RecapMoments recap={recap} />}
        <div className={quiet ? "grid min-w-0 gap-5 xl:col-span-2 xl:grid-cols-2 xl:items-start" : "grid min-w-0 gap-5"}>
          <RecapCare recap={recap} />
          <RecapComingUp recap={recap} />
        </div>
      </div>
    </div>
  );
}

function LostModeNotice({ petId, petName }: { petId: string; petName: string }) {
  return (
    <Link
      className="flex min-w-0 items-center gap-3 rounded-[1.25rem] border border-[#ffc7bc] bg-[#ffe8e3] p-3.5 transition hover:border-pet-coral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
      data-recap-lost-mode
      href={ownerRoutes.petProfile(petId)}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-[#a63c2e] shadow-sm">
        <Icon aria-hidden="true" className="h-5 w-5" name="pin" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-[#8f3025]">{petName} is in Lost Mode</span>
        <span className="mt-0.5 block text-xs font-semibold leading-5 text-[#8f3025]">
          The missing pet notice is live.
        </span>
      </span>
      <span className="shrink-0 text-xs font-black text-[#8f3025]">Review pet</span>
    </Link>
  );
}

function spokenRange(recap: WeeklyRecap) {
  return formatWeekRangeSpoken(recap.weekStart, recap.weekEnd);
}

export const actionLinkClass =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-pet-teal/35 bg-white px-4 text-sm font-bold text-pet-teal transition hover:border-pet-teal hover:bg-[#e8f3ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal";
