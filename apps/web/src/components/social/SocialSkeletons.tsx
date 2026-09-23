/**
 * Placeholders for Community surfaces, shaped like the thing that replaces
 * them.
 *
 * Every Community list used to wait behind a bare `bg-white` block: a 448px
 * rectangle on Explore, 288px on the feed, 256px on a pet's Moments tab. The
 * shell's ground is `--color-pet-cream` (#fff8f2) and those blocks were
 * #ffffff, so a "pulse" that fades opacity between 1 and .5 moved a white
 * rectangle a little closer to a cream one and back. On Explore that read as
 * most of a screen of blank page rather than as loading — which is what a
 * reader reasonably calls broken.
 *
 * Two rules fix that, and both matter:
 *
 * - **Tint that is actually visible.** The bars use `pet-cream` and
 *   `pet-border` against the card's own white, the tones the owner portal
 *   already uses for the same job (`SettingsPanel`, `QrCode`). Contrast comes
 *   from the fill, not from the animation.
 * - **The shape of the real card.** A skeleton that is one rectangle tells a
 *   reader nothing and still jumps the layout when content lands. These carry
 *   the card's own frame and its internal rhythm — subjects, byline, media,
 *   action row — so arrival is a fill, not a reflow.
 *
 * `animate-pulse` is deliberately the only motion: subtle, already in the
 * codebase, and it respects `prefers-reduced-motion` through Tailwind's own
 * handling rather than needing a second implementation here.
 *
 * Every skeleton is `aria-hidden` and its container carries `aria-busy`, so a
 * screen reader is told the region is loading once instead of being read a
 * dozen meaningless boxes.
 */

/** One tinted bar. `w`/`h` are Tailwind classes so callers stay declarative. */
function Bar({ className = "" }: { className?: string }) {
  return <span className={`block rounded-full bg-pet-cream ${className}`} />;
}

/**
 * A Moment card at rest.
 *
 * Mirrors `SocialMomentCard`: subjects row, byline with avatar, the media
 * frame, then the like row and title. The media block uses the same 4:5 box
 * the carousel settles into, which is what keeps the page from jumping.
 */
export function MomentCardSkeleton() {
  return (
    <article
      aria-hidden="true"
      className="brand-card animate-pulse overflow-hidden rounded-[1.5rem] p-0"
      data-testid="moment-card-skeleton"
    >
      <div className="flex flex-col gap-2 p-3 pb-2">
        {/* Subjects: a pet chip. */}
        <div className="flex items-center gap-2">
          <span className="block h-6 w-6 shrink-0 rounded-full bg-pet-apricot" />
          <Bar className="h-3 w-24" />
        </div>
        {/* Byline: household and age. */}
        <div className="flex items-center gap-2">
          <Bar className="h-2.5 w-20" />
          <Bar className="h-2.5 w-10" />
        </div>
      </div>

      {/*
        The media frame. 4:3 is the ratio the real card actually resolves to
        most of the time: `MomentMedia` uses it for a Moment with no media at
        every width, and `MomentMediaCarousel` uses it for video on a phone and
        for photos from `sm` up. Only a photo Moment on a phone is taller (4:5),
        so this under-estimates that one case rather than overshooting every
        other. Measured against the running app it lands within a pixel of a
        real card's 256px media box at 343px wide.

        The fill is the apricot the real card already shows behind a missing
        photo, not cream: this is the largest surface in the placeholder, and at
        #fff8f2 against a white card it was still close enough to blank paper to
        be the thing that made the old version look broken.
      */}
      <div className="aspect-[4/3] w-full bg-pet-apricot" />

      <div className="flex flex-col gap-2 p-3">
        {/* Like control. */}
        <div className="flex items-center gap-2">
          <span className="block h-7 w-7 rounded-full bg-pet-border" />
          <Bar className="h-2.5 w-8" />
        </div>
        {/* Title. */}
        <Bar className="h-3 w-2/3" />
      </div>
    </article>
  );
}

/**
 * A pet suggestion at rest.
 *
 * Mirrors `SocialPetCard`'s row shape — photo, name, species, handle, Follow.
 * The card flips to a column in narrow containers; the skeleton keeps the row,
 * because guessing the flip would need the same `@container` queries for no
 * gain while the card is still blank.
 */
export function PetCardSkeleton() {
  return (
    <article
      aria-hidden="true"
      className="brand-card flex animate-pulse gap-3 overflow-hidden rounded-[1.5rem] p-3"
      data-testid="pet-card-skeleton"
    >
      <span className="block h-20 w-20 shrink-0 rounded-[1rem] bg-pet-apricot" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Bar className="h-3.5 w-24" />
        <Bar className="mt-2 h-2.5 w-32" />
        <Bar className="mt-3 h-2.5 w-28" />
        <div className="mt-3 flex justify-end">
          <span className="block h-9 w-24 rounded-full bg-pet-border" />
        </div>
      </div>
    </article>
  );
}

/**
 * An account or notification row at rest: avatar, two lines, trailing control.
 * Used where the list item is a person rather than a Moment.
 */
export function AccountRowSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="brand-card flex animate-pulse items-center gap-3 rounded-[1.5rem] p-3"
      data-testid="account-row-skeleton"
    >
      <span className="block h-11 w-11 shrink-0 rounded-full bg-pet-apricot" />
      <div className="min-w-0 flex-1">
        <Bar className="h-3 w-28" />
        <Bar className="mt-2 h-2.5 w-20" />
      </div>
      <span className="block h-9 w-20 shrink-0 rounded-full bg-pet-border" />
    </div>
  );
}

/**
 * Search-result rows at rest: avatar and two lines of identifying text.
 *
 * Search sits directly on the cream Community page rather than inside a white
 * card, so these use the stronger border/apricot tints. That keeps the rows
 * visible while preserving the dimensions of the links that replace them.
 */
export function SearchResultsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      aria-busy="true"
      className="space-y-1"
      data-testid="search-loading"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          aria-hidden="true"
          className="flex animate-pulse items-center gap-3 rounded-[1.25rem] p-2"
          data-testid="search-result-skeleton"
          key={index}
        >
          <span className="block h-11 w-11 shrink-0 rounded-full bg-pet-apricot" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="block h-3 w-1/3 rounded-full bg-pet-border" />
            <span className="block h-3 w-1/2 rounded-full bg-pet-border" />
          </span>
        </div>
      ))}
      <span className="sr-only">Loading search results.</span>
    </div>
  );
}

/**
 * `count` Moment placeholders in the column the real stream uses.
 * Two is the default: enough to read as a list, not so many that a fast
 * response flashes a wall of grey.
 */
export function MomentStreamSkeleton({
  className = "",
  count = 2,
}: {
  className?: string;
  count?: number;
}) {
  return (
    <div
      aria-busy="true"
      className={`grid gap-4 ${className}`}
      data-testid="moment-stream-skeleton"
    >
      {Array.from({ length: count }, (_, index) => (
        <MomentCardSkeleton key={index} />
      ))}
    </div>
  );
}
