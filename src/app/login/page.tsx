import type { Metadata } from "next";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "Login",
};

export default function LoginPage() {
  return (
    <PublicLayout>
      <section className="brand-peach-section px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <Badge tone="warm">Pet owner portal</Badge>
            <h1 className="mt-5 text-4xl font-black leading-tight text-pet-ink sm:text-5xl">
              Pet owner portal
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-pet-muted">
              Keep your pet profiles, care records, moments, and smart tags in
              one warm and safe place.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "Create QR safety profiles",
                "Manage care records",
                "Save pet memories",
                "Order QR/NFC tags later",
              ].map((item) => (
                  <div
                    className="brand-card flex items-center gap-3 rounded-[1.25rem] p-4 text-sm font-bold text-pet-ink"
                    key={item}
                  >
                    <Icon name="shield" className="h-5 w-5 text-pet-teal" />
                    {item}
                  </div>
                ))}
            </div>
          </div>
          <LoginPanel />
        </div>
      </section>
    </PublicLayout>
  );
}
