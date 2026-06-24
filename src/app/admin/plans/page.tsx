import type { Metadata } from "next";
import { AdminTableShell } from "@/components/admin/AdminTableShell";
import { AdminLayout } from "@/components/layouts/AdminLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAdminPlans } from "@/services/adminService";

export const metadata: Metadata = {
  title: "Admin Plans",
};

export default async function AdminPlansPage() {
  const plans = await getAdminPlans();

  return (
    <AdminLayout>
      <PageHeader
        eyebrow="Admin"
        title="Plans"
        description="Review plan names, prices, billing notes, and included features."
      />
      <AdminTableShell
        title="Plans"
        description="Compare available plan packages."
      >
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Plan</th>
              <th className="px-5 py-3">Tier</th>
              <th className="px-5 py-3">Price</th>
              <th className="px-5 py-3">Billing</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Features</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {plans.data.map((plan) => (
              <tr key={plan.id}>
                <td className="px-5 py-4 font-bold text-slate-950">
                  {plan.name}
                </td>
                <td className="px-5 py-4 text-slate-600">{plan.tier}</td>
                <td className="px-5 py-4 text-slate-600">{plan.price}</td>
                <td className="px-5 py-4 text-slate-600">
                  {plan.billingNote}
                </td>
                <td className="px-5 py-4 text-slate-600">
                  {plan.comingSoon ? "Coming later" : "Available"}
                </td>
                <td className="px-5 py-4 text-slate-600">
                  {plan.features.join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
    </AdminLayout>
  );
}
