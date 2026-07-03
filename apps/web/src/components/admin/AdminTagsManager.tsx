"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminActionButton,
  AdminFilterTabs,
  AdminSection,
  AdminTable,
} from "@/components/admin/AdminPanels";
import { getTagTypeLabel, tagStatusTone } from "@/components/admin/adminDisplay";
import { Badge } from "@/components/ui/Badge";
import { formatOrderNumber } from "@/lib/orders";
import { getTagScanPath } from "@/lib/routes";
import {
  getTagDisplayStatus,
  getTagOrder,
  isActivePhysicalTagForPet,
  isPendingPhysicalTag,
} from "@/lib/tagStatus";
import { getAdminData, type AdminData } from "@/services/adminService";
import {
  archiveTag,
  disableTag,
  orderReplacementTag,
  reportTagLost,
  restoreTag,
} from "@/services/tagService";
import type { PetTag } from "@/types";

type AdminTagFilter =
  | "active"
  | "pending"
  | "unclaimed"
  | "lost-disabled"
  | "replaced"
  | "archived"
  | "all";

const filterDefs: { id: AdminTagFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "pending", label: "Pending" },
  { id: "unclaimed", label: "Unclaimed" },
  { id: "lost-disabled", label: "Lost / Disabled" },
  { id: "replaced", label: "Replaced" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
];

export function AdminTagsManager({ initialData }: { initialData: AdminData }) {
  const searchParams = useSearchParams();
  const petScope = searchParams.get("pet") ?? "";
  const [data, setData] = useState(initialData);
  const [filter, setFilter] = useState<AdminTagFilter>("all");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setData(await getAdminData());
  }, []);

  useEffect(() => {
    let active = true;

    getAdminData().then((next) => {
      if (active) {
        setData(next);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const petMap = useMemo(
    () => new Map(data.pets.map((pet) => [pet.id, pet])),
    [data.pets]
  );

  const scopedTags = useMemo(
    () =>
      petScope ? data.tags.filter((tag) => tag.petId === petScope) : data.tags,
    [data.tags, petScope]
  );

  const matchesFilter = useCallback(
    (tag: PetTag, target: AdminTagFilter) => {
      const linkedPet = tag.petId ? petMap.get(tag.petId) : undefined;
      const order = getTagOrder(tag, data.orders);

      switch (target) {
        case "all":
          return true;
        case "archived":
          return Boolean(tag.isArchived);
        case "active":
          return isActivePhysicalTagForPet(tag, linkedPet);
        case "pending":
          return !tag.isArchived && isPendingPhysicalTag(tag, order);
        case "unclaimed":
          return !tag.isArchived && tag.status === "Unassigned" && !tag.petId;
        case "lost-disabled":
          return (
            !tag.isArchived &&
            (tag.status === "Lost" || tag.status === "Disabled")
          );
        case "replaced":
          return !tag.isArchived && tag.status === "Replaced";
        default:
          return false;
      }
    },
    [data.orders, petMap]
  );

  const counts = useMemo(() => {
    const map = new Map<AdminTagFilter, number>();

    for (const def of filterDefs) {
      map.set(def.id, scopedTags.filter((tag) => matchesFilter(tag, def.id)).length);
    }

    return map;
  }, [scopedTags, matchesFilter]);

  const visibleTags = scopedTags.filter((tag) => matchesFilter(tag, filter));
  const scopedPetName = petScope ? petMap.get(petScope)?.name : "";

  async function runTagAction(
    tag: PetTag,
    action: "disable" | "mark-lost" | "mark-replaced" | "archive" | "restore"
  ) {
    const handlers = {
      disable: disableTag,
      "mark-lost": reportTagLost,
      "mark-replaced": orderReplacementTag,
      archive: archiveTag,
      restore: restoreTag,
    };
    const labels = {
      disable: "disabled",
      "mark-lost": "marked as lost",
      "mark-replaced": "marked as replaced",
      archive: "archived",
      restore: "restored",
    };

    await handlers[action](tag.id);
    await refresh();
    setMessage(`Tag ${tag.tagCode} ${labels[action]}.`);
  }

  return (
    <AdminSection
      title={scopedPetName ? `Smart tags for ${scopedPetName}` : "Smart tags"}
      description="Physical QR and QR + NFC tags. Lost, disabled, replaced, and archived tags never expose owner contact details."
    >
      <AdminFilterTabs
        active={filter}
        filters={filterDefs.map((def) => ({
          ...def,
          count: counts.get(def.id) ?? 0,
        }))}
        onChange={setFilter}
      />
      {message ? (
        <p className="px-4 pt-3 text-sm font-bold text-[#1b4f9c]">{message}</p>
      ) : null}
      <div className="p-4">
        {visibleTags.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
            No tags in this view.
          </p>
        ) : (
          <AdminTable
            headers={[
              "Tag code",
              "Type",
              "Pet",
              "Owner",
              "Order",
              "Status",
              "Activated",
              "Last scanned",
              "Created",
              "Actions",
            ]}
          >
            {visibleTags.map((tag) => {
              const linkedPet = tag.petId ? petMap.get(tag.petId) : undefined;
              const order = getTagOrder(tag, data.orders);
              const displayStatus = getTagDisplayStatus(tag, order, linkedPet);

              return (
                <tr className="align-top" key={tag.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-slate-950">
                    {tag.tagCode}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {getTagTypeLabel(tag.hasNfc)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {linkedPet?.name ?? (tag.petId ? "Profile removed" : "Unclaimed")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {linkedPet?.owner.name ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {order ? formatOrderNumber(order) : "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge
                      tone={tag.isArchived ? "soft" : tagStatusTone[tag.status]}
                    >
                      {displayStatus}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {tag.activatedAt ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {tag.lastScannedAt ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {tag.orderedDate ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <a
                        className="inline-flex min-h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50"
                        href={getTagScanPath(tag)}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        View Tag
                      </a>
                      {getTagActions(tag).map((action) => (
                        <AdminActionButton
                          key={action.id}
                          onClick={() => void runTagAction(tag, action.id)}
                          tone={action.tone}
                        >
                          {action.label}
                        </AdminActionButton>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </AdminTable>
        )}
      </div>
    </AdminSection>
  );
}

type TagRowAction = {
  id: "disable" | "mark-lost" | "mark-replaced" | "archive" | "restore";
  label: string;
  tone: "primary" | "neutral" | "danger";
};

function getTagActions(tag: PetTag): TagRowAction[] {
  if (tag.isArchived) {
    return [{ id: "restore", label: "Restore", tone: "primary" }];
  }

  if (tag.status === "Active") {
    return [
      { id: "mark-lost", label: "Mark Lost", tone: "danger" },
      { id: "disable", label: "Disable", tone: "danger" },
      { id: "archive", label: "Archive", tone: "neutral" },
    ];
  }

  if (tag.status === "Lost" || tag.status === "Disabled") {
    return [
      { id: "mark-replaced", label: "Mark Replaced", tone: "neutral" },
      { id: "archive", label: "Archive", tone: "neutral" },
    ];
  }

  if (tag.status === "Replaced") {
    return [{ id: "archive", label: "Archive", tone: "neutral" }];
  }

  if (tag.status === "Unassigned") {
    return [
      { id: "disable", label: "Disable", tone: "danger" },
      { id: "archive", label: "Archive", tone: "neutral" },
    ];
  }

  // Pending-family fulfillment states: archiving is the safe admin correction.
  return [{ id: "archive", label: "Archive", tone: "neutral" }];
}
