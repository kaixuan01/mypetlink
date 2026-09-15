"use client";

import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { CTAButton } from "@/components/ui/CTAButton";
import { formatMomentSubjects } from "@/lib/momentSubjects";
import type { PublicMomentListItem } from "@/services/publicSocialService";

type PublicMomentGridProps = {
  moments: PublicMomentListItem[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  emptyMessage: string;
};

/**
 * A grid of public Moments with explicit "load more" paging.
 *
 * Two deliberate choices.
 *
 * **4:5 portrait, not square.** Pets are taller than they are wide, and a square
 * crop decapitates dogs. The tile keeps the portrait shape and lets the image
 * cover it.
 *
 * **A button, not infinite scroll.** It is keyboard reachable, it is announced,
 * and it does not trap someone trying to get to the footer. The cursor is opaque
 * and held by the caller.
 */
export function PublicMomentGrid({
  moments,
  hasMore,
  loadingMore,
  onLoadMore,
  emptyMessage,
}: PublicMomentGridProps) {
  if (moments.length === 0) {
    return (
      <div className="mt-4 rounded-[1.75rem] border border-pet-border bg-white p-8 text-center">
        <LinkoMascot alt="Linko the MyPetLink mascot waving" className="mx-auto" pose="wave" size={80} />
        <p className="mt-3 text-sm font-bold text-pet-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {moments.map((moment) => {
          const cover = moment.media[0];
          const subjectLabel = formatMomentSubjects(
            moment.subjects.map((subject) => subject.name)
          );

          return (
            <li key={moment.id}>
              <figure className="brand-card m-0 overflow-hidden rounded-[1.25rem] p-0">
                <div className="relative aspect-[4/5] w-full max-w-full bg-pet-apricot">
                  {cover?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={cover.altText || moment.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      src={cover.url}
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center px-3 text-center text-sm font-black text-pet-ink">
                      {moment.title}
                    </span>
                  )}
                </div>
                <figcaption className="p-3">
                  <span
                    className="line-clamp-2 block text-sm font-black text-pet-ink"
                    data-testid="moment-title"
                  >
                    {moment.title}
                  </span>
                  {subjectLabel ? (
                    <span
                      className="mt-1 block truncate text-xs font-bold text-pet-muted"
                      data-testid="moment-subjects"
                    >
                      {subjectLabel}
                    </span>
                  ) : null}
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <CTAButton
            disabled={loadingMore}
            onClick={onLoadMore}
            type="button"
            variant="secondary"
          >
            {loadingMore ? "Loading…" : "Show more Moments"}
          </CTAButton>
        </div>
      ) : null}
    </>
  );
}
