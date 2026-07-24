// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FinderResult } from "@/types";

const mocks = vi.hoisted(() => ({
  apiMode: false,
  getFinderState: vi.fn(),
}));

vi.mock("@/services/tagService", () => ({
  getFinderState: (...args: unknown[]) => mocks.getFinderState(...args),
  getFriendlyTagErrorMessage: () => "Tag unavailable",
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => mocks.apiMode,
}));

vi.mock("@/components/marketing/QrSafetyPageView", () => ({
  QrSafetyPageView: ({ pet }: { pet: { name: string } }) => (
    <div>Safety Profile for {pet.name}</div>
  ),
}));

vi.mock("@/components/portal/TagActivationFlow", () => ({
  TagActivationFlow: ({ source }: { source: string }) => (
    <div>Activation flow: {source}</div>
  ),
}));

const { TagFinderView } = await import("./TagFinderView");

afterEach(() => {
  cleanup();
  mocks.apiMode = false;
  mocks.getFinderState.mockReset();
});

describe("TagFinderView scan-source behavior", () => {
  it("shows the finder-safe setup instructions for an unactivated NFC tag", () => {
    render(
      <TagFinderView
        initialResult={{
          state: "nfc-activation-required",
          tagCode: "MPL-NFC-01",
        }}
        refreshOnMount={false}
        source="nfc"
        tagCode="MPL-NFC-01"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Scan the QR code to activate" })
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Open the package and scan the QR code on the back of the tag to activate it first. NFC will work after activation."
      )
    ).toBeTruthy();
    expect(screen.queryByText(/Activation flow/)).toBeNull();
  });

  it("keeps QR and legacy activation flows while preserving the source", () => {
    const result: FinderResult = {
      state: "unassigned",
      tagCode: "MPL-QR-01",
    };
    const { rerender } = render(
      <TagFinderView
        initialResult={result}
        refreshOnMount={false}
        source="qr"
        tagCode="MPL-QR-01"
      />
    );
    expect(screen.getByText("Activation flow: qr")).toBeTruthy();

    rerender(
      <TagFinderView
        initialResult={result}
        refreshOnMount={false}
        source="legacy"
        tagCode="MPL-QR-01"
      />
    );
    expect(screen.getByText("Activation flow: legacy")).toBeTruthy();
  });

  it("renders the same Safety Profile for active QR and NFC entry routes", () => {
    const active = {
      state: "active" as const,
      tagCode: "MPL-ACTIVE-01",
      profile: { name: "Topu" },
    } as FinderResult;
    const { rerender } = render(
      <TagFinderView
        initialResult={active}
        refreshOnMount={false}
        source="qr"
        tagCode="MPL-ACTIVE-01"
      />
    );
    expect(screen.getByText("Safety Profile for Topu")).toBeTruthy();

    rerender(
      <TagFinderView
        initialResult={active}
        refreshOnMount={false}
        source="nfc"
        tagCode="MPL-ACTIVE-01"
      />
    );
    expect(screen.getByText("Safety Profile for Topu")).toBeTruthy();
  });

  it("does not render a build-time active profile before the live API lifecycle check", async () => {
    mocks.apiMode = true;
    mocks.getFinderState.mockResolvedValue({
      state: "inactive",
      tagCode: "MPL-DISABLED-01",
      status: "Disabled",
      reason: "inactive",
    });

    render(
      <TagFinderView
        initialResult={{
          state: "active",
          tagCode: "MPL-DISABLED-01",
          profile: { name: "Previous pet" },
        } as FinderResult}
        source="qr"
        tagCode="MPL-DISABLED-01"
      />
    );

    expect(screen.queryByText("Safety Profile for Previous pet")).toBeNull();
    expect(
      await screen.findByRole("heading", { name: "This tag is no longer active" })
    ).toBeTruthy();
    expect(mocks.getFinderState).toHaveBeenCalledTimes(1);
  });
});
