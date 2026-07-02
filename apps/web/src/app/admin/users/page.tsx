import type { Metadata } from "next";
import { AdminTableShell } from "@/components/admin/AdminTableShell";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAdminUsers } from "@/services/adminService";

export const metadata: Metadata = {
  title: "Admin Users",
};

export default async function AdminUsersPage() {
  const users = await getAdminUsers();

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description="Review pet owner accounts and account status."
      />
      <AdminTableShell
        title="Users"
        description="Search, filter, and review user account details."
      >
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Pets</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.data.map((user) => (
              <tr key={user.id}>
                <td className="px-5 py-4 font-bold text-slate-950">
                  {user.name}
                </td>
                <td className="px-5 py-4 text-slate-600">{user.email}</td>
                <td className="px-5 py-4 text-slate-600">{user.role}</td>
                <td className="px-5 py-4 text-slate-600">{user.petCount}</td>
                <td className="px-5 py-4 text-slate-600">{user.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
    </AdminLayout>
  );
}
