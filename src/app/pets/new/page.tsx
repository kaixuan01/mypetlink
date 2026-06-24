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
        title="Create a pet profile"
        description="Add the key details that make your pet easier to identify and care for."
      />
      <NewPetForm />
    </AppLayout>
  );
}
