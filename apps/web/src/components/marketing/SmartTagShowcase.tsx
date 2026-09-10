import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { smartTagOrderingEnabled } from "@/lib/features";
import { smartTagAddOn, smartTagAddOnsStatus } from "@/lib/planLimits";
import { marketingRoutes, ownerRoutes } from "@/lib/routes";

/**
 * The physical Smart Tag.
 *
 * Order matters here: the product, then how it opens, then what it costs and
 * whether it can be bought. An owner decides about a physical object by
 * looking at it first, so the outcome leads and the technology supports.
 *
 * Availability follows the existing flag rather than inventing a new flow.
 * While ordering is off this section states the status and price and offers no
 * button, matching what the owner portal already says in SmartTagsComingSoon —
 * there is no waitlist to join, so nothing here may imply one.
 */

/**
 * Real product photography is not in the repository yet. Rather than ship an
 * invented render, the slot stays empty until a photograph exists — the
 * section collapses to a single column and nothing looks unfinished. Setting
 * this to a real file is the only change needed when the photo arrives.
 */
const smartTagPhoto: { src: string; alt: string } | null = null;

const accessMethods: { icon: IconName; title: string; detail: string }[] = [
  {
    icon: "qr",
    title: "Scan the QR code",
    detail: "Works with any modern phone camera, with no app to install.",
  },
  {
    icon: "tag",
    title: "Tap using NFC",
    detail: "Hold an NFC-capable phone against the tag to open the page.",
  },
];

export function SmartTagShowcase() {
  return (
    <section className="brand-blue-section scroll-mt-24" id="smart-tags">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        {/*
          Product image slot. Fixed aspect ratio so the layout is settled
          before the photography exists; until then the section is a single
          column, which reads as a deliberate text section rather than as a
          two-column layout with a hole in it.
        */}
        <div
          className={
            smartTagPhoto
              ? "grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-14"
              : "max-w-3xl"
          }
        >
          <SmartTagProductSlot />

          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-wide text-pet-teal sm:text-sm">
              The Smart Tag
            </p>
            <h2 className="mt-2 text-2xl font-black leading-tight text-pet-ink sm:text-4xl">
              One small tag your pet actually wears.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-pet-muted sm:text-base sm:leading-7">
              A durable {smartTagAddOn.shortName}{" "}
              for your pet&apos;s collar. Scanning and tapping both open the
              same owner-approved Safety Profile.
            </p>

            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {accessMethods.map((method) => (
                <li className="flex gap-3" key={method.title}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-pet-teal">
                    <Icon aria-hidden="true" className="h-5 w-5" name={method.icon} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-pet-ink">
                      {method.title}
                    </h3>
                    <p className="mt-0.5 text-sm leading-6 text-pet-muted">
                      {method.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-pet-border pt-6">
              <p className="text-2xl font-black text-pet-ink">
                {smartTagAddOn.price}
              </p>
              <p className="text-sm font-bold text-pet-muted">
                {smartTagAddOn.billingNote}
              </p>
              {smartTagOrderingEnabled ? (
                <CTAButton href={ownerRoutes.tagOrder()} icon="tag" variant="primary">
                  Get a Smart Tag
                </CTAButton>
              ) : (
                <>
                  <Badge tone="teal">{smartTagAddOnsStatus.status}</Badge>
                  <a
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-extrabold text-pet-teal underline-offset-4 transition hover:underline"
                    href={marketingRoutes.smartPetTags}
                  >
                    About the Smart Tag
                    <Icon aria-hidden="true" className="h-4 w-4 -rotate-90" name="chevron" />
                  </a>
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

function SmartTagProductSlot() {
  if (!smartTagPhoto) {
    return null;
  }

  return (
    <div className="relative mx-auto w-full max-w-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={smartTagPhoto.alt}
        className="aspect-[4/3] w-full rounded-[1.75rem] border border-pet-border bg-white object-cover"
        height={600}
        loading="lazy"
        src={smartTagPhoto.src}
        width={800}
      />
    </div>
  );
}
