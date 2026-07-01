import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { DashboardClient } from "@/components/portal/DashboardClient";
import { getActivePets } from "@/lib/petLifecycle";
import { getPetMoments } from "@/services/momentService";
import { getPets } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import { getAllTags, getOrders } from "@/services/tagService";

export const metadata: Metadata = {
  title: "Owner Dashboard",
};

export default async function DashboardPage() {
  const petsResponse = await getPets();
  const allPets = petsResponse.data;
  const activePets = getActivePets(allPets);

  const [recordResponses, momentResponses, tagsResponse, ordersResponse] =
    await Promise.all([
      Promise.all(activePets.map((pet) => getPetRecords(pet.id))),
      Promise.all(activePets.map((pet) => getPetMoments(pet.id))),
      getAllTags(),
      getOrders(),
    ]);

  return (
    <AppLayout>
      <DashboardClient
        initialMoments={momentResponses.flatMap((response) => response.data)}
        initialOrders={ordersResponse.data}
        initialPets={allPets}
        initialRecords={recordResponses.flatMap((response) => response.data)}
        initialTags={tagsResponse.data}
      />
    </AppLayout>
  );
}
