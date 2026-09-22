// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PetSocialSettings } from "@/services/petSocialSettingsService";

const mocks = vi.hoisted(() => ({
  getPetSocialSettings: vi.fn(),
  updatePetSocialSettings: vi.fn(),
}));

vi.mock("@/services/petSocialSettingsService", () => ({
  getPetSocialSettings: (...args: unknown[]) => mocks.getPetSocialSettings(...args),
  updatePetSocialSettings: (...args: unknown[]) =>
    mocks.updatePetSocialSettings(...args),
}));

import { PetSocialSettingsList } from "@/components/portal/PetSocialSettingsList";
import { ApiClientError } from "@/services/apiClient";

function pet(overrides: Partial<PetSocialSettings> = {}): PetSocialSettings {
  return {
    petId: "pet-mochi",
    name: "Mochi",
    photoUrl: "",
    photoThumbnailUrl: "",
    isSocialEnabled: false,
    isDiscoverable: false,
    canEnableSocial: true,
    missingRequirements: [],
    rowVersion: "v1",
    ...overrides,
  };
}

function listOf(pets: PetSocialSettings[], ownerSocialEnabled = true) {
  return {
    data: { ownerSocialEnabled, pets },
    meta: { requestId: "test", source: "api" as const },
  };
}

function resolved(value: PetSocialSettings) {
  return { data: value, meta: { requestId: "test", source: "api" as const } };
}

/** The "Show … in Community" switch for a row. */
function socialSwitch(row: HTMLElement) {
  return within(row).getByRole("switch", {
    name: /in Community/i,
  }) as HTMLButtonElement | HTMLInputElement;
}

/** The "Let people find …" switch for a row. */
function discoverySwitch(row: HTMLElement) {
  return within(row).getByRole("switch", {
    name: /find .* when browsing/i,
  }) as HTMLButtonElement | HTMLInputElement;
}

