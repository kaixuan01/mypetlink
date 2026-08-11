"use client";

import Image from "next/image";
import { useId, useRef } from "react";
import { useModalDialogFocus } from "@/lib/useModalDialogFocus";

export function AdminImagePreviewDialog({
  src,
  alt,
  fileName,
  onClose,
}: {
  src: string;
  alt: string;
  fileName: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useModalDialogFocus({
    dialogRef: panelRef,
    initialFocusRef: closeRef,
    onEscape: onClose,
  });

  return (
    <div
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-pet-ink/75 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
    >
      <button
        aria-label="Close image preview"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <div
        className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
        ref={panelRef}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-black text-slate-950" id={titleId}>Image preview</h2>
            <p className="truncate text-xs font-semibold text-slate-500" id={descriptionId}>{fileName}</p>
          </div>
          <button
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-slate-300 px-4 text-sm font-extrabold text-slate-800"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-slate-950 p-3 sm:p-6">
          <Image
            alt={alt}
            className="h-auto max-h-[calc(100dvh-8rem)] w-auto max-w-full object-contain sm:max-h-[calc(100dvh-10rem)]"
            height={1200}
            src={src}
            unoptimized
            width={1600}
          />
        </div>
      </div>
    </div>
  );
}
