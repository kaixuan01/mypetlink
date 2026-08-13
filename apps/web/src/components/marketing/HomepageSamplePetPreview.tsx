"use client";

import { useEffect, useState } from "react";
import { SamplePetPhoto } from "@/components/marketing/SamplePetPhoto";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { formatPetSummaryLabel } from "@/lib/petDisplay";
import {
  getPublicSampleExperience,
  type PublicSampleExperience,
} from "@/services/sampleExperienceService";

const unavailable: PublicSampleExperience = { available: false, pet: null };

export function HomepageSamplePetPreview() {
  const [state, setState] = useState<PublicSampleExperience | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getPublicSampleExperience(controller.signal)
      .then((result) => !controller.signal.aborted && setState(result))
      .catch(() => !controller.signal.aborted && setState(unavailable));
    return () => controller.abort();
  }, []);

  if (!state?.available || !state.pet) {
    return <GenericPreview />;
  }

  const pet = state.pet;
  const summary = formatPetSummaryLabel({
    species: pet.species,
    breed: pet.breed,
    ageDisplayLabel: pet.ageDisplayLabel,
  });

  return (
    <article className="brand-card overflow-hidden rounded-[2rem]">
      <div className="brand-paw-dots min-h-32 bg-[#e8f3ff] p-6">
        <Badge tone="mint">Shareable pet profile</Badge>
      </div>
      <div className="px-6 pb-6">
        <div className="-mt-12 flex min-w-0 items-end gap-4">
          <SamplePetPhoto
            name={pet.name}
            species={pet.species}
            src={pet.profilePhotoUrl}
            size="xl"
          />
          <div className="min-w-0 rounded-[1.5rem] bg-white/95 p-4 shadow-sm">
            <h2 className="break-words text-2xl font-black text-pet-ink">
              {pet.name}
            </h2>
            {summary ? (
              <p className="mt-1 text-sm font-bold text-pet-muted">{summary}</p>
            ) : null}
          </div>
        </div>
        {pet.bio ? (
          <p className="mt-5 line-clamp-3 text-sm leading-6 text-pet-muted">
            {pet.bio}
          </p>
        ) : null}
        <div className="mt-5 rounded-[1.5rem] bg-pet-cream p-4">
          <p className="break-words text-xs font-bold uppercase tracking-[0.08em] text-pet-muted">
            If someone finds {pet.name}
          </p>
          <div className="mt-2 flex flex-wrap gap-2" aria-label="Finder contact options">
            <ContactOption icon="phone">WhatsApp owner</ContactOption>
            <ContactOption icon="phone" tone="text-pet-blue">Call owner</ContactOption>
          </div>
          <p className="mt-2 text-sm leading-5 text-pet-muted">
            Found location can be shared with the owner.
          </p>
        </div>
      </div>
    </article>
  );
}

function ContactOption({ children, icon, tone = "text-pet-teal" }: { children: React.ReactNode; icon: "phone"; tone?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-black text-pet-ink shadow-sm">
      <Icon name={icon} className={`h-4 w-4 ${tone}`} />
      {children}
    </span>
  );
}

function GenericPreview() {
  return (
    <article className="brand-card overflow-hidden rounded-[2rem]">
      <div className="brand-paw-dots min-h-32 bg-[#e8f3ff] p-6">
        <Badge tone="mint">Shareable pet profile</Badge>
      </div>
      <div className="px-6 pb-6 text-center">
        <span className="mx-auto -mt-12 grid h-24 w-24 place-items-center rounded-[2rem] border-4 border-white bg-white text-pet-teal shadow-lg">
          <Icon name="pets" className="h-10 w-10" />
        </span>
        <h2 className="mt-5 text-xl font-black text-pet-ink">
          Your pet&apos;s shareable profile
        </h2>
        <p className="mt-2 text-sm leading-6 text-pet-muted">
          Bring their photo, personality, moments, and owner-approved details
          together in one warm page.
        </p>
      </div>
    </article>
  );
}
