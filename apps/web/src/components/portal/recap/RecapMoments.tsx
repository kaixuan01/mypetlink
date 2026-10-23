"use client";

import Link from "next/link";
import { DashboardPanel } from "@/components/portal/dashboard/DashboardPanel";
import { panelLinkClass } from "@/components/portal/dashboard/DashboardCareSection";
import { VideoPoster } from "@/components/moments/VideoPoster";
import { Icon } from "@/components/ui/Icon";
import { trackEvent } from "@/lib/analytics";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { momentAudienceLabels } from "@/lib/momentVisibility";
import { ownerRoutes } from "@/lib/routes";
import { formatRecapDay } from "@/lib/weeklyRecap";
import type { WeeklyRecap, WeeklyRecapMoment } from "@/types";

/**
 * The week's Moments with the owner's own photos. Every tile says who can
 * see it — Only me or Shared publicly — because this page mixes both. A
 * Moment without a photo shows its words and category, never a stand-in
 * picture. Owner-only: nothing here links to a public page.
 */
export function RecapMoments({ recap }: { recap: WeeklyRecap }) {
  const { moments } = recap;
  const addHref = ownerRoutes.petMomentCreate(recap.petId);
  const partial = moments.items.length < moments.total;

  return (
    <DashboardPanel
      action={
        <Link
          aria-label={`Add a Moment for ${recap.petName}`}
          className={`${panelLinkClass} gap-1.5`}
          href={addHref}
          onClick={() => trackEvent("weekly_recap_action", { recap_action: "add_moment" })}
        >
          <Icon aria-hidden="true" className="h-4 w-4" name="plus" />
          Add Moment
        </Link>
      }
      id="recap-moments"
      title="Moments"
    >
      {moments.total === 0 ? (
        <div className="rounded-2xl bg-pet-cream/70 px-4 py-4" data-recap-moments-empty>
          <p className="text-sm font-bold text-pet-ink">No Moments this week.</p>
          <p className="mt-1 text-sm leading-6 text-pet-muted">
            {`A photo or a few words about ${recap.petName}'s day will appear here.`}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-pet-muted" data-recap-moment-counts>
            {audienceSummary(recap)}
          </p>
          <ul
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3"
            data-recap-moments-list
          >
            {moments.items.map((moment) => (
              <MomentTile key={moment.id} moment={moment} />
            ))}
          </ul>
          {partial ? (
            <p className="mt-3 text-sm text-pet-muted" data-recap-moments-partial>
              {`Showing the newest ${moments.items.length} of ${moments.total} Moments. `}
              <Link className="font-bold text-pet-teal hover:text-[#0f5fd0]" href={ownerRoutes.petMoments(recap.petId)}>
                See all of {recap.petName}&apos;s Moments
              </Link>
            </p>
          ) : null}
        </>
      )}
    </DashboardPanel>
  );
}

/** "4 Moments · 2 Shared publicly, 2 Only me", each part kept on one line. */
function audienceSummary(recap: WeeklyRecap) {
  const { total, sharedPubliclyCount, onlyMeCount } = recap.moments;
  const onlyMe = momentAudienceLabels.Private;
  const shared = momentAudienceLabels.Public;
  const parts = !sharedPubliclyCount
    ? [`all ${onlyMe}`]
    : !onlyMeCount
      ? [`all ${shared}`]
      : [`${sharedPubliclyCount} ${shared}`, `${onlyMeCount} ${onlyMe}`];

  return (
    <>
      <span className="whitespace-nowrap">{`${total} ${total === 1 ? "Moment" : "Moments"}`}</span>
      {" · "}
      {parts.map((part, index) => (
        <span className="whitespace-nowrap" key={part}>
          {index ? `, ${part}` : part}
        </span>
      ))}
    </>
  );
}

function MomentTile({ moment }: { moment: WeeklyRecapMoment }) {
  const audience = momentAudienceLabels[moment.visibility];
  const day = formatRecapDay(moment.date);
  const withPet = moment.isPrimary ? "" : `With ${moment.primaryPetName}`;
  const label = [moment.title, day, audience, withPet, moment.hiddenByMyPetLink ? "Hidden by MyPetLink" : ""]
    .filter(Boolean)
    .join(", ");
  const previewUrl = moment.preview ? resolveMediaUrl(moment.preview.url) : "";

  return (
    <li className="min-w-0" data-recap-moment data-recap-moment-audience={moment.visibility}>
      <Link
        aria-label={label}
        className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
        href={ownerRoutes.petMoments(moment.primaryPetId)}
        onClick={() => trackEvent("weekly_recap_action", { recap_action: "open_moment" })}
      >
        <span className="relative block aspect-square overflow-hidden rounded-2xl bg-[#fff1e8]">
          {moment.preview && previewUrl && moment.preview.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              data-recap-moment-photo
              decoding="async"
              height={320}
              loading="lazy"
              src={previewUrl}
              width={320}
            />
          ) : moment.preview && previewUrl ? (
            <VideoPoster alt="" compact url={moment.preview.url} />
          ) : (
            <span className="flex h-full w-full flex-col justify-between p-3 pt-10" data-recap-moment-text>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-white text-pet-coral">
                <Icon aria-hidden="true" className="h-4 w-4" name="heart" />
              </span>
              <span className="line-clamp-2 text-[11px] font-bold uppercase leading-4 tracking-wide text-[#9b4037]">
                {moment.type}
              </span>
            </span>
          )}
          <span
            className={[
              "absolute left-2 top-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold shadow-sm",
              moment.visibility === "Public" ? "bg-white/95 text-pet-sage" : "bg-[#0d1b3d]/80 text-white",
            ].join(" ")}
            data-recap-moment-badge
          >
            <span className="truncate">{audience}</span>
          </span>
          {moment.mediaCount > 1 ? (
            <span className="absolute bottom-2 right-2 rounded-full bg-[#0d1b3d]/75 px-2 py-0.5 text-[11px] font-bold text-white">
              {moment.mediaCount}
            </span>
          ) : null}
        </span>
        <span className="mt-1.5 block truncate text-sm font-bold text-pet-ink">{moment.title}</span>
        <span className="block truncate text-xs font-medium text-pet-muted">
          {[day, withPet].filter(Boolean).join(" · ")}
        </span>
        {moment.hiddenByMyPetLink ? (
          <span className="mt-1 inline-flex rounded-full bg-[#f7f0ec] px-2 py-0.5 text-[11px] font-bold text-pet-muted">
            Hidden by MyPetLink
          </span>
        ) : null}
      </Link>
    </li>
  );
}
