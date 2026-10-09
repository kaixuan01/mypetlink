import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import { getFriendlyMomentErrorMessage } from "@/services/momentService";

describe("Moment saves refused by a Community restriction", () => {
  it("says until when, and that the Moment can still be saved privately", () => {
    const error = new ApiClientError(403, "community_restricted", "Your Community access is temporarily restricted.", {
      restrictedUntil: ["2099-01-15T06:00:00Z"],
    });

    expect(getFriendlyMomentErrorMessage(error)).toBe(
      "Your Community access is temporarily restricted until 15 Jan 2099, 2:00 PM. You can still save this Moment privately."
    );
  });

  it("never shows the restriction's end date as if it were a field error", () => {
    const error = new ApiClientError(403, "community_restricted", "Your Community access has been suspended.");

    expect(getFriendlyMomentErrorMessage(error)).toBe(
      "Your Community access has been suspended. You can still save this Moment privately."
    );
  });
});
