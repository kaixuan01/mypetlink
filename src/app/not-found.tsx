import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CTAButton } from "@/components/ui/CTAButton";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-pet-cream px-4">
      <div className="brand-card w-full max-w-md rounded-[2rem] p-8 text-center">
        <div className="flex justify-center">
          <BrandLogo className="h-12 w-auto max-w-[200px]" />
        </div>
        <p className="mt-6 text-sm font-extrabold uppercase text-pet-teal">
          Page not found
        </p>
        <h1 className="mt-2 text-2xl font-black text-pet-ink">
          We couldn&apos;t find that page
        </h1>
        <p className="mt-3 text-sm leading-6 text-pet-muted">
          This profile or page may have moved, or the link may be incorrect.
          Let&apos;s get you back to a safe place.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <CTAButton href="/" icon="home">
            Back to Home
          </CTAButton>
          <CTAButton href="/dashboard" variant="secondary">
            Owner Dashboard
          </CTAButton>
        </div>
      </div>
    </main>
  );
}
