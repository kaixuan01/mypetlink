"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CTAButton } from "@/components/ui/CTAButton";
import { isOwnerAuthenticated } from "@/services/authService";

const publicNav = [
  { href: "/", label: "Home" },
  { href: "/sample", label: "Sample" },
  { href: "/pricing", label: "Pricing" },
  { href: "/privacy", label: "Privacy" },
];

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setLoggedIn(isOwnerAuthenticated()),
      0
    );
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-pet-cream">
      <header className="sticky top-0 z-30 border-b border-pet-border bg-[#fff8f2]/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <Link href="/" className="flex items-center">
            <BrandLogo className="h-14 w-auto max-w-[235px]" priority />
          </Link>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-pet-muted">
              {publicNav.map((item) => (
                <Link
                  className="transition hover:text-pet-teal"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            {loggedIn ? (
              <CTAButton href="/dashboard" icon="home" variant="primary">
                Open Dashboard
              </CTAButton>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <CTAButton href="/login" variant="secondary">
                  Log in
                </CTAButton>
                <CTAButton href="/login" icon="paw" variant="coral">
                  Create Pet Profile
                </CTAButton>
              </div>
            )}
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-pet-border bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_0.8fr] lg:px-8">
          <div>
            <BrandLogo className="h-16 w-auto max-w-[260px]" />
            <p className="mt-4 max-w-xl text-sm leading-6 text-pet-muted">
              Built for Malaysian pet owners who want safer public QR profiles,
              beautiful shareable pet pages, pet memories, simpler care
              records, optional MyPetLink QR and QR + NFC smart tags, and fast
              WhatsApp contact when a pet is found.
            </p>
            <div className="mt-5 grid gap-1 text-xs leading-5 text-pet-muted">
              <p className="font-bold text-pet-ink">
                MyPetLink by GBB Software Solutions
              </p>
              <p>Malaysia &middot; Reg. No. AS0515813-P</p>
              <p>
                <a
                  href="mailto:support@gbbsoftwaresolutions.com"
                  className="hover:text-pet-teal transition"
                >
                  support@gbbsoftwaresolutions.com
                </a>
              </p>
            </div>
          </div>
          <nav className="flex flex-wrap items-start gap-4 text-sm font-bold text-pet-muted md:justify-end">
            <Link href="/privacy" className="hover:text-pet-teal transition">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-pet-teal transition">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
