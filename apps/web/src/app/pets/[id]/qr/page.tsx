import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PetQrRedirect } from "@/components/portal/PetQrRedirect";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { ownerRoutes } from "@/lib/routes";

type PetQrPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export async function generateMetadata({ params }: PetQrPageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    title: "Opening pet overview",
    alternates: {
      canonical: ownerRoutes.petProfile(id),
    },
  };
}

export default async function PetQrPage({ params }: PetQrPageProps) {
  const { id } = await params;

  return (
    <AppLayout>
      <PetQrRedirect petId={id} />
    </AppLayout>
  );
}
