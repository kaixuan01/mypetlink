import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PetDetailHeader } from "@/components/portal/PetDetailHeader";
import { PetManagementTabs } from "@/components/portal/PetManagementTabs";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { smartTagsEnabled } from "@/lib/features";
import { loadingTitle, ownerPetPageTitle } from "@/lib/pageTitles";
import { getPetMoments } from "@/services/momentService";
import { getPetById } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import { getOrders, getPetTags } from "@/services/tagService";
import type { PetTag, TagOrder } from "@/types";

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
  const [records, moments] = await Promise.all([
    getPetRecords(pet.id),
    getPetMoments(pet.id),
  ]);
  let tags: PetTag[] = [];
  let petOrders: TagOrder[] = [];

  if (smartTagsEnabled) {
    const [tagResponse, orderResponse] = await Promise.all([
      getPetTags(pet.id),
      getOrders(),
    ]);
    tags = tagResponse.data;
    petOrders = orderResponse.data.filter((order) => order.petId === pet.id);
  }

  return (
    <AppLayout>
      <PetDetailHeader pet={pet} petOrders={petOrders} tags={tags} />

      <PetManagementTabs
        pet={pet}
        records={records.data}
        moments={moments.data}
        orders={petOrders}
        tags={tags}
      />
    </AppLayout>
  );
}
