import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { PetAvatar } from "@/components/ui/PetAvatar";
import type { Pet, PublicPetProfile } from "@/types";

type PublicFinderProfileProps = {
  pet: PublicPetProfile;
};

export function PublicFinderProfile({ pet }: PublicFinderProfileProps) {
  const visibility = mergeVisibility(pet.visibility);
  const message = encodeURIComponent(
    `Hi ${pet.owner.name}, I found ${pet.name} from the MyPetLink safety profile.`
  );
  const locationMessage = encodeURIComponent(
    `Hi ${pet.owner.name}, I found ${pet.name}. I can share the found location here.`
  );
  const contactPreference = pet.contactPreference ?? "WhatsApp preferred";

  return (
    <article className="brand-card mx-auto max-w-xl rounded-[2rem] p-5 sm:p-6">
      <div className="brand-blue-section rounded-[1.75rem] p-6 text-center">
        <PetAvatar pet={pet} size="xl" />
        <p className="mt-5 text-sm font-bold uppercase text-pet-teal">
          MyPetLink safety page
        </p>
        <h1 className="mt-2 text-4xl font-black text-pet-ink">
          Found {pet.name}?
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
          Please contact the owner directly using one of the options below.
        </p>
        <p className="mt-4 text-sm text-pet-muted">
          {pet.species} - {pet.breed} - {pet.color}
        </p>
        {visibility.showOwnerName ? (
          <p className="mt-2 text-sm font-bold text-pet-ink">
            Owner: {pet.owner.name}
          </p>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3">
        {visibility.showGeneralArea ? (
          <div className="rounded-[1.25rem] bg-[#e8f3ff] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-pet-ink">
              <Icon name="pin" className="h-4 w-4 text-pet-teal" />
              General area
            </div>
            <p className="mt-2 text-sm text-pet-muted">{pet.generalArea}</p>
          </div>
        ) : null}
        <div className="rounded-[1.25rem] bg-pet-apricot p-4">
          <div className="flex items-center gap-2 text-sm font-black text-pet-ink">
            <Icon name="shield" className="h-4 w-4 text-pet-coral" />
            Safety note
          </div>
          <p className="mt-2 text-sm leading-6 text-pet-muted">
            {pet.safetyNote}
          </p>
        </div>
        {visibility.showEmergencyNote ? (
          <div className="rounded-[1.25rem] bg-pet-cream p-4">
            <div className="flex items-center gap-2 text-sm font-black text-pet-ink">
              <Icon name="record" className="h-4 w-4 text-pet-coral" />
              Emergency note
            </div>
            <p className="mt-2 text-sm leading-6 text-pet-muted">
              {pet.emergencyNote}
            </p>
          </div>
        ) : null}
        <div className="rounded-[1.25rem] bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-black text-pet-ink">
            <Icon name="phone" className="h-4 w-4 text-pet-teal" />
            Contact preference
          </div>
          <p className="mt-2 text-sm text-pet-muted">
            {contactPreference}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {visibility.showWhatsapp && pet.owner.whatsapp ? (
          <CTAButton
            href={`https://wa.me/${pet.owner.whatsapp}?text=${message}`}
            icon="phone"
            target="_blank"
            rel="noopener noreferrer"
            fullWidth
          >
            WhatsApp Owner
          </CTAButton>
        ) : null}
        {visibility.showPhone && pet.owner.phone ? (
          <CTAButton
            href={`tel:${pet.owner.phone}`}
            icon="phone"
            variant="coral"
            fullWidth
          >
            Call Owner
          </CTAButton>
        ) : null}
        {visibility.showWhatsapp && pet.owner.whatsapp ? (
          <CTAButton
            href={`https://wa.me/${pet.owner.whatsapp}?text=${locationMessage}`}
            icon="pin"
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            fullWidth
          >
            Send Found Location
          </CTAButton>
        ) : null}
      </div>

      <p className="mt-5 rounded-[1.25rem] bg-pet-cream p-4 text-center text-xs font-semibold leading-5 text-pet-muted">
        For safety, this profile only shows selected public information. The
        owner&apos;s full address is not shared.
      </p>
    </article>
  );
}

function mergeVisibility(
  visibility?: Partial<Pet["visibility"]>
): Pet["visibility"] {
  return {
    showOwnerName: true,
    showGeneralArea: true,
    showPhone: true,
    showWhatsapp: true,
    showEmergencyNote: true,
    showCareBadges: true,
    showMoments: true,
    showTimeline: true,
    showHealthSummary: false,
    ...visibility,
  };
}
