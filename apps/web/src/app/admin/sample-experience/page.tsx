import type { Metadata } from "next";
import { AdminSampleExperienceManager } from "@/components/admin/AdminSampleExperienceManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Sample Experience" };

export default function AdminSampleExperiencePage() {
  return <><PageHeader eyebrow="Configuration · Public Site" title="Sample Experience" description="Choose the approved pet shown in the public Sample Experience." /><AdminSampleExperienceManager /></>;
}
