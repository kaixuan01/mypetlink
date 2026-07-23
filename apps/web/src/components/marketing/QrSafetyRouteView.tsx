"use client";

import { useEffect, useRef, useState } from "react";
import { QrSafetyPageView } from "@/components/marketing/QrSafetyPageView";
import {
  FinderShell,
  TagFinderView,
} from "@/components/portal/TagFinderView";
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
import { getFinderState } from "@/services/tagService";
import type { FinderResult, PublicPetProfile } from "@/types";

type QrSafetyRouteViewProps = {
  initialProfile: PublicPetProfile | null;
  initialTagResult?: FinderResult | null;
  refreshOnMount?: boolean;
  safetyCode: string;
};

export function QrSafetyRouteView({
  initialProfile,
  initialTagResult = null,
  refreshOnMount = true,
  safetyCode,
}: QrSafetyRouteViewProps) {
  const apiMode = isApiConfigured();
  const [profile, setProfile] = useState<PublicPetProfile | null>(() =>
    refreshOnMount && apiMode ? null : initialProfile
  );
  const [tagResult, setTagResult] = useState<FinderResult | null>(() =>
    refreshOnMount && apiMode ? null : initialTagResult
  );
  const [loaded, setLoaded] = useState(
    !refreshOnMount || (!apiMode && Boolean(initialProfile || initialTagResult))
  );
  const [loadError, setLoadError] = useState("");
  const resolvedPetProfile = useRef(Boolean(initialProfile));

  useEffect(() => {
    let active = true;
    async function loadSafetyPage() {
      if (!refreshOnMount) {
        return;
      }
      setLoadError("");

      try {
        const response = await getPublicPetProfileBySafetyCode(safetyCode);
        const nextProfile = response.data;
        const nextTagResult = nextProfile
          ? null
          : await getFinderState(safetyCode, "qr");

        if (active) {
          resolvedPetProfile.current = Boolean(nextProfile);
          setProfile(nextProfile);
          setTagResult(nextTagResult);
          setLoaded(true);
        }
      } catch (caught) {
        if (active) {
          setProfile(null);
          setTagResult(null);
          setLoadError(getSafetyPageErrorMessage(caught));
          setLoaded(true);
        }
      }
    }

    async function refreshConfirmedPetProfile() {
      if (!resolvedPetProfile.current) {
        return;
      }

      try {
        const response = await getPublicPetProfileBySafetyCode(safetyCode);
        if (active) {
          resolvedPetProfile.current = Boolean(response.data);
          setProfile(response.data);
          setTagResult(null);
          setLoadError("");
          setLoaded(true);
        }
      } catch (caught) {
        if (active) {
          setLoadError(getSafetyPageErrorMessage(caught));
        }
      }
    }

    const refreshVisiblePetProfile = () => {
      if (document.visibilityState === "visible") {
        void refreshConfirmedPetProfile();
      }
    };

    void loadSafetyPage();
    window.addEventListener("focus", refreshVisiblePetProfile);
    document.addEventListener("visibilitychange", refreshVisiblePetProfile);

    return () => {
      active = false;
      window.removeEventListener("focus", refreshVisiblePetProfile);
      document.removeEventListener("visibilitychange", refreshVisiblePetProfile);
    };
  }, [refreshOnMount, safetyCode]);

  useEffect(() => {
    if (!loaded) {
      setPageTitle(loadingTitle);
      return;
    }

    // When this /q link turned out to be a physical tag, the tag view below
    // owns the title for every one of its states — setting one here would
    // overwrite it with a Safety Profile message that contradicts the page.
    if (!profile && tagResult && tagResult.state !== "not-found") {
      return;
    }

    setPageTitle(profile ? qrSafetyPageTitle(profile.name) : qrSafetyNotFoundTitle);
  }, [loaded, profile, tagResult]);

  if (tagResult && tagResult.state !== "not-found") {
    return (
      <TagFinderView
        initialResult={tagResult}
        refreshOnMount={false}
        source="qr"
        tagCode={safetyCode}
      />
    );
  }

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
        Safety Profile temporarily unavailable
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
        Safety Profile not found
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
        We could not find an active MyPetLink Safety Profile for this link.
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

  return "We could not load this Safety Profile right now. Please try again.";
}
