"use client";

import Link from "next/link";
import { VideoPoster } from "@/components/moments/VideoPoster";
import { Icon } from "@/components/ui/Icon";
import {
  DASHBOARD_RECENT_MOMENTS_COMPACT,
  getMomentPreview,
  selectRecentMoments,
  type PetMomentsLoad,
} from "@/lib/dashboardHome";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { ownerRoutes } from "@/lib/routes";
import type { PetListItem, PetMoment } from "@/types";
import {
  DashboardPanel,
  PanelMessage,
  PanelRetry,
} from "@/components/portal/dashboard/DashboardPanel";
import { panelLinkClass } from "@/components/portal/dashboard/DashboardCareSection";

export type DashboardMomentsState =
  | { status: "loading" }
  | { status: "ready"; loads: PetMomentsLoad[] };

type DashboardRecentMomentsProps = {
  state: DashboardMomentsState;
  pets: PetListItem[];
  scopePetIds: string[];
  /** The one pet in view, when there is exactly one. */
  singlePetId?: string;
  onRetry: () => void;
};

/**
 * Recent Moments: the newest few Moments for the pets in view, shown with the
 * owner's own photos. A Moment without a photo is shown as words and its
 * category, never as a stand-in picture. Owner-only: nothing here links to a
 * public page.
 */
export function DashboardRecentMoments({
  state,
  pets,
  scopePetIds,
  singlePetId,
  onRetry,
}: DashboardRecentMomentsProps) {
  const addHref = singlePetId
    ? ownerRoutes.petMomentCreate(singlePetId)
    : ownerRoutes.moments;
  const petNames = new Map(pets.map((pet) => [pet.id, pet.name]));
  // The empty state carries its own Add Moment; one action is enough.
  const hasMoments =
    state.status === "ready" &&
    selectRecentMoments(state.loads, scopePetIds).moments.length > 0;

  return (
    <DashboardPanel
      action={
        hasMoments ? (
          <Link
            aria-label={
              singlePetId
                ? `Add a Moment for ${petNames.get(singlePetId) ?? "your pet"}`
                : "Add a Moment"
            }
            className={`${panelLinkClass} gap-1.5`}
            href={addHref}
          >
            <Icon aria-hidden="true" className="h-4 w-4" name="plus" />
            Add Moment
          </Link>
        ) : undefined
      }
      busy={state.status === "loading"}
      id="dashboard-moments"
      title="Recent Moments"
    >
      <MomentsBody
        addHref={addHref}
        onRetry={onRetry}
        petNames={petNames}
        scopePetIds={scopePetIds}
        showPetName={!singlePetId}
        state={state}
      />
    </DashboardPanel>
  );
}

function MomentsBody({
  state,
  scopePetIds,
  petNames,
  showPetName,
  addHref,
  onRetry,
}: {
  state: DashboardMomentsState;
  scopePetIds: string[];
  petNames: Map<string, string>;
  showPetName: boolean;
  addHref: string;
  onRetry: () => void;
}) {
  if (state.status === "loading") {
    return (
      <div
        aria-hidden="true"
        className="grid grid-cols-3 gap-2 pt-1 sm:grid-cols-4 sm:gap-3 2xl:grid-cols-2"
        data-dashboard-moments-loading
      >
        {[0, 1, 2, 3].map((key) => (
          <span
            className={[
              "aspect-square animate-pulse rounded-2xl bg-pet-cream motion-reduce:animate-none",
              key >= DASHBOARD_RECENT_MOMENTS_COMPACT ? "hidden sm:block" : "block",
            ].join(" ")}
            key={key}
          />
        ))}
      </div>
    );
  }

  const view = selectRecentMoments(state.loads, scopePetIds);

  if (!view.moments.length && view.failedPets > 0) {
    return (
      <PanelMessage
        action={<PanelRetry label="Try again" onClick={onRetry} />}
        dataState="error"
        title="We couldn't load Moments right now."
      >
        Your Moments are safe. Try again in a moment.
      </PanelMessage>
    );
  }

  if (!view.moments.length) {
    return (
      <PanelMessage
        action={
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-pet-teal/35 bg-white px-4 text-sm font-bold text-pet-teal transition hover:border-pet-teal hover:bg-[#e8f3ff]"
            href={addHref}
          >
            <Icon aria-hidden="true" className="h-4 w-4" name="plus" />
            Add Moment
          </Link>
        }
        dataState="empty"
        title="A small moment is worth keeping."
      >
        Add a photo or a few words — a sunny nap counts. Your newest Moments
        will appear here.
      </PanelMessage>
    );
  }

  return (
    <div className="grid gap-2">
      <ul
        className="grid grid-cols-3 gap-2 pt-1 sm:grid-cols-4 sm:gap-3 2xl:grid-cols-2"
        data-dashboard-moments-list
      >
        {view.moments.map((moment, index) => (
          <MomentTile
            compactHidden={index >= DASHBOARD_RECENT_MOMENTS_COMPACT}
            key={moment.id}
            moment={moment}
            petName={showPetName ? petNames.get(moment.petId) : undefined}
          />
        ))}
      </ul>
      {view.failedPets > 0 ? (
        <div
          className="flex flex-col gap-2 rounded-xl border border-[#ffd5cf] bg-[#fff6f3] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          data-dashboard-moments-partial
          role="status"
        >
          <p className="text-sm font-semibold text-[#8f3025]">
            Some Moments couldn&apos;t be loaded.
          </p>
          <PanelRetry label="Try again" onClick={onRetry} />
        </div>
      ) : null}
    </div>
  );
}

function MomentTile({
  moment,
  petName,
  compactHidden,
}: {
  moment: PetMoment;
  petName?: string;
  compactHidden: boolean;
}) {
  const preview = getMomentPreview(moment);
  const meta = [petName, moment.date].filter(Boolean).join(" · ");

  return (
    <li className={compactHidden ? "hidden min-w-0 sm:block" : "min-w-0"} data-dashboard-moment>
      <Link
        aria-label={`${moment.title}${petName ? `, ${petName}` : ""}, ${moment.date}`}
        className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
        href={ownerRoutes.petMoments(moment.petId)}
      >
        <span className="relative block aspect-square overflow-hidden rounded-2xl bg-[#fff1e8]">
          {preview.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              data-dashboard-moment-photo
              decoding="async"
              loading="lazy"
              src={resolveMediaUrl(preview.media.url)}
            />
          ) : preview.kind === "video" ? (
            <VideoPoster
              alt=""
              compact
              durationSeconds={preview.media.durationSeconds}
              posterUrl={preview.media.posterUrl}
              url={preview.media.url}
            />
          ) : (
            <span
              className="flex h-full w-full flex-col justify-between p-2.5 sm:p-3"
              data-dashboard-moment-text
            >
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-white text-pet-coral">
                <Icon aria-hidden="true" className="h-4 w-4" name="heart" />
              </span>
              <span className="line-clamp-2 text-[11px] font-bold uppercase leading-4 tracking-wide text-[#9b4037]">
                {moment.type}
              </span>
            </span>
          )}
        </span>
        <span className="mt-1.5 block truncate text-xs font-bold text-pet-ink sm:text-sm">
          {moment.title}
        </span>
        <span className="block truncate text-[11px] font-medium text-pet-muted sm:text-xs">
          {meta}
        </span>
      </Link>
    </li>
  );
}
