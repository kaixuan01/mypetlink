import { apiRequest, isApiClientError } from "@/services/apiClient";

// Access Management: the people who can use the Admin Portal, and the roles
// that decide what each of them may do.
//
// Every call here is authorized by the API against the same permission the
// screen used to decide what to show, so a request made any other way is
// refused in exactly the same circumstances.

export type AdminCapabilitySummary = {
  key: string;
  name: string;
  description: string;
  isWriteAccess: boolean;
  isSensitive: boolean;
};

export type AdminCapabilityModule = {
  key: string;
  name: string;
  description: string;
  capabilities: AdminCapabilitySummary[];
};

export type AdminRoleSummary = {
  id: string;
  code: string;
  name: string;
  description: string;
  isSystemRole: boolean;
  grantsAllCapabilities: boolean;
  sortOrder: number;
  capabilityCount: number;
  assignedUserCount: number;
  canEdit: boolean;
  canDelete: boolean;
  canAssign: boolean;
  updatedAt: string;
  rowVersion: string;
};

export type AdminRoleMember = {
  adminUserId: string;
  userId: string;
  email: string;
  displayName: string;
  isActive: boolean;
};

export type AdminRoleDetail = {
  role: AdminRoleSummary;
  capabilities: string[];
  capabilitiesByModule: AdminCapabilityModule[];
  members: AdminRoleMember[];
};

export type AdminAccessUserRole = {
  roleId: string;
  code: string;
  name: string;
  grantsAllCapabilities: boolean;
};

export type AdminAccessUser = {
  adminUserId: string;
  userId: string;
  email: string;
  displayName: string;
  isActive: boolean;
  disabledAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  isSuperAdmin: boolean;
  isSelf: boolean;
  canManage: boolean;
  roles: AdminAccessUserRole[];
  capabilityCount: number;
  rowVersion: string;
};

export type AdminAccessUserDetail = {
  user: AdminAccessUser;
  effectiveCapabilities: string[];
  effectiveCapabilitiesByModule: AdminCapabilityModule[];
  assignableRoles: AdminRoleSummary[];
};

export type AdminAccessUserQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "active" | "inactive" | "all";
  roleId?: string;
};

const usersEndpoint = "/api/v1/admin/access/users";
const rolesEndpoint = "/api/v1/admin/access/roles";

export function listAdminAccessUsers(query: AdminAccessUserQuery = {}, signal?: AbortSignal) {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 25));
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.roleId) params.set("roleId", query.roleId);

  return apiRequest<AdminAccessUser[]>(`${usersEndpoint}?${params.toString()}`, { signal });
}

export function getAdminAccessUser(adminUserId: string, signal?: AbortSignal) {
  return apiRequest<AdminAccessUserDetail>(`${usersEndpoint}/${adminUserId}`, { signal });
}

export function updateAdminUserRoles(
  adminUserId: string,
  roleIds: string[],
  rowVersion: string
) {
  return apiRequest<AdminAccessUserDetail>(`${usersEndpoint}/${adminUserId}/roles`, {
    method: "PUT",
    body: { roleIds, rowVersion },
  });
}

export function setAdminUserActive(
  adminUserId: string,
  isActive: boolean,
  rowVersion: string
) {
  return apiRequest<AdminAccessUserDetail>(
    `${usersEndpoint}/${adminUserId}/${isActive ? "activate" : "deactivate"}`,
    { method: "POST", body: { rowVersion } }
  );
}

export function listAdminRoles(signal?: AbortSignal) {
  return apiRequest<AdminRoleSummary[]>(rolesEndpoint, { signal });
}

export function getAdminRole(roleId: string, signal?: AbortSignal) {
  return apiRequest<AdminRoleDetail>(`${rolesEndpoint}/${roleId}`, { signal });
}

export function listAdminCapabilityCatalog(signal?: AbortSignal) {
  return apiRequest<AdminCapabilityModule[]>(`${rolesEndpoint}/capabilities`, { signal });
}

export function createAdminRole(input: {
  name: string;
  description: string;
  capabilities: string[];
}) {
  return apiRequest<AdminRoleDetail>(rolesEndpoint, { method: "POST", body: input });
}

export function updateAdminRole(
  roleId: string,
  input: { name: string; description: string; capabilities: string[]; rowVersion: string }
) {
  return apiRequest<AdminRoleDetail>(`${rolesEndpoint}/${roleId}`, {
    method: "PUT",
    body: input,
  });
}

export function deleteAdminRole(roleId: string) {
  return apiRequest<void>(`${rolesEndpoint}/${roleId}`, { method: "DELETE" });
}

/**
 * A message an operator can act on.
 *
 * The API's own wording is used when it explains a rule — "you cannot change
 * your own roles", "this is the only active Super Admin" — because that is the
 * part the operator needs. Anything else falls back to a plain sentence.
 */
export function getAdminAccessError(error: unknown, fallback = "We couldn’t save this change. Please try again."): string {
  if (!isApiClientError(error)) {
    return fallback;
  }

  if (error.status === 403 || error.status === 409) {
    return error.message || fallback;
  }

  if (error.code === "validation_failed" || error.status === 400) {
    return error.message || "Please check the highlighted fields and try again.";
  }

  if (error.status === 401) {
    return "Your session has expired. Please sign in again.";
  }

  if (error.status === 404) {
    return "This record was not found. It may have been removed.";
  }

  if (error.status === 0 || error.status === 503) {
    return "We couldn’t connect right now. Please try again in a moment.";
  }

  return fallback;
}
