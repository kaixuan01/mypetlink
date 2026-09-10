"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import {
  DesktopPublicNav,
  MobilePublicNav,
  primaryPublicNav,
} from "@/components/layouts/PublicNav";
import { siteConfig } from "@/config/site";
import { marketingRoutes } from "@/lib/routes";
import { isOwnerAuthenticated } from "@/services/authService";

export function PublicLayout({
  children,
  className = "",
  compactHeader = false,
}: {
  children: React.ReactNode;
  className?: string;
  compactHeader?: boolean;
}) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setLoggedIn(isOwnerAuthenticated()),
      0
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setMenuOpen(false);
      menuToggleRef.current?.focus();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <div
      className={`min-h-screen w-full max-w-full bg-pet-cream ${className}`}
    >
      <header className="sticky top-0 z-30 border-b border-pet-border bg-[#fff8f2]/92 backdrop-blur">
        <div
          className={`mx-auto w-full min-w-0 max-w-7xl px-3 min-[361px]:px-4 sm:px-6 lg:px-8 ${
            compactHeader ? "py-2.5 sm:py-3 lg:py-4" : "py-4"
          }`}
        >
          <div
            className={`flex min-w-0 items-center justify-between ${
              compactHeader ? "gap-2 min-[361px]:gap-3 sm:gap-4" : "gap-4"
            }`}
          >
            <Link href="/" className="flex min-w-0 items-center">
              <BrandLogo
                className={`w-auto ${
                  compactHeader
                    ? "h-10 max-w-[calc(100vw-5.5rem)] object-contain object-left min-[361px]:h-11 sm:h-12 lg:h-14 lg:max-w-[235px]"
                    : "h-14 max-w-[235px]"
                }`}
                priority
              />
            </Link>

            <DesktopPublicNav loggedIn={loggedIn} />

            {/* Mobile menu toggle */}
            <button
              ref={menuToggleRef}
              type="button"
              aria-controls="public-mobile-nav"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
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

          {menuOpen ? (
            <MobilePublicNav
              loggedIn={loggedIn}
              onNavigate={() => setMenuOpen(false)}
            />
          ) : null}
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-pet-border bg-white">
        <div className="mx-auto grid w-full min-w-0 max-w-7xl gap-8 px-3 py-10 min-[361px]:px-4 sm:px-6 md:grid-cols-[1fr_1.15fr] lg:px-8">
          <div className="min-w-0">
            <BrandLogo className="h-16 w-auto max-w-[260px]" />
            <p className="mt-4 max-w-xl text-sm leading-6 text-pet-muted">
              Built for Malaysian pet owners who want safer public pet profiles,
              beautiful shareable pet pages, pet memories, simpler care
              records, the optional one-time MyPetLink QR + NFC Smart Tag, and
              fast WhatsApp contact when a pet is found.
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
          {/*
            Grouped so the footer carries the quieter destinations the header
            no longer needs to. Every link points at a route that exists.
          */}
          <div className="grid gap-8 sm:grid-cols-3 md:justify-items-end">
            <FooterColumn
              links={[
                ...primaryPublicNav,
                { href: marketingRoutes.sample, label: "Sample Profile" },
              ]}
              title="Product"
            />
            <FooterColumn
              links={[
                { href: `${marketingRoutes.home}#faq`, label: "FAQ" },
                { href: `mailto:${siteConfig.supportEmail}`, label: "Contact support" },
              ]}
              title="Support"
            />
            <FooterColumn
              links={[
                { href: "/login", label: "Log in" },
                { href: marketingRoutes.privacy, label: "Privacy Notice" },
                { href: marketingRoutes.terms, label: "Terms of Use" },
              ]}
              title="Account & legal"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <nav aria-label={title} className="min-w-0">
      <p className="text-xs font-extrabold uppercase tracking-wide text-pet-ink">
        {title}
      </p>
      <ul className="mt-3 grid gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              className="text-sm font-bold text-pet-muted transition hover:text-pet-teal"
              href={link.href}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
