"use client";

import {
  useId,
  useRef,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { Icon } from "@/components/ui/Icon";
import { useModalDialogFocus } from "@/lib/useModalDialogFocus";

export type FormDialogAction = {
  label: ReactNode;
  pendingLabel?: ReactNode;
  pending?: boolean;
  disabled?: boolean;
  form?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit";
};

export type FormDialogProps = {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  onRequestClose: () => void;
  description?: ReactNode;
  eyebrow?: ReactNode;
  closeLabel?: string;
  dismissible?: boolean;
  closeOnBackdrop?: boolean;
  footer?: ReactNode;
  primaryAction?: FormDialogAction;
  cancelAction?: FormDialogAction;
  footerLayout?: "inline" | "stacked";
  maxWidthClassName?: string;
};

export function FormDialog({
  open,
  title,
  children,
  onRequestClose,
  description,
  eyebrow,
  closeLabel = "Close dialog",
  dismissible = true,
  closeOnBackdrop = true,
  footer,
  primaryAction,
  cancelAction,
  footerLayout = "inline",
  maxWidthClassName = "sm:max-w-4xl",
}: FormDialogProps) {
  const generatedId = useId();
  const titleId = `form-dialog-${generatedId}-title`;
  const descriptionId = description
    ? `form-dialog-${generatedId}-description`
    : undefined;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useModalDialogFocus({
    dialogRef,
    enabled: open,
    initialFocusRef: dismissible ? closeRef : titleRef,
    onEscape: () => {
      if (dismissible) onRequestClose();
    },
  });

  if (!open) return null;

  const resolvedCancelAction = primaryAction
    ? {
        label: "Cancel",
        onClick: onRequestClose,
        type: "button" as const,
        ...cancelAction,
      }
    : undefined;
  const resolvedFooter =
    footer ??
    (primaryAction ? (
      <FormDialogActions
        cancelAction={resolvedCancelAction}
        layout={footerLayout}
        primaryAction={primaryAction}
      />
    ) : null);

  return (
    <div
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 grid bg-pet-ink/35 backdrop-blur-sm sm:place-items-center sm:p-4"
      role="dialog"
      style={{ zIndex: "var(--owner-layer-backdrop)" }}
    >
      {dismissible && closeOnBackdrop ? (
        <button
          aria-hidden="true"
          className="absolute inset-0 hidden cursor-default sm:block"
          onClick={onRequestClose}
          tabIndex={-1}
          type="button"
        />
      ) : null}

      <div
        className={`relative flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-[2rem] ${maxWidthClassName}`}
        ref={dialogRef}
        style={{ zIndex: "var(--owner-layer-surface)" }}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-pet-border px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-xs font-bold uppercase tracking-wide text-pet-coral">
                {eyebrow}
              </p>
            ) : null}
            <h2
              className={`${eyebrow ? "mt-1" : ""} text-xl font-black text-pet-ink sm:text-2xl`}
              id={titleId}
              ref={titleRef}
              tabIndex={dismissible ? undefined : -1}
            >
              {title}
            </h2>
            {description ? (
              <p
                className="mt-1 text-sm leading-6 text-pet-muted"
                id={descriptionId}
              >
                {description}
              </p>
            ) : null}
          </div>
          {dismissible ? (
            <button
              aria-label={closeLabel}
              className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full bg-pet-cream text-pet-muted transition hover:text-pet-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
              onClick={onRequestClose}
              ref={closeRef}
              type="button"
            >
              <Icon className="h-5 w-5 rotate-45" name="plus" />
            </button>
          ) : null}
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6"
          data-testid="form-dialog-body"
        >
          {children}
        </div>

        {resolvedFooter ? (
          <footer className="shrink-0 border-t border-pet-border bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-4">
            {resolvedFooter}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function FormDialogActions({
  primaryAction,
  cancelAction,
  layout = "inline",
}: {
  primaryAction: FormDialogAction;
  cancelAction?: FormDialogAction;
  layout?: "inline" | "stacked";
}) {
  const layoutClassName =
    layout === "stacked"
      ? "grid grid-cols-1 gap-3"
      : "grid grid-cols-2 gap-3 sm:flex sm:justify-end";

  return (
    <div className={layoutClassName} data-form-dialog-footer-layout={layout}>
      {cancelAction ? (
        <DialogActionButton action={cancelAction} kind="secondary" />
      ) : null}
      <DialogActionButton action={primaryAction} kind="primary" />
    </div>
  );
}

function DialogActionButton({
  action,
  kind,
}: {
  action: FormDialogAction;
  kind: "primary" | "secondary";
}) {
  return (
    <button
      className={`inline-flex min-h-12 w-full min-w-0 items-center justify-center whitespace-normal break-words rounded-full px-3 py-3 text-center text-sm font-bold leading-5 transition sm:w-auto sm:px-5 disabled:cursor-not-allowed disabled:opacity-60 ${
        kind === "primary"
          ? "border border-pet-coral bg-pet-coral text-white shadow-lg shadow-[#ff7a6e]/20 hover:bg-[#f26155]"
          : "border border-pet-border bg-white text-pet-ink hover:bg-pet-cream"
      }`}
      disabled={action.disabled || action.pending}
      form={action.form}
      onClick={action.onClick}
      type={action.type ?? "button"}
    >
      {action.pending ? action.pendingLabel ?? "Saving..." : action.label}
    </button>
  );
}
