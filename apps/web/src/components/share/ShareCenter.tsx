"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "@/components/portal/PublicLinkActions";
import { PetShareCard } from "@/components/share/PetShareCard";
import { QrCodeCard } from "@/components/qr/QrCodeCard";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  AnalyticsEvent,
  trackEvent,
  type AnalyticsSurface,
} from "@/lib/analytics";
import {
  publicProfilesEnabled,
  safetyProfilesOwnerUiEnabled,
  shareCardsEnabled,
} from "@/lib/features";
import { isActivePet } from "@/lib/petLifecycle";
import {
  getAvailablePetShareCardOptions,
  getPublicProfileShareCardImagePath,
  getPublicProfileShareVersion,
} from "@/lib/publicProfileSocial";
import { toAbsoluteUrl } from "@/lib/siteUrl";
import { useModalDialogFocus } from "@/lib/useModalDialogFocus";
import type { Pet } from "@/types";

type ShareCenterProps = {
  pet: Pet;
  /** Rendered inside the trigger button. Defaults to a "Share" label. */
  triggerLabel?: React.ReactNode;
  triggerClassName?: string;
  triggerAriaLabel?: string;
  analyticsSurface?: Extract<
    AnalyticsSurface,
    "owner_portal" | "public_profile"
  >;
};

/** Which panel of the Share Center is showing. */
type ShareView = "home" | "public-qr" | "more" | "safety-qr";

const primaryTriggerClass =
  "inline-flex min-h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-pet-teal bg-pet-teal px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#0f5fd0]";

/**
 * One share entry point for a pet, used by the Dashboard, the pet detail page
 * and the owner controls on a Public Profile.
 *
 * Owners think "I want to share my pet", so the first level offers only four
 * choices and everything rarer — downloads, opening pages, and the separate
 * finder-facing Safety Profile — sits behind "More sharing options".
 */
