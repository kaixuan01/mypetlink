"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CompleteCareDialog, type CompletionAttempt } from "@/components/portal/care/CompleteCareDialog";
import { recordIcon, statusTone } from "@/components/portal/dashboard/DashboardCareSection";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { getCareRecordStatusLabel } from "@/lib/careRecordStatus";
import { getActivePets } from "@/lib/petLifecycle";
import { isUncertainRequestOutcome } from "@/lib/requestOutcome";
import { ownerRoutes } from "@/lib/routes";
import { isApiClientError } from "@/services/apiClient";
import { getPets } from "@/services/petService";
import { completeCareItem, getUpcomingCarePage, getUpcomingCareSummary } from "@/services/recordService";
import type {
  CareCompletionInput,
  PetListItem,
  UpcomingCareItem,
  UpcomingCareScope,
  UpcomingCareSummary,
} from "@/types";

/** How many more items each "Show more" adds to what is shown. */
export const PLANNER_PAGE_SIZE = 50;
/** Items per request when reading the shown window (the endpoint's maximum). */
const READ_PAGE_SIZE = 100;
/** Reads of a window that keeps changing before it is shown as changing. */
const READ_ATTEMPTS = 3;

const ALL = "all";

/**
 * One read of the shown window: every page from the first, and the summary.
 * Separate requests are not one snapshot. The checks below catch some
 * changes between them (a total, day or category that moved, a repeat, a
 * gap); they cannot prove that the pages describe the same set of items —
 * an item completed while another is added keeps every total the same. So a
 * read that took more than one page request is shown as a best-effort live
 * list, never as a verified complete one.
 */
type WindowRead = {
  items: UpcomingCareItem[];
  /** The pending total every page agreed on. */
  total: number;
  /** Did the pages agree with each other and cover the window without gaps or repeats? */
  pagesAgree: boolean;
  /** The summary, when it was read; null when that read failed. */
  summary: UpcomingCareSummary | null;
  /** Do the summary's counts and day match the pages? */
  summaryAgrees: boolean;
  /** Pets with any care records, from the list read. */
  petIdsWithCareRecords: string[];
  /** How many items were asked for. */
  window: number;
  /** How many page requests the read took. More than one: best effort. */
  pagesRead: number;
};

type PlannerState = { status: "loading" } | { status: "error" } | { status: "ready"; read: WindowRead };

/**
 * Care planner: every pending care date across the owner's active pets, or
 * one pet's, read from the server page by page, grouped into overdue, due
 * soon and later. Each item can be logged as done in one step or opened.
 *
 * Reads (a best-effort live list):
 * - Every read (first load, Show more, Refresh, a completion, the window
 *   coming back into view) re-reads the whole shown window from the first
 *   page rather than appending pages at old offsets. Each read carries a
 *   generation and the pet filter it was made for; a newer read, a filter
 *   change or leaving the page retires it, and nothing it returns — rows,
 *   error or loading state — is applied.
 * - Pages and the summary are separate requests. A detected disagreement
 *   (totals, coverage, counts or Malaysia day) is read again; if it persists,
 *   the rows are shown without counts under "Some care dates changed while
 *   loading". An undetected change between page requests is possible, so a
 *   read of more than one page always carries the note "Care dates may change
 *   while you're browsing", with its own refresh, and no counts — including
 *   when there is nothing more to load. Refresh is always available. Nothing
 *   here claims the list stays current after it is read.
 *
 * Completions belong to the page, not to the dialog: see CompletionAttempt.
 */
