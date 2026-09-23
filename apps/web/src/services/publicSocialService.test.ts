import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock("@/services/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/apiClient")>();
  return {
    ...actual,
    apiRequest: mocks.apiRequest,
  };
});

vi.mock("@/services/apiConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/apiConfig")>();
  return { ...actual, getApiBaseUrl: () => "https://api.test" };
});

import {
  getPublicMoment,
  PublicProfileUnavailableError,
} from "@/services/publicSocialService";

beforeEach(() => {
  mocks.apiRequest.mockReset();
});

describe("getPublicMoment", () => {
  it("treats the API's 404 as a Moment that is not available", async () => {
    // Missing, private, taken down and blocked all arrive as this one answer,
    // and the page must say "not available" rather than offer a Retry that
    // cannot change it.
    mocks.apiRequest.mockRejectedValue(
      new ApiClientError(404, "social_moment_not_found", "This Moment is not available.")
    );

    const error = await getPublicMoment("moment-1").catch((caught) => caught);

    expect(error).toBeInstanceOf(PublicProfileUnavailableError);
    expect((error as PublicProfileUnavailableError).reason).toBe("not-found");
  });

  it("keeps a server failure a failure", async () => {
    const failure = new ApiClientError(500, "http_500", "Something went wrong.");
    mocks.apiRequest.mockRejectedValue(failure);

    await expect(getPublicMoment("moment-1")).rejects.toBe(failure);
  });
});
