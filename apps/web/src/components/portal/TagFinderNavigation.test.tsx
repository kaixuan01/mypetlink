// @vitest-environment jsdom

import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TagFinderView } from "./TagFinderView";

function notFoundResponse(code: string) {
  return new Response(
    JSON.stringify({
      data: {
        state: "notFound",
        tagCode: code,
        status: null,
        scanSource: "Qr",
        profile: null,
      },
      meta: { requestId: "scan-test" },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

describe("physical tag page-view scan requests", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("makes one resolution request under React StrictMode", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(notFoundResponse("MPL-STRICT-01"));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <StrictMode>
        <TagFinderView
          initialResult={{ state: "not-found", tagCode: "MPL-STRICT-01" }}
          source="qr"
          tagCode="MPL-STRICT-01"
        />
      </StrictMode>
    );

    expect(
      await screen.findByRole("heading", { name: "Tag not found" })
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates one new request for each later page navigation", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(notFoundResponse("MPL-NAVIGATION-01"))
      );
    vi.stubGlobal("fetch", fetchMock);

    const first = render(
      <StrictMode>
        <TagFinderView
          initialResult={{ state: "not-found", tagCode: "MPL-NAVIGATION-01" }}
          source="legacy"
          tagCode="MPL-NAVIGATION-01"
        />
      </StrictMode>
    );
    await screen.findByRole("heading", { name: "Tag not found" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    first.unmount();

    render(
      <StrictMode>
        <TagFinderView
          initialResult={{ state: "not-found", tagCode: "MPL-NAVIGATION-01" }}
          source="legacy"
          tagCode="MPL-NAVIGATION-01"
        />
      </StrictMode>
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("heading", { name: "Tag not found" })
    ).toBeTruthy();
  });
});
