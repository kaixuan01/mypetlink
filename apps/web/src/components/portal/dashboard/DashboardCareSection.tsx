"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { getCareRecordStatusLabel } from "@/lib/careRecordStatus";
import {
  DASHBOARD_CARE_ROWS_COMPACT,
  deriveDashboardCareView,
} from "@/lib/dashboardHome";
import { ownerRoutes } from "@/lib/routes";
import type { RecordType, UpcomingCareItem, UpcomingCareSummary } from "@/types";
import {
  DashboardPanel,
  PanelMessage,
  PanelRetry,
} from "@/components/portal/dashboard/DashboardPanel";

export type DashboardCareState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; summary: UpcomingCareSummary };

type DashboardCareSectionProps = {
  state: DashboardCareState;
  /** The pet the filter shows, or null for all active pets. */
  scopePetId: string | null;
  /** The one pet in view, when there is exactly one. */
  singlePetId?: string;
  onRetry: () => void;
};

/**
 * Care coming up: the owner's pending due items for the pets in view, each
 * with its own Log as done. What the section says when it has no rows depends
 * on what is actually known — a failed or partial read is never "nothing due".
 */
export function DashboardCareSection({
  state,
  scopePetId,
  singlePetId,
  onRetry,
}: DashboardCareSectionProps) {
  const viewAllHref = singlePetId
    ? ownerRoutes.petRecords(singlePetId)
    : ownerRoutes.records;
  const logCareHref = singlePetId
    ? ownerRoutes.petRecords(singlePetId, { create: true })
    : ownerRoutes.records;

  // With nothing logged there is nothing to view; the empty state's Log care
  // is the one action.
  const nothingLogged =
    state.status === "ready" &&
    deriveDashboardCareView(state.summary, scopePetId).kind === "no-records";

  return (
    <DashboardPanel
      action={
        nothingLogged ? undefined : (
          <Link className={panelLinkClass} href={viewAllHref}>
            View all
          </Link>
        )
      }
      busy={state.status === "loading"}
      id="dashboard-care"
      title="Care coming up"
    >
      <CareBody
        logCareHref={logCareHref}
        onRetry={onRetry}
        scopePetId={scopePetId}
        showPetName={!singlePetId}
        state={state}
        viewAllHref={viewAllHref}
      />
    </DashboardPanel>
  );
}

