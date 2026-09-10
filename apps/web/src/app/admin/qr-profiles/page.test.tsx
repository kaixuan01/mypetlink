// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { adminRoutes } from "@/lib/routes";
import AdminQrProfilesRedirect from "./page";

const replace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

describe("legacy QR Profiles route", () => {
  it("uses the shared Admin page header while redirecting to Pet profiles", async () => {
    render(<AdminQrProfilesRedirect />);

    expect(screen.getByRole("heading", { level: 1, name: "Pet profiles" })).toBeTruthy();
    expect(screen.getByText("Opening Pet profiles…")).toBeTruthy();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(adminRoutes.pets));
  });
});
