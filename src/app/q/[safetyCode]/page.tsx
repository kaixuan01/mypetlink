import type { Metadata } from "next";
import { PublicFinderProfile } from "@/components/marketing/PublicFinderProfile";
import { FinderShell } from "@/components/portal/TagFinderView";
import { Icon } from "@/components/ui/Icon";
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
    title: profile.data ? `Found ${profile.data.name}?` : "QR Safety Page",
  };
}

export default async function QrSafetyPage({ params }: QrSafetyPageProps) {
  const { safetyCode } = await params;
  const profile = await getPublicPetProfileBySafetyCode(safetyCode);

  return (
    <FinderShell>
      {profile.data ? (
        <PublicFinderProfile pet={profile.data} />
      ) : (
        <SafetyUnavailableCard safetyCode={safetyCode} />
      )}
    </FinderShell>
  );
}

function SafetyUnavailableCard({ safetyCode }: { safetyCode: string }) {
  return (
    <article className="brand-card mx-auto max-w-xl rounded-[2rem] p-6 text-center sm:p-8">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-[1.5rem] bg-pet-cream text-pet-muted">
        <Icon name="shield" className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-3xl font-black text-pet-ink">
        QR Safety Page unavailable
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
        This pet safety page is not active yet. Please check the link or ask the
        pet owner for the latest MyPetLink profile.
      </p>
      <div className="mx-auto mt-5 flex flex-col items-center rounded-[1.25rem] bg-pet-cream px-5 py-3">
        <span className="text-xs font-bold uppercase text-pet-muted">
          Safety code
        </span>
        <span className="mt-1 break-all font-black tracking-wide text-pet-ink">
          {safetyCode}
        </span>
      </div>
    </article>
  );
}
