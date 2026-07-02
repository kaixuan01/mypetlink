"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import type { PetProfileTheme } from "@/lib/petProfileThemes";

type ShareProfileLinkProps = {
  path: string;
  petName?: string;
  className?: string;
  label?: string;
  showShareButton?: boolean;
  compact?: boolean;
  copyLabel?: string;
  theme?: PetProfileTheme;
};

export function ShareProfileLink({
  path,
  petName = "this pet",
  className = "",
  label = "Share profile link",
  showShareButton = false,
  compact = false,
  copyLabel = "Copy Link",
  theme,
}: ShareProfileLinkProps) {
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getBrowserOrigin,
    getDefaultOrigin
  );
  const [status, setStatus] = useState<{
    message: string;
    url: string;
  } | null>(null);

  const fullUrl = useMemo(() => {
    if (path.startsWith("http")) {
      return path;
    }

    return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  }, [origin, path]);
  const visibleStatus = status?.url === fullUrl ? status.message : "";

  useEffect(() => {
    if (!visibleStatus) {
      return;
    }

    const timer = window.setTimeout(() => setStatus(null), 4000);
    return () => window.clearTimeout(timer);
  }, [visibleStatus]);

  async function copyLink() {
    setStatus(null);

    if (await writeTextToClipboard(fullUrl)) {
      setStatus({ message: "Profile link copied.", url: fullUrl });
      return true;
    }

    setStatus({
      message: "Unable to copy automatically. Please copy the link manually.",
      url: fullUrl,
    });
    return false;
  }

  async function shareProfile() {
    setStatus(null);

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${petName}'s MyPetLink Profile`,
          text: `View ${petName}'s pet profile on MyPetLink.`,
          url: fullUrl,
        });
        setStatus({ message: "Profile shared.", url: fullUrl });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    await copyLink();
  }

  if (compact) {
    return (
      <div
        className={["flex flex-col items-center gap-2", className]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="flex flex-wrap items-center justify-center gap-2">
          {showShareButton ? (
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-pet-teal bg-pet-teal px-4 py-2 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#0f5fd0]"
              style={
                theme
                  ? {
                      background: theme.colors.buttonBackground,
                      borderColor: theme.colors.buttonBackground,
                      color: theme.colors.buttonText,
                    }
                  : undefined
              }
              onClick={shareProfile}
              type="button"
            >
              <Icon name="heart" className="h-4 w-4" />
              Share profile
            </button>
          ) : null}
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
            style={
              theme
                ? {
                    background: theme.colors.surface,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                  }
                : undefined
            }
            onClick={copyLink}
            type="button"
          >
            <Icon name="qr" className="h-4 w-4" />
            {copyLabel}
          </button>
        </div>
        {visibleStatus ? (
          <p
            aria-live="polite"
            className="text-xs font-bold text-pet-sage"
            style={theme ? { color: theme.colors.primary } : undefined}
            role="status"
          >
            {visibleStatus}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section
      className={[
        "rounded-[1.75rem] border border-pet-border bg-white/95 p-5 shadow-lg shadow-[#0d1b3d]/5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        theme
          ? {
              background: theme.colors.surface,
              borderColor: theme.colors.border,
            }
          : undefined
      }
    >
      <div className="grid gap-3">
        <p
          className="text-xs font-bold uppercase text-pet-muted"
          style={theme ? { color: theme.colors.mutedText } : undefined}
        >
          {label}
        </p>
        <div
          aria-label={label}
          aria-readonly="true"
          className="select-all break-all rounded-[1.25rem] border border-pet-border bg-pet-cream px-4 py-3 text-sm font-bold leading-6 text-pet-ink shadow-inner shadow-[#0d1b3d]/5 sm:text-base"
          style={
            theme
              ? {
                  background: theme.colors.surfaceAlt,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                }
              : undefined
          }
          role="textbox"
          tabIndex={0}
        >
          {fullUrl}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-pet-teal bg-pet-teal px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#1570ef]/20 transition hover:bg-[#0f5fd0] sm:w-auto"
            style={
              theme
                ? {
                    background: theme.colors.buttonBackground,
                    borderColor: theme.colors.buttonBackground,
                    color: theme.colors.buttonText,
                  }
                : undefined
            }
            onClick={copyLink}
            type="button"
          >
            <Icon name="qr" className="h-4 w-4" />
            Copy Link
          </button>
          {showShareButton ? (
            <button
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-pet-coral bg-pet-coral px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#ff7a6e]/20 transition hover:bg-[#f26155] sm:w-auto"
              style={
                theme
                  ? {
                      background: theme.colors.accent,
                      borderColor: theme.colors.accent,
                      color: theme.colors.buttonText,
                    }
                  : undefined
              }
              onClick={shareProfile}
              type="button"
            >
              <Icon name="heart" className="h-4 w-4" />
              Share Profile
            </button>
          ) : null}
        </div>
      </div>
      {visibleStatus ? (
        <p
          aria-live="polite"
          className="mt-3 rounded-2xl bg-[#e8f8f0] px-4 py-3 text-sm font-bold text-pet-sage"
          style={
            theme
              ? {
                  background: theme.colors.badgeBackground,
                  color: theme.colors.primary,
                }
              : undefined
          }
          role="status"
        >
          {visibleStatus}
        </p>
      ) : null}
    </section>
  );
}

function subscribeToOrigin() {
  return () => {};
}

function getBrowserOrigin() {
  return window.location.origin;
}

function getDefaultOrigin() {
  return "https://mypetlink.pages.dev";
}

async function writeTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) =>
          window.setTimeout(() => reject(new Error("Clipboard timed out")), 800)
        ),
      ]);
      return true;
    } catch {
      // Try the textarea copy path below.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
}
