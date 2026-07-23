import type { Metadata } from "next";
import { QrSafetyRouteView } from "@/components/marketing/QrSafetyRouteView";
import { staticQrSafetyParams } from "@/data/staticRouteParams";
import {
  loadingTitle,
  qrSafetyPageTitle,
  tagScanPageTitle,
} from "@/lib/pageTitles";
import { qrSafetyPath } from "@/lib/routes";
import { canonicalUrl, directAccessRobots } from "@/lib/seo";
import { getPublicPetProfileBySafetyCode } from "@/services/petService";
import { getFinderState } from "@/services/tagService";

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
  const tagResult = profile.data
    ? null
    : await getFinderState(safetyCode, "qr");

  return {
    // A /q link that resolves to a physical tag gets the tag's own title, so
    // it matches what the QR, NFC, and legacy tag entry points already show.
    title: profile.data
      ? qrSafetyPageTitle(profile.data.name)
      : tagResult?.state === "active"
        ? tagScanPageTitle(tagResult.profile.name)
        : loadingTitle,
    alternates: {
      canonical: canonicalUrl(qrSafetyPath(safetyCode)),
    },
    robots: directAccessRobots,
  };
}

export default async function QrSafetyPage({ params }: QrSafetyPageProps) {
  const { safetyCode } = await params;
  const profile = await getPublicPetProfileBySafetyCode(safetyCode);
  const tagResult = profile.data
    ? null
    : await getFinderState(safetyCode, "qr");

  return (
    <QrSafetyRouteView
      initialProfile={profile.data}
      initialTagResult={tagResult}
      safetyCode={safetyCode}
    />
  );
}
