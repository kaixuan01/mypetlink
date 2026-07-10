"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import { downloadQrPng, QrCodeImage } from "@/components/qr/QrCode";
import { getEnvBaseUrl, getSiteBaseUrl, toAbsoluteUrl } from "@/lib/siteUrl";

type QrCodeCardProps = {
  // Display label for the QR (e.g. "QR Safety Page").
  title: string;
  // Route path (e.g. "/q/CODE") or an absolute URL.
  targetPath: string;
  // Short explanation shown under the title.
  helperText?: string;
  // Label for the "open in new tab" action.
  viewLabel?: string;
  // Base for the downloaded file name.
  fileNameBase: string;
  // When true, no QR is generated; the disabled message is shown instead.
  disabled?: boolean;
  disabledMessage?: string;
  // Optional inactive/no-contact warning shown under the actions.
  warning?: string;
  className?: string;
};

function subscribeNoop() {
  return () => {};
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the manual textarea path.
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

export function QrCodeCard({
  title,
  targetPath,
  helperText,
  viewLabel = "View",
  fileNameBase,
  disabled = false,
  disabledMessage = "QR code is not available yet.",
  warning,
  className = "",
}: QrCodeCardProps) {
  // First render uses the env-only base so server and client hydrate the same;
  // after mount the client snapshot upgrades to window.location.origin when no
  // env base is set (local development).
  const base = useSyncExternalStore(subscribeNoop, getSiteBaseUrl, getEnvBaseUrl);
  const [status, setStatus] = useState("");

  const url = toAbsoluteUrl(targetPath, base);

  async function handleCopy() {
    const copied = await copyToClipboard(url);
    setStatus(copied ? "Link copied." : "Copy unavailable. Select the link manually.");
    window.setTimeout(() => setStatus(""), 2500);
  }

  async function handleDownload() {
    try {
      await downloadQrPng(url, fileNameBase);
      setStatus("QR code downloaded.");
    } catch {
      setStatus("Download unavailable right now. Please try again.");
    }

    window.setTimeout(() => setStatus(""), 2500);
  }

  return (
    <div
      className={`rounded-[1.5rem] border border-pet-border bg-white p-5 ${className}`}
    >
      <p className="text-xs font-extrabold uppercase tracking-wide text-pet-teal">
        {title}
      </p>
      {helperText ? (
        <p className="mt-1 text-sm leading-6 text-pet-muted">{helperText}</p>
      ) : null}

      {disabled ? (
        <p className="mt-4 rounded-[1.25rem] bg-pet-cream px-4 py-6 text-center text-sm font-semibold leading-6 text-pet-muted">
          {disabledMessage}
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <QrCodeImage
              ariaLabel={`${title} QR code`}
              className="shrink-0 border border-pet-border p-2"
              size={168}
              value={url}
            />
            <div className="min-w-0 flex-1">
              <p
                aria-label={`${title} link`}
                className="select-all break-all rounded-[1rem] border border-pet-border bg-pet-cream px-3 py-2 text-xs font-bold leading-5 text-pet-ink"
              >
                {url}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-1">
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
                  onClick={handleCopy}
                  type="button"
                >
                  <Icon name="copy" className="h-4 w-4" />
                  Copy link
                </button>
                <a
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
                  href={url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Icon name="qr" className="h-4 w-4" />
                  {viewLabel}
                </a>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-pet-teal bg-pet-teal px-4 py-2 text-sm font-extrabold text-white transition hover:bg-[#0f5fd0]"
                  onClick={handleDownload}
                  type="button"
                >
                  <Icon name="record" className="h-4 w-4" />
                  Download QR
                </button>
              </div>
            </div>
          </div>
          {warning ? (
            <p className="mt-4 rounded-[1rem] bg-[#fdf3df] px-4 py-3 text-xs font-bold leading-5 text-[#9a6b18]">
              {warning}
            </p>
          ) : null}
        </>
      )}

      {status ? (
        <p className="mt-3 text-xs font-bold text-pet-sage" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
