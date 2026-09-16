import type { Metadata } from "next";
import { SocialLayout } from "@/components/layouts/SocialLayout";
import { OwnerConnectionsView } from "@/components/social/OwnerConnectionsView";
import { staticOwnerHandleParams } from "@/data/staticRouteParams";

type OwnerFollowingPageProps = {
  params: Promise<{ handle: string }>;
};

// Static export: every dynamic segment must be pre-rendered. The exported shell
// is what the Cloudflare Pages Function at functions/u/[handle]/following.ts
// serves for any real handle, so this list only has to produce a page to serve.
export const dynamicParams = false;

export function generateStaticParams() {
  return staticOwnerHandleParams();
}

export const metadata: Metadata = {
  title: "Following",
  robots: { index: false, follow: false },
};

export default async function OwnerFollowingPage({
  params,
}: OwnerFollowingPageProps) {
  const { handle } = await params;

  return (
    <SocialLayout>
      <OwnerConnectionsView handle={handle.toLowerCase()} relation="following" />
    </SocialLayout>
  );
}
