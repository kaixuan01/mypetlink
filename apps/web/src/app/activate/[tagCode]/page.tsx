import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { staticTagCodeParams } from "@/data/staticRouteParams";
import { tagPath } from "@/lib/routes";

type ActivatePageProps = {
  params: Promise<{ tagCode: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticTagCodeParams();
}

export const metadata: Metadata = {
  title: "Activate your MyPetLink Tag",
};

export default async function ActivatePage({ params }: ActivatePageProps) {
  const { tagCode } = await params;
  redirect(tagPath(tagCode));
}
