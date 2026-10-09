import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import {
  communityActionErrorMessage,
  communityModerationReasonLabel,
  communityRestrictionMessage,
  formatCommunityRestrictionEnd,
  moderationNoticeCopy,
  readCommunityRestriction,
} from "@/lib/communityModeration";

const now = Date.parse("2026-10-08T02:00:00Z");

describe("Community restriction copy", () => {
  it("says until when a timed restriction lasts, in Malaysia time", () => {
    expect(formatCommunityRestrictionEnd("2026-10-15T06:00:00Z")).toBe("15 Oct 2026, 2:00 PM");
    expect(communityRestrictionMessage("2026-10-15T06:00:00Z", now)).toBe(
      "Your Community access is temporarily restricted until 15 Oct 2026, 2:00 PM."
    );
  });

  it("calls a restriction with no end date a suspension of Community access", () => {
    expect(communityRestrictionMessage(null, now)).toBe("Your Community access has been suspended.");
    expect(communityRestrictionMessage(undefined, now)).toBe("Your Community access has been suspended.");
  });

  it("never shows an end that has already passed", () => {
    expect(communityRestrictionMessage("2026-10-08T01:59:00Z", now)).toBe(
      "Your Community access is being restored. Please try again in a minute."
    );
  });

  it("reads a restriction from an API error, and nothing else", () => {
    const restricted = new ApiClientError(403, "community_restricted", "Your Community access is temporarily restricted.", {
      restrictedUntil: ["2026-10-15T06:00:00Z"],
    });
    const forbidden = new ApiClientError(403, "forbidden", "No.");

    expect(readCommunityRestriction(restricted)).toEqual({ restrictedUntil: "2026-10-15T06:00:00Z" });
    expect(readCommunityRestriction(new ApiClientError(403, "community_restricted", "Suspended."))).toEqual({ restrictedUntil: null });
    expect(readCommunityRestriction(forbidden)).toBeNull();
    expect(readCommunityRestriction(new Error("offline"))).toBeNull();
    expect(communityActionErrorMessage(restricted, "fallback")).toMatch(/temporarily restricted until 15 Oct 2026/);
    expect(communityActionErrorMessage(forbidden, "fallback")).toBe("No.");
    expect(communityActionErrorMessage(new Error("offline"), "fallback")).toBe("fallback");
  });
});

describe("Moderation notices", () => {
  it("words every notice calmly, with the reason in plain words", () => {
    expect(moderationNoticeCopy({ action: "MomentRemoved", reason: "ScamOrFraud", restrictedUntil: null })).toEqual({
      title: "Your Moment was removed",
      body: "Your Moment was removed because it violated our Community Guidelines.",
      reason: "Scam / Fraud",
    });
    expect(moderationNoticeCopy({ action: "ReplyRemoved", reason: "Harassment", restrictedUntil: null }).title).toBe("Your reply was removed");
    expect(moderationNoticeCopy({ action: "WarningIssued", reason: "Other", restrictedUntil: null }).title).toBe("You received a Community warning.");
    expect(moderationNoticeCopy({ action: "CommunityRestricted", reason: "Harassment", restrictedUntil: null }).title).toBe(
      "Your Community access has been suspended."
    );
    expect(moderationNoticeCopy({ action: "CommunityRestricted", reason: null, restrictedUntil: "2026-10-15T06:00:00Z" }).title).toBe(
      "Your Community access has been restricted until 15 Oct 2026, 2:00 PM."
    );
  });

  it("shows no reason it does not know rather than a raw value", () => {
    expect(communityModerationReasonLabel("PrivacyOrPersonalInformation")).toBe("Privacy / Personal Information");
    expect(communityModerationReasonLabel("SomethingNew")).toBeNull();
    expect(moderationNoticeCopy({ action: "CommentRemoved", reason: "SomethingNew", restrictedUntil: null }).reason).toBeNull();
  });
});
