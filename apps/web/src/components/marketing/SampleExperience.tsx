"use client";

import { useEffect, useState } from "react";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
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

  if (!state) {
    return <Fallback title="Loading the Sample Experience…" />;
  }
  if (!state.available || !state.pet) {
    return <Fallback title="The Sample Experience is being prepared" />;
  }

  const pet = state.pet;
  const publicPath = publicProfilePath(pet.publicSlug, pet.publicCode);
  const safetyPath = qrSafetyPath(pet.safetyCode);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <article className="brand-card min-w-0 overflow-hidden rounded-[2rem]">
        <div className="brand-paw-dots bg-pet-apricot p-6">
          <div className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-center">
            <PetPhoto name={pet.name} src={pet.profilePhotoUrl} />
            <div className="min-w-0">
              <p className="text-sm font-bold uppercase text-pet-coral">Public Share Profile</p>
              <h2 className="mt-2 break-words text-2xl font-black text-pet-ink sm:text-3xl">
                {pet.name}&apos;s mini website
              </h2>
              <p className="mt-2 text-sm leading-6 text-pet-muted">
                A warm pet page for family and friends, with approved details, moments, care badges, and a shareable link.
              </p>
            </div>
          </div>
        </div>
        <CardBody icon="heart" tone="text-pet-coral" items={[
          "Cute pet intro and favourite things",
          "Public moments and life timeline",
          "Only owner-approved details are shown",
        ]}>
          <CTAButton href={publicPath} icon="heart" className="mt-2">View Sample Public Profile</CTAButton>
        </CardBody>
      </article>

      <article className="brand-card min-w-0 overflow-hidden rounded-[2rem]">
        <div className="brand-paw-dots bg-[#e8f3ff] p-6">
          <div className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-center">
            <span className="grid h-24 w-24 shrink-0 place-items-center rounded-[2rem] border-4 border-white bg-white text-pet-teal shadow-lg">
              <Icon name="qr" className="h-10 w-10" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold uppercase text-pet-teal">Safety Profile</p>
              <h2 className="mt-2 break-words text-2xl font-black text-pet-ink sm:text-3xl">Found {pet.name}?</h2>
              <p className="mt-2 text-sm leading-6 text-pet-muted">
                A contact-focused pet page for finders, with large action buttons and safe location guidance.
              </p>
            </div>
          </div>
        </div>
        <CardBody icon="shield" tone="text-pet-teal" items={[
          "WhatsApp owner, call owner, and found-location actions",
          "Safety note, emergency note, and general area",
          "No full owner address shown",
        ]}>
          <CTAButton href={safetyPath} icon="qr" variant="coral" className="mt-2">View Sample Safety Profile</CTAButton>
        </CardBody>
      </article>
    </div>
  );
}

function PetPhoto({ name, src }: { name: string; src: string | null }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={`${name}'s profile`} className="h-24 w-24 shrink-0 rounded-[2rem] border-4 border-white object-cover shadow-lg" src={src} />
  ) : (
    <span aria-hidden="true" className="grid h-24 w-24 shrink-0 place-items-center rounded-[2rem] border-4 border-white bg-white text-3xl font-black text-pet-coral shadow-lg">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function CardBody({ children, icon, items, tone }: { children: React.ReactNode; icon: "heart" | "shield"; items: string[]; tone: string }) {
  return <div className="grid gap-3 p-6">{items.map((item) => (
    <div className="flex items-center gap-3 rounded-2xl bg-pet-cream px-4 py-3 text-sm font-bold text-pet-ink" key={item}>
      <Icon name={icon} className={`h-4 w-4 ${tone}`} />{item}
    </div>
  ))}{children}</div>;
}

function Fallback({ title }: { title: string }) {
  return (
    <div className="brand-card rounded-[2rem] p-8 text-center" role="status">
      <span className="mx-auto grid h-20 w-20 place-items-center rounded-[1.75rem] bg-pet-cream text-pet-teal"><Icon name="pets" className="h-9 w-9" /></span>
      <h2 className="mt-5 text-2xl font-black text-pet-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-pet-muted">Please check again soon. No pet information is shown until an approved sample is ready.</p>
    </div>
  );
}
