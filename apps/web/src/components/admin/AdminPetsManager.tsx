"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AdminFilterTabs,
  AdminNotice,
  AdminSection,
  AdminTable,
} from "@/components/admin/AdminPanels";
import { lifecycleTone } from "@/components/admin/adminDisplay";
import { Badge } from "@/components/ui/Badge";
import { getPetTypeLabel } from "@/lib/petDisplay";
import { getPetLifecycleStatus, isActivePet } from "@/lib/petLifecycle";
import { getPublicProfilePath, getQrSafetyPath } from "@/lib/routes";
import { getPetSmartTagStatus } from "@/lib/tagStatus";
import { getAdminData, type AdminData } from "@/services/adminService";
import type { Pet } from "@/types";

type PetFilter = "active" | "lost-mode" | "memorial" | "archived" | "all";

const filterDefs: { id: PetFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "lost-mode", label: "Lost Mode" },
  { id: "memorial", label: "Memorial" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
];

function matchesFilter(pet: Pet, filter: PetFilter) {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return getPetLifecycleStatus(pet) === "Active";
    case "lost-mode":
      // Lost Mode is a flag on an active pet, not a lifecycle status.
      return isActivePet(pet) && pet.lostModeEnabled;
    case "memorial":
      return getPetLifecycleStatus(pet) === "Memorial";
    case "archived":
      return getPetLifecycleStatus(pet) === "Archived";
    default:
      return false;
  }
}

export function AdminPetsManager({ initialData }: { initialData: AdminData }) {
  const [data, setData] = useState(initialData);
  const [filter, setFilter] = useState<PetFilter>("all");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    getAdminData()
      .then((next) => {
        if (active) {
          setData(next);
        }
      })
      .catch(() => {
        if (active) {
          setError("We could not load pet profiles. Please refresh to try again.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const map = new Map<PetFilter, number>();

    for (const def of filterDefs) {
      map.set(def.id, data.pets.filter((pet) => matchesFilter(pet, def.id)).length);
    }

    return map;
  }, [data.pets]);

  const visiblePets = data.pets.filter((pet) => matchesFilter(pet, filter));

  return (
    <div className="grid gap-4">
      <AdminNotice>
        Every pet has its own free QR Safety Page that works even without a
        physical tag. Use the QR Safety column and the QR Safety Page action
        below to review it. This is separate from physical Smart Tags — physical
        tags and stock are managed under Smart Tags and Tag Inventory.
      </AdminNotice>
      <AdminSection
        title="Pet profiles"
        description="Lifecycle, Lost Mode, QR Safety, and smart tag status for every pet profile."
      >
      <AdminFilterTabs
        active={filter}
        filters={filterDefs.map((def) => ({
          ...def,
          count: counts.get(def.id) ?? 0,
        }))}
        onChange={setFilter}
      />
      {error ? (
        <p className="px-4 pt-3 text-sm font-bold text-[#a63c2e]">{error}</p>
      ) : null}
      <div className="p-4">
        {visiblePets.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
            No pets in this view.
          </p>
        ) : (
          <AdminTable
            headers={[
              "Pet",
              "Owner",
              "Type / Breed",
              "QR Safety",
              "Smart Tag",
              "Lifecycle",
              "Lost Mode",
              "Created",
              "Actions",
            ]}
          >
            {visiblePets.map((pet) => {
              const lifecycle = getPetLifecycleStatus(pet);
              const tagStatus = getPetSmartTagStatus(
                data.tags,
                data.orders,
                pet.id,
                pet
              );

              return (
                <tr className="align-top" key={pet.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-950">
                    {pet.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {pet.owner.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {getPetTypeLabel(pet)} - {pet.breed}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge
                      tone={
                        isActivePet(pet) && pet.qrSafetyEnabled ? "mint" : "soft"
                      }
                    >
                      {isActivePet(pet) && pet.qrSafetyEnabled
                        ? "Enabled"
                        : "Off"}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge
                      tone={
                        tagStatus === "active"
                          ? "mint"
                          : tagStatus === "pending"
                            ? "warm"
                            : "soft"
                      }
                    >
                      {tagStatus === "active"
                        ? "Active tag"
                        : tagStatus === "pending"
                          ? "Tag pending"
                          : "No tag"}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge tone={lifecycleTone[lifecycle]}>{lifecycle}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {isActivePet(pet) && pet.lostModeEnabled ? (
                      <Badge tone="danger">Lost Mode on</Badge>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatCreatedDate(pet.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <PetLink
                        href={getPublicProfilePath(pet)}
                        label="Public Profile"
                        newTab
                      />
                      <PetLink
                        href={getQrSafetyPath(pet)}
                        label="QR Safety Page"
                        newTab
                      />
                      <PetLink
                        href={`/admin/tags?pet=${encodeURIComponent(pet.id)}`}
                        label="View Tags"
                      />
                      <PetLink href="/admin/users" label="View Owner" />
                    </div>
                  </td>
                </tr>
              );
            })}
          </AdminTable>
        )}
      </div>
      </AdminSection>
    </div>
  );
}

function formatCreatedDate(value: string) {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(parsed));
}

function PetLink({
  href,
  label,
  newTab,
}: {
  href: string;
  label: string;
  newTab?: boolean;
}) {
  const className =
    "inline-flex min-h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50";

  // Public previews open in a new tab so the operations portal stays open.
  if (newTab) {
    return (
      <a className={className} href={href} rel="noopener noreferrer" target="_blank">
        {label}
      </a>
    );
  }

  return (
    <Link className={className} href={href}>
      {label}
    </Link>
  );
}
