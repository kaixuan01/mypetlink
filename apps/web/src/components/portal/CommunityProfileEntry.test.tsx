// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => true,
  canUseApi: () => true,
}));

import { CommunityProfileSettingsLink } from "@/components/portal/CommunityProfileSettingsLink";
import { ownerRoutes } from "@/lib/routes";

const webRoot = join(__dirname, "..", "..", "..");

function source(relativePath: string) {
  return readFileSync(join(webRoot, "src", relativePath), "utf8");
}

/**
 * Where the Community identity is edited, and that there is only one of it.
 *
 * The form used to live at the bottom of Owner Settings, which meant changing
 * how you appear in the community required leaving the community, opening a
 * pet-management screen, and scrolling past contact details and plan usage to
 * reach yourself. It now has its own Community route, and Owner Settings points
 * at it rather than keeping a second copy — one implementation of handle,
 * display name, photo and the social switches, not two that can drift.
 */

afterEach(cleanup);

describe("Community profile entry points", () => {
  it("links Owner Settings to the Community profile editor", () => {
    render(<CommunityProfileSettingsLink />);

    const link = screen.getByRole("link", { name: /manage community profile/i });

    expect(link.getAttribute("href")).toBe(ownerRoutes.socialProfileEdit);
    expect(
      screen.getByRole("heading", { name: "Community" })
    ).toBeTruthy();
    expect(
      screen.getByText(/how you and your pets appear in community/i)
    ).toBeTruthy();
  });

  it("does not keep a second social form inside Owner Settings", () => {
    const settingsPage = source("app/settings/page.tsx");

    // The link, not the form. Two independent implementations of the same
    // consent controls is how they drift apart.
    expect(settingsPage).toContain("CommunityProfileSettingsLink");
    expect(settingsPage).not.toContain("SocialProfileSettingsSection");
  });

  it("puts the editor on a Community route that reuses the existing form", () => {
    const editorPage = source("app/community/profile/edit/page.tsx");

    // Reused, not forked: the same section component Owner Settings used to
    // render is what the Community route renders now.
    expect(editorPage).toContain("SocialProfileSettingsSection");
    expect(editorPage).toContain("AppLayout");
  });

  it("treats the editor as a Community route, so the sidebar stays in Community", async () => {
    const { isCommunityPath, getAppMode } = await import("@/lib/appMode");

    expect(isCommunityPath(ownerRoutes.socialProfileEdit)).toBe(true);
    expect(getAppMode(ownerRoutes.socialProfileEdit)).toBe("community");

    // Owner Settings itself stays on the management side.
    expect(getAppMode(ownerRoutes.settings)).toBe("pets");
  });
});
