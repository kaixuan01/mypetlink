"use client";

import { useEffect, useState } from "react";
import { AdminActionButton, AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { AdminPermissionGroups } from "@/components/admin/access/AdminPermissionGroups";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { adminCapabilities, hasCapability } from "@/lib/adminCapabilities";
import { useAdminAccessQuery } from "@/lib/useAdminAccessQuery";
import { getAdminCapabilities } from "@/services/authService";
import {
  getAdminAccessError,
  getAdminAccessUser,
  listAdminAccessUsers,
  setAdminUserActive,
  updateAdminUserRoles,
  type AdminAccessUser,
  type AdminAccessUserDetail,
} from "@/services/adminAccessService";

type StatusFilter = "all" | "active" | "inactive";

/**
 * Who can use the Admin Portal, what each of them can do, and how to change it.
 *
 * Every control here appears because the API said this operator may use it
 * (`canManage` on the row it belongs to). The API checks again on every
 * request, so hiding a control is a courtesy, never the control itself.
 */
export function AdminAccessUsersManager() {
  const access = getAdminCapabilities();
  const canManage = hasCapability(access, adminCapabilities.adminUsersManage);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState<AdminAccessUser | null>(null);

  // Typing should not fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const list = useAdminAccessQuery<AdminAccessUser[]>(
    `${appliedSearch}|${status}`,
    async (signal) => {
      const response = await listAdminAccessUsers(
        { search: appliedSearch, status, pageSize: 100 },
        signal
      );
      return response.data ?? [];
    },
    (error) => getAdminAccessError(error, "We couldn’t load the admin users. Please try again.")
  );

  const detail = useAdminAccessQuery<AdminAccessUserDetail | null>(
    selectedId ?? "",
    async (signal) => {
      if (!selectedId) return null;
      const response = await getAdminAccessUser(selectedId, signal);
      return response.data ?? null;
    },
    (error) => getAdminAccessError(error, "We couldn’t load this person’s permissions.")
  );

  // Re-reads after every change rather than trusting the response, so the
  // screen always shows what is actually stored — including when the server
  // refused part of what was asked for.
  function refresh() {
    list.reload();
    detail.reload();
  }

  async function applyRoles(user: AdminAccessUser, nextRoleIds: string[]) {
    setSaving(true);
    setActionError(null);
    try {
      await updateAdminUserRoles(user.adminUserId, nextRoleIds, user.rowVersion);
    } catch (error) {
      setActionError(getAdminAccessError(error));
    } finally {
      setSaving(false);
      refresh();
    }
  }

  async function applyActive(user: AdminAccessUser, isActive: boolean) {
    setSaving(true);
    setActionError(null);
    try {
      await setAdminUserActive(user.adminUserId, isActive, user.rowVersion);
    } catch (error) {
      setActionError(getAdminAccessError(error));
    } finally {
      setSaving(false);
      setPendingDeactivate(null);
      refresh();
    }
  }

  const users = list.data ?? [];

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
          You can see who has Admin Portal access, but not change it. Ask a Super Admin if
          something needs updating.
        </AdminNotice>
      ) : null}

      <AdminSection
        compact
        description="Everyone who can sign in to the Admin Portal, and the roles they hold."
        title="Admin users"
      >
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
          <label className="min-w-0 flex-1 basis-56">
            <span className="block text-xs font-extrabold uppercase text-slate-500">Search</span>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or email"
              type="search"
              value={search}
            />
          </label>
          <div className="basis-40">
            <span className="block text-xs font-extrabold uppercase text-slate-500">Status</span>
            <div className="mt-1">
              <Select
                aria-label="Status"
                onChange={(value) => setStatus(value as StatusFilter)}
                options={[
                  { value: "all", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
                value={status}
              />
            </div>
          </div>
        </div>

        {list.error ? (
          <div className="p-5">
            <AdminNotice>{list.error}</AdminNotice>
            <div className="mt-3">
              <AdminActionButton onClick={list.reload}>Try again</AdminActionButton>
            </div>
          </div>
        ) : list.loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : users.length === 0 ? (
          <EmptyState
            description="Try a different search or status."
            icon="users"
            title="No admin users match"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-extrabold uppercase text-slate-500">
                  <th className="px-5 py-3">Person</th>
                  <th className="px-5 py-3">Roles</th>
                  <th className="px-5 py-3">Permissions</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.adminUserId} className="border-b border-slate-100 align-top">
                    <td className="px-5 py-3">
                      <span className="block font-bold text-slate-900">
                        {user.displayName}
                        {user.isSelf ? (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-extrabold uppercase text-slate-600">
                            You
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-slate-500">{user.email}</span>
                    </td>
                    <td className="px-5 py-3">
                      {user.roles.length === 0 ? (
                        <span className="text-xs font-bold text-[#a63c2e]">
                          No role — cannot do anything yet
                        </span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <span
                              key={role.roleId}
                              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700"
                            >
                              {role.name}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs font-semibold text-slate-600">
                      {user.isSuperAdmin ? "Everything" : `${user.capabilityCount} permissions`}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
                          user.isActive
                            ? "bg-[#e8f7ee] text-[#1d7a45]"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="flex flex-wrap justify-end gap-2">
                        <AdminActionButton
                          onClick={() =>
                            setSelectedId((current) =>
                              current === user.adminUserId ? null : user.adminUserId
                            )
                          }
                        >
                          {selectedId === user.adminUserId ? "Hide" : "View access"}
                        </AdminActionButton>
                        {user.canManage ? (
                          user.isActive ? (
                            <AdminActionButton
                              disabled={saving}
                              onClick={() => setPendingDeactivate(user)}
                              tone="danger"
                            >
                              Turn off access
                            </AdminActionButton>
                          ) : (
                            <AdminActionButton
                              disabled={saving}
                              onClick={() => void applyActive(user, true)}
                              tone="primary"
                            >
                              Turn on access
                            </AdminActionButton>
                          )
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>

      {selectedId ? (
        <AdminUserAccessDetail
          detail={detail.data ?? null}
          error={detail.error}
          loading={detail.loading}
          onChangeRoles={applyRoles}
          saving={saving}
        />
      ) : null}

      {pendingDeactivate ? (
        <ConfirmDialog
          confirmDisabled={saving}
          confirmLabel="Turn off access"
          destructive
          message={`${pendingDeactivate.displayName} will no longer be able to sign in to the Admin Portal. You can turn it back on at any time.`}
          onCancel={() => setPendingDeactivate(null)}
          onConfirm={() => void applyActive(pendingDeactivate, false)}
          open
          title="Turn off Admin Portal access?"
        />
      ) : null}
    </div>
  );
}

function AdminUserAccessDetail({
  detail,
  error,
  loading,
  onChangeRoles,
  saving,
}: {
  detail: AdminAccessUserDetail | null;
  error: string | null;
  loading: boolean;
  onChangeRoles: (user: AdminAccessUser, roleIds: string[]) => void | Promise<void>;
  saving: boolean;
}) {
  if (error) {
    return (
      <AdminSection compact title="Access">
        <div className="p-5">
          <AdminNotice>{error}</AdminNotice>
        </div>
      </AdminSection>
    );
  }

  if (loading || !detail) {
    return (
      <AdminSection compact title="Access">
        <p className="p-5 text-sm text-slate-500">Loading…</p>
      </AdminSection>
    );
  }

  const user = detail.user;
  const held = new Set(user.roles.map((role) => role.roleId));

  function toggleRole(roleId: string, next: boolean) {
    const roleIds = new Set(held);
    if (next) roleIds.add(roleId);
    else roleIds.delete(roleId);
    void onChangeRoles(user, [...roleIds]);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AdminSection
        compact
        description={
          user.canManage
            ? "A role is a set of permissions. Someone can hold more than one."
            : "You can see these roles but not change them."
        }
        title={`Roles for ${user.displayName}`}
      >
        {user.isSelf ? (
          <div className="px-5 pt-4">
            <AdminNotice>
              You cannot change your own roles. Ask another administrator who manages access.
            </AdminNotice>
          </div>
        ) : null}

        <ul className="grid gap-2 p-5">
          {(user.canManage ? detail.assignableRoles : []).map((role) => (
            <li key={role.id}>
              <label className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                <input
                  checked={held.has(role.id)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                  disabled={saving}
                  onChange={(event) => toggleRole(role.id, event.target.checked)}
                  type="checkbox"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900">{role.name}</span>
                  <span className="block text-xs text-slate-500">{role.description}</span>
                </span>
              </label>
            </li>
          ))}

          {!user.canManage
            ? user.roles.map((role) => (
                <li
                  key={role.roleId}
                  className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900"
                >
                  {role.name}
                </li>
              ))
            : null}

          {user.canManage && detail.assignableRoles.length === 0 ? (
            <li className="text-sm text-slate-500">
              There are no roles you are able to assign.
            </li>
          ) : null}

          {!user.canManage && user.roles.length === 0 ? (
            <li className="text-sm text-slate-500">No roles.</li>
          ) : null}
        </ul>
      </AdminSection>

      <AdminSection
        compact
        description={
          user.isSuperAdmin
            ? "Everything, including anything added in future."
            : "The permissions these roles add up to."
        }
        title="What this allows"
      >
        <AdminPermissionGroups
          emptyMessage="No permissions yet. Give this person a role so they can do something."
          modules={detail.effectiveCapabilitiesByModule}
        />
      </AdminSection>
    </div>
  );
}
