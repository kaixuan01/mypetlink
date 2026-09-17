import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { CTAButton } from "@/components/ui/CTAButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { communityPreviewCards } from "@/data/communityPreview";
import { socialRoutes } from "@/lib/routes";

/**
 * The landing page's one Community section.
 *
 * A window, not a feed. Three cards say what a Moment looks like and then get
 * out of the way; the Explore button is where the real thing lives. A homepage
 * that streams Community would make the most-cached page in the product depend
 * on the least-cacheable query in it, and would keep growing for as long as the
 * network does.
 *
 * It is a server component with no data fetching at all, so it cannot delay
 * first paint and cannot be affected by the Social API being down — the
 * homepage must not go quiet because Community did. It also means no owner's
 * pet can reach this page by being discoverable: there is no query here to
 * select one. See `communityPreview` for why that distinction matters.
 *
 * On a phone the row scrolls sideways instead of stacking. Three stacked cards
 * would add roughly a screen and a half of height to a page that already has
 * eight sections, and a Community teaser is worth a glance, not a scroll.
 */
export function CommunityTeaser() {
  return (
    <section className="bg-pet-cream" id="community">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <PageHeader
          as="h2"
          eyebrow="Community"
          title="Meet the MyPetLink community."
        />
        <p className="-mt-2 max-w-xl text-base leading-7 text-pet-muted">
          Discover pets, families and the everyday Moments that make them
          special.
        </p>

        <ul
          className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0"
          data-testid="community-preview-cards"
        >
          {communityPreviewCards.map((card) => (
            <li
              className="w-[78%] min-w-0 shrink-0 snap-start sm:w-auto sm:shrink"
              key={card.id}
            >
              <article className="brand-card flex h-full flex-col overflow-hidden rounded-[1.5rem] p-5">
                <div className="flex min-w-0 items-center gap-3">
                  {/*
                    Brand art or an initial avatar. There is no photo URL to
                    pass: nothing on this page points at a real pet's media.
                  */}
                  {card.mascot ? (
                    <LinkoMascot
                      alt="Linko, the MyPetLink mascot"
                      className="shrink-0"
                      pose={card.mascot}
                      size={96}
                    />
                  ) : (
                    <PetAvatar
                      pet={{
                        photoInitial: card.photoInitial,
                        photoTone: card.photoTone,
                        species: card.species,
                      }}
                      size="lg"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-pet-ink">
                      {card.petName}
                    </p>
                    <p className="truncate text-xs font-bold text-pet-muted">
                      {card.species} · {card.breed}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm font-black text-pet-ink">
                  {card.momentTitle}
                </p>
                <p className="mt-1 text-sm leading-6 text-pet-muted">
                  {card.momentCaption}
                </p>
              </article>
            </li>
          ))}
        </ul>

        {/*
          Said plainly rather than implied. These are our own pets, and a
          visitor should not have to wonder whether they are looking at somebody
          real who did not ask to be here.
        */}
        <p className="mt-4 text-xs font-semibold text-pet-muted">
          Sample pets shown to illustrate the Community experience. Real
          families and their Moments are in Explore.
        </p>

        <div className="mt-7">
          <CTAButton href={socialRoutes.explore} variant="primary">
            Explore Community
          </CTAButton>
        </div>
      </div>
    </section>
  );
}
