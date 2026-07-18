import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { ownerRoutes } from "@/lib/routes";

type SmartTagsComingSoonProps = {
  // When provided, offers a link back to that pet's profile.
  petId?: string;
  className?: string;
};

// Friendly state shown while Smart Tag ordering is disabled for launch.
// Emphasises that the free Safety Profile and Public Share Profile are already
// active, so owners are never left at a dead end.
export function SmartTagsComingSoon({ petId, className = "" }: SmartTagsComingSoonProps) {
  return (
    <section
      className={`brand-soft-card rounded-[1.75rem] p-6 sm:p-8 ${className}`}
    >
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pet-apricot text-pet-coral">
          <Icon name="tag" className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-wide text-pet-teal">
            Coming soon
          </p>
          <h2 className="mt-1 text-2xl font-black text-pet-ink">
            Physical Smart Tags are on the way
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-pet-muted">
            We are getting our physical QR and QR + NFC Smart Tags ready. Tag
            ordering is not open just yet. In the meantime, your pet&apos;s
            free Safety Profile and Public Share Profile are already active — no
            physical tag needed to keep a Safety Profile ready for finders.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            {petId ? (
              <CTAButton href={ownerRoutes.petProfile(petId)} icon="paw">
                Back to Pet Profile
              </CTAButton>
            ) : null}
            <CTAButton
              href={ownerRoutes.pets}
              icon="pets"
              variant={petId ? "secondary" : "primary"}
            >
              Go to My Pets
            </CTAButton>
          </div>
        </div>
      </div>
    </section>
  );
}
