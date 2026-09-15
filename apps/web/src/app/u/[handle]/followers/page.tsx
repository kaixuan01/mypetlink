import type { Metadata } from "next";
import { OwnerConnectionsView } from "@/components/social/OwnerConnectionsView";
import { staticOwnerHandleParams } from "@/data/staticRouteParams";

type OwnerFollowersPageProps = {
  params: Promise<{ handle: string }>;
};

// Static export: every dynamic segment must be pre-rendered. The exported shell
// is what the Cloudflare Pages Function at functions/u/[handle]/followers.ts
// serves for any real handle, so this list only has to produce a page to serve.
export const dynamicParams = false;

export function generateStaticParams() {
  return staticOwnerHandleParams();
}

export const metadata: Metadata = {
  title: "Followers",
  // A list of accounts is not something we want in search results, and there is
  // nothing here worth a link preview either.
  robots: { index: false, follow: false },
};

export default async function OwnerFollowersPage({
  params,
}: OwnerFollowersPageProps) {
  const { handle } = await params;

  return (
    <main className="min-h-screen bg-pet-cream">
      <OwnerConnectionsView handle={handle.toLowerCase()} relation="followers" />
    </main>
  );
}
