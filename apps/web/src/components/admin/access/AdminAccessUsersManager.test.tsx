// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminCapabilities, allAdminCapabilities } from "@/lib/adminCapabilities";
import type {
  AdminAccessUser,
  AdminAccessUserDetail,
} from "@/services/adminAccessService";

const state = vi.hoisted(() => ({
  access: { isSuperAdmin: true, roles: [] as unknown[], granted: new Set<string>() },
}));

const api = vi.hoisted(() => ({
  listUsers: vi.fn(),
  getUser: vi.fn(),
  updateRoles: vi.fn(),
  setActive: vi.fn(),
}));

vi.mock("@/services/authService", () => ({
  getAdminCapabilities: () => state.access,
}));

vi.mock("@/services/adminAccessService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/adminAccessService")>();
  return {
    ...actual,
    listAdminAccessUsers: api.listUsers,
    getAdminAccessUser: api.getUser,
    updateAdminUserRoles: api.updateRoles,
    setAdminUserActive: api.setActive,
    getAdminAccessError: (_error: unknown, fallback = "Something went wrong.") => fallback,
  };
});

const { AdminAccessUsersManager } = await import("./AdminAccessUsersManager");

function user(overrides: Partial<AdminAccessUser> = {}): AdminAccessUser {
  return {
    adminUserId: "admin-1",
    userId: "user-1",
    email: "sam@example.test",
    displayName: "Sam Operator",
    isActive: true,
    disabledAt: null,
    lastLoginAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    isSuperAdmin: false,
    isSelf: false,
    canManage: true,
    roles: [
      { roleId: "role-sales", code: "sales", name: "Sales", grantsAllCapabilities: false },
    ],
    capabilityCount: 9,
    rowVersion: "AAAAAAAAB9E=",
    ...overrides,
  };
}

