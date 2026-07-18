"use client";

import { useRef, useState } from "react";
import { QrCodeCard } from "@/components/qr/QrCodeCard";
import { useModalDialogFocus } from "@/lib/useModalDialogFocus";

type QrCodeButtonProps = {
  title: string;
  targetPath: string;
  helperText?: string;
  viewLabel?: string;
  fileNameBase: string;
  warning?: string;
  // Button label; defaults to "QR".
  label?: React.ReactNode;
  ariaLabel?: string;
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
  ariaLabel,
  className = defaultClassName,
}: QrCodeButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={className}
        onClick={() => setOpen(true)}
        type="button"
      >
        {label}
      </button>
      {open ? (
        <QrCodeDialog
          fileNameBase={fileNameBase}
          helperText={helperText}
          onClose={() => setOpen(false)}
          targetPath={targetPath}
          title={title}
          viewLabel={viewLabel}
          warning={warning}
        />
      ) : null}
    </>
  );
}

function QrCodeDialog({
  title,
  targetPath,
  helperText,
  viewLabel,
  fileNameBase,
  warning,
  onClose,
}: Omit<QrCodeButtonProps, "className" | "label"> & { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useModalDialogFocus({
    dialogRef,
    initialFocusRef: closeRef,
    onEscape: onClose,
  });

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        aria-label={title}
        aria-modal="true"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto"
        ref={dialogRef}
        role="dialog"
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
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/40 bg-white/90 px-4 py-2 text-sm font-extrabold text-slate-800 transition hover:bg-white"
          onClick={onClose}
          ref={closeRef}
          type="button"
        >
          Close
        </button>
      </div>
    </div>
  );
}
