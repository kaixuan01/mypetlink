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
import { ApiClientError } from "@/services/apiClient";

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

function displayNameInput() {
  const input = document.querySelector<HTMLInputElement>("#social-display-name-input");
  if (!input) throw new Error("display name input not rendered");
  return input;
}

function socialSwitch() {
  return screen.getByRole("switch", {
    name: /turn on my social profile/i,
  }) as HTMLButtonElement;
}

function enabledProfile(overrides: Partial<OwnerSocialProfile> = {}): OwnerSocialProfile {
  return {
    ...emptyProfile,
    handle: "mochiandcoco",
    displayName: "Mochi and Coco",
    canEnableSocial: true,
    missingRequirements: [],
    ...overrides,
  };
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

  it("cannot be switched on before a handle exists, and names what is missing", async () => {
    render(<SocialProfileSettings />);

    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    expect(socialSwitch().disabled).toBe(true);

    // Names the one thing actually missing, rather than listing every
    // prerequisite and leaving the owner to work out which applies to them.
    expect(
      screen.getByText(/choose and save a handle before turning on your social profile/i)
    ).toBeTruthy();
  });

  it("does not prevent turning social on merely because the form is dirty", async () => {
    mocks.getOwnerSocialProfile.mockResolvedValue(respond(enabledProfile()));

    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    fireEvent.change(generalAreaInput(), { target: { value: "Bangsar, Kuala Lumpur" } });

    expect(socialSwitch().disabled).toBe(false);
  });

  it("enables social from a valid unsaved display name, in one click", async () => {
    // The reported defect. A handle is saved, the display name is not, and the
    // owner types one. The server still reports canEnableSocial false because it
    // describes STORED state, so the switch has to read the draft instead.
    mocks.getOwnerSocialProfile.mockResolvedValue(
      respond(
        enabledProfile({
          displayName: "",
          canEnableSocial: false,
          missingRequirements: ["displayName"],
        })
      )
    );

    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    expect(socialSwitch().disabled).toBe(true);
    expect(
      screen.getByText(/add a display name before turning on your social profile/i)
    ).toBeTruthy();

    fireEvent.change(displayNameInput(), { target: { value: "Mochi and Coco" } });
    fireEvent.change(generalAreaInput(), { target: { value: "Bangsar, Kuala Lumpur" } });

    expect(socialSwitch().disabled).toBe(false);

    fireEvent.click(socialSwitch());

    // One request carrying the draft and the new social state together, never a
    // profile save racing a separate toggle save.
    await waitFor(() => expect(mocks.updateOwnerSocialProfile).toHaveBeenCalledTimes(1));
    expect(mocks.updateOwnerSocialProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Mochi and Coco",
        generalArea: "Bangsar, Kuala Lumpur",
        isSocialEnabled: true,
        rowVersion: "rv-1",
      })
    );
  });

  it("refreshes the form to the saved server state after an immediate toggle", async () => {
    mocks.getOwnerSocialProfile.mockResolvedValue(
      respond(enabledProfile({ displayName: "", canEnableSocial: false }))
    );
    mocks.updateOwnerSocialProfile.mockResolvedValue(
      respond(
        enabledProfile({
          generalArea: "Bangsar, Kuala Lumpur",
          isSocialEnabled: true,
          rowVersion: "rv-2",
        })
      )
    );

    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    fireEvent.change(displayNameInput(), { target: { value: "Mochi and Coco" } });
    fireEvent.click(socialSwitch());

    await waitFor(() => expect(socialSwitch().getAttribute("aria-checked")).toBe("true"));

    // The form now shows what the server holds, so Save would resend the same
    // thing rather than a stale draft.
    expect(displayNameInput().value).toBe("Mochi and Coco");
    expect(generalAreaInput().value).toBe("Bangsar, Kuala Lumpur");

    fireEvent.click(screen.getByRole("button", { name: /save social profile/i }));
    await waitFor(() => expect(mocks.updateOwnerSocialProfile).toHaveBeenCalledTimes(2));

    // And the refreshed concurrency token is used, not the one from page load.
    expect(mocks.updateOwnerSocialProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({ rowVersion: "rv-2" })
    );
  });

  it("leaves the switch off when the server refuses to enable", async () => {
    mocks.getOwnerSocialProfile.mockResolvedValue(respond(enabledProfile()));
    mocks.updateOwnerSocialProfile.mockRejectedValue(
      new ApiClientError(500, "server_error", "Something went wrong.")
    );

    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    fireEvent.click(socialSwitch());
    await waitFor(() => expect(mocks.updateOwnerSocialProfile).toHaveBeenCalled());

    // The one thing a privacy switch must never do: claim it is on when the
    // server said no.
    expect(socialSwitch().getAttribute("aria-checked")).toBe("false");
  });

  it("reloads and does not claim enabled when another tab changed the profile", async () => {
    mocks.getOwnerSocialProfile
      .mockResolvedValueOnce(respond(enabledProfile()))
      .mockResolvedValueOnce(
        respond(enabledProfile({ displayName: "Renamed Elsewhere", rowVersion: "rv-9" }))
      );
    mocks.updateOwnerSocialProfile.mockRejectedValue(
      new ApiClientError(409, "concurrency_conflict", "Changed somewhere else.")
    );

    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalledTimes(1));

    fireEvent.click(socialSwitch());

    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalledTimes(2));

    expect(socialSwitch().getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/changed somewhere else/i)).toBeTruthy();
    expect(displayNameInput().value).toBe("Renamed Elsewhere");
  });

  it("asks the owner to slow down rather than showing a failure when rate limited", async () => {
    mocks.getOwnerSocialProfile.mockResolvedValue(respond(enabledProfile()));
    mocks.updateOwnerSocialProfile.mockRejectedValue(
      new ApiClientError(429, "rate_limited", "Too many requests.")
    );

    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    fireEvent.click(socialSwitch());

    await waitFor(() => expect(screen.getByText(/try again shortly/i)).toBeTruthy());
    expect(socialSwitch().getAttribute("aria-checked")).toBe("false");
  });

  it("says a stored child preference is inactive while social is off", async () => {
    mocks.getOwnerSocialProfile.mockResolvedValue(
      respond(enabledProfile({ isSocialEnabled: false, allowFollowers: true }))
    );

    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    const followers = screen.getByRole("switch", {
      name: /let other owners follow me/i,
    }) as HTMLButtonElement;

    // Preserved, plainly disabled, and explained — not a blue switch that looks
    // like it is doing something.
    expect(followers.getAttribute("aria-checked")).toBe("true");
    expect(followers.disabled).toBe(true);
    expect(
      screen.getAllByText(/will apply when your social profile is turned on/i).length
    ).toBe(2);
  });

  it("keeps discoverability unavailable while social is off", async () => {
    mocks.getOwnerSocialProfile.mockResolvedValue(
      respond(enabledProfile({ isSocialEnabled: false, isDiscoverable: true }))
    );

    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    expect(
      (screen.getByRole("switch", { name: /show me in search and browsing/i }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("never claims the handle as part of a social toggle", async () => {
    mocks.getOwnerSocialProfile.mockResolvedValue(respond(enabledProfile()));

    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    // A handle carries uniqueness, reservations, history and a cooldown, so it
    // stays its own explicit action however the rest of the form is saved.
    fireEvent.change(handleInput(), { target: { value: "somethingelse" } });
    fireEvent.click(socialSwitch());

    await waitFor(() => expect(mocks.updateOwnerSocialProfile).toHaveBeenCalled());
    expect(mocks.claimOwnerHandle).not.toHaveBeenCalled();
  });

  it("does not upload an avatar because a switch was clicked", async () => {
    mocks.getOwnerSocialProfile.mockResolvedValue(respond(enabledProfile()));

    render(<SocialProfileSettings />);
    await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());

    fireEvent.click(socialSwitch());

    await waitFor(() => expect(mocks.updateOwnerSocialProfile).toHaveBeenCalled());
    expect(mocks.uploadMediaFile).not.toHaveBeenCalled();
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
