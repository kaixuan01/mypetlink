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
    <PublicLayout className="overflow-x-clip">
      <section className="brand-peach-section w-full max-w-full px-3 py-14 min-[361px]:px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center">
          <div className="min-w-0">
            <Badge tone="warm">Pet owner portal</Badge>
            <h1 className="mt-5 text-4xl font-black leading-tight text-pet-ink sm:text-5xl">
              Pet owner portal
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-pet-muted">
              Keep your pet profiles, care records, moments, and smart tags in
              one warm and safe place.
            </p>
            <div className="mt-6 grid min-w-0 gap-3 sm:grid-cols-2">
              {[
                "Create QR safety profiles",
                "Manage care records",
                "Save pet memories",
                "Order QR or QR + NFC tags",
              ].map((item) => (
                  <div
                    className="brand-card flex min-w-0 items-center gap-3 rounded-[1.25rem] p-4 text-sm font-bold text-pet-ink"
                    key={item}
                  >
                    <Icon
                      name="shield"
                      className="h-5 w-5 shrink-0 text-pet-teal"
                    />
                    <span className="min-w-0">{item}</span>
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
