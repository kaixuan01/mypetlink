"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { QrSafetyPageView } from "@/components/marketing/QrSafetyPageView";
import { TagActivationFlow } from "@/components/portal/TagActivationFlow";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PetProfileLoading } from "@/components/ui/PetProfileLoading";
import {
  loadingTitle,
  setPageTitle,
  tagNotFoundTitle,
  tagScanPageTitle,
} from "@/lib/pageTitles";
import {
  getFinderState,
  getFriendlyTagErrorMessage,
} from "@/services/tagService";
import type { FinderResult } from "@/types";

type TagFinderViewProps = {
  initialResult: FinderResult;
  tagCode: string;
};

// Renders the finder states for a scanned physical /t/{tagCode}. Active
// tags show pet Safety Profile content; inactive tags stay safely inactive.
// The page passes a build-time result; this component re-checks the live tag
// state on mount so a tag activated, disabled, or reported lost in this browser
// shows correctly.
export function TagFinderView({ initialResult, tagCode }: TagFinderViewProps) {
  const [result, setResult] = useState(initialResult);
  const [loaded, setLoaded] = useState(initialResult.state !== "not-found");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;

    getFinderState(tagCode)
      .then((next) => {
        if (active) {
          setResult(next);
          setLoadError("");
          setLoaded(true);
        }
      })
      .catch((caught) => {
        if (active) {
          setLoadError(getFriendlyTagErrorMessage(caught));
          setLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, [tagCode]);

  useEffect(() => {
    setPageTitle(loaded ? finderPageTitle(result) : loadingTitle);
  }, [loaded, result]);

  if (!loaded) {
    return (
      <FinderShell>
        <PetProfileLoading />
      </FinderShell>
    );
  }

  if (loadError) {
    return (
      <FinderShell>
        <FinderCard
          description={loadError}
          icon="shield"
          tagCode={tagCode}
          title="Tag status unavailable"
          tone="soft"
        />
      </FinderShell>
    );
  }

  if (result.state === "active") {
    return (
      <FinderShell>
        <QrSafetyPageView pet={result.profile} />
      </FinderShell>
    );
  }

  if (result.state === "unassigned") {
    return <TagActivationFlow initialResult={result} tagCode={tagCode} />;
  }

  if (result.state === "pending") {
    return <TagActivationFlow initialResult={result} tagCode={tagCode} />;
  }

  if (result.state === "inactive") {
    const inactiveCopy = getInactiveTagCopy(result);
    const showMemorialLink =
      result.reason === "memorial" &&
      result.profile?.memorial.showMemorialOnPublicProfile;

    return (
      <FinderShell>
        <FinderCard
          description={inactiveCopy.description}
          icon="shield"
          tagCode={result.tagCode}
          title={inactiveCopy.title}
          tone="soft"
        >
          {showMemorialLink && result.profile ? (
            <CTAButton
              className="min-h-14 text-base"
              href={result.profile.publicProfilePath}
              icon="heart"
              variant="secondary"
              fullWidth
            >
              View Memorial Profile
            </CTAButton>
          ) : null}
        </FinderCard>
      </FinderShell>
    );
  }

  return (
    <FinderShell>
      <FinderCard
        description="We could not find a MyPetLink tag with this code. Please check the code printed on the tag and try scanning again."
        icon="qr"
        tagCode={result.tagCode}
        title="Tag not found"
        tone="soft"
      />
    </FinderShell>
  );
}

function getInactiveTagCopy(result: Extract<FinderResult, { state: "inactive" }>) {
  if (result.reason === "memorial" && result.profile) {
    return {
      title: "This tag is no longer active",
      description: `${result.profile.name}'s profile is now kept as a memorial. This tag does not show finder contact details.`,
    };
  }

  if (result.reason === "archived" && result.profile) {
    return {
      title: "This tag is no longer active",
      description: `${result.profile.name}'s profile is archived. This tag does not show finder contact details.`,
    };
  }

  return {
    title: "This tag is no longer active",
    description:
      "This MyPetLink tag has been reported lost, disabled, or replaced by its owner. If you found this physical tag, please contact MyPetLink support.",
  };
}

function finderPageTitle(result: FinderResult) {
  switch (result.state) {
    case "active":
      return tagScanPageTitle(result.profile.name);
    case "not-found":
      return tagNotFoundTitle;
    case "unassigned":
      return "Activate MyPetLink Tag";
    case "pending":
      return "MyPetLink Tag Pending";
    case "inactive":
    default:
      return "Inactive MyPetLink Tag";
  }
}

export function FinderShell({ children }: { children: ReactNode }) {
  return (
    <main className="brand-blue-section min-h-screen px-4 py-5 sm:px-6">
      <header className="mx-auto mb-4 flex max-w-xl items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3">
          <BrandLogo markOnly className="h-10 w-10" />
          <span className="text-sm font-black text-pet-ink">
            MyPetLink Safety Profile
          </span>
        </Link>
      </header>
      {children}
      <p className="mx-auto mt-5 max-w-xl text-center text-xs font-semibold text-pet-muted">
        <Link href="/" className="font-black text-pet-teal underline">
          What is MyPetLink?
        </Link>
      </p>
    </main>
  );
}

function FinderCard({
  children,
  description,
  icon,
  tagCode,
  title,
  tone,
}: {
  children?: ReactNode;
  description: string;
  icon: IconName;
  tagCode: string;
  title: string;
  tone: "teal" | "soft";
}) {
  const iconWrap =
    tone === "teal"
      ? "bg-[#e8f3ff] text-pet-teal"
      : "bg-pet-cream text-pet-muted";

  return (
    <article className="brand-card mx-auto max-w-xl rounded-[2rem] p-6 text-center sm:p-8">
      <span
        className={`mx-auto grid h-16 w-16 place-items-center rounded-[1.5rem] ${iconWrap}`}
      >
        <Icon name={icon} className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-3xl font-black text-pet-ink">{title}</h1>
      <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
        {description}
      </p>
      <div className="mx-auto mt-5 flex flex-col items-center rounded-[1.25rem] bg-pet-cream px-5 py-3">
        <span className="text-xs font-bold uppercase text-pet-muted">
          Tag code
        </span>
        <span className="mt-1 font-black tracking-wide text-pet-ink">
          {tagCode}
        </span>
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </article>
  );
}
