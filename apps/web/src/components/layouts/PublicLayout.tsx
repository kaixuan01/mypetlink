"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CreateProfileCTA } from "@/components/marketing/CreateProfileCTA";
import { CTAButton } from "@/components/ui/CTAButton";
import { siteConfig } from "@/config/site";
import { isOwnerAuthenticated } from "@/services/authService";

const publicNav = [
  { href: "/", label: "Home" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/sample", label: "Sample Profile" },
  { href: "/#smart-tags", label: "Smart Tags" },
  { href: "/pricing", label: "Pricing" },
  { href: "/privacy", label: "Privacy" },
];

export function PublicLayout({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setLoggedIn(isOwnerAuthenticated()),
      0
    );
    return () => window.clearTimeout(timer);
  }, []);

  const actions = loggedIn ? (
    <CTAButton href="/dashboard" icon="home" variant="primary">
      Open Dashboard
    </CTAButton>
  ) : (
    <div className="flex flex-col gap-2 sm:flex-row">
      <CTAButton href="/login" variant="secondary">
        Log in
      </CTAButton>
      <CreateProfileCTA>
        Create Pet Profile
      </CreateProfileCTA>
    </div>
  );

  return (
    <div
      className={`min-h-screen w-full max-w-full bg-pet-cream ${className}`}
    >
      <header className="sticky top-0 z-30 border-b border-pet-border bg-[#fff8f2]/92 backdrop-blur">
        <div className="mx-auto w-full min-w-0 max-w-7xl px-3 py-4 min-[361px]:px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center justify-between gap-4">
            <Link href="/" className="flex min-w-0 items-center">
              <BrandLogo className="h-14 w-auto max-w-[235px]" priority />
            </Link>

            {/* Desktop nav */}
            <div className="hidden lg:flex lg:items-center lg:gap-6">
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
              {actions}
            </div>

            {/* Mobile menu toggle */}
            <button
              type="button"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-pet-border bg-white text-pet-ink lg:hidden"
            >
              <span className="relative block h-4 w-5">
                <span
                  className={`absolute left-0 block h-0.5 w-5 bg-current transition ${
                    menuOpen ? "top-1.5 rotate-45" : "top-0"
                  }`}
                />
                <span
                  className={`absolute left-0 top-1.5 block h-0.5 w-5 bg-current transition ${
                    menuOpen ? "opacity-0" : "opacity-100"
                  }`}
                />
                <span
                  className={`absolute left-0 block h-0.5 w-5 bg-current transition ${
                    menuOpen ? "top-1.5 -rotate-45" : "top-3"
                  }`}
                />
              </span>
            </button>
          </div>

          {/* Mobile nav panel */}
          {menuOpen ? (
            <div className="mt-4 flex flex-col gap-4 lg:hidden">
              <nav className="grid gap-1 text-sm font-bold text-pet-muted">
                {publicNav.map((item) => (
                  <Link
                    className="rounded-xl px-3 py-2 transition hover:bg-white hover:text-pet-teal"
                    href={item.href}
                    key={item.href}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              {actions}
            </div>
          ) : null}
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-pet-border bg-white">
        <div className="mx-auto grid w-full min-w-0 max-w-7xl gap-8 px-3 py-10 min-[361px]:px-4 sm:px-6 md:grid-cols-[1.2fr_0.8fr] lg:px-8">
          <div className="min-w-0">
            <BrandLogo className="h-16 w-auto max-w-[260px]" />
            <p className="mt-4 max-w-xl text-sm leading-6 text-pet-muted">
              Built for Malaysian pet owners who want safer public QR profiles,
              beautiful shareable pet pages, pet memories, simpler care
              records, optional one-time MyPetLink QR and QR + NFC smart tag
              add-ons, and fast WhatsApp contact when a pet is found.
            </p>
            <div className="mt-5 grid gap-1 text-xs leading-5 text-pet-muted">
              <p className="font-bold text-pet-ink">
                {siteConfig.productName} by {siteConfig.companyName}
              </p>
              <p>{siteConfig.country}</p>
              <p>
                Business Registration No.: {siteConfig.businessRegistrationNo}
              </p>
              <p className="min-w-0 truncate" title={siteConfig.supportEmail}>
                <a
                  href={`mailto:${siteConfig.supportEmail}`}
                  className="transition hover:text-pet-teal"
                >
                  {siteConfig.supportEmail}
                </a>
              </p>
            </div>
          </div>
          <nav className="flex flex-wrap items-start gap-4 text-sm font-bold text-pet-muted md:justify-end">
            <Link href="/privacy" className="hover:text-pet-teal transition">
              Privacy Notice
            </Link>
            <Link href="/terms" className="hover:text-pet-teal transition">
              Terms of Use
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
