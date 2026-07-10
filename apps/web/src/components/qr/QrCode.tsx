"use client";

import { useEffect, useRef, useState } from "react";
import * as QRCode from "qrcode";

// Client-side QR generation only. We never call an external QR image service;
// everything is rendered in the browser from the target URL.

const DISPLAY_OPTIONS = {
  errorCorrectionLevel: "M" as const,
  margin: 2,
  color: { dark: "#0d1b3d", light: "#ffffff" },
};

// High resolution so a downloaded PNG stays crisp when printed on artwork.
const DOWNLOAD_PNG_WIDTH = 1024;

function safeFileName(base: string) {
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "mypetlink-qr";
}

function triggerDownload(href: string, fileName: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function downloadQrPng(value: string, fileNameBase: string) {
  const dataUrl = await QRCode.toDataURL(value, {
    ...DISPLAY_OPTIONS,
    width: DOWNLOAD_PNG_WIDTH,
  });

  triggerDownload(dataUrl, `${safeFileName(fileNameBase)}.png`);
}

// Renders the QR for the given value as an <img> built from a PNG data URL.
// Returns a small fallback message if generation fails.
export function QrCodeImage({
  value,
  size = 200,
  className = "",
  ariaLabel,
}: {
  value: string;
  size?: number;
  className?: string;
  ariaLabel?: string;
}) {
  // Result is keyed by the value that produced it, so a stale QR is never shown
  // after the value changes and no state is set synchronously inside the effect.
  const [result, setResult] = useState<{
    value: string;
    dataUrl: string;
    failed: boolean;
  } | null>(null);
  const latestValue = useRef(value);

  useEffect(() => {
    latestValue.current = value;
    let active = true;

    QRCode.toDataURL(value, { ...DISPLAY_OPTIONS, width: size * 2 })
      .then((url) => {
        if (active && latestValue.current === value) {
          setResult({ value, dataUrl: url, failed: false });
        }
      })
      .catch(() => {
        if (active && latestValue.current === value) {
          setResult({ value, dataUrl: "", failed: true });
        }
      });

    return () => {
      active = false;
    };
  }, [value, size]);

  const current = result && result.value === value ? result : null;
  const dataUrl = current?.dataUrl ?? "";
  const failed = current?.failed ?? false;

  if (failed) {
    return (
      <div
        className={`grid place-items-center rounded-2xl bg-pet-cream p-3 text-center text-xs font-semibold text-pet-muted ${className}`}
        style={{ width: size, height: size }}
      >
        QR code unavailable
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div
        className={`animate-pulse rounded-2xl bg-pet-cream ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={ariaLabel ?? "QR code"}
      className={`rounded-2xl bg-white ${className}`}
      height={size}
      src={dataUrl}
      width={size}
    />
  );
}
