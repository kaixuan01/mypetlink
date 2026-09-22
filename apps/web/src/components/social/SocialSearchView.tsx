"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CommunityBrandFooter } from "@/components/social/CommunityBrandFooter";
import { SocialSearchExperience } from "@/components/social/SocialSearchExperience";
import { socialRoutes } from "@/lib/routes";
import { useSignedIn } from "@/lib/useSignedIn";

/**
 * The `/search` page.
 *
 * Search is a tool Explore opens, not a sixth place to go — it is deliberately
 * absent from the Community navigation. The route stays anyway, because a URL
 * that exists is one somebody has bookmarked, refreshed, shared or been handed
 * by a screen reader's landmark list, and because an overlay is a poor thing to
 * deep-link into.
 *
 * What it renders is the same component the dialog renders. The page is a
 * heading and a shell around it; the searching itself has one implementation.
 */
export function SocialSearchView() {
  const signedIn = useSignedIn();
  const searchParams = useSearchParams();

  return (
    <div className="mx-auto w-full max-w-2xl pt-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-black text-pet-ink sm:text-3xl">Search</h1>
        <Link
          className="text-sm font-bold text-pet-teal transition hover:text-pet-ink"
          href={socialRoutes.explore}
        >
          Explore
        </Link>
      </header>

      <div className="mt-4">
        {/*
          Not auto-focused. Arriving at a page is not the same as opening a
          search overlay: pulling focus here would scroll a phone to the box and
          throw up the keyboard before the reader has seen where they are.
        */}
        <SocialSearchExperience initialQuery={searchParams.get("q") ?? ""} />
      </div>

      <CommunityBrandFooter signedIn={signedIn} />
    </div>
  );
}
