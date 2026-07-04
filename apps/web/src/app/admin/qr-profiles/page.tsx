"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The former "QR Profiles" admin module was a build-time demo table that
// duplicated Admin Pets. Pet-level QR Safety Pages (/q/:safetyCode) are now
// shown inside Admin Pets, which loads live backend data. This route is kept
// only as a safe redirect for existing bookmarks; nothing links to it.
export default function AdminQrProfilesRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/pets");
  }, [router]);

  return null;
}
