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
    expect(screen.queryByRole("button", { name: /save settings/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Logout" })).toBeTruthy();
  });

  it("shows desktop and mobile Save actions only after a setting changes", async () => {
    mocks.getOwnerProfileSettings.mockResolvedValue({
      data: ownerData({ ownerDisplayName: "Real Owner" }),
    });

    render(<SettingsPanel />);
    const name = await screen.findByDisplayValue("Real Owner");
    expect(screen.queryByRole("button", { name: "Save settings" })).toBeNull();

    fireEvent.change(name, { target: { value: "Updated Owner" } });
    screen
      .getAllByRole("button", { name: "Save settings" })
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
    fireEvent.click(within(mobileActions).getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(mocks.updateOwnerProfileSettings).toHaveBeenCalledOnce());
    expect(mocks.updateOwnerProfileSettings.mock.calls[0][0].ownerDisplayName).toBe(
      "Updated Owner"
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Save settings" })).toBeNull()
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
        name: "Save settings",
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
        name: "Save settings",
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
        name: "Save settings",
      })
    );

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText("Owner display name") as HTMLInputElement).value).toBe(
      "Still Unsaved"
    );
    screen
      .getAllByRole("button", { name: "Save settings" })
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

  it("separates essential emails, disabled Premium reminders, and optional marketing", async () => {
    mocks.getOwnerProfileSettings.mockResolvedValue({
      data: ownerData({
        notificationPreferences: {
          whatsappReminders: true,
          emailReminders: true,
          careDigest: true,
        },
      }),
    });

    render(<SettingsPanel />);

    expect(await screen.findByText("Essential account and order emails")).toBeTruthy();
    expect(
      screen.getByText("Important account and order emails are sent when required.")
    ).toBeTruthy();
    expect(screen.getByText("Premium care reminders")).toBeTruthy();
    expect(
      screen.getByText("Care reminders will be available with MyPetLink Premium.")
    ).toBeTruthy();

    for (const label of [
      "WhatsApp care reminders",
      "Email care reminders",
      "Monthly care digest",
    ]) {
      const control = screen.getByRole("checkbox", { name: new RegExp(label) });
      expect((control as HTMLInputElement).disabled).toBe(true);
      expect((control as HTMLInputElement).checked).toBe(false);
    }

    const marketing = screen.getByRole("checkbox", {
      name: /MyPetLink news and offers/i,
    });
    expect((marketing as HTMLInputElement).disabled).toBe(false);
    expect((marketing as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole("button", { name: "Save settings" })).toBeNull();
  });

  it("marks only the marketing preference dirty and clears it after save", async () => {
    const loaded = ownerData({ marketingEmailOptIn: false });
    mocks.getOwnerProfileSettings.mockResolvedValue({ data: loaded });
    mocks.updateOwnerProfileSettings.mockImplementation(async (settings) => ({
      data: settings,
    }));

    render(<SettingsPanel />);
    const marketing = await screen.findByRole("checkbox", {
      name: /MyPetLink news and offers/i,
    });
    fireEvent.click(marketing);

    expect(screen.getByTestId("mobile-form-actions")).toBeTruthy();
    fireEvent.click(
      within(screen.getByTestId("mobile-form-actions")).getByRole("button", {
        name: "Save settings",
      })
    );

    await waitFor(() =>
      expect(mocks.updateOwnerProfileSettings).toHaveBeenCalledWith(
        expect.objectContaining({ marketingEmailOptIn: true })
      )
    );
    await waitFor(() =>
      expect(screen.queryByTestId("mobile-form-actions")).toBeNull()
    );
  });

  it("keeps failed marketing changes selected and prevents repeated submissions", async () => {
    const pending = deferred<{ data: OwnerSettings }>();
    mocks.getOwnerProfileSettings.mockResolvedValue({
      data: ownerData({ marketingEmailOptIn: false }),
    });
    mocks.updateOwnerProfileSettings.mockReturnValue(pending.promise);

    render(<SettingsPanel />);
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: /MyPetLink news and offers/i,
      })
    );
    const save = within(screen.getByTestId("mobile-form-actions")).getByRole(
      "button",
      { name: "Save settings" }
    );
    fireEvent.click(save);
    fireEvent.click(save);

    expect(mocks.updateOwnerProfileSettings).toHaveBeenCalledTimes(1);
    expect((save as HTMLButtonElement).disabled).toBe(true);

    pending.reject(new Error("offline"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      (screen.getByRole("checkbox", {
        name: /MyPetLink news and offers/i,
      }) as HTMLInputElement).checked
    ).toBe(true);
  });

  it("reserves shared clearance above mobile navigation while Save is visible", async () => {
    mocks.getOwnerProfileSettings.mockResolvedValue({
      data: ownerData({ ownerDisplayName: "Real Owner" }),
    });

    render(<SettingsPanel />);
    fireEvent.change(await screen.findByDisplayValue("Real Owner"), {
      target: { value: "Changed Owner" },
    });

    const accountHeading = screen.getByText("Account actions");
    const clearance = screen.getByTestId("mobile-form-actions-clearance");
    const actions = screen.getByTestId("mobile-form-actions");
    expect(
      accountHeading.compareDocumentPosition(clearance) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(actions.className).toContain("--owner-bottom-nav-height");
  });
});
