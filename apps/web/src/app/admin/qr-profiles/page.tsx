import type { Metadata } from "next";
import { AdminTableShell } from "@/components/admin/AdminTableShell";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAdminQrProfiles } from "@/services/adminService";

export const metadata: Metadata = {
  title: "Admin QR Profiles",
};

export default async function AdminQrProfilesPage() {
  const profiles = await getAdminQrProfiles();

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Admin"
        title="QR profiles"
        description="Operational view of pet-level QR Safety Page links, owners, and statuses."
      />
      <AdminTableShell
        title="QR profiles"
        description="Review QR Safety Page links, owners, and QR status."
      >
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Pet</th>
              <th className="px-5 py-3">Slug</th>
              <th className="px-5 py-3">Owner</th>
              <th className="px-5 py-3">URL</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profiles.data.map((profile) => (
              <tr key={profile.id}>
                <td className="px-5 py-4 font-bold text-slate-950">
                  {profile.petName}
                </td>
                <td className="px-5 py-4 text-slate-600">{profile.slug}</td>
                <td className="px-5 py-4 text-slate-600">{profile.owner}</td>
                <td className="px-5 py-4 text-slate-600">{profile.url}</td>
                <td className="px-5 py-4 text-slate-600">{profile.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
    </AdminLayout>
  );
}
