// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerSocialProfile } from "@/services/ownerSocialService";

const mocks = vi.hoisted(() => ({
  getOwnerSocialProfile: vi.fn(),
  updateOwnerSocialProfile: vi.fn(),
  claimOwnerHandle: vi.fn(),
  checkOwnerHandleAvailability: vi.fn(),
  uploadMediaFile: vi.fn(),
  isApiConfigured: vi.fn(() => true),
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => mocks.isApiConfigured(),
  canUseApi: () => mocks.isApiConfigured(),
}));
vi.mock("@/services/mediaService", () => ({
  uploadMediaFile: (...args: unknown[]) => mocks.uploadMediaFile(...args),
}));
vi.mock("@/services/ownerSocialService", async () => {
  const actual = await vi.importActual<typeof import("@/services/ownerSocialService")>(
    "@/services/ownerSocialService"
  );

  return {
    ...actual,
    getOwnerSocialProfile: (...args: unknown[]) => mocks.getOwnerSocialProfile(...args),
    updateOwnerSocialProfile: (...args: unknown[]) =>
      mocks.updateOwnerSocialProfile(...args),
    claimOwnerHandle: (...args: unknown[]) => mocks.claimOwnerHandle(...args),
    checkOwnerHandleAvailability: (...args: unknown[]) =>
      mocks.checkOwnerHandleAvailability(...args),
  };
});

import { SocialProfileSettings } from "@/components/portal/SocialProfileSettings";

const emptyProfile: OwnerSocialProfile = {
  handle: "",
  displayName: "",
  bio: "",
  avatarMediaId: "",
  avatarUrl: "",
  avatarThumbnailUrl: "",
  generalArea: "",
  isSocialEnabled: false,
  isDiscoverable: false,
  allowFollowers: true,
  canEnableSocial: false,
  missingRequirements: ["handle", "displayName"],
  handleChangeAvailableAt: "",
  rowVersion: "rv-1",
};

function handleInput() {
  const input = document.querySelector<HTMLInputElement>("#social-handle-input");
  if (!input) throw new Error("handle input not rendered");
  return input;
}

function generalAreaInput() {
  const input = document.querySelector<HTMLInputElement>("#social-general-area-input");
  if (!input) throw new Error("general area input not rendered");
  return input;
}

function respond(profile: OwnerSocialProfile) {
  return { data: profile, meta: { requestId: "test", source: "api" as const } };
}

describe("SocialProfileSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isApiConfigured.mockReturnValue(true);
    mocks.getOwnerSocialProfile.mockResolvedValue(respond(emptyProfile));
    mocks.updateOwnerSocialProfile.mockImplementation((update: Record<string, unknown>) =>
      Promise.resolve(respond({ ...emptyProfile, ...update } as OwnerSocialProfile))
    );
    mocks.claimOwnerHandle.mockResolvedValue(
      respond({ ...emptyProfile, handle: "mochiandcoco", missingRequirements: ["displayName"] })
    );
    mocks.checkOwnerHandleAvailability.mockResolvedValue({
      data: true,
      meta: { requestId: "test", source: "api" as const },
    });
  });

  afterEach(cleanup);

  it("starts switched off for an account that has not joined", async () => {
    render(<SocialProfileSettings />);

    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    const socialSwitch = screen.getByRole("switch", {
      name: /turn on my social profile/i,
    });
    expect(socialSwitch.getAttribute("aria-checked")).toBe("false");
  });

  it("does not enable anything merely by opening the page", async () => {
    render(<SocialProfileSettings />);

    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    expect(mocks.updateOwnerSocialProfile).not.toHaveBeenCalled();
    expect(mocks.claimOwnerHandle).not.toHaveBeenCalled();
  });

  it("cannot be switched on before a handle and display name exist", async () => {
    render(<SocialProfileSettings />);

    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    expect(
      (screen.getByRole("switch", { name: /turn on my social profile/i }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(screen.getByText(/choose a handle and a display name first/i)).toBeTruthy();
  });

  it("explains that the social identity is separate from finder contact details", async () => {
    render(<SocialProfileSettings />);

    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    expect(
      screen.getByText(/separate from the contact details shown to someone who finds your pet/i)
    ).toBeTruthy();
  });

  it("rejects a malformed handle without calling the API", async () => {
    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    fireEvent.change(handleInput(), { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: /save handle/i }));

    await waitFor(() =>
      expect(screen.getByText(/handles are 3 to 30 characters/i)).toBeTruthy()
    );
    expect(mocks.claimOwnerHandle).not.toHaveBeenCalled();
  });

  it("reports an unavailable handle without saying why", async () => {
    mocks.checkOwnerHandleAvailability.mockResolvedValue({
      data: false,
      meta: { requestId: "test", source: "api" as const },
    });

    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    fireEvent.change(handleInput(), { target: { value: "support" } });
    fireEvent.blur(handleInput());

    await waitFor(() =>
      expect(screen.getByText(/that handle isn't available/i)).toBeTruthy()
    );

    // Reserved, taken and screened-out all read the same. The UI must not
    // invent a reason the API deliberately withheld.
    expect(screen.queryByText(/reserved/i)).toBeNull();
    expect(screen.queryByText(/already taken by/i)).toBeNull();
  });

  it("claims an available handle", async () => {
    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    fireEvent.change(handleInput(), { target: { value: "mochiandcoco" } });
    fireEvent.click(screen.getByRole("button", { name: /save handle/i }));

    await waitFor(() =>
      expect(mocks.claimOwnerHandle).toHaveBeenCalledWith("mochiandcoco")
    );
  });

  it("blocks a handle change while a cooldown is running", async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    mocks.getOwnerSocialProfile.mockResolvedValue(
      respond({ ...emptyProfile, handle: "mochiandcoco", handleChangeAvailableAt: future })
    );

    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    expect(handleInput().disabled).toBe(true);
    expect(screen.getByText(/you can change your handle again after/i)).toBeTruthy();
  });

  it("refuses a general area that is really a street address", async () => {
    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    fireEvent.change(generalAreaInput(), {
      target: { value: "No. 12, Jalan Maarof" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save social profile/i }));

    await waitFor(() =>
      expect(screen.getByText(/not a full street address/i)).toBeTruthy()
    );
    expect(mocks.updateOwnerSocialProfile).not.toHaveBeenCalled();
  });

  it("suggests a handle built from pet names, never from the account", async () => {
    render(<SocialProfileSettings petNames={["Mochi", "Coco"]} />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "@mochiandcoco" })).toBeTruthy();
  });

  it("uploads a replacement avatar and reloads the profile", async () => {
    mocks.uploadMediaFile.mockResolvedValue({ mediaId: "media-1" });

    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    const file = new File(["x"], "avatar.jpg", { type: "image/jpeg" });
    const input = document.querySelector<HTMLInputElement>("#social-avatar-input");
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.uploadMediaFile).toHaveBeenCalledWith(
        expect.objectContaining({ category: "OwnerAvatar" })
      )
    );
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalledTimes(2));
  });

  it("asks the visitor to sign in when there is no connection", () => {
    mocks.isApiConfigured.mockReturnValue(false);

    render(<SocialProfileSettings />);

    expect(screen.getByText(/sign in to set up your social profile/i)).toBeTruthy();
  });
});
