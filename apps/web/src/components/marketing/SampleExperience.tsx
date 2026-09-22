"use client";

import { useEffect, useState } from "react";
import { CreateProfileCTA } from "@/components/marketing/CreateProfileCTA";
import { SamplePetPhoto } from "@/components/marketing/SamplePetPhoto";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import {
  staticSampleExperienceDestinations,
  staticSampleExperiencePet,
} from "@/data/publicSample";
import { publicProfilePath, qrSafetyPath } from "@/lib/routes";
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
  // Both cards always open a live sample. When a sample pet is configured its
  // own published links are used; otherwise the site's own published sample
  // pages keep the journey working.
  const publicPath = pet
    ? publicProfilePath(pet.publicSlug, pet.publicCode)
    : staticSampleExperienceDestinations.publicProfilePath;
  const safetyPath = pet
    ? qrSafetyPath(pet.safetyCode)
    : staticSampleExperienceDestinations.safetyProfilePath;

  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-2">
        <article
          className="brand-card flex min-w-0 scroll-mt-28 flex-col overflow-hidden rounded-[2rem]"
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
                  Share Profile
                </p>
                <h2 className="mt-2 break-words text-2xl font-black text-pet-ink sm:text-3xl">
                  {petName}&apos;s Share Profile
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
          >
            <CTAButton
              ariaLabel={`View ${petName}'s sample Share Profile`}
              className="mt-2"
              fullWidth
              href={publicPath}
              icon="heart"
            >
              View Sample Share Profile
            </CTAButton>
          </CardBody>
        </article>

        <article
          className="brand-card flex min-w-0 scroll-mt-28 flex-col overflow-hidden rounded-[2rem]"
          id="safety-profile"
        >
          {/*
            A rehearsal of the real page, not a description of it.

            This card used to be a large QR mark above three bullet points about
            features, which put the way IN to the experience ahead of the
            experience itself and left the card looking half-empty beside the
            profile sample. Somebody deciding whether this is worth setting up
            needs to see what the person holding their lost pet will see: the
            pet, two obvious ways to reach the owner, where it is, and what to
            know before approaching it.

            Everything below is sample data. The two contact controls are not
            links — there is no number here to dial, and a marketing page must
            not be able to place a real call.
          */}
          <div className="brand-paw-dots bg-[#e8f3ff] p-6">
            <div className="flex min-w-0 items-center gap-4">
              <SamplePetPhoto
                name={petName}
                species={petSpecies}
                src={petPhoto}
              />
              <div className="min-w-0">
                <p className="text-sm font-bold uppercase text-pet-teal">
                  Safety Profile
                </p>
                <h2 className="mt-2 break-words text-2xl font-black text-pet-ink sm:text-3xl">
                  Found {petName}?
                </h2>
                <p className="mt-1 text-sm font-semibold text-pet-muted">
                  {petSpecies} · Sample pet
                </p>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">
            <div
              className="grid gap-2 sm:grid-cols-2"
              data-testid="sample-safety-contact"
            >
              {/*
                Buttons, not links. A sample must look like the real controls
                without being able to act like them.
              */}
              <span
                aria-hidden="true"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#25d366] px-4 text-sm font-black text-white"
              >
                <Icon aria-hidden="true" className="h-4 w-4" name="share" />
                WhatsApp owner
              </span>
              <span
                aria-hidden="true"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 text-sm font-black text-pet-ink"
              >
                <Icon aria-hidden="true" className="h-4 w-4" name="qr" />
                Call owner
              </span>
              <span className="sr-only">
                Sample contact buttons. On a real Safety Profile these reach the
                owner by WhatsApp or a phone call.
              </span>
            </div>

            <dl className="grid gap-3">
              <div className="rounded-[1.25rem] border border-pet-border bg-pet-cream p-4">
                <dt className="text-xs font-black uppercase tracking-wide text-pet-muted">
                  General area
                </dt>
                <dd className="mt-1 text-sm font-bold text-pet-ink">
                  Bangsar, Kuala Lumpur
                </dd>
              </div>
              <div className="rounded-[1.25rem] border border-pet-border bg-pet-cream p-4">
                <dt className="text-xs font-black uppercase tracking-wide text-pet-muted">
                  Safety note
                </dt>
                <dd className="mt-1 text-sm font-semibold leading-6 text-pet-ink">
                  {petName} may be nervous around dogs. Approach slowly and
                  speak quietly.
                </dd>
              </div>
            </dl>

            <div className="rounded-[1.25rem] border border-dashed border-pet-border p-4">
              <p className="text-sm font-black text-pet-ink">Found this pet?</p>
              <p className="mt-1 text-sm leading-6 text-pet-muted">
                A finder can send the general area where they found{" "}
                {petName}, when the owner switches it on.
              </p>
              <span
                aria-hidden="true"
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full border border-pet-teal px-4 text-sm font-bold text-pet-teal"
              >
                Share found location
              </span>
            </div>

            <p className="text-xs font-semibold text-pet-muted">
              Sample details only. A real Safety Profile shows the contact
              options its owner switched on, and never a home address.
            </p>

            <div className="mt-auto">
              <CTAButton
                ariaLabel={`Open ${petName}'s sample Safety Profile`}
                fullWidth
                href={safetyPath}
                icon="shield"
                variant="coral"
              >
                View Sample Safety Profile
              </CTAButton>
            </div>
          </div>
        </article>
      </div>

      <section className="mx-auto mt-8 max-w-2xl rounded-[2rem] bg-pet-ink px-6 py-8 text-center text-white sm:px-8">
        <h2 className="text-2xl font-black">Ready to make one for your pet?</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/75">
          Start free, choose what visitors can see, and add a Smart Tag only if
          you want one.
        </p>
        <CreateProfileCTA className="mt-5" />
      </section>
    </div>
  );
}

function CardBody({
  children,
  icon,
  items,
  tone,
}: {
  children?: React.ReactNode;
  icon: "heart" | "shield";
  items: string[];
  tone: string;
}) {
  return (
    <div className="mt-auto grid gap-3 p-6">
      {items.map((item) => (
        <div
          className="flex items-center gap-3 rounded-2xl bg-pet-cream px-4 py-3 text-sm font-bold text-pet-ink"
          key={item}
        >
          <Icon name={icon} className={`h-4 w-4 ${tone}`} />
          {item}
        </div>
      ))}
      {children}
    </div>
  );
}