export function ShareCenter({
  pet,
  triggerLabel,
  triggerClassName = primaryTriggerClass,
  triggerAriaLabel,
  analyticsSurface = "owner_portal",
}: ShareCenterProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ShareView>("home");
  const [status, setStatus] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    // Return focus to the control the owner actually pressed.
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  function openShareCenter() {
    // Always start at the first level, whatever the last visit ended on.
    setView("home");
    setStatus("");
    setOpen(true);
  }

  useModalDialogFocus({
    dialogRef,
    initialFocusRef: closeRef,
    onEscape: close,
    enabled: open,
  });

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 3000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const publicShareable = publicProfilesEnabled && pet.publicProfileEnabled;
  const safetyShareable =
    safetyProfilesOwnerUiEnabled && pet.qrSafetyEnabled && isActivePet(pet);
  const profileUrl = toAbsoluteUrl(pet.publicProfilePath);
  const safetyUrl = toAbsoluteUrl(pet.qrSafetyPath);

  async function copy(url: string, message: string, surface: AnalyticsSurface) {
    const copied = await copyTextToClipboard(url);
    if (copied) {
      trackEvent(AnalyticsEvent.ShareLinkCopied, {
        surface: surface as "owner_portal" | "public_profile",
      });
    }
    setStatus(
      copied
        ? message
        : "We couldn't copy automatically. Open the page and copy the address.",
    );
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={triggerAriaLabel ?? `Share ${pet.name}`}
        className={triggerClassName}
        onClick={openShareCenter}
        ref={triggerRef}
        type="button"
      >
        {triggerLabel ?? (
          <>
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" name="copy" />
            Share
          </>
        )}
      </button>

      {open ? (
        <div
          aria-labelledby="share-center-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#102247]/55 p-0 sm:items-center sm:p-6"
          data-share-center
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          role="dialog"
        >
          {/* Full-width sheet on phones, centred dialog from sm upwards. */}
          <section
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] bg-pet-cream p-5 shadow-2xl sm:max-h-[calc(100dvh-4rem)] sm:rounded-[1.75rem]"
            ref={dialogRef}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {view === "home" ? (
                  <>
                    <h2
                      className="break-words text-xl font-black leading-7 text-pet-ink"
                      id="share-center-title"
                    >
                      Share {pet.name}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-pet-muted">
                      {`Share ${pet.name} with friends, family, or anyone who'd love to meet them.`}
                    </p>
                  </>
                ) : (
                  <>
                    {/* Keeps the dialog named on every panel, not just the first. */}
                    <h2 className="sr-only" id="share-center-title">
                      Share {pet.name}
                    </h2>
                    <button
                      className="inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-pet-teal"
                      onClick={() =>
                        setView(view === "safety-qr" ? "more" : "home")
                      }
                      type="button"
                    >
                      <Icon
                        aria-hidden="true"
                        className="h-4 w-4"
                        name="chevron"
                      />
                      Back
                    </button>
                  </>
                )}
              </div>
              <button
                aria-label="Close share options"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-pet-border bg-white text-pet-ink transition hover:bg-pet-cream"
                onClick={close}
                ref={closeRef}
                type="button"
              >
                <Icon aria-hidden="true" className="h-5 w-5" name="close" />
              </button>
            </div>

            {view === "home" ? (
              <div className="mt-5 grid gap-2.5">
                {shareCardsEnabled && publicShareable ? (
                  <PetShareCard
                    imagePath={getPublicProfileShareCardImagePath(pet)}
                    petName={pet.name}
                    profilePath={pet.publicProfilePath}
                    shareVersion={getPublicProfileShareVersion(pet)}
                    triggerClassName="flex w-full min-w-0 items-center gap-3 rounded-[1.35rem] border border-pet-teal bg-pet-teal p-4 text-left text-white shadow-sm transition hover:bg-[#0f5fd0]"
                    triggerLabel={
                      <>
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20">
                          <Icon
                            aria-hidden="true"
                            className="h-5 w-5"
                            name="heart"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-black leading-6">
                            Share Pet Card
                          </span>
                          <span className="mt-0.5 block text-xs font-semibold leading-5 text-white/85">
                            A beautiful card with {pet.name}&apos;s photo and
                            profile QR.
                          </span>
                        </span>
                      </>
                    }
                    variants={getAvailablePetShareCardOptions(pet)}
                  />
                ) : null}

                {publicShareable ? (
                  <>
                    <ShareRow
                      description="Paste it anywhere."
                      icon="copy"
                      label="Copy Profile Link"
                      onClick={() =>
                        void copy(
                          profileUrl,
                          `${pet.name}'s profile link copied.`,
                          analyticsSurface,
                        )
                      }
                    />
                    <ShareRow
                      description={`Anyone can scan to meet ${pet.name}.`}
                      icon="qr"
                      label="Show QR"
                      onClick={() => setView("public-qr")}
                    />
                  </>
                ) : (
                  <p className="rounded-[1.25rem] border border-pet-border bg-white px-4 py-3.5 text-sm font-semibold leading-6 text-pet-muted">
                    {pet.name}&apos;s public profile is switched off, so there
                    is nothing to share yet.
                  </p>
                )}

                <ShareRow
                  description="Downloads, and the page for finders."
                  icon="settings"
                  label="More sharing options"
                  onClick={() => setView("more")}
                />
              </div>
            ) : null}

            {view === "public-qr" ? (
              <div className="mt-5">
                <QrCodeCard
                  fileNameBase={`${pet.slug}-public-profile-qr`}
                  helperText={`Scan to view ${pet.name}'s profile`}
                  targetPath={pet.publicProfilePath}
                  title={`${pet.name}'s Public Profile`}
                  viewLabel="Open Public Profile"
                />
              </div>
            ) : null}

            {view === "more" ? (
              <div className="mt-5 grid gap-4">
                <div className="grid gap-2.5">
                  {publicShareable ? (
                    <>
                      <ShareRow
                        icon="qr"
                        label="Download Public Profile QR"
                        onClick={() => setView("public-qr")}
                      />
                      <ShareRow
                        href={pet.publicProfilePath}
                        icon="paw"
                        label="Open Public Profile"
                      />
                    </>
                  ) : null}
                </div>

                {safetyShareable ? (
                  <div className="rounded-[1.35rem] border border-pet-border bg-white p-4">
                    <h3 className="text-sm font-black text-pet-ink">
                      Safety Profile
                    </h3>
                    <p className="mt-1 text-xs font-semibold leading-5 text-pet-muted">
                      For someone who finds {pet.name}.
                    </p>
                    <div className="mt-3 grid gap-2.5">
                      <ShareRow
                        icon="copy"
                        label="Copy Safety Profile Link"
                        onClick={() =>
                          void copy(
                            safetyUrl,
                            "Safety Profile link copied.",
                            analyticsSurface,
                          )
                        }
                        tone="plain"
                      />
                      <ShareRow
                        icon="qr"
                        label="Show Safety QR"
                        onClick={() => setView("safety-qr")}
                        tone="plain"
                      />
                      <ShareRow
                        href={pet.qrSafetyPath}
                        icon="shield"
                        label="Open Safety Profile"
                        tone="plain"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {view === "safety-qr" ? (
              <div className="mt-5">
                <QrCodeCard
                  fileNameBase={`${pet.slug}-safety-profile-qr`}
                  helperText={`Scan if you have found ${pet.name}`}
                  targetPath={pet.qrSafetyPath}
                  title={`${pet.name}'s Safety Profile`}
                  viewLabel="Open Safety Profile"
                />
              </div>
            ) : null}

            {status ? (
              <p
                aria-live="polite"
                className="mt-4 rounded-[1rem] bg-white px-4 py-3 text-sm font-bold text-pet-sage"
                role="status"
              >
                {status}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

function ShareRow({
  description,
  href,
  icon,
  label,
  onClick,
  tone = "card",
}: {
  description?: string;
  href?: string;
  icon: IconName;
  label: string;
  onClick?: () => void;
  tone?: "card" | "plain";
}) {
  const className = [
    "flex w-full min-w-0 items-center gap-3 rounded-[1.25rem] px-4 py-3 text-left transition",
    tone === "card"
      ? "border border-pet-border bg-white hover:bg-white/70"
      : "bg-pet-cream hover:bg-pet-cream/70",
    "min-h-[3.25rem]",
  ].join(" ");

  const content = (
    <>
      <Icon
        aria-hidden="true"
        className="h-5 w-5 shrink-0 text-pet-teal"
        name={icon}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold leading-5 text-pet-ink">
          {label}
        </span>
        {description ? (
          <span className="mt-0.5 block text-xs font-semibold leading-5 text-pet-muted">
            {description}
          </span>
        ) : null}
      </span>
    </>
  );

  if (href) {
    return (
      <a
        className={className}
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {content}
      </a>
    );
  }

  return (
    <button className={className} onClick={onClick} type="button">
      {content}
    </button>
  );
}
