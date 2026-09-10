import { BrandDecoration } from "@/components/brand/BrandDecoration";
import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { PRIMARY_CTA_LABEL } from "@/components/layouts/PublicNav";
import { CreateProfileCTA } from "@/components/marketing/CreateProfileCTA";
import { HomepageSamplePetPreview } from "@/components/marketing/HomepageSamplePetPreview";
import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { freePlanLimits, smartTagAddOn, smartTagAddOnsStatus } from "@/lib/planLimits";
import { marketingRoutes } from "@/lib/routes";

/**
 * The landing page hero.
 *
 * Two rules shape the copy here. The outcome comes before the mechanism, so
 * the headline says what an owner gets rather than introducing our mascot. And
 * every promise is one the Free plan already keeps today: a profile, a Safety
 * Profile, and a QR an owner can download. The physical Smart Tag is named
 * only as what it is right now — an add-on that is not on sale yet — so nobody
 * reads this section as an offer to buy one.
 */

const trustPoints: { icon: IconName; label: string }[] = [
  { icon: "paw", label: `Free for up to ${freePlanLimits.maxPets} pet profiles` },
  { icon: "qr", label: "No app needed for whoever finds them" },
  { icon: "shield", label: "Your full address stays private" },
];

export function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-pet-cream">
      <BrandDecoration
        className="absolute right-[8%] top-12 hidden lg:block"
        shape="sparkle"
        size={30}
      />
      <BrandDecoration
        className="absolute bottom-16 left-[6%] hidden lg:block"
        opacity={0.18}
        shape="paw"
        size={34}
      />

      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-12 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:px-8 lg:pb-16 lg:pt-20">
        <div className="min-w-0">
          <Badge tone="warm">Made for Malaysian pet families</Badge>

          <h1 className="mt-5 max-w-2xl text-4xl font-black leading-[1.06] text-pet-ink sm:text-5xl lg:text-6xl">
            A safer way home for your pet.
          </h1>

          <p className="mt-5 max-w-xl text-base leading-7 text-pet-muted sm:text-lg sm:leading-8">
            Create a free pet profile with a Safety Profile that helps whoever
            finds your pet reach you — with no app to install on their phone.
          </p>

          <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <CreateProfileCTA className="w-full sm:w-auto" variant="primary">
              {PRIMARY_CTA_LABEL}
            </CreateProfileCTA>
            <a
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-extrabold text-pet-teal underline-offset-4 transition hover:underline"
              href={marketingRoutes.samplePublicProfile}
            >
              See a sample profile
              <Icon aria-hidden="true" className="h-4 w-4 -rotate-90" name="chevron" />
            </a>
          </div>

          {/*
            Availability, stated plainly. The tag is described as what it is
            today so the hero never reads as a shop window for something that
            cannot be bought.
          */}
          <p className="mt-4 text-sm font-semibold text-pet-muted">
            The {smartTagAddOn.shortName} is an optional {smartTagAddOn.billingNote}{" "}
            add-on — {smartTagAddOnsStatus.status.toLowerCase()}.
          </p>

          {/*
            These three lines are the first thing a sceptical visitor reads, so
            they are set at body size with full line height rather than as fine
            print — small text here reads as a disclaimer, which is the
            opposite of the job they do.
          */}
          <ul className="mt-8 grid gap-3.5 border-t border-pet-border pt-6 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-4">
            {trustPoints.map((point) => (
              <li className="flex items-start gap-3" key={point.label}>
                <Icon
                  aria-hidden="true"
                  className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 text-pet-teal"
                  name={point.icon}
                />
                <span className="text-[0.9375rem] font-bold leading-6 text-pet-ink">
                  {point.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/*
          Linko wears the tag, so the mascot and the product demonstration are
          the same picture. She sits below the preview and tucks under its
          bottom edge, which reads as one composition without ever covering the
          profile content the preview exists to show.
        */}
        <div className="mx-auto w-full max-w-md">
          <HomepageSamplePetPreview />
          <div className="-mt-7 flex justify-start pl-2 sm:-mt-9 sm:pl-8">
            <LinkoMascot
              alt="Linko the MyPetLink cat, wearing a Smart Tag on her collar"
              className="drop-shadow-xl"
              pose="wave"
              priority
              size={172}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
