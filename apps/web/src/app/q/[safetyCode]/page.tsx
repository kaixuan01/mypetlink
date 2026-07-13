import type { Metadata } from "next";
import { QrSafetyRouteView } from "@/components/marketing/QrSafetyRouteView";
import { staticQrSafetyParams } from "@/data/staticRouteParams";
import { loadingTitle, qrSafetyPageTitle } from "@/lib/pageTitles";
import { qrSafetyPath } from "@/lib/routes";
import { canonicalUrl, directAccessRobots } from "@/lib/seo";
import { getPublicPetProfileBySafetyCode } from "@/services/petService";

type QrSafetyPageProps = {
  params: Promise<{ safetyCode: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticQrSafetyParams();
}

export async function generateMetadata({
  params,
}: QrSafetyPageProps): Promise<Metadata> {
  const { safetyCode } = await params;
  const profile = await getPublicPetProfileBySafetyCode(safetyCode);

  return {
    title: profile.data ? qrSafetyPageTitle(profile.data.name) : loadingTitle,
    alternates: {
      canonical: canonicalUrl(qrSafetyPath(safetyCode)),
    },
    robots: directAccessRobots,
  };
}

export default async function QrSafetyPage({ params }: QrSafetyPageProps) {
  const { safetyCode } = await params;
  const profile = await getPublicPetProfileBySafetyCode(safetyCode);

  return (
    <QrSafetyRouteView
      initialProfile={profile.data}
      safetyCode={safetyCode}
    />
  );
}
