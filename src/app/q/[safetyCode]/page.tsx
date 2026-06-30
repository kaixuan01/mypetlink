import type { Metadata } from "next";
import { QrSafetyRouteView } from "@/components/marketing/QrSafetyRouteView";
import { staticQrSafetyParams } from "@/data/staticRouteParams";
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
    title: profile.data
      ? `${profile.data.name} QR Safety Page`
      : "QR Safety Page",
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
