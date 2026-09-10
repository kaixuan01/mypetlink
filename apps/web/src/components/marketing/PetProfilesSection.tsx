import { Icon, type IconName } from "@/components/ui/Icon";
import { marketingRoutes } from "@/lib/routes";

/**
 * The two pages a pet gets, and what each is for.
 *
 * This is the one genuine either/or on the landing page, so it is the one
 * place a pair of cards earns its borders: a visitor has to be able to tell
 * the page they share with friends from the page a stranger sees.
 *
 * Everything described here is owner-controlled. The copy deliberately says
 * what a finder *may* see rather than what they will, because visibility is a
 * per-pet privacy setting and the page must not imply otherwise.
 */

const profiles: {
  icon: IconName;
  title: string;
  audience: string;
  description: string;
  shows: string[];
  tone: "coral" | "teal";
}[] = [
  {
    icon: "heart",
    title: "Public Share Profile",
    audience: "For friends and family",
    description:
      "A friendly page you can share anywhere — your pet's story, photos, moments and life timeline.",
    shows: ["Photos and moments", "Life timeline", "Personality and bio"],
    tone: "coral",
  },
  {
    icon: "qr",
    title: "Safety Profile",
    audience: "For whoever finds your pet",
    description:
      "The finder-first page a scan or tap opens. You choose what appears on it before anyone ever sees it.",
    shows: [
      "Your pet's name and photo",
      "A general area, never your address",
      "Contact options you switch on",
    ],
    tone: "teal",
  },
];

export function PetProfilesSection() {
  // Warm ground, between the white explanation above and the blue product
  // section below. Backgrounds carry the rhythm across the page so sections do
  // not need borders to separate them.
  return (
    <section className="bg-pet-cream" id="pet-profiles">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-extrabold uppercase tracking-wide text-pet-teal sm:text-sm">
            Pet profiles
          </p>
          <h2 className="mt-2 text-2xl font-black leading-tight text-pet-ink sm:text-4xl">
            Every pet gets two pages.
          </h2>
          <p className="mt-3 text-sm leading-6 text-pet-muted sm:text-base sm:leading-7">
            One to show off, one to bring them home. You decide what each one
            shows.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {profiles.map((profile) => (
            <article
              className="brand-card flex flex-col rounded-[1.5rem] p-5 sm:p-6"
              key={profile.title}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                    profile.tone === "coral"
                      ? "bg-[#fdeada] text-pet-coral"
                      : "bg-[#e8f3ff] text-pet-teal"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-5 w-5" name={profile.icon} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-black text-pet-ink">
                    {profile.title}
                  </h3>
                  <p
                    className={`text-xs font-black ${
                      profile.tone === "coral" ? "text-pet-coral" : "text-pet-teal"
                    }`}
                  >
                    {profile.audience}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-pet-muted">
                {profile.description}
              </p>

              <ul className="mt-4 grid gap-2 border-t border-pet-border pt-4 text-sm text-pet-muted">
                {profile.shows.map((item) => (
                  <li className="flex gap-2" key={item}>
                    <Icon
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-pet-teal"
                      name="paw"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-7 flex justify-start">
          <a
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-extrabold text-pet-teal underline-offset-4 transition hover:underline"
            href={marketingRoutes.samplePublicProfile}
          >
            View Sample Profile
            <Icon aria-hidden="true" className="h-4 w-4 -rotate-90" name="chevron" />
          </a>
        </div>
      </div>
    </section>
  );
}
