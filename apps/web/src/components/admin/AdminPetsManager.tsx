"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { AdminPetProfileDetailDrawer } from "@/components/admin/AdminPetProfileDetailDrawer";
import { formatAdminDateTime, lifecycleTone } from "@/components/admin/adminDisplay";
import { AdminBulkActionBar, type AdminBulkAction } from "@/components/admin/table/AdminBulkActionBar";
import { AdminDataTable, type AdminColumn } from "@/components/admin/table/AdminDataTable";
import { AdminExportMenu, type AdminExportFormat } from "@/components/admin/table/AdminExportMenu";
import { AdminFilterBar, type AdminFilterDef } from "@/components/admin/table/AdminFilterBar";
import { AdminRowActionMenu, type AdminRowAction } from "@/components/admin/table/AdminRowActionMenu";
import { AdminSearchInput } from "@/components/admin/table/AdminSearchInput";
import { useAdminTableQuery } from "@/components/admin/table/useAdminTableQuery";
import { Badge } from "@/components/ui/Badge";
import { PET_TYPE_OPTIONS } from "@/lib/petDisplay";
import { adminRoutes, publicProfilePath, qrSafetyPath } from "@/lib/routes";
import { toAbsoluteUrl } from "@/lib/siteUrl";
import { isAbortError } from "@/services/apiClient";
import {
  countAdminPetProfiles,
  downloadAdminPetProfilesExport,
  getAdminPetProfileDetail,
  getAdminPetProfileExportFormats,
  listAdminPetProfiles,
  type AdminPetProfile,
  type AdminPetProfileCounts,
  type AdminPetProfileListParams,
} from "@/services/adminPetProfileService";

const filterKeys = [
  "view", "lifecycle", "lostMode", "hasLastSeen", "petType", "breed", "gender", "ageMode",
  "publicProfile", "showAllergiesPublicly", "profileTheme", "hasProfilePhoto", "hasCoverPhoto",
  "qrSafety", "hasFinderContact", "hasAllergies", "hasEmergencyNote", "tagState", "tagType",
  "owner", "ownerId", "createdFrom", "createdTo", "updatedFrom", "updatedTo",
] as const;