beforeEach(() => {
  mocks.getPetSocialSettings.mockResolvedValue(listOf([pet()]));
  mocks.updatePetSocialSettings.mockImplementation(
    async (_petId: string, update: Partial<PetSocialSettings>) =>
      resolved(pet({ ...update, rowVersion: "v2" }))
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PetSocialSettingsList", () => {
  it("lists the owner's pets with both choices", async () => {
    mocks.getPetSocialSettings.mockResolvedValue(
      listOf([pet(), pet({ petId: "pet-coco", name: "Coco" })])
    );

    render(<PetSocialSettingsList ownerSocialEnabled />);

    const rows = await screen.findAllByTestId("pet-social-row");

    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Mochi")).toBeTruthy();
    expect(within(rows[1]).getByText("Coco")).toBeTruthy();
    expect(socialSwitch(rows[0])).toBeTruthy();
    expect(discoverySwitch(rows[0])).toBeTruthy();
  });

  it("shows a single pet without any list scaffolding around it", async () => {
    render(<PetSocialSettingsList ownerSocialEnabled />);

    expect(await screen.findAllByTestId("pet-social-row")).toHaveLength(1);
  });

  it("starts every pet switched off", async () => {
    render(<PetSocialSettingsList ownerSocialEnabled />);

    const row = (await screen.findAllByTestId("pet-social-row"))[0];

    expect(socialSwitch(row).getAttribute("aria-checked")).toBe("false");
    expect(discoverySwitch(row).getAttribute("aria-checked")).toBe("false");
  });

  it("puts a pet into Social when the owner asks", async () => {
    render(<PetSocialSettingsList ownerSocialEnabled />);

    const row = (await screen.findAllByTestId("pet-social-row"))[0];
    fireEvent.click(socialSwitch(row));

    await waitFor(() =>
      expect(mocks.updatePetSocialSettings).toHaveBeenCalledWith("pet-mochi", {
        isSocialEnabled: true,
        isDiscoverable: false,
        rowVersion: "v1",
      })
    );

    await waitFor(() =>
      expect(socialSwitch(row).getAttribute("aria-checked")).toBe("true")
    );
  });

  it("takes a pet back out of Social", async () => {
    mocks.getPetSocialSettings.mockResolvedValue(
      listOf([pet({ isSocialEnabled: true, isDiscoverable: true })])
    );
    mocks.updatePetSocialSettings.mockResolvedValue(
      resolved(pet({ isSocialEnabled: false, isDiscoverable: false, rowVersion: "v2" }))
    );

    render(<PetSocialSettingsList ownerSocialEnabled />);

    const row = (await screen.findAllByTestId("pet-social-row"))[0];
    fireEvent.click(socialSwitch(row));

    await waitFor(() =>
      expect(socialSwitch(row).getAttribute("aria-checked")).toBe("false")
    );

    // Discovery goes with it. A pet that is out of Social cannot be left
    // looking discoverable.
    expect(discoverySwitch(row).getAttribute("aria-checked")).toBe("false");
  });

  it("moves discoverability on its own, without touching participation", async () => {
    mocks.getPetSocialSettings.mockResolvedValue(
      listOf([pet({ isSocialEnabled: true })])
    );

    render(<PetSocialSettingsList ownerSocialEnabled />);

    const row = (await screen.findAllByTestId("pet-social-row"))[0];
    fireEvent.click(discoverySwitch(row));

    await waitFor(() =>
      expect(mocks.updatePetSocialSettings).toHaveBeenCalledWith("pet-mochi", {
        isSocialEnabled: true,
        isDiscoverable: true,
        rowVersion: "v1",
      })
    );
  });

  it("cannot offer discoverability for a pet that is not in Social", async () => {
    render(<PetSocialSettingsList ownerSocialEnabled />);

    const row = (await screen.findAllByTestId("pet-social-row"))[0];

    expect(discoverySwitch(row).hasAttribute("disabled")).toBe(true);
    expect(within(row).getByText(/Available once Mochi is shared/)).toBeTruthy();
  });

  it("explains a pet whose Public Profile is off instead of switching it on", async () => {
    mocks.getPetSocialSettings.mockResolvedValue(
      listOf([pet({ canEnableSocial: false, missingRequirements: ["publicProfile"] })])
    );

    render(<PetSocialSettingsList ownerSocialEnabled />);

    const row = (await screen.findAllByTestId("pet-social-row"))[0];

    expect(socialSwitch(row).hasAttribute("disabled")).toBe(true);
    expect(
      within(row).getByText(/Turn on Mochi's Share Profile first/)
    ).toBeTruthy();
    expect(mocks.updatePetSocialSettings).not.toHaveBeenCalled();
  });

  it("explains a pet whose lifecycle rules it out", async () => {
    mocks.getPetSocialSettings.mockResolvedValue(
      listOf([pet({ canEnableSocial: false, missingRequirements: ["lifecycle"] })])
    );

    render(<PetSocialSettingsList ownerSocialEnabled />);

    const row = (await screen.findAllByTestId("pet-social-row"))[0];

    expect(within(row).getByText(/Only an active pet can be shared/)).toBeTruthy();
  });

  it("disables the pet choices while the household's own profile is off", async () => {
    render(<PetSocialSettingsList ownerSocialEnabled={false} />);

    const row = (await screen.findAllByTestId("pet-social-row"))[0];

    expect(socialSwitch(row).hasAttribute("disabled")).toBe(true);
    expect(discoverySwitch(row).hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("pet-social-master-off").textContent).toContain(
      "Turn on your Community Profile above"
    );
  });

  it("keeps a pet's stored choices visible while the master switch is off", async () => {
    mocks.getPetSocialSettings.mockResolvedValue(
      listOf([pet({ isSocialEnabled: true, isDiscoverable: true })], false)
    );

    render(<PetSocialSettingsList ownerSocialEnabled={false} />);

    const row = (await screen.findAllByTestId("pet-social-row"))[0];

    // Paused, not erased. Somebody who turns Social off for a week should not
    // come back to a blank slate.
    expect(socialSwitch(row).getAttribute("aria-checked")).toBe("true");
    expect(discoverySwitch(row).getAttribute("aria-checked")).toBe("true");
  });

  it("explains an owner with no pets yet", async () => {
    mocks.getPetSocialSettings.mockResolvedValue(listOf([]));

    render(<PetSocialSettingsList ownerSocialEnabled />);

    expect((await screen.findByTestId("pet-social-empty")).textContent).toContain(
      "Add a pet"
    );
  });

  it("offers a retry when the pets cannot be loaded", async () => {
    mocks.getPetSocialSettings.mockRejectedValueOnce(new Error("network"));

    render(<PetSocialSettingsList ownerSocialEnabled />);

    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByTestId("pet-social-list")).toBeTruthy();
  });

  it("leaves the switch where it was when the server refuses", async () => {
    mocks.updatePetSocialSettings.mockRejectedValue(
      new ApiClientError(500, "server_error", "Something went wrong.")
    );

    render(<PetSocialSettingsList ownerSocialEnabled />);

    const row = (await screen.findAllByTestId("pet-social-row"))[0];
    fireEvent.click(socialSwitch(row));

    await waitFor(() => expect(screen.getByTestId("pet-social-message")).toBeTruthy());

    // The one thing a privacy switch must never do: look like it moved when the
    // server said no.
    expect(socialSwitch(row).getAttribute("aria-checked")).toBe("false");
  });

  it("reloads and says so when the settings changed somewhere else", async () => {
    mocks.updatePetSocialSettings.mockRejectedValue(
      new ApiClientError(409, "concurrency_conflict", "Changed elsewhere.")
    );
    mocks.getPetSocialSettings
      .mockResolvedValueOnce(listOf([pet()]))
      .mockResolvedValueOnce(listOf([pet({ isSocialEnabled: true, rowVersion: "v9" })]));

    render(<PetSocialSettingsList ownerSocialEnabled />);

    const row = (await screen.findAllByTestId("pet-social-row"))[0];
    fireEvent.click(socialSwitch(row));

    await waitFor(() =>
      expect(screen.getByTestId("pet-social-message").textContent).toContain(
        "changed somewhere else"
      )
    );

    await waitFor(() => expect(mocks.getPetSocialSettings).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(socialSwitch(row).getAttribute("aria-checked")).toBe("true")
    );
  });

  it("says to slow down rather than showing an error when rate limited", async () => {
    mocks.updatePetSocialSettings.mockRejectedValue(
      new ApiClientError(429, "rate_limited", "Too many requests.")
    );

    render(<PetSocialSettingsList ownerSocialEnabled />);

    const row = (await screen.findAllByTestId("pet-social-row"))[0];
    fireEvent.click(socialSwitch(row));

    await waitFor(() =>
      expect(screen.getByTestId("pet-social-message").textContent).toContain(
        "try again shortly"
      )
    );
    expect(socialSwitch(row).getAttribute("aria-checked")).toBe("false");
  });

  it("names the pet in every control, so the labels work without sight of the row", async () => {
    mocks.getPetSocialSettings.mockResolvedValue(
      listOf([pet(), pet({ petId: "pet-coco", name: "Coco" })])
    );

    render(<PetSocialSettingsList ownerSocialEnabled />);

    await screen.findAllByTestId("pet-social-row");

    // Two pets, four switches, four distinct accessible names. A screen reader
    // moving control to control must never meet "Show in Community"
    // twice with no way to tell which pet it means.
    expect(
      screen.getByRole("switch", { name: /Show Mochi in Community/i })
    ).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: /Show Coco in Community/i })
    ).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: /Let people find Mochi when browsing/i })
    ).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: /Let people find Coco when browsing/i })
    ).toBeTruthy();
  });

  it("uses no developer wording an owner would not recognise", async () => {
    mocks.getPetSocialSettings.mockResolvedValue(
      listOf([pet({ canEnableSocial: false, missingRequirements: ["publicProfile"] })])
    );

    render(<PetSocialSettingsList ownerSocialEnabled />);

    const list = await screen.findByTestId("pet-social-list");
    const text = list.textContent ?? "";

    for (const term of [
      "IsSocialEnabled",
      "IsDiscoverable",
      "publicProfile",
      "lifecycle",
      "API",
      "payload",
      "rowVersion",
    ]) {
      expect(text).not.toContain(term);
    }
  });

  it("stacks its controls in one column, so it holds at phone width", async () => {
    render(<PetSocialSettingsList ownerSocialEnabled />);

    const row = (await screen.findAllByTestId("pet-social-row"))[0];

    // A grid with no explicit column count is one column at every width; the
    // failure this guards against is a fixed multi-column row that overflows a
    // 320px screen.
    expect(row.className).toContain("grid");
    expect(row.className).not.toMatch(/grid-cols-[2-9]/);
    expect(screen.getByTestId("pet-social-list").className).not.toMatch(
      /grid-cols-[2-9]/
    );
  });
});
