"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminEmptyPanel } from "@/components/admin/AdminStatus";
import { PageHeader } from "@/components/ui/PageHeader";
import { adminRoutes } from "@/lib/routes";

// The former "QR Profiles" admin module was a build-time demo table that
// duplicated Admin Pets. Pet-level QR Safety Pages (/q/:safetyCode) are now
// shown inside Admin Pets, which loads live backend data. This route is kept
// only as a safe redirect for existing bookmarks; nothing links to it.
export default function AdminQrProfilesRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace(adminRoutes.pets);
  }, [router]);

  return (
    <>
      <PageHeader
        compactOnMobile
        description="Safety Profile status and linked Smart Tags are managed with each pet profile."
        eyebrow="Admin"
        title="Pet profiles"
      />
      <div className="rounded-xl border border-slate-200 bg-white">
        <AdminEmptyPanel compact icon="pets" title="Opening Pet profiles…" />
      </div>
    </>
  );
}
