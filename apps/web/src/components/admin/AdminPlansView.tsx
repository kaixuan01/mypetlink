"use client";

import { useEffect, useState } from "react";
import { AdminTableShell } from "@/components/admin/AdminTableShell";
import { getAdminPlans } from "@/services/adminService";
import type { Plan } from "@/types";

export function AdminPlansView() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    getAdminPlans()
      .then((response) => {
        if (active) {
          setPlans(response.data);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AdminTableShell title="Plans" description="Compare available plan packages.">
      {status === "loading" ? (
        <p className="p-6 text-sm font-semibold text-slate-500">Loading plans...</p>
      ) : status === "error" ? (
        <p className="p-6 text-sm font-bold text-[#a63c2e]">
          We couldn&apos;t load plans. Please try again. Your data has not been changed.
        </p>
      ) : plans.length === 0 ? (
        <p className="p-6 text-sm font-semibold text-slate-500">No plans are available yet.</p>
      ) : (
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Plan</th><th className="px-5 py-3">Tier</th>
              <th className="px-5 py-3">Price</th><th className="px-5 py-3">Billing</th>
              <th className="px-5 py-3">Status</th><th className="px-5 py-3">Features</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td className="px-5 py-4 font-bold text-slate-950">{plan.name}</td>
                <td className="px-5 py-4 text-slate-600">{plan.tier}</td>
                <td className="px-5 py-4 text-slate-600">{plan.price}</td>
                <td className="px-5 py-4 text-slate-600">{plan.billingNote}</td>
                <td className="px-5 py-4 text-slate-600">{plan.comingSoon ? "Coming later" : "Available"}</td>
                <td className="px-5 py-4 text-slate-600">{plan.features.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminTableShell>
  );
}
