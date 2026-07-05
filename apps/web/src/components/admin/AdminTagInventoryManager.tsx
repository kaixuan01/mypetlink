"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminActionButton,
  AdminNotice,
  AdminSection,
  AdminTable,
} from "@/components/admin/AdminPanels";
import { getTagTypeLabel, tagStatusTone } from "@/components/admin/adminDisplay";
import { QrCodeButton } from "@/components/qr/QrCodeButton";
import { Badge } from "@/components/ui/Badge";
import { getTagScanPath } from "@/lib/routes";
import {
  downloadAdminInventoryCsv,
  getAdminData,
  type AdminData,
} from "@/services/adminService";
import {
  adminGenerateRetailTags,
  getFriendlyTagErrorMessage,
} from "@/services/tagService";
import type { PetTag, TagVariant } from "@/types";

const variantOptions: TagVariant[] = ["Lightweight", "Standard"];

// Retail/pet-shop stock: tags that carry a TagCode but no pet and no owner
// until a customer scans and activates them. Portal-purchased tags are bound
// to a pet from the start and never appear as unclaimed stock.
export function AdminTagInventoryManager({
  initialData,
}: {
  initialData: AdminData;
}) {
  const [data, setData] = useState(initialData);
  const [count, setCount] = useState(5);
  const [tagKind, setTagKind] = useState<"qr" | "nfc">("qr");
  const [variant, setVariant] = useState<TagVariant>("Standard");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setData(await getAdminData());
  }, []);

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
          setMessage("We could not load tag inventory. Please refresh to try again.");
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

  // Inventory view: current unclaimed stock. Once a retail tag is activated it
  // gains a pet binding and is managed from the Smart Tags page instead.
  const inventoryTags = useMemo(
    () => data.tags.filter((tag) => tag.status === "Unassigned" || !tag.petId),
    [data.tags]
  );

  const unclaimedCount = inventoryTags.filter(
    (tag) => tag.status === "Unassigned" && !tag.petId && !tag.isArchived
  ).length;

  async function generate() {
    try {
      const result = await adminGenerateRetailTags(count, tagKind === "nfc", variant);
      await refresh();
      setMessage(
        `${result.data.length} new ${tagKind === "nfc" ? "QR + NFC" : "QR"} ${variant} tag code${
          result.data.length === 1 ? "" : "s"
        } generated as unclaimed stock.`
      );
    } catch (caught) {
      setMessage(getFriendlyTagErrorMessage(caught));
    }
  }

  async function exportCsv() {
    try {
      if (await downloadAdminInventoryCsv()) {
        setMessage("Tag inventory exported as CSV.");
        return;
      }
    } catch {
      setMessage("We could not export the tag inventory right now. Please try again.");
      return;
    }

    exportLocalCsv();
  }

  function exportLocalCsv() {
    const rows = [
      ["Tag code", "Type", "Variant", "Status", "Batch", "Generated", "Pet", "Owner"],
      ...inventoryTags.map((tag) => {
        const pet = tag.petId ? petMap.get(tag.petId) : undefined;
        return [
          tag.tagCode,
          getTagTypeLabel(tag.hasNfc),
          `${tag.variant} Tag`,
          tag.isArchived ? "Archived" : tag.status,
          tag.batchNo ?? "",
          tag.orderedDate ?? "",
          pet?.name ?? "",
          pet?.owner.name ?? "",
        ];
      }),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "mypetlink-tag-inventory.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage("Tag inventory exported as CSV.");
  }

  return (
    <div className="grid gap-4">
      <AdminNotice>
        Retail tags start as Unclaimed stock: they have a tag code but no pet
        and no owner. A customer scans the tag, signs in or creates an account,
        links it to a pet, and the tag becomes Active. Print and reseller
        tracking tools are coming later.
      </AdminNotice>

      <AdminSection
        title="Generate tag codes"
        description="Create new unclaimed retail stock. Codes use the MPL-XXXX-XXXX format and are ready for QR printing."
      >
        <div className="flex flex-wrap items-end gap-3 p-4">
          <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">
            Quantity
            <input
              className="min-h-10 w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-slate-400"
              max={50}
              min={1}
              onChange={(event) => setCount(Number(event.target.value) || 1)}
              type="number"
              value={count}
            />
          </label>
          <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">
            Tag type
            <select
              className="min-h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-slate-400"
              onChange={(event) => setTagKind(event.target.value as "qr" | "nfc")}
              value={tagKind}
            >
              <option value="qr">QR Pet Tag</option>
              <option value="nfc">QR + NFC Smart Tag</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">
            Tag variant
            <select
              className="min-h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-slate-400"
              onChange={(event) => setVariant(event.target.value as TagVariant)}
              value={variant}
            >
              {variantOptions.map((option) => (
                <option key={option} value={option}>
                  {option} Tag
                </option>
              ))}
            </select>
          </label>
          <AdminActionButton onClick={() => void generate()} tone="primary">
            Generate Tag Codes
          </AdminActionButton>
          <AdminActionButton onClick={exportCsv}>Export CSV</AdminActionButton>
          <AdminActionButton disabled onClick={() => undefined}>
            Mark as Printed (coming later)
          </AdminActionButton>
          <AdminActionButton disabled onClick={() => undefined}>
            Send to Reseller (coming later)
          </AdminActionButton>
        </div>
        {message ? (
          <p className="px-4 pb-4 text-sm font-bold text-[#1b4f9c]">{message}</p>
        ) : null}
      </AdminSection>

      <AdminSection
        title="Tag stock"
        description={`${unclaimedCount} unclaimed retail tag${
          unclaimedCount === 1 ? "" : "s"
        } ready for activation.`}
      >
        <div className="p-4">
          {inventoryTags.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
              No retail stock yet. Generate tag codes to create unclaimed stock.
            </p>
          ) : (
            <AdminTable
              headers={[
                "Tag code",
                "Type",
                "Variant",
                "Status",
                "Batch",
                "Generated",
                "Linked pet",
                "Linked owner",
                "Physical Tag QR",
              ]}
            >
              {inventoryTags.map((tag) => (
                <InventoryRow
                  key={tag.id}
                  petName={
                    tag.petId ? petMap.get(tag.petId)?.name ?? "Profile removed" : ""
                  }
                  ownerName={
                    tag.petId ? petMap.get(tag.petId)?.owner.name ?? "" : ""
                  }
                  tag={tag}
                />
              ))}
            </AdminTable>
          )}
        </div>
      </AdminSection>
    </div>
  );
}

