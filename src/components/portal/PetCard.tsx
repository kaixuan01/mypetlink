import { ProfileAccessBadges } from "@/components/portal/ProfileAccessStatus";
import { CTAButton } from "@/components/ui/CTAButton";
import { PetAvatar } from "@/components/ui/PetAvatar";
import type { Pet } from "@/types";

type PetCardProps = {
  pet: Pet;
};

export function PetCard({ pet }: PetCardProps) {
  return (
    <article className="brand-card rounded-[1.75rem] p-5">
      <div className="flex items-start gap-4">
        <PetAvatar pet={pet} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-black text-pet-ink">{pet.name}</h3>
            <ProfileAccessBadges qrStatus={pet.qrStatus} />
          </div>
          <p className="mt-1 text-sm text-pet-muted">
            {pet.species} - {pet.breed} - {pet.ageLabel}
          </p>
          <p className="mt-3 text-sm leading-6 text-pet-muted">
            {pet.safetyNote}
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CTAButton href={`/pets/${pet.id}`} variant="secondary" fullWidth>
          Details
        </CTAButton>
        <CTAButton href={`/pets/${pet.id}/edit`} variant="outline" fullWidth>
          Edit
        </CTAButton>
        <CTAButton href={`/pets/${pet.id}/records`} variant="outline" fullWidth>
          Records
        </CTAButton>
        <CTAButton href={`/pets/${pet.id}/moments`} variant="outline" fullWidth>
          Moments
        </CTAButton>
        <CTAButton href={`/pets/${pet.id}/qr`} variant="outline" fullWidth>
          QR Profile
        </CTAButton>
        <CTAButton href={`/pets/${pet.id}/tags`} variant="outline" fullWidth>
          Smart Tags
        </CTAButton>
        <CTAButton href={`/pets/${pet.id}/tags/order`} variant="outline" fullWidth>
          Order Tag
        </CTAButton>
        <CTAButton href={pet.publicProfileUrl} variant="outline" fullWidth>
          Public Profile
        </CTAButton>
      </div>
    </article>
  );
}
