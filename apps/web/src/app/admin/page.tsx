import type { Metadata } from "next";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { getQrStatusLabel } from "@/components/portal/ProfileAccessStatus";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { getAdminDashboard, getAdminPets } from "@/services/adminService";

export const metadata: Metadata = {
  title: "Admin Overview",
};

export default async function AdminPage() {
  const dashboard = await getAdminDashboard();
  const pets = await getAdminPets();

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Admin"
        title="Operations overview"
        description="Track users, pets, QR profiles, and recent activity from one workspace."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="users"
          label="Total users"
          note="Owner accounts only"
          value={dashboard.data.totalUsers}
        />
        <StatCard
          icon="pets"
          label="Total pets"
          note="Pet profiles"
          tone="mint"
          value={dashboard.data.totalPets}
        />
        <StatCard
          icon="qr"
          label="Active QR profiles"
          note="Finder pages live"
          tone="teal"
          value={dashboard.data.activeQrProfiles}
        />
        <StatCard
          icon="record"
          label="New this month"
          note="New pet profiles"
          tone="soft"
          value={dashboard.data.newProfilesThisMonth}
        />
      </div>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-slate-950">
          Recent QR profiles
        </h2>
        <div className="mt-4 grid gap-3">
          {pets.data.map((pet) => (
            <div
              className="flex flex-col gap-2 rounded-2xl bg-slate-50 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
              key={pet.id}
            >
              <span className="font-bold text-slate-950">{pet.name}</span>
              <span className="text-slate-500">{pet.publicProfilePath}</span>
              <span className="font-semibold text-slate-600">
                {getQrStatusLabel(pet.qrStatus, pet.qrSafetyPath, pet)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </AdminLayout>
  );
}
