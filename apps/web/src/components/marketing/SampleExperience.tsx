"use client";

import { useEffect, useState } from "react";
import { CreateProfileCTA } from "@/components/marketing/CreateProfileCTA";
import { SamplePetPhoto } from "@/components/marketing/SamplePetPhoto";
import { Icon } from "@/components/ui/Icon";
import { staticSampleExperiencePet } from "@/data/publicSample";
import {
  getPublicSampleExperience,
  type PublicSampleExperience as SampleState,
} from "@/services/sampleExperienceService";

const unavailable: SampleState = { available: false, pet: null };

export function SampleExperience() {
  const [state, setState] = useState<SampleState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getPublicSampleExperience(controller.signal)
      .then((result) => !controller.signal.aborted && setState(result))
      .catch(() => !controller.signal.aborted && setState(unavailable));
    return () => controller.abort();
  }, []);

  const pet = state?.available ? state.pet : null;
  const petName = pet?.name ?? staticSampleExperiencePet.name;
  const petSpecies = pet?.species ?? staticSampleExperiencePet.species;
  const petPhoto = pet?.profilePhotoUrl ?? staticSampleExperiencePet.profilePhotoUrl;
  const petBio = pet?.bio ?? staticSampleExperiencePet.bio;

  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-2">
        <article
          className="brand-card min-w-0 scroll-mt-28 overflow-hidden rounded-[2rem]"
          id="public-share-profile"
        >
          <div className="brand-paw-dots bg-pet-apricot p-6">
            <div className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-center">
              <SamplePetPhoto
                name={petName}
                species={petSpecies}
                src={petPhoto}
              />
              <div className="min-w-0">
                <p className="text-sm font-bold uppercase text-pet-coral">
                  Public Share Profile
                </p>
                <h2 className="mt-2 break-words text-2xl font-black text-pet-ink sm:text-3xl">
                  {petName}&apos;s mini website
                </h2>
                <p className="mt-2 text-sm leading-6 text-pet-muted">
                  A warm pet page for family and friends, with approved details,
                  moments, care badges, and a shareable link.
                </p>
              </div>
            </div>
          </div>
          <div className="px-6 pt-6">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-pet-muted">
              About {petName}
            </p>
            <p className="mt-2 text-sm leading-6 text-pet-muted">{petBio}</p>
            <div
              className="mt-4 flex flex-wrap gap-2"
              aria-label="Public profile highlights"
            >
              <span className="rounded-full bg-pet-apricot px-3 py-1.5 text-xs font-black text-pet-coral">
                Moments
              </span>
              <span className="rounded-full bg-[#e8f3ff] px-3 py-1.5 text-xs font-black text-pet-teal">
                Life Timeline
              </span>
            </div>
          </div>
          <CardBody
            icon="heart"
            items={[
              "Cute pet intro and favourite things",
              "Public moments and life timeline",
              "Only owner-approved details are shown",
            ]}
            tone="text-pet-coral"
          />
        </article>

        <article
          className="brand-card min-w-0 scroll-mt-28 overflow-hidden rounded-[2rem]"
          id="safety-profile"
        >
          <div className="brand-paw-dots bg-[#e8f3ff] p-6">
            <div className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-center">
              <span className="grid h-24 w-24 shrink-0 place-items-center rounded-[2rem] border-4 border-white bg-white text-pet-teal shadow-lg">
                <Icon name="qr" className="h-10 w-10" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold uppercase text-pet-teal">
                  Safety Profile
                </p>
                <h2 className="mt-2 break-words text-2xl font-black text-pet-ink sm:text-3xl">
                  Found {petName}?
                </h2>
                <p className="mt-2 text-sm leading-6 text-pet-muted">
                  A contact-focused pet page for finders, with large action
                  buttons and safe location guidance.
                </p>
              </div>
            </div>
          </div>
          <CardBody
            icon="shield"
            items={[
              "WhatsApp owner, call owner, and found-location actions",
              "Safety note, emergency note, and general area",
              "No full owner address shown",
            ]}
            tone="text-pet-teal"
          />
        </article>
      </div>

      <section className="mx-auto mt-8 max-w-2xl rounded-[2rem] bg-pet-ink px-6 py-8 text-center text-white sm:px-8">
        <h2 className="text-2xl font-black">Ready to make one for your pet?</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/75">
          Start free, choose what visitors can see, and add a Smart Tag only if
          you want one.
        </p>
        <CreateProfileCTA className="mt-5">
          Create Your Pet&apos;s Profile
        </CreateProfileCTA>
      </section>
    </div>
  );
}

function CardBody({
  icon,
  items,
  tone,
}: {
  icon: "heart" | "shield";
  items: string[];
  tone: string;
}) {
  return (
    <div className="grid gap-3 p-6">
      {items.map((item) => (
        <div
          className="flex items-center gap-3 rounded-2xl bg-pet-cream px-4 py-3 text-sm font-bold text-pet-ink"
          key={item}
        >
          <Icon name={icon} className={`h-4 w-4 ${tone}`} />
          {item}
        </div>
      ))}
    </div>
  );
}
