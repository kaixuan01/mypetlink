// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminCapabilities, allAdminCapabilities } from "@/lib/adminCapabilities";
import type {
  AdminCapabilityModule,
  AdminRoleDetail,
  AdminRoleSummary,
} from "@/services/adminAccessService";

const state = vi.hoisted(() => ({
  access: { isSuperAdmin: true, roles: [] as unknown[], granted: new Set<string>() },
}));

const api = vi.hoisted(() => ({
  listRoles: vi.fn(),
  getRole: vi.fn(),
  catalog: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
}));

vi.mock("@/services/authService", () => ({
  getAdminCapabilities: () => state.access,
}));

vi.mock("@/services/adminAccessService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/adminAccessService")>();
  return {
    ...actual,
    listAdminRoles: api.listRoles,
    getAdminRole: api.getRole,
    listAdminCapabilityCatalog: api.catalog,
    createAdminRole: api.createRole,
    updateAdminRole: api.updateRole,
    deleteAdminRole: api.deleteRole,
    getAdminAccessError: (_error: unknown, fallback = "Something went wrong.") => fallback,
  };
});

const { AdminAccessRolesManager } = await import("./AdminAccessRolesManager");

function role(overrides: Partial<AdminRoleSummary> = {}): AdminRoleSummary {
  return {
    id: "role-sales",
    code: "sales",
    name: "Sales",
    description: "Resellers, quotations and merchant orders.",
    isSystemRole: true,
    grantsAllCapabilities: false,
    sortOrder: 50,
    capabilityCount: 9,
    assignedUserCount: 2,
    canEdit: true,
    canDelete: false,
    canAssign: true,
    updatedAt: "2026-01-01T00:00:00Z",
    rowVersion: "AAAAAAAAB9E=",
    ...overrides,
  };
}

const catalog: AdminCapabilityModule[] = [
  {
    key: "inventory",
    name: "Tag Inventory",
    description: "Physical tag stock.",
    capabilities: [
      {
        key: adminCapabilities.inventoryView,
        name: "View inventory",
        description: "See current tag stock.",
        isWriteAccess: false,
        isSensitive: false,
      },
      {
        key: adminCapabilities.inventoryGenerate,
        name: "Create new tag stock",
        description: "Generate new tag codes.",
        isWriteAccess: true,
        isSensitive: true,
      },
    ],
  },
];

