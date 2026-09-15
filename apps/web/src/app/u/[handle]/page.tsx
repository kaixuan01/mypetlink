import type { Metadata } from "next";
import { OwnerSocialProfileView } from "@/components/social/OwnerSocialProfileView";
import { staticOwnerHandleParams } from "@/data/staticRouteParams";

type OwnerProfilePageProps = {
  params: Promise<{ handle: string }>;
};

// Static export: every dynamic segment must be pre-rendered. The exported shell
// is what the Cloudflare Pages Function at functions/u/[handle].ts serves for
// any real handle after rewriting its <head>, so this list only has to cover the
// build, not the set of live profiles.
export const dynamicParams = false;

export function generateStaticParams() {
  return staticOwnerHandleParams();
}

export const metadata: Metadata = {
  title: "Profile",
  // The edge rewrites the real title and description per handle. Until then
  // there is nothing here worth indexing.
  robots: { index: false, follow: true },
};

export default async function OwnerProfilePage({ params }: OwnerProfilePageProps) {
  const { handle } = await params;

  return (
    <main className="min-h-screen bg-pet-cream">
      <OwnerSocialProfileView handle={handle.toLowerCase()} />
    </main>
  );
}
