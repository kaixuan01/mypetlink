import type { Metadata } from "next";
import { OwnerLoginExperience } from "@/components/auth/OwnerLoginExperience";
import { PublicLayout } from "@/components/layouts/PublicLayout";

export const metadata: Metadata = {
  title: "Login",
};

export default function LoginPage() {
  return (
    <PublicLayout className="overflow-x-clip" compactHeader>
      <OwnerLoginExperience />
    </PublicLayout>
  );
}
