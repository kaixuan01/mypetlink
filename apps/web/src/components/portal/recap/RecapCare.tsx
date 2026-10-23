"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { DashboardPanel } from "@/components/portal/dashboard/DashboardPanel";
import { panelLinkClass, recordIcon } from "@/components/portal/dashboard/DashboardCareSection";
import { trackEvent } from "@/lib/analytics";
import { formatCareDayLabel } from "@/lib/dashboardHome";
import { ownerRoutes } from "@/lib/routes";
import { formatRecapDay, getRecapCareStatusLabel } from "@/lib/weeklyRecap";
import type {
  WeeklyRecap,
  WeeklyRecapCareStatus,
  WeeklyRecapDueCare,
  WeeklyRecapLoggedCare,
} from "@/types";

const logCareLinkClass =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-pet-teal/35 bg-white px-4 text-sm font-bold text-pet-teal transition hover:border-pet-teal hover:bg-[#e8f3ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal";

/**
 * Care in the week: what was logged, and the due dates the week left
 * behind. A logged record shows only its name, type and day — never notes,
 * provider or documents — and never a due status; an item is either logged
 * or still to do, never both.
 */
export function RecapCare({ recap }: { recap: WeeklyRecap }) {
  const { care } = recap;
  // Overdue items due outside this week — before it or, for a past week,
  // after it — so "other", never "earlier".
  const otherOverdue = care.overdueTotal - care.stillDue.total;

  return (
    <DashboardPanel id="recap-care" title="Care this week">
      {care.logged.total === 0 ? (
        care.hasCareRecords ? (
          <p className="rounded-2xl bg-pet-cream/70 px-4 py-3.5 text-sm text-pet-muted" data-recap-care-empty>
            No care logged this week.
          </p>
        ) : (
          <div className="grid gap-3 rounded-2xl bg-pet-cream/70 px-4 py-4" data-recap-care-none>
            <div>
              <p className="text-sm font-bold text-pet-ink">{`Keep track of ${recap.petName}'s care.`}</p>
              <p className="mt-1 text-sm leading-6 text-pet-muted">
                Log a vet visit, grooming or medicine, and add a next date to see it here.
              </p>
            </div>
            <div>
              <Link
                className={logCareLinkClass}
                href={ownerRoutes.petRecords(recap.petId, { create: true })}
                onClick={() => trackEvent("weekly_recap_action", { recap_action: "log_care" })}
              >
                <Icon aria-hidden="true" className="h-4 w-4" name="plus" />
                Log care
              </Link>
            </div>
          </div>
        )
      ) : (
        <>
          <ul className="divide-y divide-pet-border/70" data-recap-care-logged>
            {care.logged.items.map((item) => (
              <LoggedRow item={item} key={item.id} />
            ))}
          </ul>
          {care.logged.items.length < care.logged.total ? (
            <p className="mt-2 text-sm text-pet-muted">
              {`Showing ${care.logged.items.length} of ${care.logged.total} care records logged this week.`}
            </p>
          ) : null}
        </>
      )}

      {care.stillDue.total > 0 ? (
        <div className="mt-4 border-t border-pet-border/70 pt-4" data-recap-still-due>
          <h3 className="text-sm font-extrabold text-pet-ink">Still to do from this week</h3>
          <ul className="mt-1 divide-y divide-pet-border/70">
            {care.stillDue.items.map((item) => (
              <DueRow asOfDate={recap.asOfDate} item={item} key={item.id} petId={recap.petId} petName={recap.petName} />
            ))}
          </ul>
          {care.stillDue.items.length < care.stillDue.total ? (
            <p className="mt-2 text-sm text-pet-muted">
              {`Showing ${care.stillDue.items.length} of ${care.stillDue.total}.`}
            </p>
          ) : null}
        </div>
      ) : null}

      {otherOverdue > 0 ? (
        <p className="mt-3 text-sm text-pet-muted" data-recap-other-overdue>
          {otherOverdue === 1 ? "1 other overdue care date. " : `${otherOverdue} other overdue care dates. `}
          <PlannerLink petId={recap.petId} />
        </p>
      ) : null}
    </DashboardPanel>
  );
}

/**
 * What is due from today on, whichever week is shown — labelled as of today
 * so a past week's recap never suggests these were its due dates.
 */
export function RecapComingUp({ recap }: { recap: WeeklyRecap }) {
  const { comingUp } = recap.care;
  const more = comingUp.total - comingUp.items.length;

  return (
    <DashboardPanel
      action={comingUp.total > 0 ? <PlannerLink label="View all" petId={recap.petId} /> : undefined}
      id="recap-coming-up"
      title="Coming up"
    >
      <p className="mb-2 text-xs font-semibold text-pet-muted">
        {`As of today, ${formatRecapDay(recap.asOfDate)}`}
      </p>
      {comingUp.total === 0 ? (
        <p className="rounded-2xl bg-pet-cream/70 px-4 py-3.5 text-sm text-pet-muted" data-recap-coming-up-empty>
          {recap.care.hasCareRecords
            ? "No next care dates saved."
            : "Next care dates you add will show here."}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-pet-border/70" data-recap-coming-up>
            {comingUp.items.map((item) => (
              <DueRow asOfDate={recap.asOfDate} item={item} key={item.id} petId={recap.petId} petName={recap.petName} />
            ))}
          </ul>
          {more > 0 ? (
            <p className="mt-2 text-sm text-pet-muted">
              {more === 1 ? "1 more care date" : `${more} more care dates`}
            </p>
          ) : null}
        </>
      )}
    </DashboardPanel>
  );
}

function LoggedRow({ item }: { item: WeeklyRecapLoggedCare }) {
  return (
    <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 py-3 first:pt-1 last:pb-1" data-recap-logged-item>
      <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f8f0] text-pet-sage">
        <Icon className="h-[1.125rem] w-[1.125rem]" name={recordIcon(item.type)} />
      </span>
      <div className="min-w-0">
        <p className="break-words text-[0.9375rem] font-bold leading-5 text-pet-ink [overflow-wrap:anywhere]">
          {careName(item)}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-pet-muted">
          <span>{item.type}</span>
          <span aria-hidden="true">·</span>
          <span>{`Logged ${formatRecapDay(item.recordDate)}`}</span>
          {item.loggedAsDone ? (
            <Badge className="px-2.5 py-0.5" tone="mint">
              <Icon aria-hidden="true" className="mr-1 h-3 w-3" name="check" />
              Logged as done
            </Badge>
          ) : null}
        </p>
      </div>
    </li>
  );
}

