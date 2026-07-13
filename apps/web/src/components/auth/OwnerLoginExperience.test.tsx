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
import { OwnerLoginExperience } from "./OwnerLoginExperience";

const authMocks = vi.hoisted(() => ({
  apiMode: false,
  clientId: "",
  credentialCallback: null as null | ((response: { credential?: string }) => void),
  loginMockOwner: vi.fn(),
  loginWithGoogleIdToken: vi.fn(),
  replace: vi.fn(),
  router: null as null | { replace: ReturnType<typeof vi.fn> },
}));

authMocks.router = { replace: authMocks.replace };

vi.mock("next/navigation", () => ({
  useRouter: () => authMocks.router,
}));

vi.mock("@/services/apiConfig", () => ({
  getGoogleClientId: () => authMocks.clientId,
  isApiConfigured: () => authMocks.apiMode,
}));

vi.mock("@/services/authService", () => ({
  loginMockOwner: authMocks.loginMockOwner,
  loginWithGoogleIdToken: authMocks.loginWithGoogleIdToken,
}));

function installGoogleButton() {
  Object.defineProperty(window, "google", {
    configurable: true,
    value: {
      accounts: {
        id: {
          initialize: ({ callback }: { callback: typeof authMocks.credentialCallback }) => {
            authMocks.credentialCallback = callback;
          },
          renderButton: (element: HTMLElement) => {
            const button = document.createElement("button");
            button.setAttribute("aria-label", "Continue with Google account");
            button.textContent = "Continue with Google";
            button.addEventListener("click", () => {
              authMocks.credentialCallback?.({ credential: "google-id-token" });
            });
            element.appendChild(button);
          },
        },
      },
    },
    writable: true,
  });
}

describe("OwnerLoginExperience", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/login");
    authMocks.apiMode = false;
    authMocks.clientId = "";
    authMocks.credentialCallback = null;
    authMocks.loginMockOwner.mockReset();
    authMocks.loginWithGoogleIdToken.mockReset();
    authMocks.loginWithGoogleIdToken.mockResolvedValue({});
    authMocks.replace.mockReset();

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 320,
    });

    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete window.google;
  });

  it("renders the mobile login action before portal benefits", () => {
    render(<OwnerLoginExperience />);
    const heading = screen.getByRole("heading", { level: 1, name: "Welcome back" });
    const action = screen.getByRole("group", { name: "Google sign-in action" });
    const benefits = screen.getByRole("region", { name: "What you can manage" });

    expect(
      heading.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
    expect(
      action.compareDocumentPosition(benefits) & Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
  });

  it("keeps the local Google sign-in action functional", () => {
    render(<OwnerLoginExperience />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(authMocks.loginMockOwner).toHaveBeenCalledOnce();
    expect(authMocks.replace).toHaveBeenCalledWith("/dashboard");
  });

  it("returns the owner to the requested Edit Pet page after sign-in", () => {
    window.history.replaceState(
      {},
      "",
      `/login?redirect=${encodeURIComponent(
        "/pets/owner-pet-id/edit?tab=photos"
      )}`
    );
    render(<OwnerLoginExperience />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(authMocks.replace).toHaveBeenCalledWith(
      "/pets/owner-pet-id/edit?tab=photos"
    );
  });

  it("rejects an external post-login redirect", () => {
    window.history.replaceState(
      {},
      "",
      `/login?redirect=${encodeURIComponent("https://evil.example/account")}`
    );
    render(<OwnerLoginExperience />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(authMocks.replace).toHaveBeenCalledWith("/dashboard");
  });

  it("submits a Google credential and redirects after successful sign-in", async () => {
    authMocks.apiMode = true;
    authMocks.clientId = "client-id.apps.googleusercontent.com";
    installGoogleButton();
    render(<OwnerLoginExperience />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Continue with Google account" })
    );

    await waitFor(() => {
      expect(authMocks.loginWithGoogleIdToken).toHaveBeenCalledWith(
        "google-id-token"
      );
      expect(authMocks.replace).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows authentication errors immediately after the sign-in action and focuses them", async () => {
    authMocks.apiMode = true;
    authMocks.clientId = "client-id.apps.googleusercontent.com";
    authMocks.loginWithGoogleIdToken.mockRejectedValueOnce(new Error("failed"));
    installGoogleButton();
    render(<OwnerLoginExperience />);
    const action = screen.getByRole("group", { name: "Google sign-in action" });

    fireEvent.click(
      await screen.findByRole("button", { name: "Continue with Google account" })
    );
    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toContain("Google sign-in could not finish");
    expect(
      action.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
    expect(document.activeElement).toBe(alert);
  });

  it("does not repeat a large MyPetLink logo inside the login card", () => {
    render(<OwnerLoginExperience />);
    const panel = screen.getByRole("region", { name: "Continue with Google" });

    expect(within(panel).queryByRole("img")).toBeNull();
  });

  it("retains a balanced two-column desktop layout", () => {
    render(<OwnerLoginExperience />);
    const heading = screen.getByRole("heading", { level: 1, name: "Welcome back" });
    const layout = heading.parentElement?.parentElement;
    const panel = screen.getByRole("region", { name: "Continue with Google" });

    expect(layout?.className).toContain("lg:grid-cols-");
    expect(panel.parentElement?.className).toContain("lg:col-start-2");
    expect(panel.parentElement?.className).toContain("lg:row-span-2");
  });

  it("constrains the mobile layout without horizontal overflow", () => {
    render(<OwnerLoginExperience />);
    const pageSection = screen
      .getByRole("heading", { level: 1, name: "Welcome back" })
      .closest("section");

    expect(pageSection?.className).toContain("overflow-x-clip");
    expect((pageSection as HTMLElement).style.maxWidth).toBe("100%");
  });

  it("marks Smart Tag add-ons as Coming Soon", () => {
    render(<OwnerLoginExperience />);

    expect(screen.getByText("Smart Tag add-ons — Coming Soon")).toBeTruthy();
    expect(screen.queryByText(/Order QR or QR \+ NFC tags/i)).toBeNull();
  });

  it("keeps the unavailable state close to the sign-in action", () => {
    authMocks.apiMode = true;
    authMocks.clientId = "";
    render(<OwnerLoginExperience />);
    const action = screen.getByRole("group", { name: "Google sign-in action" });

    expect(
      within(action).getByText(/Google sign-in is temporarily unavailable/i)
    ).toBeTruthy();
  });
});
