// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/pets/private-one" }));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/script", () => ({ default: () => null }));

const { AnalyticsProvider } = await import("./AnalyticsProvider");

function pageViewCalls() {
  return (window.dataLayer ?? [])
    .map((entry) => Array.from(entry as unknown[]))
    .filter((call) => call[0] === "event" && call[1] === "page_view");
}

describe("AnalyticsProvider", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST12345");
    state.pathname = "/pets/private-one";
    delete window.dataLayer;
    delete window.gtag;
    delete window.__myPetLinkGaMeasurementId;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("fires once per distinct App Router pathname, including dynamic routes", async () => {
    const view = render(<AnalyticsProvider />);
    await waitFor(() => expect(pageViewCalls()).toHaveLength(1));

    view.rerender(<AnalyticsProvider />);
    expect(pageViewCalls()).toHaveLength(1);

    state.pathname = "/pets/private-two";
    view.rerender(<AnalyticsProvider />);
    await waitFor(() => expect(pageViewCalls()).toHaveLength(2));
    expect(pageViewCalls().map((call) => call[2])).toEqual([
      expect.objectContaining({ page_path: "/pets/[pet]" }),
      expect.objectContaining({ page_path: "/pets/[pet]" }),
    ]);
    expect(JSON.stringify(pageViewCalls())).not.toContain("private-one");
    expect(JSON.stringify(pageViewCalls())).not.toContain("private-two");
  });
});