export function CarePlanner({ initialPetId }: { initialPetId?: string }) {
  const [pets, setPets] = useState<PetListItem[] | null>(null);
  const [petsError, setPetsError] = useState(false);
  const [petFilter, setPetFilter] = useState(initialPetId || ALL);
  const [state, setState] = useState<PlannerState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [notice, setNotice] = useState("");
  const generationRef = useRef(0);
  const windowRef = useRef(PLANNER_PAGE_SIZE);
  const mountedRef = useRef(true);

  // Completion attempts, by the care item they complete. An attempt keeps its
  // frozen details and key from its first send until it is settled or the
  // owner discards it; it is never replaced while it may still be written.
  const [attempts, setAttempts] = useState<Record<string, CompletionAttempt>>({});
  const attemptsRef = useRef(attempts);
  const [openAttemptItemId, setOpenAttemptItemId] = useState<string | null>(null);
  const attemptSequenceRef = useRef(0);

  const scopePetId = petFilter === ALL ? null : petFilter;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getPets()
      .then((response) => {
        if (active) setPets(getActivePets(response.data));
      })
      .catch(() => {
        if (active) setPetsError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  /**
   * Reads the window for the current filter. Returns false when a newer
   * read, a filter change or unmount retired it before it finished.
   */
  const read = useCallback(
    async (window: number): Promise<boolean> => {
      const generation = ++generationRef.current;
      const petId = scopePetId ?? undefined;
      const current = () => generation === generationRef.current;

      let result: WindowRead | null = null;
      for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
        const summary = await getUpcomingCareSummary().catch(() => null);
        if (!current()) return false;
        const pages = await readWindow(window, petId);
        if (!current()) return false;
        const scope = summary?.scopes.find((item) => item.petId === (petId ?? null));
        const summaryAgrees = Boolean(
          summary &&
            scope &&
            pages.pagesAgree &&
            summary.asOfDate === pages.asOfDate &&
            scope.pendingCount === pages.total &&
            countsFit(scope, pages.items, pages.total)
        );
        result = {
          items: pages.items,
          total: pages.total,
          pagesAgree: pages.pagesAgree,
          summary,
          summaryAgrees,
          petIdsWithCareRecords: pages.petIdsWithCareRecords,
          window,
          pagesRead: pages.pagesRead,
        };
        // A failed summary is not a disagreement: the rows still stand.
        if (pages.pagesAgree && (summaryAgrees || summary === null)) break;
      }

      if (!current() || !result) return false;
      windowRef.current = window;
      setState({ status: "ready", read: result });
      return true;
    },
    [scopePetId]
  );

  /** A full read that shows the loading state first, or an error if it fails. */
  const reload = useCallback(
    (window: number, showLoading: boolean) => {
      const before = generationRef.current;
      setMoreError(false);
      setLoadingMore(false);
      if (showLoading) setState({ status: "loading" });
      read(window).catch(() => {
        // Only the newest read may show an error.
        if (generationRef.current === before + 1 && mountedRef.current) setState({ status: "error" });
      });
    },
    [read]
  );

  useEffect(() => {
    windowRef.current = PLANNER_PAGE_SIZE;
    queueMicrotask(() => reload(PLANNER_PAGE_SIZE, true));
    return () => {
      // A filter change retires every read made for the previous one.
      generationRef.current += 1;
    };
  }, [reload]);

  // Another tab may have changed care, or Malaysia's day may have turned:
  // statuses come from the server's day, so read again on return.
  useEffect(() => {
    function refresh() {
      if (document.visibilityState === "visible") reload(windowRef.current, false);
    }
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload]);

  function choosePet(next: string) {
    setNotice("");
    setPetFilter(next);
    const url = new URL(window.location.href);
    if (next === ALL) url.searchParams.delete("pet");
    else url.searchParams.set("pet", next);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function showMore() {
    if (state.status !== "ready") return;
    const before = generationRef.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      await read(state.read.window + PLANNER_PAGE_SIZE);
    } catch {
      if (generationRef.current === before + 1 && mountedRef.current) setMoreError(true);
    } finally {
      if (generationRef.current === before + 1 && mountedRef.current) setLoadingMore(false);
    }
  }

  // ---- completion attempts ------------------------------------------------

  function putAttempt(attempt: CompletionAttempt | null, itemId: string) {
    const next = { ...attemptsRef.current };
    if (attempt) next[itemId] = attempt;
    else delete next[itemId];
    attemptsRef.current = next;
    setAttempts(next);
  }

  function openDone(item: UpcomingCareItem) {
    setNotice("");
    if (!attemptsRef.current[item.id]) {
      putAttempt(
        { id: ++attemptSequenceRef.current, item, key: newKey(), input: null, phase: "editing" },
        item.id
      );
    }
    setOpenAttemptItemId(item.id);
  }

  async function send(itemId: string, input: CareCompletionInput) {
    const attempt = attemptsRef.current[itemId];
    if (!attempt || attempt.phase === "sending") return;
    // The details are frozen with the key from the first send on.
    const frozen = attempt.input ?? Object.freeze({ ...input, idempotencyKey: attempt.key });
    putAttempt({ ...attempt, input: frozen, phase: "sending", message: undefined, fieldErrors: undefined }, itemId);
    const isCurrent = () => mountedRef.current && attemptsRef.current[itemId]?.id === attempt.id;

    try {
      const result = await completeCareItem(attempt.item.id, frozen);
      if (!mountedRef.current) return;
      // Settled, whether or not this attempt was still on screen.
      if (isCurrent()) putAttempt(null, itemId);
      setOpenAttemptItemId((open) => (open === itemId ? null : open));
      const changedSince = result.outcome === "replayed" && result.completion.fulfillsCareRecordId !== attempt.item.id;
      setNotice(
        changedSince
          ? `${attempt.item.title} was logged as done earlier; that record has since been changed.`
          : `${attempt.item.title} is logged as done for ${attempt.item.petName}${result.completion.dueDate ? `. Next due ${result.completion.dueDate}` : ""}.`
      );
      reload(windowRef.current, false);
    } catch (caught) {
      if (!isCurrent()) return;
      if (isUncertainRequestOutcome(caught)) {
        putAttempt(
          {
            ...attempt,
            input: frozen,
            phase: "unknown",
            message: "We couldn't confirm this yet. Your details are kept — try again and it won't be logged twice.",
          },
          itemId
        );
        return;
      }
      if (isApiClientError(caught) && caught.status === 400 && caught.details) {
        // Nothing was written: the details can be corrected and sent fresh.
        putAttempt(
          {
            ...attempt,
            key: newKey(),
            input: null,
            phase: "editing",
            draft: frozen,
            fieldErrors: Object.fromEntries(
              Object.entries(caught.details).map(([field, messages]) => [field, messages[0] ?? ""])
            ),
          },
          itemId
        );
        return;
      }
      putAttempt(
        {
          ...attempt,
          input: frozen,
          phase: "refused",
          message: isApiClientError(caught)
            ? refusalCopy[caught.code] ?? "We couldn't log this right now. Please try again."
            : "We couldn't log this right now. Please try again.",
        },
        itemId
      );
    }
  }

  function closeDone(itemId: string) {
    const attempt = attemptsRef.current[itemId];
    if (attempt?.phase === "sending") return;
    setOpenAttemptItemId(null);
    // An unknown outcome is kept to review; anything else is finished.
    if (attempt && attempt.phase !== "unknown") putAttempt(null, itemId);
    if (attempt?.phase === "refused") reload(windowRef.current, false);
  }

  const heldAttempts = Object.values(attempts).filter(
    (attempt) => attempt.phase === "unknown" && attempt.item.id !== openAttemptItemId
  );
  const openAttempt = openAttemptItemId ? attempts[openAttemptItemId] : undefined;

  // Only rows of the selected pets are ever shown or actionable.
  const visibleItems = useMemo(() => {
    if (state.status !== "ready") return [];
    return scopePetId ? state.read.items.filter((item) => item.petId === scopePetId) : state.read.items;
  }, [state, scopePetId]);

  const groups = useMemo(
    () =>
      [
        { id: "overdue", title: "Overdue", items: visibleItems.filter((item) => item.status === "overdue") },
        { id: "due-soon", title: "Due soon", items: visibleItems.filter((item) => item.status === "due-soon") },
        { id: "upcoming", title: "Later", items: visibleItems.filter((item) => item.status === "upcoming") },
      ].filter((group) => group.items.length > 0),
    [visibleItems]
  );

  return (
    <section aria-labelledby="care-planner-title" className="grid gap-4" data-care-planner>
      <h2 className="sr-only" id="care-planner-title">
        Upcoming care
      </h2>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        {pets && pets.length > 1 ? (
          <div aria-label="Show care for" className="flex min-w-0 flex-wrap gap-2" role="group">
            {[{ id: ALL, name: "All pets" }, ...pets.map((pet) => ({ id: pet.id, name: pet.name }))].map((option) => {
              const selected = option.id === petFilter;
              return (
                <button
                  aria-pressed={selected}
                  className={[
                    "inline-flex min-h-11 max-w-[14rem] items-center rounded-full border px-4 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal",
                    selected
                      ? "border-pet-teal bg-pet-teal text-white shadow-sm"
                      : "border-pet-border bg-white text-pet-ink hover:border-pet-teal/50 hover:bg-[#f4f9ff]",
                  ].join(" ")}
                  key={option.id}
                  onClick={() => choosePet(option.id)}
                  title={option.name}
                  type="button"
                >
                  <span className="truncate">{option.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <span />
        )}
        {state.status === "ready" ? (
          <button className={textButton} onClick={() => reload(windowRef.current, false)} type="button">
            Refresh
          </button>
        ) : null}
      </div>

      {heldAttempts.map((attempt) => (
        <div
          className="flex flex-col gap-3 rounded-[1.25rem] border border-[#f3b4a8] bg-[#fff6f3] p-4 sm:flex-row sm:items-center sm:justify-between"
          data-care-planner-held={attempt.item.id}
          key={attempt.id}
          role="status"
        >
          <p className="text-sm font-bold leading-6 text-[#8f3025]">
            Your Done for {attempt.item.title} ({attempt.item.petName}) isn&apos;t confirmed yet. Your details are
            kept on this page until you leave or reload it. Leaving doesn&apos;t cancel a save that was already sent.
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button className={secondaryButton} onClick={() => setOpenAttemptItemId(attempt.item.id)} type="button">
              Review
            </button>
            <button className={secondaryButton} onClick={() => putAttempt(null, attempt.item.id)} type="button">
              Discard
            </button>
          </div>
        </div>
      ))}

      {notice ? (
        <p
          className="rounded-[1.25rem] border border-pet-mint bg-[#e8f8f0] p-4 text-sm font-bold text-pet-sage"
          data-care-planner-notice
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <PlannerBody
        groups={groups}
        loadingMore={loadingMore}
        moreError={moreError}
        onComplete={openDone}
        onRefresh={() => reload(windowRef.current, false)}
        onRetry={() => reload(windowRef.current, true)}
        petsError={petsError}
        scopePetId={scopePetId}
        showMore={() => void showMore()}
        showPetNames={petFilter === ALL}
        state={state}
        visibleCount={visibleItems.length}
      />

      {openAttempt ? (
        <CompleteCareDialog
          attempt={openAttempt}
          key={openAttempt.id}
          onClose={() => closeDone(openAttempt.item.id)}
          onSubmit={(input) => void send(openAttempt.item.id, input)}
        />
      ) : null}
    </section>
  );
}

/**
 * Reads the first `window` pending items, page by page from the first, and
 * checks the pages agree: one total and one Malaysia day across them, no item
 * twice, and every page full except the last.
 */
async function readWindow(window: number, petId: string | undefined) {
  const items: UpcomingCareItem[] = [];
  const seen = new Set<string>();
  const totals = new Set<number>();
  const days = new Set<string>();
  let petIdsWithCareRecords: string[] = [];
  let repeated = false;
  let short = false;
  const pages = Math.max(1, Math.ceil(window / READ_PAGE_SIZE));

  let requests = 0;
  for (let page = 1; page <= pages; page += 1) {
    requests += 1;
    const response = await getUpcomingCarePage({ page, pageSize: READ_PAGE_SIZE, petId });
    const total = response.meta?.total;
    if (typeof total !== "number") throw new Error("Care dates came back without a total.");
    totals.add(total);
    days.add(response.data.asOfDate);
    petIdsWithCareRecords = response.data.petIdsWithCareRecords;
    for (const entry of response.data.items) {
      if (seen.has(entry.id)) repeated = true;
      else {
        seen.add(entry.id);
        items.push(entry);
      }
    }
    const expected = Math.min(READ_PAGE_SIZE, Math.max(0, total - (page - 1) * READ_PAGE_SIZE));
    if (response.data.items.length !== expected) short = true;
    if (page * READ_PAGE_SIZE >= total) break;
  }

  const total = [...totals][0] ?? 0;
  const shown = items.slice(0, window);
  return {
    items: shown,
    total,
    pagesRead: requests,
    asOfDate: [...days][0] ?? "",
    petIdsWithCareRecords,
    pagesAgree:
      totals.size === 1 && days.size === 1 && !repeated && !short && shown.length === Math.min(window, total),
  };
}

/** Do the summary's category counts leave room for the rows that were read? */
function countsFit(scope: UpcomingCareScope, items: UpcomingCareItem[], total: number) {
  const overdue = items.filter((item) => item.status === "overdue").length;
  const dueSoon = items.filter((item) => item.status === "due-soon").length;
  const later = items.filter((item) => item.status === "upcoming").length;
  const complete = items.length === total;
  const counts = {
    overdue: scope.overdueCount,
    dueSoon: scope.dueWithinHorizonCount - scope.overdueCount,
    later: scope.pendingCount - scope.dueWithinHorizonCount,
  };
  return complete
    ? overdue === counts.overdue && dueSoon === counts.dueSoon && later === counts.later
    : overdue <= counts.overdue && dueSoon <= counts.dueSoon && later <= counts.later;
}

function PlannerBody({
  state,
  scopePetId,
  groups,
  visibleCount,
  showPetNames,
  petsError,
  loadingMore,
  moreError,
  showMore,
  onComplete,
  onRefresh,
  onRetry,
}: {
  state: PlannerState;
  scopePetId: string | null;
  groups: Array<{ id: string; title: string; items: UpcomingCareItem[] }>;
  visibleCount: number;
  showPetNames: boolean;
  petsError: boolean;
  loadingMore: boolean;
  moreError: boolean;
  showMore: () => void;
  onComplete: (item: UpcomingCareItem) => void;
  onRefresh: () => void;
  onRetry: () => void;
}) {
  if (state.status === "loading") {
    return (
      <div aria-busy="true" aria-label="Loading care dates" className="brand-card grid gap-3 rounded-[1.75rem] p-5" data-care-planner-state="loading">
        {[0, 1, 2].map((key) => (
          <div className="flex items-center gap-3" key={key}>
            <span className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-pet-cream motion-reduce:animate-none" />
            <span className="grid flex-1 gap-2">
              <span className="h-3.5 w-2/3 animate-pulse rounded-full bg-pet-cream motion-reduce:animate-none" />
              <span className="h-3 w-1/3 animate-pulse rounded-full bg-pet-cream motion-reduce:animate-none" />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <PlannerMessage
        action={
          <button className={secondaryButton} onClick={onRetry} type="button">
            Try again
          </button>
        }
        state="error"
        title="We couldn't load care dates right now."
      >
        Your care records are safe. Try again in a moment.
      </PlannerMessage>
    );
  }

  const { read } = state;
  const allRecordsHref = ownerRoutes.care({ view: "all" });
  const consistent = read.pagesAgree && (read.summaryAgrees || read.summary === null);
  const changedNote = !consistent ? (
    <div
      className="flex flex-col gap-2 rounded-[1.25rem] border border-[#ffd5cf] bg-[#fff6f3] p-4 sm:flex-row sm:items-center sm:justify-between"
      data-care-planner-changed
      role="status"
    >
      <p className="text-sm font-semibold text-[#8f3025]">
        Some care dates changed while loading. Refresh to check again.
      </p>
    </div>
  ) : null;

  if (visibleCount === 0) {
    // "Nothing pending" only from a read whose parts agree on it.
    if (!consistent || read.total > 0) {
      return changedNote ?? (
        <PlannerMessage state="changed" title="Some care dates changed while loading.">
          Refresh to check again.
        </PlannerMessage>
      );
    }

    const hasRecords = scopePetId
      ? read.petIdsWithCareRecords.includes(scopePetId)
      : read.petIdsWithCareRecords.length > 0;
    if (!hasRecords) {
      return (
        <PlannerMessage
          action={
            <Link className={secondaryButton} href={scopePetId ? ownerRoutes.petRecords(scopePetId, { create: true }) : allRecordsHref}>
              Log care
            </Link>
          }
          state="no-records"
          title="No care records yet."
        >
          Log a vaccination, deworming or grooming visit, and add the next date
          from your vet card. It will show up here.
        </PlannerMessage>
      );
    }

    return (
      <PlannerMessage
        action={
          <Link className={secondaryButton} href={allRecordsHref}>
            View care records
          </Link>
        }
        state="no-pending"
        title="No pending care dates."
      >
        When you log care, add the next date from your vet card to see it here.
      </PlannerMessage>
    );
  }

  const scope = read.summary?.scopes.find((item) => item.petId === scopePetId);
  const multiPage = read.pagesRead > 1;
  // Counts are shown only beside a list read in one request that the summary
  // agrees with: never as proof that rows read across pages are complete.
  const counts =
    read.summaryAgrees && !multiPage && scope
      ? ({
          overdue: scope.overdueCount,
          "due-soon": scope.dueWithinHorizonCount - scope.overdueCount,
          upcoming: scope.pendingCount - scope.dueWithinHorizonCount,
        } as Record<string, number>)
      : null;
  const remaining = read.pagesAgree ? Math.max(0, read.total - visibleCount) : 0;

  return (
    <div className="grid gap-4" data-care-planner-state="ready">
      {changedNote}
      {read.summary === null ? (
        <p className="text-xs font-semibold text-pet-muted" data-care-planner-no-totals>
          The totals aren&apos;t available right now. The list below is up to date as of this read.
        </p>
      ) : null}
      {petsError ? (
        <p className="text-xs font-semibold text-pet-muted">Pet filters aren&apos;t available right now.</p>
      ) : null}
      {groups.map((group) => (
        <section
          aria-labelledby={`care-group-${group.id}`}
          className="brand-card rounded-[1.75rem] p-4 sm:p-5"
          data-care-group={group.id}
          key={group.id}
        >
          <h3 className="flex items-baseline justify-between gap-3 text-base font-black text-pet-ink" id={`care-group-${group.id}`}>
            {group.title}
            {counts ? (
              <span className="text-xs font-bold text-pet-muted" data-care-group-count>
                {counts[group.id]}
              </span>
            ) : null}
          </h3>
          <ul className="mt-2 divide-y divide-pet-border/70">
            {group.items.map((item) => (
              <PlannerRow item={item} key={item.id} onComplete={onComplete} showPetName={showPetNames} />
            ))}
          </ul>
        </section>
      ))}

      {multiPage && consistent ? (
        <div
          className="flex flex-col gap-2 rounded-[1.25rem] border border-pet-border bg-white/70 p-3 sm:flex-row sm:items-center sm:justify-between"
          data-care-planner-freshness
        >
          <p className="text-sm font-semibold leading-6 text-pet-muted">
            Care dates may change while you&apos;re browsing. Refresh to check the latest list.
          </p>
          <button className={secondaryButton} onClick={onRefresh} type="button">
            Refresh the list
          </button>
        </div>
      ) : null}

      {remaining > 0 ? (
        <div className="grid justify-items-start gap-2" data-care-planner-more>
          <button className={secondaryButton} disabled={loadingMore} onClick={showMore} type="button">
            {loadingMore ? "Loading..." : `Show more care dates (${remaining} more)`}
          </button>
          {moreError ? (
            <p className="text-sm font-semibold text-[#a63c2e]" role="alert">
              We couldn&apos;t load more right now. Try again in a moment.
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs font-semibold text-pet-muted">
        Email reminders are coming with Premium.{" "}
        <Link className="font-bold text-pet-teal underline-offset-2 hover:underline" href={allRecordsHref}>
          View all care records
        </Link>
      </p>
    </div>
  );
}

function PlannerRow({
  item,
  showPetName,
  onComplete,
}: {
  item: UpcomingCareItem;
  showPetName: boolean;
  onComplete: (item: UpcomingCareItem) => void;
}) {
  const overdue = item.status === "overdue";
  const name = item.careName && item.careName !== item.title ? `${item.title} · ${item.careName}` : item.title;

  return (
    <li
      className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 py-3 first:pt-2 last:pb-1 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center"
      data-care-planner-item={item.id}
    >
      <span
        aria-hidden="true"
        className={[
          "grid h-10 w-10 place-items-center rounded-xl",
          overdue ? "bg-[#ffe8e3] text-[#a63c2e]" : "bg-[#e8f3ff] text-pet-teal",
        ].join(" ")}
      >
        <Icon className="h-[1.125rem] w-[1.125rem]" name={recordIcon(item.type)} />
      </span>
      <div className="min-w-0">
        <p className="break-words text-[0.9375rem] font-bold leading-5 text-pet-ink [overflow-wrap:anywhere]">{name}</p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-medium text-pet-muted">
          {showPetName ? (
            <>
              <span className="min-w-0 truncate" title={item.petName}>
                {item.petName}
              </span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span className="shrink-0">{item.type}</span>
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge className="px-2.5 py-0.5" tone={statusTone(item.status)}>
            {getCareRecordStatusLabel(item)}
          </Badge>
          <span className="whitespace-nowrap text-xs font-semibold text-pet-ink">Due {item.dueDate}</span>
        </p>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto sm:justify-end">
        <button
          aria-label={`Mark ${item.title} for ${item.petName} as done`}
          className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-pet-teal bg-pet-teal px-4 text-sm font-bold text-white transition hover:bg-[#0f5fd0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
          onClick={() => onComplete(item)}
          type="button"
        >
          <Icon aria-hidden="true" className="h-4 w-4" name="check" />
          Done
        </button>
        <Link
          aria-label={`Open ${item.petName}'s care records`}
          className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-pet-border bg-white px-4 text-sm font-bold text-pet-ink transition hover:border-pet-teal/50 hover:bg-[#f4f9ff]"
          href={ownerRoutes.petRecords(item.petId)}
        >
          Open
        </Link>
      </div>
    </li>
  );
}

function PlannerMessage({
  title,
  children,
  action,
  state,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  state: string;
}) {
  return (
    <div className="brand-card grid gap-3 rounded-[1.75rem] p-5" data-care-planner-state={state}>
      <p className="text-base font-black text-pet-ink">{title}</p>
      <p className="text-sm font-semibold leading-6 text-pet-muted">{children}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

const refusalCopy: Record<string, string> = {
  care_item_completed: "This care item was already logged as done.",
  care_item_archived: "This care item was deleted, so it can't be logged as done.",
  care_item_no_due_date: "This care item no longer has a due date, so there's nothing to log as done.",
  care_item_pet_archived: "This pet's profile is archived, so care can't be logged for it right now.",
  completion_removed: "This was logged as done, but that record has since been deleted.",
  idempotency_key_conflict: "This save changed while it was being sent. Close this and try again.",
  care_write_busy: "This pet's care records are being updated. Try again in a moment.",
};

function newKey() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // RFC 4122 version 4 from secure random bytes, for browsers without randomUUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-pet-teal/35 bg-white px-4 text-sm font-bold text-pet-teal transition hover:border-pet-teal hover:bg-[#e8f3ff] disabled:cursor-not-allowed disabled:opacity-60";
const textButton =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-pet-teal transition hover:bg-[#e8f3ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal";
