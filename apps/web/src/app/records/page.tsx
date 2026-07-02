import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { GenericPetSection } from "@/components/portal/GenericPetSection";

export const metadata: Metadata = {
  title: "Care Records",
};

export default function RecordsPage() {
  return (
    <AppLayout>
      <GenericPetSection section="records" />
    </AppLayout>
  );
}
