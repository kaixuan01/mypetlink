// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminOwnerSocialHandle } from "@/services/adminOwnerService";

const mocks = vi.hoisted(() => ({
  getAdminOwnerSocialHandle: vi.fn(),
  assignAdminOwnerSocialHandle: vi.fn(),
  getAdminCapabilities: vi.fn(),
}));

vi.mock("@/services/adminOwnerService", () => ({
  getAdminOwnerSocialHandle: (...args: unknown[]) => mocks.getAdminOwnerSocialHandle(...args),
  assignAdminOwnerSocialHandle: (...args: unknown[]) =>
    mocks.assignAdminOwnerSocialHandle(...args),
}));

vi.mock("@/services/authService", () => ({
  getAdminCapabilities: () => mocks.getAdminCapabilities(),
}));

import { AdminOwnerSocialHandleSection } from "@/components/admin/AdminOwnerSocialHandleSection";
import { adminCapabilities } from "@/lib/adminCapabilities";
import { ApiClientError } from "@/services/apiClient";

function access(...granted: string[]) {
  return { isSuperAdmin: false, granted: new Set(granted) };
}

function handleState(overrides: Partial<AdminOwnerSocialHandle> = {}): AdminOwnerSocialHandle {
  return {
    userId: "owner-1",
    handle: "",
    isReservedHandle: false,
    isSocialEnabled: false,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.getAdminOwnerSocialHandle.mockResolvedValue(handleState());
  mocks.assignAdminOwnerSocialHandle.mockResolvedValue(
    handleState({ handle: "MyPetLink", isReservedHandle: true })
  );
  mocks.getAdminCapabilities.mockReturnValue(
    access(adminCapabilities.ownerSocialHandleAssign)
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminOwnerSocialHandleSection", () => {
  it("shows the current handle and marks a reserved one", async () => {
    mocks.getAdminOwnerSocialHandle.mockResolvedValue(
      handleState({ handle: "MyPetLink", isReservedHandle: true, isSocialEnabled: true })
    );

    render(<AdminOwnerSocialHandleSection ownerUserId="owner-1" />);

    expect(await screen.findByText("@MyPetLink")).toBeTruthy();
    expect(screen.getByText("Reserved name")).toBeTruthy();
    expect(screen.getByText("Community Profile on")).toBeTruthy();
  });

  it("says when an owner has no handle yet", async () => {
    render(<AdminOwnerSocialHandleSection ownerUserId="owner-1" />);

    expect(await screen.findByText("No handle chosen yet")).toBeTruthy();
  });

  it("assigns a reserved handle", async () => {
    render(<AdminOwnerSocialHandleSection ownerUserId="owner-1" />);

    const input = await screen.findByLabelText(/assign a reserved handle/i);
    fireEvent.change(input, { target: { value: "mypetlink" } });
    fireEvent.click(screen.getByRole("button", { name: /^assign$/i }));

    await waitFor(() =>
      expect(mocks.assignAdminOwnerSocialHandle).toHaveBeenCalledWith(
        "owner-1",
        "mypetlink",
        false
      )
    );

    expect(
      (await screen.findByTestId("owner-social-handle-message")).textContent
    ).toContain("Assigned @MyPetLink");
  });

  it("hides the control from an admin without the capability", async () => {
    mocks.getAdminCapabilities.mockReturnValue(access(adminCapabilities.ownersView));

    render(<AdminOwnerSocialHandleSection ownerUserId="owner-1" />);

    await screen.findByText("No handle chosen yet");

    expect(screen.queryByLabelText(/assign a reserved handle/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /^assign$/i })).toBeNull();
  });

  it("asks before taking a handle off another profile", async () => {
    mocks.assignAdminOwnerSocialHandle.mockRejectedValueOnce(
      new ApiClientError(
        409,
        "reserved_handle_assigned",
        "Another social profile already holds this reserved handle."
      )
    );

    render(<AdminOwnerSocialHandleSection ownerUserId="owner-1" />);

    fireEvent.change(await screen.findByLabelText(/assign a reserved handle/i), {
      target: { value: "mypetlink" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^assign$/i }));

    // Never silently taken. A second, explicit action is required.
    const confirm = await screen.findByTestId("owner-social-handle-reassign");
    expect(confirm.textContent).toContain("already holds @mypetlink");

    fireEvent.click(screen.getByRole("button", { name: /reassign it/i }));

    await waitFor(() =>
      expect(mocks.assignAdminOwnerSocialHandle).toHaveBeenLastCalledWith(
        "owner-1",
        "mypetlink",
        true
      )
    );
  });

  it("lets the admin back out of a reassignment", async () => {
    mocks.assignAdminOwnerSocialHandle.mockRejectedValueOnce(
      new ApiClientError(409, "reserved_handle_assigned", "Already held.")
    );

    render(<AdminOwnerSocialHandleSection ownerUserId="owner-1" />);

    fireEvent.change(await screen.findByLabelText(/assign a reserved handle/i), {
      target: { value: "mypetlink" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^assign$/i }));

    fireEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(screen.queryByTestId("owner-social-handle-reassign")).toBeNull();
    expect(mocks.assignAdminOwnerSocialHandle).toHaveBeenCalledTimes(1);
  });

  it("surfaces a refusal from the server rather than pretending it worked", async () => {
    mocks.assignAdminOwnerSocialHandle.mockRejectedValue(
      new ApiClientError(
        400,
        "validation_failed",
        "This is not a reserved handle. Only protected names are assigned here."
      )
    );

    render(<AdminOwnerSocialHandleSection ownerUserId="owner-1" />);

    fireEvent.change(await screen.findByLabelText(/assign a reserved handle/i), {
      target: { value: "tanfamily" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^assign$/i }));

    expect(
      (await screen.findByTestId("owner-social-handle-message")).textContent
    ).toContain("not a reserved handle");

    expect(screen.queryByText("@tanfamily")).toBeNull();
  });

  it("says a handle alone does not publish the profile", async () => {
    mocks.getAdminOwnerSocialHandle.mockResolvedValue(
      handleState({ handle: "MyPetLink", isReservedHandle: true, isSocialEnabled: false })
    );

    render(<AdminOwnerSocialHandleSection ownerUserId="owner-1" />);

    expect(
      await screen.findByText(/still has to turn their\s+Community Profile on/i)
    ).toBeTruthy();
    expect(screen.getByText("Community Profile off")).toBeTruthy();
  });
});
