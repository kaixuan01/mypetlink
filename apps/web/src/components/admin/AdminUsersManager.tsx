"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminSection, AdminTable } from "@/components/admin/AdminPanels";
import { Badge } from "@/components/ui/Badge";
import {
  getOwnerSummaries,
  type AdminOwnerSummary,
} from "@/services/adminService";

export function AdminUsersManager() {
  // API-backed pages must never render local fixture owners while their first
  // request is loading or after it fails. initialData is intentionally empty
  // in the production Admin route; local demo data is loaded by the service.
  const [owners, setOwners] = useState<AdminOwnerSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    getOwnerSummaries()
      .then((next) => {
        if (active) {
          setOwners(next);
        }
      })
      .catch(() => {
        if (active) {
          setError("We could not load owner accounts. Please refresh to try again.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <AdminSection
      title="Owners"
      description="Pet owner accounts with their profiles and tag orders. Account suspension arrives with a later update."
    >
      {error ? (
        <p className="px-4 pt-3 text-sm font-bold text-[#a63c2e]">{error}</p>
      ) : null}
      <div className="p-4">
        {owners.length === 0 && !error ? (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
            No owner accounts yet. Owner accounts will appear here after registration.
          </p>
        ) : <AdminTable
          headers={[
            "Owner",
            "Email",
            "Phone / WhatsApp",
            "Pets",
            "Orders",
            "Joined",
            "Status",
            "Actions",
          ]}
        >
          {owners.map(({ user, petCount, orderCount, phone, whatsapp }) => (
            <tr className="align-top" key={user.id}>
              <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-950">
                {user.name}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                {user.email}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                {phone || whatsapp || "-"}
              </td>
              <td className="px-4 py-3 text-slate-600">{petCount}</td>
              <td className="px-4 py-3 text-slate-600">{orderCount}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                {user.joinedAt}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <Badge tone={user.status === "active" ? "mint" : "soft"}>
                  {user.status}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  <Link
                    className="inline-flex min-h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50"
                    href="/admin/pets"
                  >
                    View Pets
                  </Link>
                  <Link
                    className="inline-flex min-h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50"
                    href="/admin/orders"
                  >
                    View Orders
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>}
      </div>
    </AdminSection>
  );
}
