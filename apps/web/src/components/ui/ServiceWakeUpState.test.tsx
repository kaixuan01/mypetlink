// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearWakeUpState,
  markWakeUpFailed,
  markWakeUpRetrying,
} from "@/services/serviceWakeUp";
import { ServiceWakeUpState } from "./ServiceWakeUpState";

let pathname = "/dashboard";

vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("ServiceWakeUpState", () => {
  beforeEach(() => {
    pathname = "/dashboard";
    clearWakeUpState();
  });

  afterEach(() => {
    cleanup();
    clearWakeUpState();
  });

  it("announces a warm, non-technical owner waiting state", () => {
    markWakeUpRetrying("request-1", 1);
    render(<ServiceWakeUpState />);

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Waking up MyPetLink");
    expect(status.textContent).toContain("getting your pet’s space ready");
    expect(status.textContent).not.toMatch(/SQL|Azure|503|database|server error/i);
    expect(status.querySelector(".wake-paw")).toBeTruthy();
  });

  it("uses professional wording for admin routes", () => {
    pathname = "/admin/orders";
    markWakeUpRetrying("request-1", 2);
    render(<ServiceWakeUpState />);

    expect(screen.getByRole("status").textContent).toContain("Preparing MyPetLink");
    expect(screen.getByText("Please wait while the service becomes ready.")).toBeTruthy();
  });

  it("offers accessible recovery actions after bounded retries", () => {
    markWakeUpFailed("request-1", 6);
    render(<ServiceWakeUpState />);

    expect(screen.getByRole("button", { name: "Try Again" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to Home" }).getAttribute("href")
    ).toBe("/");
    expect(screen.getByRole("status").textContent).toContain(
      "Your pet information is safe"
    );
  });
});
