"use client";

import { useMemo, useState } from "react";
import { AdminActionButton, AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import {
  AdminPermissionGroups,
  AdminPermissionPicker,
} from "@/components/admin/access/AdminPermissionGroups";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { adminCapabilities, hasCapability } from "@/lib/adminCapabilities";
import { useAdminAccessQuery } from "@/lib/useAdminAccessQuery";
import { getAdminCapabilities } from "@/services/authService";
import {
  createAdminRole,
  deleteAdminRole,
  getAdminAccessError,
  getAdminRole,
  listAdminCapabilityCatalog,
  listAdminRoles,
  updateAdminRole,
  type AdminCapabilityModule,
  type AdminRoleDetail,
  type AdminRoleSummary,
} from "@/services/adminAccessService";

type Editor =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; role: AdminRoleDetail };

/**
 * Roles — reusable sets of permissions.
 *
 * Built-in roles can be tuned but never deleted, and the Super Admin role is
 * fixed at full access so it cannot be quietly narrowed until nobody can put
 * things right again.
 */
export function AdminAccessRolesManager() {
  const access = getAdminCapabilities();
  const canManage = hasCapability(access, adminCapabilities.adminRolesManage);

  const [actionError, setActionError] = useState<string | null>(null);
  const [openRole, setOpenRole] = useState<AdminRoleDetail | null>(null);
  const [editor, setEditor] = useState<Editor>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = useState<AdminRoleSummary | null>(null);
  const [saving, setSaving] = useState(false);

  const loaded = useAdminAccessQuery<{
    roles: AdminRoleSummary[];
    catalog: AdminCapabilityModule[];
  }>(
    "roles",
    async (signal) => {
      const [roleResponse, catalogResponse] = await Promise.all([
        listAdminRoles(signal),
        // Somebody who can view roles but not manage them has no use for the
        // full picker, and the API does not owe them one.
        listAdminCapabilityCatalog(signal).catch(() => ({
          data: [] as AdminCapabilityModule[],
        })),
      ]);

      return {
        roles: roleResponse.data ?? [],
        catalog: catalogResponse.data ?? [],
      };
    },
    (error) => getAdminAccessError(error, "We couldn’t load the roles. Please try again.")
  );

  const roles = loaded.data?.roles ?? [];
  const catalog = useMemo(() => loaded.data?.catalog ?? [], [loaded.data]);

  // Permissions the signed-in administrator does not hold are shown but not
  // selectable: they cannot delegate what they do not have, and the API refuses
  // it too, so saying so up front beats a failed save.
  const lockedKeys = useMemo(() => {
    const locked = new Set<string>();
    for (const group of catalog) {
      for (const capability of group.capabilities) {
        if (!access.granted.has(capability.key)) locked.add(capability.key);
      }
    }
    return locked;
  }, [access, catalog]);

  const load = loaded.reload;

  async function openDetail(roleId: string) {
    setActionError(null);
    try {
      const response = await getAdminRole(roleId);
      setOpenRole(response.data ?? null);
    } catch (error) {
      setActionError(getAdminAccessError(error, "We couldn’t open this role."));
    }
  }

  async function startEdit(roleId: string) {
    setActionError(null);
    try {
      const response = await getAdminRole(roleId);
      if (response.data) setEditor({ mode: "edit", role: response.data });
    } catch (error) {
      setActionError(getAdminAccessError(error, "We couldn’t open this role for editing."));
    }
  }

  async function save(input: { name: string; description: string; capabilities: string[] }) {
    setSaving(true);
    setActionError(null);
    try {
      if (editor.mode === "create") {
        await createAdminRole(input);
      } else if (editor.mode === "edit") {
        await updateAdminRole(editor.role.role.id, {
          ...input,
          rowVersion: editor.role.role.rowVersion,
        });
      }
      setEditor({ mode: "closed" });
      setOpenRole(null);
      load();
    } catch (error) {
      setActionError(getAdminAccessError(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove(role: AdminRoleSummary) {
    setSaving(true);
    setActionError(null);
    try {
      await deleteAdminRole(role.id);
      if (openRole?.role.id === role.id) setOpenRole(null);
      load();
    } catch (error) {
      setActionError(getAdminAccessError(error));
    } finally {
      setSaving(false);
      setPendingDelete(null);
    }
  }

  if (editor.mode !== "closed") {
    return (
      <AdminRoleEditor
        catalog={catalog}
        error={actionError}
        lockedKeys={lockedKeys}
        onCancel={() => setEditor({ mode: "closed" })}
        onSave={save}
        role={editor.mode === "edit" ? editor.role : null}
        saving={saving}
      />
    );
  }

  return (
    <div className="grid gap-4">
      {actionError ? (
        <div
          className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-semibold text-[#a63c2e]"
          role="alert"
        >
          {actionError}
        </div>
      ) : null}

      {!canManage ? (
        <AdminNotice>
          You can see each role and what it allows, but not change them. Ask a Super Admin if
          something needs updating.
        </AdminNotice>
      ) : null}

      <AdminSection
        action={
          canManage ? (
            <AdminActionButton onClick={() => setEditor({ mode: "create" })} tone="primary">
              New role
            </AdminActionButton>
          ) : null
        }
        compact
        description="A role is a set of permissions. Give someone a role rather than picking permissions one by one."
        title="Roles"
      >
        {loaded.error ? (
          <div className="p-5">
            <AdminNotice>{loaded.error}</AdminNotice>
            <div className="mt-3">
              <AdminActionButton onClick={load}>Try again</AdminActionButton>
            </div>
          </div>
        ) : loaded.loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : (
          <ul className="grid gap-3 p-5">
            {roles.map((role) => (
              <li
                key={role.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 p-4"
              >
                <div className="min-w-0 flex-1 basis-64">
                  <h3 className="text-sm font-black text-slate-900">
                    {role.name}
                    {role.isSystemRole ? (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-extrabold uppercase text-slate-600">
                        Built in
                      </span>
                    ) : null}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">{role.description}</p>
                  <p className="mt-2 text-xs font-bold text-slate-600">
                    {role.grantsAllCapabilities
                      ? "Full access, including anything added in future"
                      : `${role.capabilityCount} permissions`}
                    {" · "}
                    {role.assignedUserCount === 1
                      ? "1 person"
                      : `${role.assignedUserCount} people`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <AdminActionButton onClick={() => void openDetail(role.id)}>
                    View permissions
                  </AdminActionButton>
                  {role.canEdit ? (
                    <AdminActionButton onClick={() => void startEdit(role.id)}>
                      Edit
                    </AdminActionButton>
                  ) : null}
                  {role.canDelete ? (
                    <AdminActionButton
                      disabled={saving}
                      onClick={() => setPendingDelete(role)}
                      tone="danger"
                    >
                      Delete
                    </AdminActionButton>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      {openRole ? (
        <AdminSection
          action={
            <AdminActionButton onClick={() => setOpenRole(null)}>Close</AdminActionButton>
          }
          compact
          description={
            openRole.role.grantsAllCapabilities
              ? "This role always has full access, so its permissions cannot be edited."
              : openRole.role.description
          }
          title={`${openRole.role.name} — permissions`}
        >
          <AdminPermissionGroups modules={openRole.capabilitiesByModule} />
          {openRole.members.length > 0 ? (
            <div className="border-t border-slate-200 px-5 py-4">
              <h3 className="text-xs font-extrabold uppercase text-slate-500">
                Who has this role
              </h3>
              <ul className="mt-2 grid gap-1">
                {openRole.members.map((member) => (
                  <li key={member.adminUserId} className="text-sm text-slate-700">
                    <span className="font-bold text-slate-900">{member.displayName}</span>{" "}
                    <span className="text-slate-500">{member.email}</span>
                    {member.isActive ? null : (
                      <span className="ml-2 text-xs font-bold text-slate-500">(inactive)</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </AdminSection>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          confirmDisabled={saving}
          confirmLabel="Delete role"
          destructive
          message={`${pendingDelete.name} will be removed. This cannot be undone.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void remove(pendingDelete)}
          open
          title="Delete this role?"
        />
      ) : null}
    </div>
  );
}

function AdminRoleEditor({
  catalog,
  error,
  lockedKeys,
  onCancel,
  onSave,
  role,
  saving,
}: {
  catalog: AdminCapabilityModule[];
  error: string | null;
  lockedKeys: ReadonlySet<string>;
  onCancel: () => void;
  onSave: (input: { name: string; description: string; capabilities: string[] }) => void;
  role: AdminRoleDetail | null;
  saving: boolean;
}) {
  const [name, setName] = useState(role?.role.name ?? "");
  const [description, setDescription] = useState(role?.role.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(role?.capabilities ?? [])
  );

  function toggle(key: string, next: boolean) {
    setSelected((current) => {
      const updated = new Set(current);
      if (next) updated.add(key);
      else updated.delete(key);
      return updated;
    });
  }

  function toggleModule(keys: string[], next: boolean) {
    setSelected((current) => {
      const updated = new Set(current);
      for (const key of keys) {
        if (next) updated.add(key);
        else updated.delete(key);
      }
      return updated;
    });
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ name: name.trim(), description: description.trim(), capabilities: [...selected] });
      }}
    >
      {error ? (
        <div
          className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-semibold text-[#a63c2e]"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <AdminSection
        compact
        description="Give the role a name people will recognise, then choose what it allows."
        title={role ? `Edit ${role.role.name}` : "New role"}
      >
        <div className="grid gap-4 p-5">
          <label className="grid gap-1">
            <span className="text-xs font-extrabold uppercase text-slate-500">Name</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-extrabold uppercase text-slate-500">
              What this role is for
            </span>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              maxLength={600}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              value={description}
            />
          </label>
        </div>
      </AdminSection>

      <AdminSection
        compact
        description="Anyone with this role will be able to do all of these things."
        title="Permissions"
      >
        <div className="p-5">
          <AdminPermissionPicker
            disabled={saving}
            lockedKeys={lockedKeys}
            modules={catalog}
            onToggle={toggle}
            onToggleModule={toggleModule}
            selected={selected}
          />
        </div>
      </AdminSection>

      <div className="flex flex-wrap justify-end gap-2">
        <AdminActionButton disabled={saving} onClick={onCancel}>
          Cancel
        </AdminActionButton>
        <button
          className="inline-flex min-h-9 items-center justify-center rounded-full border border-slate-950 bg-slate-950 px-4 py-1.5 text-xs font-extrabold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={saving || name.trim().length < 2}
          type="submit"
        >
          {saving ? "Saving…" : role ? "Save changes" : "Create role"}
        </button>
      </div>
    </form>
  );
}
