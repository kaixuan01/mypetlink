"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PublicFinderProfile } from "@/components/marketing/PublicFinderProfile";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { activatePath } from "@/lib/routes";
import { getFinderState } from "@/services/tagService";
import type { FinderResult } from "@/types";

type TagFinderViewProps = {
  initialResult: FinderResult;
  tagCode: string;
};

// Renders the four finder states for a scanned /t/{tagCode}. The page passes a
// build-time result; this component re-checks the live tag state on mount so a
// tag activated, disabled, or reported lost in this browser shows correctly.
export function TagFinderView({ initialResult, tagCode }: TagFinderViewProps) {
  const [result, setResult] = useState(initialResult);

  useEffect(() => {
    let active = true;

    getFinderState(tagCode).then((next) => {
      if (active) {
        setResult(next);
      }
    });

    return () => {
      active = false;
    };
  }, [tagCode]);

  if (result.state === "active") {
    return (
      <FinderShell>
        <PublicFinderProfile pet={result.profile} />
      </FinderShell>
    );
  }

  if (result.state === "unassigned") {
    return (
      <FinderShell>
        <FinderCard
          description="This tag is not linked to any pet yet. Activate it now so your pet can be identified if they ever get lost."
          icon="tag"
          tagCode={result.tagCode}
          title="Activate your MyPetLink Tag"
          tone="teal"
        >
          <CTAButton
            className="min-h-14 text-base"
            href={activatePath(result.tagCode)}
            icon="paw"
            fullWidth
          >
            Activate Tag
          </CTAButton>
        </FinderCard>
      </FinderShell>
    );
  }

  if (result.state === "inactive") {
    return (
      <FinderShell>
        <FinderCard
          description="This MyPetLink tag is not currently linked to an active pet profile. If you found a pet, please look for another tag or contact local animal services."
          icon="shield"
          tagCode={result.tagCode}
          title="This tag is not active"
          tone="soft"
        />
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

function FinderShell({ children }: { children: ReactNode }) {
  return (
    <main className="brand-blue-section min-h-screen px-4 py-5 sm:px-6">
      <header className="mx-auto mb-4 flex max-w-xl items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3">
          <BrandLogo markOnly className="h-10 w-10" />
          <span className="text-sm font-black text-pet-ink">
            MyPetLink Safety Page
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
