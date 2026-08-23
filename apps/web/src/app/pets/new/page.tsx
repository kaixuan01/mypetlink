import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { NewPetForm } from "@/components/portal/NewPetForm";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Add Pet",
};

export default function NewPetPage() {
  return (
    <AppLayout>
      <PageHeader
        eyebrow="Add pet"
        title="Add a pet"
        description="Two details are enough to start. You can add the rest any time."
      />
      <NewPetForm />
    </AppLayout>
  );
}
