// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("button", { name: /save settings/i })).toBeTruthy();
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
