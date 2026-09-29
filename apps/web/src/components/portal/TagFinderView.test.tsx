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

describe("TagFinderView when the tag is no longer active", () => {
  // The page told whoever was holding the tag to "contact MyPetLink support"
  // and gave them no way to. It now carries the support action itself, and
  // nothing else: an inactive tag still shows no owner contact.
  const ownerLeak = {
    name: "Mochi",
    ownerName: "Aisyah Rahman",
    phone: "+60123456789",
    whatsapp: "+60123456789",
    contact: { phoneE164: "+60123456789", whatsappE164: "+60123456789" },
    publicProfilePath: "/p/mochi-pubmochi",
    memorial: { showMemorialOnPublicProfile: true },
  };

  function inactive(overrides: Record<string, unknown> = {}) {
    return {
      state: "inactive",
      tagCode: "MPL-QA7K-9F3M",
      status: "Disabled",
      reason: "inactive",
      ...overrides,
    } as unknown as FinderResult;
  }

  // The view re-reads the tag once on mount; it answers with the same state.
  function renderInactive(
    result: FinderResult,
    source: "qr" | "nfc" | "legacy" = "qr"
  ) {
    mocks.getFinderState.mockResolvedValue(result);
    return render(
      <TagFinderView initialResult={result} source={source} tagCode="MPL-QA7K-9F3M" />
    );
  }

  function supportLink() {
    return screen.getByRole("link", { name: /Contact MyPetLink Support/ });
  }

  it.each([
    ["qr", "Lost"],
    ["qr", "Disabled"],
    ["qr", "Replaced"],
    ["nfc", "Lost"],
    ["nfc", "Disabled"],
    ["nfc", "Replaced"],
    ["legacy", "Disabled"],
  ] as const)("offers MyPetLink Support for a %s scan of a %s tag", (source, status) => {
    renderInactive(inactive({ status }), source);

    expect(screen.getByRole("heading", { name: "This tag is no longer active" })).toBeTruthy();
    const href = supportLink().getAttribute("href") ?? "";

    // The one support address the site keeps, with the tag code pre-filled so
    // Support can find the tag without asking.
    expect(href.startsWith("mailto:support@mypetlink.com.my?")).toBe(true);
    expect(decodeURIComponent(href)).toContain("subject=MyPetLink tag MPL-QA7K-9F3M");
  });

  it("also offers Support when the pet's profile is archived", () => {
    renderInactive(inactive({ reason: "archived", profile: ownerLeak }), "qr");

    expect(screen.getByText(/profile is archived/)).toBeTruthy();
    expect(supportLink()).toBeTruthy();
  });

  it.each(["inactive", "archived"] as const)(
    "shows no owner contact beside the support action (%s)",
    (reason) => {
      const { container } = renderInactive(inactive({ reason, profile: ownerLeak }), "nfc");

      const hrefs = [...container.querySelectorAll("a[href]")].map((link) =>
        link.getAttribute("href") ?? ""
      );

      expect(hrefs.some((href) => href.startsWith("tel:"))).toBe(false);
      expect(hrefs.some((href) => href.includes("wa.me"))).toBe(false);
      expect(container.textContent).not.toContain("+60123456789");
      expect(container.textContent).not.toContain("Aisyah Rahman");
      // Support is the only way out of this page.
      expect(hrefs.filter((href) => href.startsWith("mailto:"))).toHaveLength(1);
    }
  );

  it("leaves a memorial tag with its memorial link and no support prompt", () => {
    renderInactive(inactive({ reason: "memorial", profile: ownerLeak }), "qr");

    expect(screen.getByRole("link", { name: /View Memorial Profile/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Contact MyPetLink Support/ })).toBeNull();
  });
});
