// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { REFERRAL_ATTRIBUTION_STORAGE_KEY } from "@/lib/referralAttribution";

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("@/services/apiClient", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("@/services/apiConfig", () => ({ canUseApi: () => true }));

import { loginWithGoogleIdToken } from "./authService";

const response = {
  accessToken: "access",
  refreshToken: "refresh",
  expiresIn: 900,
  user: {
    id: "owner-1",
    email: "owner@example.com",
    displayName: "Owner",
    roles: ["Owner"],
    status: "Active",
  },
  ownerProfile: {
    id: "profile-1",
    ownerDisplayName: "Owner",
    planCode: "Free",
    planName: "Free",
  },
};

describe("Google login referral handoff", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.apiRequest.mockReset();
  });

  it("sends the stored code and capture timestamp, then consumes it after success", async () => {
    window.localStorage.setItem(
      REFERRAL_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({ code: "AMANDA", capturedAt: new Date().toISOString() })
    );
    mocks.apiRequest.mockResolvedValue({ data: response });

    await loginWithGoogleIdToken("google-token");

    expect(mocks.apiRequest).toHaveBeenCalledWith("/api/v1/auth/google", {
      method: "POST",
      body: {
        idToken: "google-token",
        referralCode: "AMANDA",
        referralCapturedAt: expect.any(String),
      },
      auth: false,
    });
    expect(window.localStorage.getItem(REFERRAL_ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });

  it("retains the first touch when sign-in fails so the owner can retry", async () => {
    window.localStorage.setItem(
      REFERRAL_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({ code: "AMANDA", capturedAt: new Date().toISOString() })
    );
    mocks.apiRequest.mockRejectedValue(new Error("network"));

    await expect(loginWithGoogleIdToken("google-token")).rejects.toThrow("network");
    expect(window.localStorage.getItem(REFERRAL_ATTRIBUTION_STORAGE_KEY)).not.toBeNull();
  });
});