function InventoryRow({
  tag,
  petName,
  ownerName,
}: {
  tag: PetTag;
  petName: string;
  ownerName: string;
}) {
  return (
    <tr>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-slate-950">
        {tag.tagCode}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
        {getTagTypeLabel(tag.hasNfc)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
        {tag.variant} Tag
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <Badge tone={tag.isArchived ? "soft" : tagStatusTone[tag.status]}>
          {tag.isArchived ? "Archived" : tag.status}
        </Badge>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
        {tag.batchNo ?? "-"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
        {tag.orderedDate ?? "-"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
        {petName || "Unclaimed"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
        {ownerName || "-"}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          <a
            className="inline-flex min-h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50"
            href={getTagScanPath(tag)}
            rel="noopener noreferrer"
            target="_blank"
          >
            View Tag Scan Page
          </a>
          <QrCodeButton
            fileNameBase={`${tag.tagCode}-physical-tag-qr`}
            helperText="This QR belongs to an unassigned tag. It will show an activation page until the tag is assigned to a pet and activated. Downloading this QR does not use up inventory."
            label="QR"
            targetPath={getTagScanPath(tag)}
            title={`Physical Tag QR · ${tag.tagCode}`}
            viewLabel="View Tag Scan Page"
          />
        </div>
      </td>
    </tr>
  );
}
