import type { Metadata } from "next";
import { OwnerLoginExperience } from "@/components/auth/OwnerLoginExperience";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { privatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...privatePageMetadata,
  title: "Login",
};

export default function LoginPage() {
  return (
    <PublicLayout className="overflow-x-clip" compactHeader>
      <OwnerLoginExperience />
    </PublicLayout>
  );
}