function CareBody({
  state,
  scopePetId,
  showPetName,
  logCareHref,
  viewAllHref,
  onRetry,
}: {
  state: DashboardCareState;
  scopePetId: string | null;
  showPetName: boolean;
  logCareHref: string;
  viewAllHref: string;
  onRetry: () => void;
}) {
  if (state.status === "loading") {
    return (
      <div aria-hidden="true" className="grid gap-3 pt-1" data-dashboard-care-loading>
        {[0, 1].map((key) => (
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
      <PanelMessage
        action={<PanelRetry label="Try again" onClick={onRetry} />}
        dataState="error"
        title="We couldn't load care dates right now."
      >
        Your care records are safe. Try again in a moment.
      </PanelMessage>
    );
  }

  const view = deriveDashboardCareView(state.summary, scopePetId);

  if (view.kind === "unavailable") {
    return (
      <PanelMessage
        action={<PanelRetry label="Try again" onClick={onRetry} />}
        dataState="unavailable"
        title="We couldn't show care dates for this pet right now."
      >
        Your care records are safe. Try again in a moment.
      </PanelMessage>
    );
  }

  if (view.kind === "no-records") {
    return (
      <PanelMessage
        action={<LogCareLink href={logCareHref} />}
        dataState="no-records"
        title="No care records yet."
      >
        Log a vaccination, deworming or grooming visit, and add the next date
        from your vet card. It will show up here.
      </PanelMessage>
    );
  }

  if (view.kind === "no-pending") {
    // Care is logged, but no due date is waiting. That is all this proves —
    // dates may well have been saved and since logged as done.
    return (
      <PanelMessage
        action={<LogCareLink href={logCareHref} />}
        dataState="no-pending"
        title="No pending care dates."
      >
        When you log care, add the next date from your vet card to see it
        here.
      </PanelMessage>
    );
  }

  // Counts come from the same consistent read as the rows, so the remainder
  // is exact even when the summary could not check every item.
  const shownCompact = Math.min(view.rows.length, DASHBOARD_CARE_ROWS_COMPACT);
  const moreCompact = Math.max(0, view.pendingCount - shownCompact);
  const moreWide = Math.max(0, view.pendingCount - view.rows.length);

  return (
    <div className="grid gap-1" data-dashboard-care-state={view.complete ? "complete" : "partial"}>
      {view.complete && view.dueWithinHorizon === 0 && view.horizonLabel ? (
        <p
          className="rounded-xl bg-[#effaf4] px-3 py-2 text-sm font-semibold text-pet-sage"
          data-dashboard-care-horizon
        >
          Nothing due through {view.horizonLabel}.
        </p>
      ) : null}

      {view.rows.length ? (
        <ul className="divide-y divide-pet-border/70" data-dashboard-care-list>
          {view.rows.map((item, index) => (
            <CareRow
              compactHidden={index >= DASHBOARD_CARE_ROWS_COMPACT}
              item={item}
              key={item.id}
              showPetName={showPetName}
            />
          ))}
        </ul>
      ) : null}

      {!view.complete ? (
        <div
          className="mt-2 flex flex-col gap-2 rounded-xl border border-[#ffd5cf] bg-[#fff6f3] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          data-dashboard-care-partial
          role="status"
        >
          <p className="text-sm font-semibold text-[#8f3025]">
            You have more care dates than we can show here, so some may be
            missing from this list.
          </p>
        </div>
      ) : null}

      {moreCompact > 0 || moreWide > 0 ? (
        <Link
          className={[
            "mt-1 inline-flex min-h-11 items-center self-start text-sm font-bold text-pet-teal transition hover:text-[#0f5fd0]",
            moreWide > 0 ? "" : "sm:hidden",
          ].join(" ")}
          data-dashboard-care-more
          href={viewAllHref}
        >
          {moreCompact > 0 ? (
            <span className="sm:hidden">{moreLabel(moreCompact)}</span>
          ) : null}
          {moreWide > 0 ? (
            <span className="hidden sm:inline">{moreLabel(moreWide)}</span>
          ) : null}
        </Link>
      ) : null}
    </div>
  );
}

function CareRow({
  item,
  showPetName,
  compactHidden,
}: {
  item: UpcomingCareItem;
  showPetName: boolean;
  compactHidden: boolean;
}) {
  const statusLabel = getCareRecordStatusLabel(item);
  const overdue = item.status === "overdue";
  const name = item.careName && item.careName !== item.title
    ? `${item.title} · ${item.careName}`
    : item.title;

  return (
    <li
      className={[
        "grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 py-3 first:pt-1 last:pb-1 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center",
        compactHidden ? "hidden sm:grid" : "grid",
      ].join(" ")}
      data-dashboard-care-item
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
        <p className="break-words text-[0.9375rem] font-bold leading-5 text-pet-ink [overflow-wrap:anywhere]">
          {name}
        </p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-medium text-pet-muted">
          {showPetName ? (
            <>
              <span
                className="min-w-0 truncate"
                data-dashboard-care-pet-name
                title={item.petName}
              >
                {item.petName}
              </span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span className="shrink-0">{item.type}</span>
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge className="px-2.5 py-0.5" tone={statusTone(item.status)}>
            {statusLabel}
          </Badge>
          <span
            className="whitespace-nowrap text-xs font-semibold text-pet-ink"
            data-dashboard-care-date
          >
            Due {item.dueDate}
          </span>
        </p>
      </div>
      <Link
        aria-label={`Log ${item.title} for ${item.petName} as done`}
        className="col-start-2 inline-flex min-h-11 items-center justify-self-start whitespace-nowrap rounded-full border border-pet-teal/35 bg-white px-4 text-sm font-bold text-pet-teal transition hover:border-pet-teal hover:bg-[#e8f3ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal sm:col-start-auto sm:justify-self-end"
        href={ownerRoutes.petRecords(item.petId, { complete: item.id })}
      >
        Log as done
      </Link>
    </li>
  );
}

function LogCareLink({ href }: { href: string }) {
  return (
    <Link
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-pet-teal/35 bg-white px-4 text-sm font-bold text-pet-teal transition hover:border-pet-teal hover:bg-[#e8f3ff]"
      href={href}
    >
      <Icon aria-hidden="true" className="h-4 w-4" name="plus" />
      Log care
    </Link>
  );
}

function moreLabel(count: number) {
  return count === 1 ? "1 more care date" : `${count} more care dates`;
}

function statusTone(status: UpcomingCareItem["status"]) {
  if (status === "overdue") return "danger" as const;
  if (status === "due-soon") return "warm" as const;
  return "soft" as const;
}

function recordIcon(type: RecordType): IconName {
  if (type === "Grooming") return "heart";
  if (type === "Vet Visit" || type === "Vaccine") return "shield";
  if (type === "Medication" || type === "Deworming") return "calendar";
  return "record";
}

export const panelLinkClass =
  "inline-flex min-h-11 items-center whitespace-nowrap text-sm font-bold text-pet-teal transition hover:text-[#0f5fd0]";
