// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultOwnerSettings, type OwnerSettings } from "@/lib/ownerSettings";

const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() },
  getOwnerProfileSettings: vi.fn(),
  updateOwnerProfileSettings: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));
vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => true }));
vi.mock("@/services/authService", () => ({ logoutOwner: vi.fn() }));
vi.mock("@/services/ownerProfileService", () => ({
  getOwnerProfileSettings: (...args: unknown[]) =>
    mocks.getOwnerProfileSettings(...args),
  updateOwnerProfileSettings: (...args: unknown[]) =>
    mocks.updateOwnerProfileSettings(...args),
}));
vi.mock("@/components/portal/PlanSummaryCard", () => ({
  PlanSummaryCard: () => <div data-testid="plan-card" />,
}));

class FakeApiError extends Error {
  status: number;
  code: string;

  constructor(status: number) {
    super("failed");
    this.status = status;
    this.code = `http_${status}`;
  }
}

vi.mock("@/services/apiClient", () => ({
  isApiClientError: (error: unknown) => error instanceof FakeApiError,
}));

const { SettingsPanel } = await import("./SettingsPanel");

function ownerData(overrides: Partial<OwnerSettings> = {}): OwnerSettings {
  return {
    ...structuredClone(defaultOwnerSettings),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mocks.getOwnerProfileSettings.mockReset();
  mocks.updateOwnerProfileSettings.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsPanel loading behaviour", () => {
  it("shows a skeleton with no field values and no Save while loading", () => {
    mocks.getOwnerProfileSettings.mockReturnValue(
      deferred<{ data: OwnerSettings }>().promise
    );

    render(<SettingsPanel />);

    expect(screen.getByText("Loading your saved details")).toBeTruthy();
    // No inputs, no sample data, no way to save unresolved data.
    expect(document.querySelectorAll("input")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    expect(document.body.textContent).not.toContain("Aina");
    expect(document.body.textContent).not.toContain("+60123456789");
  });

  it("populates only the authenticated owner's returned values", async () => {
    mocks.getOwnerProfileSettings.mockResolvedValue({
      data: ownerData({
        ownerDisplayName: "Real Owner",
        phoneNumber: "+60199887766",
      }),
    });

    render(<SettingsPanel />);

    expect(await screen.findByDisplayValue("Real Owner")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /save settings/i })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Logout" })).toBeTruthy();
    expect(
      within(screen.getByTestId("mobile-form-actions")).queryByRole("button", {
        name: "Logout",
      })
    ).toBeNull();
  });

  it("keeps desktop and mobile Save actions disabled until a setting changes", async () => {
    mocks.getOwnerProfileSettings.mockResolvedValue({
      data: ownerData({ ownerDisplayName: "Real Owner" }),
    });

    render(<SettingsPanel />);
    const name = await screen.findByDisplayValue("Real Owner");
    const initialButtons = screen.getAllByRole("button", { name: "Save Settings" });
    expect(initialButtons).toHaveLength(2);
    initialButtons.forEach((button) =>
      expect((button as HTMLButtonElement).disabled).toBe(true)
    );

    fireEvent.change(name, { target: { value: "Updated Owner" } });
    screen
      .getAllByRole("button", { name: "Save Settings" })
      .forEach((button) =>
        expect((button as HTMLButtonElement).disabled).toBe(false)
      );
  });

  it("saves from the mobile action bar and resets the dirty baseline on success", async () => {
    const loaded = ownerData({ ownerDisplayName: "Real Owner" });
    mocks.getOwnerProfileSettings.mockResolvedValue({ data: loaded });
    mocks.updateOwnerProfileSettings.mockImplementation(async (settings) => ({
      data: settings,
    }));

    render(<SettingsPanel />);
    fireEvent.change(await screen.findByDisplayValue("Real Owner"), {
      target: { value: "Updated Owner" },
    });
    const mobileActions = screen.getByTestId("mobile-form-actions");
    fireEvent.click(within(mobileActions).getByRole("button", { name: "Save Settings" }));

    await waitFor(() => expect(mocks.updateOwnerProfileSettings).toHaveBeenCalledOnce());
    expect(mocks.updateOwnerProfileSettings.mock.calls[0][0].ownerDisplayName).toBe(
      "Updated Owner"
    );
    await waitFor(() =>
      screen
        .getAllByRole("button", { name: "Save Settings" })
        .forEach((button) =>
          expect((button as HTMLButtonElement).disabled).toBe(true)
        )
    );
    expect(screen.getByText("Account defaults saved.")).toBeTruthy();
  });

  it("clears WhatsApp independently and keeps it empty after save and reload", async () => {
    const loaded = ownerData({
      ownerDisplayName: "Real Owner",
      phoneNumber: "+60123334444",
      whatsappNumber: "+60128889999",
    });
    const persisted = { ...loaded, whatsappNumber: "" };
    mocks.getOwnerProfileSettings.mockResolvedValue({ data: loaded });
    mocks.updateOwnerProfileSettings.mockResolvedValue({ data: persisted });

    const firstRender = render(<SettingsPanel />);
    const whatsapp = (await screen.findByLabelText(
      "WhatsApp number"
    )) as HTMLInputElement;
    fireEvent.change(whatsapp, { target: { value: "" } });
    fireEvent.click(
      within(screen.getByTestId("mobile-form-actions")).getByRole("button", {
        name: "Save Settings",
      })
    );

    await waitFor(() =>
      expect(mocks.updateOwnerProfileSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          phoneNumber: "+60123334444",
          whatsappNumber: "",
        })
      )
    );
    await waitFor(() => expect(whatsapp.value).toBe(""));
    expect(
      (screen.getByLabelText("Phone number") as HTMLInputElement).value
    ).toBe("123334444");
    expect(screen.getByText("Account defaults saved.")).toBeTruthy();

    firstRender.unmount();
    mocks.getOwnerProfileSettings.mockResolvedValue({ data: persisted });
    render(<SettingsPanel />);

    expect(
      (await screen.findByLabelText("WhatsApp number") as HTMLInputElement).value
    ).toBe("");
    expect(
      (screen.getByLabelText("Phone number") as HTMLInputElement).value
    ).toBe("123334444");
  });

  it("does not show success when the server does not confirm the clear", async () => {
    const loaded = ownerData({
      ownerDisplayName: "Real Owner",
      whatsappNumber: "+60128889999",
    });
    mocks.getOwnerProfileSettings.mockResolvedValue({ data: loaded });
    mocks.updateOwnerProfileSettings.mockRejectedValue(
      new Error("The saved contact details did not match the requested values.")
    );

    render(<SettingsPanel />);
    fireEvent.change(await screen.findByLabelText("WhatsApp number"), {
      target: { value: "" },
    });
    fireEvent.click(
      within(screen.getByTestId("mobile-form-actions")).getByRole("button", {
        name: "Save Settings",
      })
    );

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Account defaults saved.")).toBeNull();
  });

  it("retains unsaved values and an enabled Save action after a failed save", async () => {
    mocks.getOwnerProfileSettings.mockResolvedValue({
      data: ownerData({ ownerDisplayName: "Real Owner" }),
    });
    mocks.updateOwnerProfileSettings.mockRejectedValue(new Error("offline"));

    render(<SettingsPanel />);
    const name = await screen.findByDisplayValue("Real Owner");
    fireEvent.change(name, { target: { value: "Still Unsaved" } });
    fireEvent.click(
      within(screen.getByTestId("mobile-form-actions")).getByRole("button", {
        name: "Save Settings",
      })
    );

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText("Owner display name") as HTMLInputElement).value).toBe(
      "Still Unsaved"
    );
    screen
      .getAllByRole("button", { name: "Save Settings" })
      .forEach((button) =>
        expect((button as HTMLButtonElement).disabled).toBe(false)
      );
  });

  it("shows empty inputs with placeholders for an empty owner profile", async () => {
    mocks.getOwnerProfileSettings.mockResolvedValue({ data: ownerData() });

    render(<SettingsPanel />);

    const name = (await screen.findByLabelText(
      "Owner display name"
    )) as HTMLInputElement;
    expect(name.value).toBe("");
    expect(name.placeholder).toBe("e.g. Sarah Tan");
    expect(document.body.textContent).not.toContain("Aina");
  });

  it("treats a 404 as a brand-new empty profile, not a sample one", async () => {
    mocks.getOwnerProfileSettings.mockRejectedValue(new FakeApiError(404));

    render(<SettingsPanel />);

    const name = (await screen.findByLabelText(
      "Owner display name"
    )) as HTMLInputElement;
    expect(name.value).toBe("");
    expect(document.body.textContent).not.toContain("Aina");
  });

  it("shows a Retry error state on failure without any mock fallback", async () => {
    mocks.getOwnerProfileSettings.mockRejectedValueOnce(new FakeApiError(0));
    mocks.getOwnerProfileSettings.mockResolvedValueOnce({
      data: ownerData({ ownerDisplayName: "Recovered Owner" }),
    });

    render(<SettingsPanel />);

    expect(
      await screen.findByText(/couldn’t load your details|couldn't load your details/i)
    ).toBeTruthy();
    expect(document.querySelectorAll("input")).toHaveLength(0);
    expect(document.body.textContent).not.toContain("Aina");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByDisplayValue("Recovered Owner")).toBeTruthy();
    expect(mocks.getOwnerProfileSettings).toHaveBeenCalledTimes(2);
  });
});
