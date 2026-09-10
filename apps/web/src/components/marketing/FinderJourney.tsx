import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { Icon, type IconName } from "@/components/ui/Icon";
import { marketingRoutes } from "@/lib/routes";

/**
 * What happens when someone finds a lost pet.
 *
 * This replaced two separate sections that both explained a process. Telling
 * the finder's story once, as a sequence, does the job of both: an owner
 * understands what they are buying into by watching a stranger use it.
 *
 * The layout is a row on wide screens and a vertical timeline below. It is
 * never a horizontal scroller — this is the page's main explanation, and an
 * explanation nobody can see without discovering a swipe gesture is not an
 * explanation.
 */

type JourneyStep = {
  icon: IconName;
  title: string;
  detail: string;
};

const steps: JourneyStep[] = [
  {
    icon: "search",
    title: "Someone finds your pet",
    detail: "A neighbour, a passer-by, a nearby shop.",
  },
  {
    icon: "tag",
    title: "They see the tag",
    detail: "A QR code on your pet's collar tag.",
  },
  {
    icon: "qr",
    title: "They scan or tap it",
    detail: "Any phone camera, or a tap if the phone has NFC.",
  },
  {
    icon: "shield",
    title: "The Safety Profile opens",
    detail: "Your pet's name, a general area, and your safety notes.",
  },
  {
    icon: "phone",
    title: "They reach you",
    detail: "By WhatsApp or a call, if you have switched those on.",
  },
];

const setupSteps = [
  "Create your pet's profile",
  "Choose what a finder can see",
  "Download your Safety Profile QR",
];

export function FinderJourney() {
  return (
    <section className="bg-white" id="how-it-works">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-extrabold uppercase tracking-wide text-pet-teal sm:text-sm">
            If your pet gets lost
          </p>
          <h2 className="mt-2 text-2xl font-black leading-tight text-pet-ink sm:text-4xl">
            A stranger can reach you in seconds.
          </h2>
          <p className="mt-3 text-sm leading-6 text-pet-muted sm:text-base sm:leading-7">
            No app, no account, and no sign-up for the person who finds your
            pet. They only need their phone.
          </p>
        </div>

        {/* Desktop: one row, connected. Mobile: a vertical timeline. */}
        <ol className="mt-10 grid gap-0 lg:grid-cols-5 lg:gap-4">
          {steps.map((step, index) => (
            <li
              className="relative grid grid-cols-[2.75rem_1fr] gap-x-4 pb-7 last:pb-0 lg:block lg:pb-0"
              key={step.title}
            >
              {/*
                One connector, drawn from every step except the last so the
                five beats read as a single line rather than five markers.
                Vertical below the large breakpoint, horizontal above it; both
                run icon-to-icon with no gap at the step boundary.
              */}
              {index < steps.length - 1 ? (
                <>
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-[1.375rem] top-10 w-px -translate-x-1/2 bg-pet-border lg:hidden"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute -right-4 left-[3.25rem] top-[1.375rem] hidden h-px bg-pet-border lg:block"
                  />
                </>
              ) : null}

              <span className="relative z-10 grid h-11 w-11 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                <Icon aria-hidden="true" className="h-5 w-5" name={step.icon} />
              </span>

              <div className="min-w-0 lg:mt-4">
                <p className="text-[0.68rem] font-extrabold uppercase tracking-wide text-pet-muted">
                  Step {index + 1}
                </p>
                <h3 className="mt-1 text-base font-black leading-snug text-pet-ink">
                  {step.title}
                </h3>
                <p className="mt-1 text-sm leading-6 text-pet-muted">
                  {step.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-col gap-5 border-t border-pet-border pt-7 sm:flex-row sm:items-center sm:justify-between">
          {/*
            Owner setup, compressed to one line. It used to be a section of its
            own; here it stays available without competing with the story.
          */}
          <div className="min-w-0">
            <p className="text-sm font-black text-pet-ink">
              Setting it up takes three steps
            </p>
            <p className="mt-1 text-sm leading-6 text-pet-muted">
              {setupSteps.join(" · ")}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <LinkoMascot
              alt=""
              className="hidden sm:block"
              pose="celebrate"
              size={72}
            />
            <a
              className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap text-sm font-extrabold text-pet-teal underline-offset-4 transition hover:underline"
              href={marketingRoutes.sampleSafetyProfile}
            >
              See a real Safety Profile
              <Icon aria-hidden="true" className="h-4 w-4 -rotate-90" name="chevron" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
