import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PetDetailHeader } from "@/components/portal/PetDetailHeader";
import { PetManagementTabs } from "@/components/portal/PetManagementTabs";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { loadingTitle, ownerPetPageTitle } from "@/lib/pageTitles";
import { getPetMoments } from "@/services/momentService";
import { getPetById } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import { getOrders, getPetTags } from "@/services/tagService";

type PetDetailPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export async function generateMetadata({
  params,
}: PetDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const pet = await getPetById(id);

  return {
    title: pet.data ? ownerPetPageTitle("profile", pet.data.name) : loadingTitle,
  };
}

export default async function PetDetailPage({ params }: PetDetailPageProps) {
  const { id } = await params;
  const petResponse = await getPetById(id);

  if (!petResponse.data) {
    notFound();
  }

  const pet = petResponse.data;
  const records = await getPetRecords(pet.id);
  const tags = await getPetTags(pet.id);
  const moments = await getPetMoments(pet.id);
  const orders = await getOrders();
  const petOrders = orders.data.filter((order) => order.petId === pet.id);

  return (
    <AppLayout>
      <PetDetailHeader pet={pet} petOrders={petOrders} tags={tags.data} />

      <PetManagementTabs
        pet={pet}
        records={records.data}
        moments={moments.data}
        orders={petOrders}
        tags={tags.data}
      />
    </AppLayout>
  );
}
