// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";

const mocks = vi.hoisted(() => ({
  authenticated: false,
  replace: vi.fn(),
  router: null as null | { replace: ReturnType<typeof vi.fn> },
  getCurrentOwnerSession: vi.fn(),
  logoutOwner: vi.fn(),
  getPetById: vi.fn(),
  getPets: vi.fn(),
  getPetRecords: vi.fn(),
  getPetMoments: vi.fn(),
  getPetTags: vi.fn(),
  getOrders: vi.fn(),
}));

mocks.router = { replace: mocks.replace };

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("@/components/layouts/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => true,
}));

vi.mock("@/services/authService", () => ({
  getCurrentOwnerSession: (...args: unknown[]) =>
    mocks.getCurrentOwnerSession(...args),
  isOwnerAuthenticated: () => mocks.authenticated,
  logoutOwner: (...args: unknown[]) => mocks.logoutOwner(...args),
}));

vi.mock("@/services/petService", () => ({
  getPetById: (...args: unknown[]) => mocks.getPetById(...args),
  getPets: (...args: unknown[]) => mocks.getPets(...args),
  getPublicPetProfileByPublicCode: vi.fn(),
  getPublicPetProfileBySafetyCode: vi.fn(),
}));

vi.mock("@/services/recordService", () => ({
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
}));

vi.mock("@/services/momentService", () => ({
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
  getPublicPetMoments: vi.fn(),
}));

vi.mock("@/services/tagService", () => ({
  getPetTags: (...args: unknown[]) => mocks.getPetTags(...args),
  getOrders: (...args: unknown[]) => mocks.getOrders(...args),
  getAllTags: vi.fn(),
  getFinderState: vi.fn(),
  getOrder: vi.fn(),
}));

const { RuntimeRouteFallback } = await import("./RuntimeRouteFallback");