const filters: AdminFilterDef[] = [
  { type: "select", key: "lifecycle", label: "Lifecycle", options: [
    { value: "Active", label: "Active" },
    { value: "Memorial", label: "Memorial" },
    { value: "Archived", label: "Archived" },
  ] },
  { type: "select", key: "lostMode", label: "Lost Mode", options: [
    { value: "true", label: "On" }, { value: "false", label: "Off" },
  ] },
  { type: "select", key: "petType", label: "Pet Type", options: PET_TYPE_OPTIONS.map((value) => ({ value, label: value })) },
  { type: "select", key: "publicProfile", label: "Public Profile", options: [
    { value: "accessible", label: "Accessible" },
    { value: "unavailable", label: "Unavailable" },
    { value: "setup-issue", label: "Setup issue" },
  ] },
  { type: "select", key: "qrSafety", label: "QR Safety", options: [
    { value: "accessible", label: "Accessible" },
    { value: "unavailable", label: "Unavailable" },
    { value: "setup-issue", label: "Setup issue" },
  ] },
  { type: "select", key: "tagState", label: "Smart Tags", options: [
    { value: "active", label: "Has active tag" },
    { value: "any", label: "Has linked tag" },
    { value: "none", label: "No physical tag" },
    { value: "inactive-only", label: "Only inactive tags" },
  ] },
  { type: "text", key: "owner", label: "Owner", placeholder: "Name or email", advanced: true },
  { type: "text", key: "breed", label: "Breed", placeholder: "Breed", advanced: true },
  { type: "text", key: "gender", label: "Gender", placeholder: "Gender", advanced: true },
  { type: "select", key: "ageMode", label: "Age Information", options: [
    { value: "exact", label: "Exact birthday" },
    { value: "estimated", label: "Estimated birth year" },
    { value: "unknown", label: "Unknown" },
  ], advanced: true },
  { type: "select", key: "hasLastSeen", label: "Last-seen Details", options: [
    { value: "true", label: "Present" }, { value: "false", label: "Missing" },
  ], advanced: true },
  { type: "select", key: "hasFinderContact", label: "Finder Contact", options: [
    { value: "true", label: "Available" }, { value: "false", label: "Not available" },
  ], advanced: true },
  { type: "select", key: "hasAllergies", label: "Allergies", options: [
    { value: "true", label: "Present" }, { value: "false", label: "None recorded" },
  ], advanced: true },
  { type: "select", key: "showAllergiesPublicly", label: "Public Allergies", options: [
    { value: "true", label: "Shown" }, { value: "false", label: "Hidden" },
  ], advanced: true },
  { type: "select", key: "hasEmergencyNote", label: "Emergency Note", options: [
    { value: "true", label: "Present" }, { value: "false", label: "None recorded" },
  ], advanced: true },
  { type: "select", key: "profileTheme", label: "Profile Theme", options: [
    { value: "default", label: "Default" }, { value: "mint", label: "Mint" },
    { value: "peach", label: "Peach" }, { value: "sky", label: "Sky" },
    { value: "lavender", label: "Lavender" },
  ], advanced: true },
  { type: "select", key: "hasProfilePhoto", label: "Profile Photo", options: [
    { value: "true", label: "Available" }, { value: "false", label: "Missing" },
  ], advanced: true },
  { type: "select", key: "hasCoverPhoto", label: "Cover Photo", options: [
    { value: "true", label: "Available" }, { value: "false", label: "Missing" },
  ], advanced: true },
  { type: "select", key: "tagType", label: "Tag Type", options: [
    { value: "QR", label: "QR Pet Tag" }, { value: "QR_NFC", label: "QR + NFC Smart Tag" },
  ], advanced: true },
  { type: "date-range", key: "created", label: "Created", advanced: true },
  { type: "date-range", key: "updated", label: "Updated", advanced: true },
];

const shortcuts: { value: string; label: string; count: keyof AdminPetProfileCounts }[] = [
  { value: "active", label: "Active", count: "active" },
  { value: "lost-mode", label: "Lost Mode", count: "lostMode" },
  { value: "memorial", label: "Memorial", count: "memorial" },
  { value: "archived", label: "Archived", count: "archived" },
  { value: "", label: "All", count: "all" },
];

const zeroCounts: AdminPetProfileCounts = { all: 0, active: 0, lostMode: 0, memorial: 0, archived: 0 };

