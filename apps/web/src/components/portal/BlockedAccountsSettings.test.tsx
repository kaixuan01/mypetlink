// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SocialAccountPage } from "@/services/socialGraphService";

const mocks = vi.hoisted(() => ({
  getBlockedAccounts: vi.fn(),
  unblockOwner: vi.fn(),
  apiConfigured: true,
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => mocks.apiConfigured,
  getApiBaseUrl: () => (mocks.apiConfigured ? "https://api.test" : ""),
}));

vi.mock("@/services/socialGraphService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/socialGraphService")
  >("@/services/socialGraphService");

  return {
    ...actual,
    getBlockedAccounts: (...args: unknown[]) => mocks.getBlockedAccounts(...args),
    unblockOwner: (...args: unknown[]) => mocks.unblockOwner(...args),
  };
});

import { BlockedAccountsSettings } from "@/components/portal/BlockedAccountsSettings";

function page(handles: string[], nextCursor: string | null = null): SocialAccountPage {
  return {
    items: handles.map((handle) => ({
      handle,
      displayName: `The ${handle} Family`,
      avatarThumbnailUrl: null,
      isFollowing: false,
      isSelf: false,
    })),
    nextCursor,
  };
}

beforeEach(() => {
  mocks.apiConfigured = true;
  mocks.getBlockedAccounts.mockResolvedValue(page(["limfamily"]));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BlockedAccountsSettings", () => {
  it("lists who you have blocked, so a block stays reversible", async () => {
    render(<BlockedAccountsSettings />);

    const list = await screen.findByTestId("blocked-accounts-list");

    expect(within(list).getByText("The limfamily Family")).toBeTruthy();
    expect(within(list).getByText("@limfamily")).toBeTruthy();
  });

  it("stays off a settings page that has never been used for blocking", async () => {
    mocks.getBlockedAccounts.mockResolvedValue(page([]));

    const { container } = render(<BlockedAccountsSettings />);

    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("asks before unblocking, and says what unblocking does not do", async () => {
    render(<BlockedAccountsSettings />);

    fireEvent.click(await screen.findByRole("button", { name: "Unblock" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByText(/will not start following you again/i)
    ).toBeTruthy();
    expect(mocks.unblockOwner).not.toHaveBeenCalled();
  });

  it("removes the row once the unblock lands", async () => {
    mocks.unblockOwner.mockResolvedValue({});

    render(<BlockedAccountsSettings />);

    fireEvent.click(await screen.findByRole("button", { name: "Unblock" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Unblock" })
    );

    await waitFor(() =>
      expect(mocks.unblockOwner).toHaveBeenCalledWith("limfamily")
    );
    await waitFor(() =>
      expect(screen.queryByTestId("blocked-accounts-list")).toBeNull()
    );
  });

  it("keeps the row and explains when the unblock fails", async () => {
    mocks.unblockOwner.mockRejectedValue(new Error("network"));

    render(<BlockedAccountsSettings />);

    fireEvent.click(await screen.findByRole("button", { name: "Unblock" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Unblock" })
    );

    await screen.findByTestId("blocked-accounts-error");

    expect(screen.getByTestId("blocked-accounts-list")).toBeTruthy();
  });

  it("pages with the cursor rather than an offset", async () => {
    mocks.getBlockedAccounts
      .mockResolvedValueOnce(page(["limfamily"], "cursor-2"))
      .mockResolvedValueOnce(page(["raofamily"]));

    render(<BlockedAccountsSettings />);

    fireEvent.click(await screen.findByRole("button", { name: "Show more" }));

    await waitFor(() =>
      expect(mocks.getBlockedAccounts).toHaveBeenLastCalledWith("cursor-2")
    );
    expect(await screen.findByText("The raofamily Family")).toBeTruthy();
  });

  it("never asks the server for anything when there is no connection", async () => {
    mocks.apiConfigured = false;

    const { container } = render(<BlockedAccountsSettings />);

    await waitFor(() => expect(container.innerHTML).toBe(""));
    expect(mocks.getBlockedAccounts).not.toHaveBeenCalled();
  });
});
