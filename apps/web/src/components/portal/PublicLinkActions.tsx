"use client";

import { useState, useSyncExternalStore } from "react";
import { QrCodeButton } from "@/components/qr/QrCodeButton";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { getServerFallbackBaseUrl, toAbsoluteUrl } from "@/lib/siteUrl";

type PublicLinkActionsProps = {
  copyLabel: string;
  copyMessage: string;
  fileNameBase: string;
  helperText: string;
  path: string;
  qrTitle: string;
  viewLabel: string;
  warning?: string;
  compact?: boolean;
  showUrl?: boolean;
};

export function PublicLinkActions({
  copyLabel,
  copyMessage,
  fileNameBase,
  helperText,
  path,
  qrTitle,
  viewLabel,
  warning,
  compact = false,
  showUrl = true,
}: PublicLinkActionsProps) {
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getBrowserOrigin,
    getServerOrigin
  );
  const [status, setStatus] = useState("");
  const url = toAbsoluteUrl(path, origin);
  const secondaryButtonClass = compact
    ? "min-h-11 px-2 py-2 text-xs"
    : "min-h-12 px-4 py-2 text-sm";

  async function handleCopy() {
    const copied = await copyTextToClipboard(url);
    setStatus(copied ? copyMessage : "Copy unavailable. Select and copy the link.");
    window.setTimeout(() => setStatus(""), 2500);
  }

  return (
    <div className={compact ? "grid min-w-0 gap-2" : "grid min-w-0 gap-3"}>
      {showUrl ? (
        <p
          aria-label={`${qrTitle} link`}
          className="select-all break-all rounded-[1rem] border border-pet-border bg-white px-3 py-2 text-xs font-bold leading-5 text-pet-ink"
          role="textbox"
          tabIndex={0}
        >
          {url}
        </p>
      ) : null}
      <div
        className={
          compact
            ? "grid grid-cols-3 gap-2"
            : "grid gap-2 sm:grid-cols-3"
        }
      >
        <button
          className={
            compact
              ? "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-pet-teal bg-pet-teal px-2 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#0f5fd0]"
              : "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
          }
          onClick={handleCopy}
          type="button"
        >
          <Icon name="copy" className="h-4 w-4 shrink-0" />
          {copyLabel}
        </button>
        <QrCodeButton
          className={`inline-flex items-center justify-center rounded-full border border-pet-border bg-white font-extrabold text-pet-ink transition hover:bg-pet-cream ${secondaryButtonClass}`}
          fileNameBase={fileNameBase}
          helperText={helperText}
          label="Show QR"
          targetPath={path}
          title={qrTitle}
          viewLabel={viewLabel}
          warning={warning}
        />
        <CTAButton
          className={compact ? "min-h-11 px-2 py-2 text-xs" : ""}
          href={path}
          rel="noopener noreferrer"
          target="_blank"
          variant="secondary"
          fullWidth
        >
          {viewLabel}
        </CTAButton>
      </div>
      {status ? (
        <p className="text-xs font-bold text-pet-sage" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}

function subscribeToOrigin() {
  return () => {};
}

function getBrowserOrigin() {
  return window.location.origin;
}

function getServerOrigin() {
  return getServerFallbackBaseUrl();
}

/** Clipboard write with a legacy textarea fallback; returns whether it copied. */
export async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
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
  document.body.appendChild(textArea);
  textArea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
}
