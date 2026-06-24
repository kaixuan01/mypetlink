import type { Metadata } from "next";
import { AdminTableShell } from "@/components/admin/AdminTableShell";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { getQrStatusLabel } from "@/components/portal/ProfileAccessStatus";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAdminPets } from "@/services/adminService";

export const metadata: Metadata = {
  title: "Admin Pets",
};

export default async function AdminPetsPage() {
  const pets = await getAdminPets();

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Admin"
        title="Pet profiles"
        description="Review pet profiles, owners, locations, and QR status."
      />
      <AdminTableShell
        title="Pets"
        description="Search, filter, and review pet profile status."
      >
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Pet</th>
              <th className="px-5 py-3">Owner</th>
              <th className="px-5 py-3">Area</th>
              <th className="px-5 py-3">QR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pets.data.map((pet) => (
              <tr key={pet.id}>
                <td className="px-5 py-4 font-bold text-slate-950">
                  {pet.name} - {pet.species}
                </td>
                <td className="px-5 py-4 text-slate-600">{pet.owner.name}</td>
                <td className="px-5 py-4 text-slate-600">{pet.generalArea}</td>
                <td className="px-5 py-4 text-slate-600">
                  {getQrStatusLabel(pet.qrStatus)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
    </AdminLayout>
  );
}
