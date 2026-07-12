// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ApiClientError } from "@/services/apiClient";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/pets",
  useRouter: () => ({ replace }),
}));

vi.mock("@/services/apiConfig", () => ({
  canUseApi: () => true,
  isApiConfigured: () => true,
}));

type AccessSnapshot = { access: { admin: { isActive: boolean } } | null } | null;

const authState = {
  authed: true,
  cache: null as AccessSnapshot,
  check: vi.fn(),
};

vi.mock("@/services/authService", () => ({
  isAdminAuthenticated: () => authState.authed,
  getCachedAdminAccess: () => authState.cache,
  clearCachedAdminAccess: () => {
    authState.cache = null;
  },
  checkAdminAccess: (...args: unknown[]) => authState.check(...args),
}));

// Imported after the mocks are registered.
const { AdminGuard } = await import("@/components/auth/AdminGuard");

afterEach(() => {
  cleanup();
  replace.mockReset();
  authState.authed = true;
  authState.cache = null;
  authState.check.mockReset();
});

describe("AdminGuard", () => {
  it("verifies access once, renders the page, and reuses the result on the next navigation", async () => {
    authState.check.mockImplementation(async () => {
      const access = { user: {}, admin: { role: "Admin", isActive: true } };
      authState.cache = { access }; // mirror real checkAdminAccess() caching
      return access;
    });

    const first = render(
      <AdminGuard>
        <div>ADMIN CONTENT</div>
      </AdminGuard>
    );
    await waitFor(() => expect(screen.getByText("ADMIN CONTENT")).toBeTruthy());
    expect(authState.check).toHaveBeenCalledTimes(1);

    // Navigating to another Admin page remounts the guard boundary.
    first.unmount();
    render(
      <AdminGuard>
        <div>ADMIN CONTENT 2</div>
      </AdminGuard>
    );
    await waitFor(() => expect(screen.getByText("ADMIN CONTENT 2")).toBeTruthy());

    // No second access call — the verified result was reused, not re-fetched.
    expect(authState.check).toHaveBeenCalledTimes(1);
  });

  it("shows Access Denied (no retry) on 403 and never renders admin content", async () => {
    authState.check.mockImplementation(async () => {
      throw new ApiClientError(403, "forbidden", "No access.");
    });

    render(
      <AdminGuard>
        <div>SECRET ADMIN CONTENT</div>
      </AdminGuard>
    );

    await waitFor(() =>
      expect(screen.getByText("Access not available")).toBeTruthy()
    );
    expect(screen.queryByText("SECRET ADMIN CONTENT")).toBeNull();
    expect(screen.queryByText("Try Again")).toBeNull();
  });

  it("redirects to login when not authenticated and never renders admin content", async () => {
    authState.authed = false;

    render(
      <AdminGuard>
        <div>SECRET ADMIN CONTENT</div>
      </AdminGuard>
    );

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace.mock.calls[0][0]).toContain("/admin/login");
    expect(screen.queryByText("SECRET ADMIN CONTENT")).toBeNull();
    expect(authState.check).not.toHaveBeenCalled();
  });
});
