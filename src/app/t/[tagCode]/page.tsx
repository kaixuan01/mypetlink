import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PublicFinderProfile } from "@/components/marketing/PublicFinderProfile";
import { staticTagCodeParams } from "@/data/staticRouteParams";
import { getFinderPetProfile } from "@/services/tagService";

type FinderPageProps = {
  params: Promise<{ tagCode: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticTagCodeParams();
}

export async function generateMetadata({
  params,
}: FinderPageProps): Promise<Metadata> {
  const { tagCode } = await params;
  const profile = await getFinderPetProfile(tagCode);

  return {
    title: profile.data ? `Found ${profile.data.name}?` : "Pet Safety Page",
  };
}

export default async function FinderPage({ params }: FinderPageProps) {
  const { tagCode } = await params;
  const profile = await getFinderPetProfile(tagCode);

  if (!profile.data) {
    notFound();
  }

  return (
    <main className="brand-blue-section min-h-screen px-4 py-5 sm:px-6">
      <header className="mx-auto mb-4 flex max-w-xl items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3">
          <BrandLogo markOnly className="h-10 w-10" />
          <span className="text-sm font-black text-pet-ink">
            MyPetLink Safety Page
          </span>
        </Link>
      </header>
      <PublicFinderProfile pet={profile.data} />
      <p className="mx-auto mt-5 max-w-xl text-center text-xs font-semibold text-pet-muted">
        <Link href="/" className="font-black text-pet-teal underline">
          What is MyPetLink?
        </Link>
      </p>
    </main>
  );
}