function detail(overrides: Partial<AdminAccessUserDetail> = {}): AdminAccessUserDetail {
  return {
    user: user(),
    effectiveCapabilities: [adminCapabilities.salesView, adminCapabilities.salesManage],
    effectiveCapabilitiesByModule: [
      {
        key: "sales",
        name: "Merchant Sales",
        description: "Bulk sales to business customers.",
        capabilities: [
          {
            key: adminCapabilities.salesView,
            name: "View sales and resellers",
            description: "See resellers and sales performance.",
            isWriteAccess: false,
            isSensitive: false,
          },
          {
            key: adminCapabilities.salesManage,
            name: "Manage sales and resellers",
            description: "Add and edit resellers.",
            isWriteAccess: true,
            isSensitive: false,
          },
        ],
      },
    ],
    assignableRoles: [
      {
        id: "role-sales",
        code: "sales",
        name: "Sales",
        description: "Resellers and quotations.",
        isSystemRole: true,
        grantsAllCapabilities: false,
        sortOrder: 50,
        capabilityCount: 9,
        assignedUserCount: 1,
        canEdit: true,
        canDelete: false,
        canAssign: true,
        updatedAt: "2026-01-01T00:00:00Z",
        rowVersion: "AAAAAAAAB9E=",
      },
      {
        id: "role-finance",
        code: "finance",
        name: "Finance",
        description: "Payments and payouts.",
        isSystemRole: true,
        grantsAllCapabilities: false,
        sortOrder: 70,
        capabilityCount: 20,
        assignedUserCount: 0,
        canEdit: true,
        canDelete: false,
        canAssign: true,
        updatedAt: "2026-01-01T00:00:00Z",
        rowVersion: "AAAAAAAAB9E=",
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  // jsdom has no layout, so the dropdown's scroll-into-view is a no-op here.
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Object.assign(state.access, allAdminCapabilities());
  api.listUsers.mockResolvedValue({ data: [user()] });
  api.getUser.mockResolvedValue({ data: detail() });
  api.updateRoles.mockResolvedValue({ data: detail() });
  api.setActive.mockResolvedValue({ data: detail() });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Admin users list", () => {
  it("shows each person with their roles and status", async () => {
    render(<AdminAccessUsersManager />);

    expect(await screen.findByText("Sam Operator")).toBeTruthy();
    expect(screen.getByText("sam@example.test")).toBeTruthy();
    expect(screen.getByText("Sales")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("9 permissions")).toBeTruthy();
  });

  it("says plainly when somebody has full access", async () => {
    api.listUsers.mockResolvedValue({
      data: [
        user({
          isSuperAdmin: true,
          roles: [
            {
              roleId: "role-super",
              code: "super-admin",
              name: "Super Admin",
              grantsAllCapabilities: true,
            },
          ],
        }),
      ],
    });
    render(<AdminAccessUsersManager />);

    expect(await screen.findByText("Everything")).toBeTruthy();
  });

  it("flags somebody who has no role, because they cannot do anything yet", async () => {
    api.listUsers.mockResolvedValue({ data: [user({ roles: [], capabilityCount: 0 })] });
    render(<AdminAccessUsersManager />);

    expect(await screen.findByText(/No role/)).toBeTruthy();
  });

  it("filters by status", async () => {
    render(<AdminAccessUsersManager />);
    await screen.findByText("Sam Operator");

    fireEvent.click(screen.getByRole("combobox", { name: "Status" }));
    fireEvent.click(await screen.findByRole("option", { name: "Inactive" }));

    await waitFor(() =>
      expect(api.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({ status: "inactive" }),
        expect.anything()
      )
    );
  });
});

describe("Admin users read-only state", () => {
  it("explains the limit and offers no controls to somebody who can only look", async () => {
    Object.assign(state.access, {
      isSuperAdmin: false,
      roles: [],
      granted: new Set([adminCapabilities.adminUsersView]),
    });
    api.listUsers.mockResolvedValue({ data: [user({ canManage: false })] });
    api.getUser.mockResolvedValue({
      data: detail({ user: user({ canManage: false }), assignableRoles: [] }),
    });

    render(<AdminAccessUsersManager />);
    await screen.findByText("Sam Operator");

    expect(screen.getByText(/not change it/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Turn off access" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "View access" }));
    await screen.findByText(/You can see these roles but not change them/i);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("Assigning roles", () => {
  it("shows effective permissions grouped by module", async () => {
    render(<AdminAccessUsersManager />);
    await screen.findByText("Sam Operator");

    fireEvent.click(screen.getByRole("button", { name: "View access" }));

    expect(await screen.findByText("What this allows")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Merchant Sales" })).toBeTruthy();
    expect(screen.getByText("View sales and resellers")).toBeTruthy();
    expect(screen.getByText("Manage sales and resellers")).toBeTruthy();
  });

  it("adds a role and sends the version it was read at", async () => {
    render(<AdminAccessUsersManager />);
    await screen.findByText("Sam Operator");
    fireEvent.click(screen.getByRole("button", { name: "View access" }));

    const finance = await screen.findByRole("checkbox", { name: /Finance/ });
    fireEvent.click(finance);

    await waitFor(() =>
      expect(api.updateRoles).toHaveBeenCalledWith(
        "admin-1",
        expect.arrayContaining(["role-sales", "role-finance"]),
        "AAAAAAAAB9E="
      )
    );
  });

  it("removes a role", async () => {
    render(<AdminAccessUsersManager />);
    await screen.findByText("Sam Operator");
    fireEvent.click(screen.getByRole("button", { name: "View access" }));

    const sales = await screen.findByRole("checkbox", { name: /Sales/ });
    expect((sales as HTMLInputElement).checked).toBe(true);
    fireEvent.click(sales);

    await waitFor(() => expect(api.updateRoles).toHaveBeenCalledWith("admin-1", [], "AAAAAAAAB9E="));
  });

  it("tells you the server refused, and shows what is actually stored", async () => {
    api.updateRoles.mockRejectedValue(new Error("refused"));
    render(<AdminAccessUsersManager />);
    await screen.findByText("Sam Operator");
    fireEvent.click(screen.getByRole("button", { name: "View access" }));

    fireEvent.click(await screen.findByRole("checkbox", { name: /Finance/ }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    // Reloaded from the server rather than left showing the refused change.
    await waitFor(() => expect(api.getUser).toHaveBeenCalledTimes(2));
  });

  it("never offers to change your own roles", async () => {
    api.listUsers.mockResolvedValue({
      data: [user({ isSelf: true, canManage: false })],
    });
    api.getUser.mockResolvedValue({
      data: detail({ user: user({ isSelf: true, canManage: false }) }),
    });

    render(<AdminAccessUsersManager />);
    await screen.findByText("Sam Operator");

    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Turn off access" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "View access" }));
    expect(
      await screen.findByText(/cannot change your own roles/i)
    ).toBeTruthy();
  });
});

describe("Turning access on and off", () => {
  it("confirms before switching somebody off", async () => {
    render(<AdminAccessUsersManager />);
    await screen.findByText("Sam Operator");

    fireEvent.click(screen.getByRole("button", { name: "Turn off access" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/no longer be able to sign in/i)).toBeTruthy();
    expect(api.setActive).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Turn off access" }));
    await waitFor(() =>
      expect(api.setActive).toHaveBeenCalledWith("admin-1", false, "AAAAAAAAB9E=")
    );
  });

  it("turns access back on without a confirmation step", async () => {
    api.listUsers.mockResolvedValue({
      data: [user({ isActive: false, disabledAt: "2026-02-01T00:00:00Z" })],
    });
    render(<AdminAccessUsersManager />);
    await screen.findByText("Sam Operator");

    fireEvent.click(screen.getByRole("button", { name: "Turn on access" }));
    await waitFor(() =>
      expect(api.setActive).toHaveBeenCalledWith("admin-1", true, "AAAAAAAAB9E=")
    );
  });

  it("surfaces the reason when the server refuses, such as the last Super Admin", async () => {
    api.setActive.mockRejectedValue(new Error("refused"));
    render(<AdminAccessUsersManager />);
    await screen.findByText("Sam Operator");

    fireEvent.click(screen.getByRole("button", { name: "Turn off access" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Turn off access" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