export function AdminPetsManager() {
  const { query, actions, hasActiveFilters } = useAdminTableQuery({
    filterKeys,
    defaultSortBy: "updatedAt",
    allowedSortIds: ["name", "owner", "petType", "lifecycle", "lostMode", "createdAt", "updatedAt", "lastSeenAt", "smartTagCount"],
    allowedFilterValues: {
      view: ["active", "lost-mode", "memorial", "archived"],
      lifecycle: ["Active", "Memorial", "Archived"],
      lostMode: ["true", "false"],
      hasLastSeen: ["true", "false"],
      ageMode: ["exact", "estimated", "unknown"],
      publicProfile: ["accessible", "unavailable", "setup-issue"],
      showAllergiesPublicly: ["true", "false"],
      hasProfilePhoto: ["true", "false"],
      hasCoverPhoto: ["true", "false"],
      qrSafety: ["accessible", "unavailable", "setup-issue"],
      hasFinderContact: ["true", "false"],
      hasAllergies: ["true", "false"],
      hasEmergencyNote: ["true", "false"],
      tagState: ["active", "any", "none", "inactive-only"],
      tagType: ["QR", "QR_NFC"],
    },
  });

  const params = useMemo<AdminPetProfileListParams>(() => ({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search || undefined,
    view: query.filters.view,
    lifecycle: query.filters.lifecycle,
    lostMode: query.filters.lostMode,
    hasLastSeen: query.filters.hasLastSeen,
    petType: query.filters.petType,
    breed: query.filters.breed,
    gender: query.filters.gender,
    ageMode: query.filters.ageMode,
    publicProfile: query.filters.publicProfile,
    showAllergiesPublicly: query.filters.showAllergiesPublicly,
    profileTheme: query.filters.profileTheme,
    hasProfilePhoto: query.filters.hasProfilePhoto,
    hasCoverPhoto: query.filters.hasCoverPhoto,
    qrSafety: query.filters.qrSafety,
    hasFinderContact: query.filters.hasFinderContact,
    hasAllergies: query.filters.hasAllergies,
    hasEmergencyNote: query.filters.hasEmergencyNote,
    tagState: query.filters.tagState,
    tagType: query.filters.tagType,
    owner: query.filters.owner,
    ownerId: isGuid(query.filters.ownerId) ? query.filters.ownerId : undefined,
    createdFrom: isDateOnly(query.filters.createdFrom) ? query.filters.createdFrom : undefined,
    createdTo: isDateOnly(query.filters.createdTo) ? query.filters.createdTo : undefined,
    updatedFrom: isDateOnly(query.filters.updatedFrom) ? query.filters.updatedFrom : undefined,
    updatedTo: isDateOnly(query.filters.updatedTo) ? query.filters.updatedTo : undefined,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  }), [query]);

  const paramsKey = useMemo(() => JSON.stringify(params), [params]);
  const [reloadKey, setReloadKey] = useState(0);
  const fetchKey = `${paramsKey}#${reloadKey}`;
  const [state, setState] = useState<{
    key: string;
    items: AdminPetProfile[];
    total: number;
    counts: AdminPetProfileCounts;
    error: string;
  } | null>(null);
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({ key: paramsKey, ids: new Set() });
  const [detachedPet, setDetachedPet] = useState<AdminPetProfile | null>(null);
  const [message, setMessage] = useState("");
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const request = JSON.parse(paramsKey) as AdminPetProfileListParams;
    Promise.all([
      listAdminPetProfiles(request, controller.signal),
      countAdminPetProfiles(request, controller.signal),
    ])
      .then(([list, counts]) => {
        if (!controller.signal.aborted) setState({ key: fetchKey, items: list.items, total: list.total, counts, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setState({ key: fetchKey, items: [], total: 0, counts: zeroCounts, error: "We couldn't load pet profiles. Please try again." });
        }
      });
    return () => controller.abort();
  }, [fetchKey, paramsKey]);

  const current = state?.key === fetchKey ? state : null;
  const items = useMemo(() => current?.items ?? [], [current]);
  const selectedIds = selection.key === paramsKey ? selection.ids : new Set<string>();
  const setSelectedIds = (ids: Set<string>) => setSelection({ key: paramsKey, ids });
  const openPetId = actions.getExtraParam("petProfile");
  const openPet = items.find((pet) => pet.id === openPetId) ?? (detachedPet?.id === openPetId ? detachedPet : null);
  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    if (!openPetId || items.some((pet) => pet.id === openPetId)) {
      return;
    }
    const controller = new AbortController();
    getAdminPetProfileDetail(openPetId, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted) setDetachedPet(detail.pet);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMessage("This pet profile could not be opened.");
          actions.setExtraParam("petProfile", null);
        }
      });
    return () => controller.abort();
  }, [actions, items, openPetId]);

  async function copyLink(path: string, label: string) {
    try {
      await navigator.clipboard.writeText(toAbsoluteUrl(path));
      setMessage(`${label} copied.`);
    } catch {
      setMessage("The link could not be copied. Please try again.");
    }
  }

  function rowActions(pet: AdminPetProfile): AdminRowAction[] {
    const list: AdminRowAction[] = [];
    if (pet.publicProfileAccessible && pet.publicSlug && pet.publicCode) {
      const path = publicProfilePath(pet.publicSlug, pet.publicCode);
      list.push(
        { label: "Open Public Share Profile", href: path, external: true },
        { label: "Copy public link", onSelect: () => void copyLink(path, "Public profile link") }
      );
    }
    if (pet.qrSafetyAccessible && pet.safetyCode) {
      const path = qrSafetyPath(pet.safetyCode);
      list.push(
        { label: "Open QR Safety Page", href: path, external: true },
        { label: "Copy QR Safety link", onSelect: () => void copyLink(path, "QR Safety link") }
      );
    }
    if (pet.ownerId) list.push({ label: "View owner", href: adminRoutes.owner(pet.ownerId) });
    list.push({ label: "View Smart Tags", href: adminRoutes.smartTagsForPet(pet.id) });
    if (pet.lostModeEnabled) list.push({ label: "View Lost Mode details", onSelect: () => actions.setExtraParam("petProfile", pet.id) });
    return list;
  }

  const columns: AdminColumn<AdminPetProfile>[] = [
    {
      id: "pet", header: "Pet", sortId: "name",
      cell: (pet) => (
        <div className="flex min-w-40 items-center gap-2.5">
          {pet.profilePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" src={pet.profilePhotoUrl} />
          ) : <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pet-cream font-black text-pet-ink">{pet.name.slice(0, 1).toUpperCase()}</span>}
          <span className="min-w-0"><span className="block truncate font-black text-slate-950">{pet.name}</span><span className="block truncate text-xs font-semibold text-slate-500">{pet.ownerName}</span></span>
        </div>
      ),
    },
    { id: "owner", header: "Owner", sortId: "owner", cell: (pet) => <Link className="font-bold text-slate-800 hover:underline" href={adminRoutes.owner(pet.ownerId)}>{pet.ownerName}<span className="block text-xs font-semibold text-slate-500">{pet.ownerEmail || "—"}</span></Link> },
    { id: "type", header: "Type / Breed", sortId: "petType", cell: (pet) => <span className="whitespace-nowrap">{pet.customSpecies || pet.species}{pet.breed ? ` · ${pet.breed}` : ""}</span> },
    { id: "publicProfile", header: "Public Profile", cell: (pet) => <RouteBadge accessible={pet.publicProfileAccessible} issue={pet.publicProfileSetupIssue} /> },
    { id: "qrSafety", header: "QR Safety", cell: (pet) => <RouteBadge accessible={pet.qrSafetyAccessible} issue={pet.qrSafetySetupIssue} /> },
    { id: "tags", header: "Smart Tags", sortId: "smartTagCount", cell: (pet) => pet.totalSmartTagCount === 0 ? <Badge tone="soft">No physical tag</Badge> : <div className="whitespace-nowrap"><Badge tone={pet.activeSmartTagCount > 0 ? "mint" : "soft"}>{pet.activeSmartTagCount > 0 ? `${pet.activeSmartTagCount} active` : "No active tags"}</Badge><p className="mt-1 text-xs font-semibold text-slate-400">{pet.totalSmartTagCount} linked</p></div> },
    { id: "lifecycle", header: "Lifecycle", sortId: "lifecycle", cell: (pet) => <Badge tone={lifecycleTone[pet.lifecycle]}>{pet.lifecycle}</Badge> },
    { id: "lostMode", header: "Lost Mode", sortId: "lostMode", cell: (pet) => <Badge tone={pet.lostModeEnabled ? "danger" : "soft"}>{pet.lostModeEnabled ? "On" : "Off"}</Badge> },
    { id: "createdAt", header: "Created", sortId: "createdAt", cell: (pet) => formatAdminDateTime(pet.createdAt), hideable: true, defaultHidden: true, className: "whitespace-nowrap" },
    { id: "updatedAt", header: "Updated", sortId: "updatedAt", cell: (pet) => formatAdminDateTime(pet.updatedAt), hideable: true, className: "whitespace-nowrap" },
    { id: "more", header: "More", cell: (pet) => <AdminRowActionMenu actions={rowActions(pet)} label={`More actions for ${pet.name}, owned by ${pet.ownerName}`} />, className: "w-14" },
  ];

  async function exportRows(format: AdminExportFormat, scope: "filtered" | "selected") {
    setExportBusy(true);
    setMessage("");
    try {
      await downloadAdminPetProfilesExport(params, format, scope === "selected" ? [...selectedIds] : undefined);
      setMessage(scope === "selected" ? "Selected pet profiles exported." : "Filtered pet profiles exported.");
    } catch {
      setMessage("The export could not be created. Please try again.");
    } finally {
      setExportBusy(false);
    }
  }

  const bulkActions: AdminBulkAction[] = [
    { id: "export-csv", label: "Export selected CSV", onClick: () => void exportRows("csv", "selected") },
    ...(getAdminPetProfileExportFormats().includes("xlsx")
      ? [{ id: "export-xlsx", label: "Export selected Excel", onClick: () => void exportRows("xlsx", "selected") } satisfies AdminBulkAction]
      : []),
  ];

  return (
    <div className="grid gap-4">
      <AdminNotice>
        Every pet can have a pet-level QR Safety Page without a physical tag. Physical Smart Tags and inventory remain separate operational records.
      </AdminNotice>
      <AdminSection title="Pet profiles" description="Investigate pet identity, owner relationships, route availability, Lost Mode, safety details, and linked Smart Tags.">
        <nav aria-label="Pet profile status shortcuts" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 pt-3">
          {shortcuts.map((shortcut) => (
            <button
              aria-current={(query.filters.view ?? "") === shortcut.value ? "page" : undefined}
              className={`min-h-10 shrink-0 rounded-t-xl px-3 text-xs font-extrabold ${(query.filters.view ?? "") === shortcut.value ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              key={shortcut.label}
              onClick={() => actions.setFilter("view", shortcut.value || null)}
              type="button"
            >
              {shortcut.label} <span className="opacity-70">{current ? current.counts[shortcut.count] : "…"}</span>
            </button>
          ))}
        </nav>
        <AdminFilterBar
          endSlot={<AdminExportMenu busy={exportBusy} formats={getAdminPetProfileExportFormats()} onExport={(format, scope) => void exportRows(format, scope)} selectedCount={selectedIds.size} />}
          filters={filters}
          hasActiveFilters={hasActiveFilters}
          onClearAll={actions.clearAllFilters}
          onFilterChange={actions.setFilter}
          onFiltersChange={actions.setFilters}
          searchSlot={<AdminSearchInput onChange={actions.setSearch} placeholder="Search pet, owner, breed, public code, safety code, tag, order…" value={query.search} />}
          values={query.filters}
        />
        {message ? <div className="px-4 pt-3"><AdminNotice>{message}</AdminNotice></div> : null}
        <AdminDataTable
          columns={columns}
          emptyDescription={hasActiveFilters ? "Try changing or clearing the active filters." : "Pet profiles appear after owners create them."}
          emptyTitle={hasActiveFilters ? "No pet profiles match these filters." : "No pet profiles yet."}
          error={current?.error || undefined}
          loading={!current}
          onPageChange={actions.setPage}
          onPageSizeChange={actions.setPageSize}
          onRetry={refresh}
          onRowOpen={(pet) => actions.setExtraParam("petProfile", pet.id)}
          onSelectedIdsChange={setSelectedIds}
          onSortChange={actions.setSort}
          page={query.page}
          pageSize={query.pageSize}
          rowKey={(pet) => pet.id}
          rowOpenLabel="View Pet"
          rows={items}
          selectable
          selectedIds={selectedIds}
          sortBy={query.sortBy}
          sortDir={query.sortDir}
          stickyFirstColumn
          total={current?.total ?? 0}
        />
        <AdminBulkActionBar actions={bulkActions} busy={exportBusy} onClearSelection={() => setSelectedIds(new Set())} selectedCount={selectedIds.size} />
        {openPet ? <AdminPetProfileDetailDrawer onClose={() => actions.setExtraParam("petProfile", null)} summary={openPet} /> : null}
      </AdminSection>
    </div>
  );
}

function RouteBadge({ accessible, issue }: { accessible: boolean; issue: boolean }) {
  return <Badge tone={issue ? "danger" : accessible ? "mint" : "soft"}>{issue ? "Setup issue" : accessible ? "Accessible" : "Unavailable"}</Badge>;
}

function isGuid(value?: string) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function isDateOnly(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
