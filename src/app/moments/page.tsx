import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { GenericPetSection } from "@/components/portal/GenericPetSection";

export const metadata: Metadata = {
  title: "Pet Moments",
};

export default function MomentsPage() {
  return (
    <AppLayout>
      <GenericPetSection section="moments" />
    </AppLayout>
  );
}
