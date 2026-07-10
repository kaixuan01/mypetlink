"use client";

import { useState } from "react";
import { QrCodeCard } from "@/components/qr/QrCodeCard";

type QrCodeButtonProps = {
  title: string;
  targetPath: string;
  helperText?: string;
  viewLabel?: string;
  fileNameBase: string;
  warning?: string;
  // Button label; defaults to "QR".
  label?: string;
  // Visual style matching the admin action buttons.
  className?: string;
};

const defaultClassName =
  "inline-flex min-h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50";

// Compact trigger for dense tables (Admin). Opens a modal that renders the
// shared QrCodeCard so admins can preview, copy, view, and download the QR
// without bloating table rows with inline images.
export function QrCodeButton({
  title,
  targetPath,
  helperText,
  viewLabel,
  fileNameBase,
  warning,
  label = "QR",
  className = defaultClassName,
}: QrCodeButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className={className} onClick={() => setOpen(true)} type="button">
        {label}
      </button>
      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
        >
          <div
            className="w-full max-w-md"
            onClick={(event) => event.stopPropagation()}
          >
            <QrCodeCard
              className="bg-white shadow-2xl"
              fileNameBase={fileNameBase}
              helperText={helperText}
              targetPath={targetPath}
              title={title}
              viewLabel={viewLabel}
              warning={warning}
            />
            <button
              className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-full border border-white/40 bg-white/90 px-4 py-2 text-sm font-extrabold text-slate-800 transition hover:bg-white"
              onClick={() => setOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