function detail(overrides: Partial<AdminRoleDetail> = {}): AdminRoleDetail {
  return {
    role: role(),
    capabilities: [adminCapabilities.inventoryView],
    capabilitiesByModule: [
      { ...catalog[0], capabilities: [catalog[0].capabilities[0]] },
    ],
    members: [
      {
        adminUserId: "admin-1",
        userId: "user-1",
        email: "sam@example.test",
        displayName: "Sam Operator",
        isActive: true,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  Object.assign(state.access, allAdminCapabilities());
  api.listRoles.mockResolvedValue({ data: [role()] });
  api.getRole.mockResolvedValue({ data: detail() });
  api.catalog.mockResolvedValue({ data: catalog });
  api.createRole.mockResolvedValue({ data: detail() });
  api.updateRole.mockResolvedValue({ data: detail() });
  api.deleteRole.mockResolvedValue({ data: undefined });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Roles list", () => {
  it("shows each role with what it covers and who holds it", async () => {
    render(<AdminAccessRolesManager />);

    expect(await screen.findByText("Sales")).toBeTruthy();
    expect(screen.getByText("Resellers, quotations and merchant orders.")).toBeTruthy();
    expect(screen.getByText(/9 permissions/)).toBeTruthy();
    expect(screen.getByText(/2 people/)).toBeTruthy();
    expect(screen.getByText("Built in")).toBeTruthy();
  });

  it("says full access rather than a permission count for the founder role", async () => {
    api.listRoles.mockResolvedValue({
      data: [role({ name: "Super Admin", grantsAllCapabilities: true, canEdit: false })],
    });
    render(<AdminAccessRolesManager />);

    expect(await screen.findByText(/Full access, including anything added in future/)).toBeTruthy();
  });

  it("protects built-in roles from deletion", async () => {
    render(<AdminAccessRolesManager />);
    await screen.findByText("Sales");

    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("does not offer editing for a role the server says cannot be edited", async () => {
    api.listRoles.mockResolvedValue({
      data: [role({ grantsAllCapabilities: true, canEdit: false, canDelete: false })],
    });
    render(<AdminAccessRolesManager />);
    await screen.findByText("Sales");

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("shows permissions grouped by module, and who holds the role", async () => {
    render(<AdminAccessRolesManager />);
    await screen.findByText("Sales");

    fireEvent.click(screen.getByRole("button", { name: "View permissions" }));

    expect(await screen.findByText("Sales — permissions")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tag Inventory" })).toBeTruthy();
    expect(screen.getByText("View inventory")).toBeTruthy();
    expect(screen.getByText("Who has this role")).toBeTruthy();
    expect(screen.getByText("Sam Operator")).toBeTruthy();
  });
});

describe("Roles read-only state", () => {
  it("explains the limit and offers no controls to somebody who can only look", async () => {
    Object.assign(state.access, {
      isSuperAdmin: false,
      roles: [],
      granted: new Set([adminCapabilities.adminRolesView]),
    });
    api.listRoles.mockResolvedValue({
      data: [role({ canEdit: false, canDelete: false, canAssign: false })],
    });

    render(<AdminAccessRolesManager />);
    await screen.findByText("Sales");

    expect(screen.getByText(/not change them/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New role" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getByRole("button", { name: "View permissions" })).toBeTruthy();
  });
});

describe("Creating and editing a role", () => {
  it("creates a role from the permissions picked", async () => {
    render(<AdminAccessRolesManager />);
    await screen.findByText("Sales");

    fireEvent.click(screen.getByRole("button", { name: "New role" }));

    fireEvent.change(await screen.findByRole("textbox", { name: /Name/i }), {
      target: { value: "Warehouse Lead" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /View inventory/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create role" }));

    await waitFor(() =>
      expect(api.createRole).toHaveBeenCalledWith({
        name: "Warehouse Lead",
        description: "",
        capabilities: [adminCapabilities.inventoryView],
      })
    );
  });

  it("sends the version the role was read at when saving an edit", async () => {
    render(<AdminAccessRolesManager />);
    await screen.findByText("Sales");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByText("Edit Sales");

    fireEvent.click(screen.getByRole("checkbox", { name: /Create new tag stock/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(api.updateRole).toHaveBeenCalledWith("role-sales", {
        name: "Sales",
        description: "Resellers, quotations and merchant orders.",
        capabilities: [adminCapabilities.inventoryView, adminCapabilities.inventoryGenerate],
        rowVersion: "AAAAAAAAB9E=",
      })
    );
  });

  it("will not let you hand out a permission you do not have yourself", async () => {
    Object.assign(state.access, {
      isSuperAdmin: false,
      roles: [],
      granted: new Set([
        adminCapabilities.adminRolesView,
        adminCapabilities.adminRolesManage,
        adminCapabilities.inventoryView,
      ]),
    });

    render(<AdminAccessRolesManager />);
    await screen.findByText("Sales");
    fireEvent.click(screen.getByRole("button", { name: "New role" }));

    const locked = await screen.findByRole("checkbox", { name: /Create new tag stock/ });
    expect((locked as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/do not have it yourself/i)).toBeTruthy();

    const allowed = screen.getByRole("checkbox", { name: /View inventory/ });
    expect((allowed as HTMLInputElement).disabled).toBe(false);
  });

  it("marks high-impact permissions so they are not granted by accident", async () => {
    render(<AdminAccessRolesManager />);
    await screen.findByText("Sales");
    fireEvent.click(screen.getByRole("button", { name: "New role" }));

    const generate = (await screen.findByRole("checkbox", { name: /Create new tag stock/ }))
      .closest("label")!;
    expect(within(generate).getByText("High impact")).toBeTruthy();
  });

  it("surfaces the reason when the server refuses to save", async () => {
    api.createRole.mockRejectedValue(new Error("refused"));
    render(<AdminAccessRolesManager />);
    await screen.findByText("Sales");

    fireEvent.click(screen.getByRole("button", { name: "New role" }));
    fireEvent.change(await screen.findByRole("textbox", { name: /Name/i }), {
      target: { value: "Back Door" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create role" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});

describe("Deleting a role", () => {
  it("confirms first, then deletes", async () => {
    api.listRoles.mockResolvedValue({
      data: [
        role({
          id: "role-custom",
          name: "Warehouse",
          isSystemRole: false,
          assignedUserCount: 0,
          canDelete: true,
        }),
      ],
    });
    render(<AdminAccessRolesManager />);
    await screen.findByText("Warehouse");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(api.deleteRole).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete role" }));
    await waitFor(() => expect(api.deleteRole).toHaveBeenCalledWith("role-custom"));
  });
});
