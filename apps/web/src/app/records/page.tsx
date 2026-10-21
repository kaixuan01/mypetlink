import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { CareHome } from "@/components/portal/care/CareHome";

export const metadata: Metadata = {
  title: "Care Records",
};

export default function RecordsPage() {
  return (
    <AppLayout>
      <CareHome />
    </AppLayout>
  );
}
