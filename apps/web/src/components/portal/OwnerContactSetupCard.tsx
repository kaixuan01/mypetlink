import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { ownerRoutes } from "@/lib/routes";

// Gentle reminder shown when the owner has no usable phone or WhatsApp
// contact. Rendered on Home and after pet creation; hidden automatically once
// contact details exist. It never blocks any flow.
export function OwnerContactSetupCard() {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-[1.5rem] border border-[#ffd5cf] bg-[#fff1ee] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-pet-coral">
          <Icon name="phone" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-black text-pet-ink">
            Add your contact details
          </h2>
          <p className="mt-1 text-sm leading-6 text-pet-muted">
            Help finders contact you if your pet is lost.
          </p>
        </div>
      </div>
      <CTAButton
        className="shrink-0"
        href={ownerRoutes.settingsOwnerContact}
        icon="phone"
        variant="coral"
      >
        Add contact details
      </CTAButton>
    </section>
  );
}
