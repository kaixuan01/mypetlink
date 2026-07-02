"use client";

import { useEffect, useState } from "react";
import { QrSafetyPageView } from "@/components/marketing/QrSafetyPageView";
import { FinderShell } from "@/components/portal/TagFinderView";
import { Icon } from "@/components/ui/Icon";
import {
  loadingTitle,
  qrSafetyNotFoundTitle,
  qrSafetyPageTitle,
  setPageTitle,
} from "@/lib/pageTitles";
import { getPublicPetProfileBySafetyCode } from "@/services/petService";
import type { PublicPetProfile } from "@/types";

type QrSafetyRouteViewProps = {
  initialProfile: PublicPetProfile | null;
  safetyCode: string;
};

export function QrSafetyRouteView({
  initialProfile,
  safetyCode,
}: QrSafetyRouteViewProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [loaded, setLoaded] = useState(Boolean(initialProfile));

  useEffect(() => {
    let active = true;

    getPublicPetProfileBySafetyCode(safetyCode).then((response) => {
      if (active) {
        setProfile(response.data);
        setLoaded(true);
      }
    });

    return () => {
      active = false;
    };
  }, [safetyCode]);

  useEffect(() => {
    if (!loaded) {
      setPageTitle(loadingTitle);
      return;
    }

    setPageTitle(
      profile ? qrSafetyPageTitle(profile.name) : qrSafetyNotFoundTitle
    );
  }, [loaded, profile]);

  return (
    <FinderShell>
      {profile ? (
        <QrSafetyPageView pet={profile} />
      ) : !loaded ? (
        <SafetyPageLoadingCard />
      ) : (
        <SafetyPageNotFoundCard safetyCode={safetyCode} />
      )}
    </FinderShell>
  );
}

function SafetyPageLoadingCard() {
  return (
    <article className="brand-card mx-auto max-w-xl rounded-[2rem] p-6 text-center sm:p-8">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-[1.5rem] bg-[#e8f3ff] text-pet-teal">
        <Icon name="shield" className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-3xl font-black text-pet-ink">
        Loading QR Safety Page
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
        Checking the latest saved pet safety details for this link.
      </p>
    </article>
  );
}

function SafetyPageNotFoundCard({ safetyCode }: { safetyCode: string }) {
  return (
    <article className="brand-card mx-auto max-w-xl rounded-[2rem] p-6 text-center sm:p-8">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-[1.5rem] bg-pet-cream text-pet-muted">
        <Icon name="shield" className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-3xl font-black text-pet-ink">
        QR Safety Page not found
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
        We could not find an active MyPetLink QR Safety Page for this link.
        Please check with the pet owner for the latest profile.
      </p>
      <div className="mx-auto mt-5 flex flex-col items-center rounded-[1.25rem] bg-pet-cream px-5 py-3">
        <span className="text-xs font-bold uppercase text-pet-muted">
          Safety code
        </span>
        <span className="mt-1 break-all font-black tracking-wide text-pet-ink">
          {safetyCode}
        </span>
      </div>
    </article>
  );
}
