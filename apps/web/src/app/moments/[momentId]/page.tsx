import type { Metadata } from "next";
import { MomentDetailView } from "@/components/social/MomentDetailView";
import { staticMomentIdParams } from "@/data/staticRouteParams";

type MomentPageProps = {
  params: Promise<{ momentId: string }>;
};

// Static export: every dynamic segment must be pre-rendered. The exported shell
// is what the Cloudflare Pages Function at functions/moments/[momentId].ts
// serves for any real Moment after rewriting its <head>, so this list only has
// to produce a page to serve — it is never the set of live Moments.
export const dynamicParams = false;

export function generateStaticParams() {
  return staticMomentIdParams();
}

export const metadata: Metadata = {
  // The edge rewrites the real title and description per Moment. Until then
  // there is nothing here worth indexing.
  title: "Moment",
  robots: { index: false, follow: true },
};

export default async function MomentPage({ params }: MomentPageProps) {
  const { momentId } = await params;

  return <MomentDetailView momentId={momentId} />;
}
