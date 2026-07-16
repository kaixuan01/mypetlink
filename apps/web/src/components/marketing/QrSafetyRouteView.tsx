"use client";

import { useEffect, useState } from "react";
import { QrSafetyPageView } from "@/components/marketing/QrSafetyPageView";
import { FinderShell } from "@/components/portal/TagFinderView";
import { Icon } from "@/components/ui/Icon";
import { PetProfileLoading } from "@/components/ui/PetProfileLoading";
import {
  loadingTitle,
  qrSafetyNotFoundTitle,
  qrSafetyPageTitle,
  setPageTitle,
} from "@/lib/pageTitles";
import { isApiClientError } from "@/services/apiClient";
import { isApiConfigured } from "@/services/apiConfig";
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
  const apiMode = isApiConfigured();
  const [profile, setProfile] = useState<PublicPetProfile | null>(() =>
    apiMode ? null : initialProfile
  );
  const [loaded, setLoaded] = useState(!apiMode && Boolean(initialProfile));
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    let loadInFlight = false;

    async function loadSafetyPage() {
      if (loadInFlight) {
        return;
      }

      loadInFlight = true;
      setLoadError("");

      try {
        const response = await getPublicPetProfileBySafetyCode(safetyCode);

        if (active) {
          setProfile(response.data);
          setLoaded(true);
        }
      } catch (caught) {
        if (active) {
          setProfile(null);
          setLoadError(getSafetyPageErrorMessage(caught));
          setLoaded(true);
        }
      } finally {
        loadInFlight = false;
      }
    }

    const refreshVisibleSafetyPage = () => {
      if (document.visibilityState === "visible") {
        void loadSafetyPage();
      }
    };

    void loadSafetyPage();
    window.addEventListener("focus", refreshVisibleSafetyPage);
    document.addEventListener("visibilitychange", refreshVisibleSafetyPage);

    return () => {
      active = false;
      window.removeEventListener("focus", refreshVisibleSafetyPage);
      document.removeEventListener("visibilitychange", refreshVisibleSafetyPage);
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
      {loadError ? (
        <SafetyPageUnavailableCard message={loadError} />
      ) : profile ? (
        <QrSafetyPageView pet={profile} />
      ) : !loaded ? (
        <PetProfileLoading />
      ) : (
        <SafetyPageNotFoundCard safetyCode={safetyCode} />
      )}
    </FinderShell>
  );
}

function SafetyPageUnavailableCard({ message }: { message: string }) {
  return (
    <article className="brand-card mx-auto max-w-xl rounded-[2rem] p-6 text-center sm:p-8">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-[1.5rem] bg-[#e8f3ff] text-pet-teal">
        <Icon name="shield" className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-3xl font-black text-pet-ink">
        QR Safety Page temporarily unavailable
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
        {message}
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

function getSafetyPageErrorMessage(error: unknown) {
  if (isApiClientError(error) && error.status === 0) {
    return "We could not reach MyPetLink right now. Please try again.";
  }

  return "We could not load this QR Safety Page right now. Please try again.";
}