function DueRow({
  item,
  asOfDate,
  petId,
  petName,
}: {
  item: WeeklyRecapDueCare;
  asOfDate: string;
  petId: string;
  petName: string;
}) {
  const actionable = item.status === "overdue" || item.status === "due-today";
  const day = formatCareDayLabel(item.dueDate, asOfDate);

  return (
    <li
      className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 py-3 first:pt-1 last:pb-1 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center"
      data-recap-due-item
      data-recap-due-status={item.status}
    >
      <span
        aria-hidden="true"
        className={[
          "grid h-10 w-10 place-items-center rounded-xl",
          item.status === "overdue" ? "bg-[#ffe8e3] text-[#a63c2e]" : "bg-[#e8f3ff] text-pet-teal",
        ].join(" ")}
      >
        <Icon className="h-[1.125rem] w-[1.125rem]" name={recordIcon(item.type)} />
      </span>
      <div className="min-w-0">
        <p className="break-words text-[0.9375rem] font-bold leading-5 text-pet-ink [overflow-wrap:anywhere]">
          {careName(item)}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge className="px-2.5 py-0.5" tone={statusTone(item.status)}>
            {getRecapCareStatusLabel(item.status)}
          </Badge>
          <span className="whitespace-nowrap text-xs font-semibold text-pet-ink">
            {item.status === "overdue" ? `Was due ${day}` : `Due ${day}`}
          </span>
        </p>
      </div>
      {actionable ? (
        <Link
          aria-label={`Log ${item.title} for ${petName} as done`}
          className="col-start-2 inline-flex min-h-11 items-center justify-self-start whitespace-nowrap rounded-full border border-pet-teal/35 bg-white px-4 text-sm font-bold text-pet-teal transition hover:border-pet-teal hover:bg-[#e8f3ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal sm:col-start-auto sm:justify-self-end"
          href={ownerRoutes.petRecords(petId, { complete: item.id })}
          onClick={() => trackEvent("weekly_recap_action", { recap_action: "log_as_done" })}
        >
          Log as done
        </Link>
      ) : null}
    </li>
  );
}

function PlannerLink({ petId, label = "Open the care planner" }: { petId: string; label?: string }) {
  return (
    <Link
      className={label === "View all" ? panelLinkClass : "font-bold text-pet-teal hover:text-[#0f5fd0]"}
      href={ownerRoutes.care({ petId })}
      onClick={() => trackEvent("weekly_recap_action", { recap_action: "view_planner" })}
    >
      {label}
    </Link>
  );
}

function careName(item: { title: string; careName?: string }) {
  return item.careName && item.careName !== item.title ? `${item.title} · ${item.careName}` : item.title;
}

function statusTone(status: WeeklyRecapCareStatus) {
  if (status === "overdue") return "danger" as const;
  if (status === "due-today" || status === "due-soon") return "warm" as const;
  return "soft" as const;
}
