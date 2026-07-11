import { Icon } from "@/components/ui/Icon";

type PetProfileLoadingProps = {
  message?: string;
  secondary?: string;
};

// One reusable, brand-friendly loading state shared by every public pet page:
// Public Share Profile (/p), QR Safety Page (/q), physical tag scan (/t), and
// the Lost Mode / Memorial variants that reuse those views. It stays compact and
// centered (no oversized card), uses a subtle paw-step animation that respects
// prefers-reduced-motion, and announces itself politely to assistive tech.
export function PetProfileLoading({
  message = "Getting this pet’s profile ready…",
  secondary = "Just a moment — almost there.",
}: PetProfileLoadingProps) {
  return (
    <div
      className="grid min-h-[55vh] place-items-center px-4 py-8"
      role="status"
      aria-live="polite"
    >
      <div className="brand-card flex w-full max-w-xs flex-col items-center gap-4 rounded-[1.75rem] px-6 py-8 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-pet-apricot text-pet-coral">
          <Icon name="paw" className="h-7 w-7" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-black leading-6 text-pet-ink">{message}</p>
          <p className="text-xs font-semibold leading-5 text-pet-muted">
            {secondary}
          </p>
        </div>
        <span className="flex items-center gap-1.5" aria-hidden="true">
          <span
            className="paw-step h-2 w-2 rounded-full bg-pet-coral"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="paw-step h-2 w-2 rounded-full bg-pet-teal"
            style={{ animationDelay: "160ms" }}
          />
          <span
            className="paw-step h-2 w-2 rounded-full bg-pet-sky"
            style={{ animationDelay: "320ms" }}
          />
        </span>
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}
