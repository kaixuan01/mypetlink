import type { ReactNode } from "react";

type MobileFormActionBarProps = {
  primaryLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  secondaryAction?: ReactNode;
  formId?: string;
};

/**
 * Shared Owner Portal action surface for long mobile forms. It sits above the
 * fixed owner navigation and reserves matching document space so final fields
 * can always scroll clear of both fixed layers.
 */
export function MobileFormActionBar({
  primaryLabel,
  pendingLabel = "Saving...",
  pending = false,
  disabled = false,
  secondaryAction,
  formId,
}: MobileFormActionBarProps) {
  return (
    <>
      <div aria-hidden="true" className="h-40 lg:hidden" />
      <div
        aria-label="Form actions"
        className="fixed inset-x-3 bottom-[calc(var(--owner-bottom-nav-height)+env(safe-area-inset-bottom)+0.5rem)] z-20 max-w-[calc(100vw-1.5rem)] lg:hidden"
        data-testid="mobile-form-actions"
        role="group"
      >
        <div className="brand-card flex min-w-0 items-center gap-2 rounded-full p-2">
          {secondaryAction}
          <button
            className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-full bg-pet-coral px-4 text-sm font-bold text-white shadow-lg shadow-[#ff7a6e]/20 transition hover:bg-[#f26155] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={disabled || pending}
            form={formId}
            type="submit"
          >
            {pending ? pendingLabel : primaryLabel}
          </button>
        </div>
      </div>
    </>
  );
}
