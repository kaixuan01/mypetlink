// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiMode: true,
  developmentEnabled: false,
  authenticated: false,
  replace: vi.fn(),
  checkAdminAccess: vi.fn(),
  loginAsDevelopmentAdmin: vi.fn(),
  loginMockAdmin: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => mocks.apiMode,
  isDevelopmentAdminLoginEnabled: () => mocks.developmentEnabled,
}));

vi.mock("@/services/authService", () => ({
  checkAdminAccess: (...args: unknown[]) => mocks.checkAdminAccess(...args),
  isOwnerAuthenticated: () => mocks.authenticated,
  loginAsDevelopmentAdmin: (...args: unknown[]) =>
    mocks.loginAsDevelopmentAdmin(...args),
  loginMockAdmin: (...args: unknown[]) => mocks.loginMockAdmin(...args),
}));

const { AdminLoginPanel } = await import("./AdminLoginPanel");

describe("AdminLoginPanel Development login", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/admin/login");
    mocks.apiMode = true;
    mocks.developmentEnabled = false;
    mocks.authenticated = false;
    mocks.replace.mockReset();
    mocks.checkAdminAccess.mockReset();
    mocks.loginAsDevelopmentAdmin.mockReset();
    mocks.loginMockAdmin.mockReset();
  });

  afterEach(cleanup);

  it("does not render the Development login action when the production-safe flag is off", () => {
    render(<AdminLoginPanel />);

    expect(
      screen.queryByRole("button", { name: "Development login" })
    ).toBeNull();
  });

  it("stores a normal session, verifies Admin policy, and preserves the intended redirect", async () => {
    window.history.replaceState(
      {},
      "",
      "/admin/login?redirect=%2Fadmin%2Ftag-products"
    );
    mocks.developmentEnabled = true;
    mocks.loginAsDevelopmentAdmin.mockResolvedValue({ accessToken: "access" });
    mocks.checkAdminAccess.mockResolvedValue({
      user: {},
      admin: { role: "Admin", isActive: true },
    });
    render(<AdminLoginPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Development login" }));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/admin/tag-products")
    );
    expect(mocks.loginAsDevelopmentAdmin).toHaveBeenCalledOnce();
    expect(mocks.checkAdminAccess).toHaveBeenCalledOnce();
  });

  it("shows a local setup error without redirecting when Development login fails", async () => {
    mocks.developmentEnabled = true;
    mocks.loginAsDevelopmentAdmin.mockRejectedValue(new Error("Not available"));
    render(<AdminLoginPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Development login" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Development sign in is not available. Check the local setup and try again."
        )
      ).toBeTruthy()
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
