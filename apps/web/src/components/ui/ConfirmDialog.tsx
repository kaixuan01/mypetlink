"use client";

import { useId, useRef, type ReactNode } from "react";
import { useModalDialogFocus } from "@/lib/useModalDialogFocus";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  cancelLabel?: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
};

export function ConfirmDialog({
  open,
  title,
  message,
  cancelLabel = "Cancel",
  confirmLabel,
  destructive = false,
  onCancel,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const messageId = useId();

  useModalDialogFocus({
    dialogRef: panelRef,
    enabled: open,
    initialFocusRef: confirmRef,
    onEscape: onCancel,
  });

  if (!open) {
    return null;
  }

  const confirmClass = destructive
    ? "border-[#ffd2c9] bg-[#ffe8e3] text-[#a63c2e] hover:bg-[#ffd8cf]"
    : "border-pet-teal bg-[#e8f3ff] text-pet-teal hover:bg-[#d8edff]";

  return (
    <div
      aria-describedby={messageId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-end bg-pet-ink/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      role="dialog"
    >
      <button
        aria-label="Close confirmation"
        className="absolute inset-0 cursor-default"
        onClick={onCancel}
        type="button"
      />
      <div
        className="relative w-full max-w-lg rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem] sm:p-6"
        ref={panelRef}
      >
        <h2 className="text-2xl font-black text-pet-ink" id={titleId}>{title}</h2>
        <p className="mt-3 text-sm leading-6 text-pet-muted" id={messageId}>{message}</p>
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={`inline-flex min-h-12 items-center justify-center rounded-full border px-5 py-3 text-sm font-bold transition ${confirmClass}`}
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