describe("RuntimeRouteFallback owner authentication", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/pets/owner-pet-id/edit?tab=photos");
    mocks.authenticated = false;
    mocks.replace.mockReset();
    mocks.getCurrentOwnerSession.mockReset();
    mocks.logoutOwner.mockReset();
    mocks.getPetById.mockReset();
    mocks.getPets.mockReset().mockResolvedValue({ data: [] });
    mocks.getPetRecords.mockReset().mockResolvedValue({ data: [] });
    mocks.getPetMoments.mockReset().mockResolvedValue({ data: [] });
    mocks.getPetTags.mockReset().mockResolvedValue({ data: [] });
    mocks.getOrders.mockReset().mockResolvedValue({ data: [] });
  });

  afterEach(() => cleanup());

  it("redirects a missing session before checking whether the pet exists", async () => {
    render(
      <RuntimeRouteFallback>
        <p>Page not found</p>
      </RuntimeRouteFallback>
    );

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        `/login?redirect=${encodeURIComponent(
          "/pets/owner-pet-id/edit?tab=photos"
        )}`
      )
    );
    expect(mocks.getCurrentOwnerSession).not.toHaveBeenCalled();
    expect(mocks.getPetById).not.toHaveBeenCalled();
    expect(screen.queryByText("Page not found")).toBeNull();
  });

  it("redirects an expired verified session before loading the pet", async () => {
    mocks.authenticated = true;
    mocks.getCurrentOwnerSession.mockRejectedValue(
      new ApiClientError(401, "unauthorized", "Session expired")
    );

    render(
      <RuntimeRouteFallback>
        <p>Page not found</p>
      </RuntimeRouteFallback>
    );

    await waitFor(() => expect(mocks.logoutOwner).toHaveBeenCalledOnce());
    expect(mocks.replace).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent(
        "/pets/owner-pet-id/edit?tab=photos"
      )}`
    );
    expect(mocks.getPetById).not.toHaveBeenCalled();
  });

  it("keeps the loading state while authentication is still being verified", async () => {
    mocks.authenticated = true;
    mocks.getCurrentOwnerSession.mockImplementation(() => new Promise(() => {}));

    render(
      <RuntimeRouteFallback>
        <p>Page not found</p>
      </RuntimeRouteFallback>
    );

    await waitFor(() => expect(mocks.getCurrentOwnerSession).toHaveBeenCalledOnce());
    expect(mocks.getPetById).not.toHaveBeenCalled();
    expect(screen.queryByText("Pet not found")).toBeNull();
    expect(screen.queryByText("Page not found")).toBeNull();
  });

  it("checks the current session before loading an authenticated pet route", async () => {
    mocks.authenticated = true;
    mocks.getCurrentOwnerSession.mockResolvedValue({});
    mocks.getPetById.mockResolvedValue({ data: null });

    render(
      <RuntimeRouteFallback>
        <p>Page not found</p>
      </RuntimeRouteFallback>
    );

    expect(await screen.findByText("Pet not found")).toBeTruthy();
    expect(mocks.getCurrentOwnerSession).toHaveBeenCalledOnce();
    expect(mocks.getPetById).toHaveBeenCalledWith("owner-pet-id");
    expect(mocks.getCurrentOwnerSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getPetById.mock.invocationCallOrder[0]
    );
  });

  it("shows a retryable connection state instead of Pet Not Found", async () => {
    mocks.authenticated = true;
    mocks.getCurrentOwnerSession.mockResolvedValue({});
    mocks.getPetById.mockRejectedValue(
      new ApiClientError(0, "service_unavailable", "Could not connect")
    );

    render(
      <RuntimeRouteFallback>
        <p>Page not found</p>
      </RuntimeRouteFallback>
    );

    expect(
      await screen.findByText("MyPetLink temporarily unavailable")
    ).toBeTruthy();
    expect(screen.queryByText("Pet not found")).toBeNull();
    expect(screen.queryByText("Page not found")).toBeNull();
  });

  it("uses a privacy-preserving Pet Not Found state for forbidden pets", async () => {
    mocks.authenticated = true;
    mocks.getCurrentOwnerSession.mockResolvedValue({});
    mocks.getPetById.mockRejectedValue(
      new ApiClientError(403, "forbidden", "Forbidden")
    );

    render(
      <RuntimeRouteFallback>
        <p>Page not found</p>
      </RuntimeRouteFallback>
    );

    expect(await screen.findByText("Pet not found")).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
});

describe("RuntimeRouteFallback shared /q resolution", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/q/MPL-QR-TITLE");
    mocks.authenticated = false;
    mocks.replace.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("titles a /q link that resolved to a physical tag after the tag, not a missing profile", async () => {
    const petService = await import("@/services/petService");
    const tagService = await import("@/services/tagService");
    vi.mocked(petService.getPublicPetProfileBySafetyCode).mockResolvedValue({
      data: null,
    } as never);
    vi.mocked(tagService.getFinderState).mockResolvedValue({
      state: "unassigned",
      tagCode: "MPL-QR-TITLE",
    } as never);

    render(
      <RuntimeRouteFallback>
        <p>Page not found</p>
      </RuntimeRouteFallback>
    );

    await waitFor(() =>
      expect(tagService.getFinderState).toHaveBeenCalledWith(
        "MPL-QR-TITLE",
        "qr"
      )
    );
    await waitFor(() =>
      expect(document.title).toContain("Activate MyPetLink Tag")
    );
    expect(document.title).not.toContain("Safety Profile not found");
  });

  it("shows a retryable throttling message instead of Page Not Found", async () => {
    const petService = await import("@/services/petService");
    const tagService = await import("@/services/tagService");
    vi.mocked(petService.getPublicPetProfileBySafetyCode).mockResolvedValue({
      data: null,
    } as never);
    vi.mocked(tagService.getFinderState).mockRejectedValue(
      new ApiClientError(
        429,
        "rate_limit_exceeded",
        "Too many requests. Please wait a moment and try again."
      )
    );

    render(
      <RuntimeRouteFallback>
        <p>Page not found</p>
      </RuntimeRouteFallback>
    );

    expect(await screen.findByText("Please wait a moment")).toBeTruthy();
    expect(
      screen.getByText(
        "Too many requests. Please wait a moment and try again."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Page not found")).toBeNull();
  });
});
