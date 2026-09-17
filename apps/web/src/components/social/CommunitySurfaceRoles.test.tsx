// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Three surfaces, three jobs.
 *
 * Home is the people you already care about. Explore is everyone else. Profile
 * is you. The failure this guards against is the tempting one: a Home that
 * looks thin gets "helped" with discovery content until it is Explore with
 * extra steps, and then Explore has no reason to exist.
 *
 * These read the source because the rule is about which query each surface asks
 * and what it renders around it — structure, not pixels.
 */

const web = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(web, "src", relative), "utf8");

const feed = () => read("components/social/SocialFeedView.tsx");
const explore = () => read("components/social/SocialExploreView.tsx");

describe("Home is a relationship feed", () => {
  it("asks the feed query and never the discovery one", () => {
    expect(feed()).toContain("getSocialFeed");
    // The one discovery call it makes is for the labelled suggestions block
    // below the feed; the stream itself never comes from Explore.
    expect(feed()).not.toContain("getExploreMoments");
  });

  it("keeps the viewer's own Moments in the stream", () => {
    // Profile shows them too, and that is fine: a new owner should not be met
    // by an empty screen, and seeing your own public Moment in context is how
    // you find out what it looks like to everybody else.
    const service = read("services/socialFeedService.ts");

    expect(service).toContain("/api/v1/social/feed");
    expect(feed()).not.toContain("excludeOwn");
    expect(feed()).not.toContain("filter((moment)");
  });

  it("never mixes suggestions into the chronological stream", () => {
    // Suggestions live in their own component under their own heading. If an
    // unfollowed household's card appeared in the stream, a reader would have
    // no way to tell what they had actually chosen to see.
    const stream = feed().slice(feed().indexOf('data-testid="feed-list"'));
    const beforeSuggestions = stream.slice(0, stream.indexOf("MeetMorePets"));

    expect(beforeSuggestions).not.toContain("SocialPetCard");
    expect(feed()).toContain("<SocialMomentStream");
  });

  it("puts discovery in a labelled block of its own", () => {
    // Its own heading and its own section, so nobody has to work out whether a
    // card arrived because they follow that family or because we suggested it.
    expect(feed()).toContain("Meet more pets");
    expect(feed()).toContain('id="meet-more-pets"');
    expect(feed()).toContain('data-testid="feed-suggestions"');
  });

  it("only offers discovery under a feed that actually exists", () => {
    // A reader who follows nobody gets the onboarding panel instead; showing
    // both would be two invitations to the same place on one screen.
    expect(feed()).toContain(
      "ready && !followsNobody && moments.length > 0 && moments.length < 5"
    );
  });
});

describe("Home's empty states", () => {
  it("reads the relationship from the server, not from the item count", () => {
    // A person can follow a dozen quiet households. Counting items would tell
    // them they follow nobody, which is both wrong and insulting.
    expect(feed()).toContain("hasFollowing");
    expect(feed()).toContain("hasFollowing === false");
    expect(feed()).toContain("hasFollowing === true && moments.length === 0");
  });

  it("gets that flag from the feed request it already makes", () => {
    // No second round trip per render, and no followers query of its own.
    const service = read("services/socialFeedService.ts");

    expect(service).toContain("hasFollowing");
    expect(feed()).not.toContain("getFollowing");
    expect(feed()).not.toContain("getFollowers");
  });
});

describe("Explore stays discovery", () => {
  it("asks the discovery query and never the feed", () => {
    expect(explore()).toContain("getExploreMoments");
    expect(explore()).toContain("getSuggestedPets");
    expect(explore()).not.toContain("getSocialFeed");
  });

  it("keeps its own filtering and search", () => {
    expect(explore()).toContain("SpeciesFilterSelect");
    expect(explore()).toContain("SocialSearchDialog");
  });

  it("did not become personalised", () => {
    // No viewer relationship steers what Explore selects. ("following" appears
    // once in prose describing what Explore is for, so this looks for the data.)
    expect(explore()).not.toContain("hasFollowing");
    expect(explore()).not.toContain("getSocialFeed");
    expect(explore()).not.toMatch(/followingCount|viewerFollows/);
  });
});

describe("Profile stays identity", () => {
  it("shows the household's own content and no discovery", () => {
    const profile = read("components/social/OwnerSocialProfileView.tsx");

    expect(profile).not.toContain("getExploreMoments");
    expect(profile).not.toContain("getSuggestedPets");
    expect(profile).not.toContain("getSocialFeed");
    expect(profile).not.toContain("Discover more pets");
  });
});

describe("what this pass must not have disturbed", () => {
  it("leaves the feed query's shape alone", () => {
    const service = readFileSync(
      join(web, "..", "api", "MyPetLink.Api", "Services", "SocialFeedService.cs"),
      "utf8"
    );

    // Own Moments, plus followed households, minus blocked — unchanged. The
    // only addition is a separate existence check for the relationship.
    expect(service).toContain("moment.AuthorUserId == actorId");
    expect(service).toContain("follow.FollowerUserId == actorId");
    expect(service).toContain("!blocked.Contains(moment.AuthorUserId)");
    expect(service).toContain("SocialCursor.FeedPageSize");
  });

  it("keeps the shared Moment card and its timestamp rules", () => {
    expect(feed()).toContain("SocialMomentStream");
    expect(read("components/social/SocialMomentStream.tsx")).toContain(
      "SocialMomentCard"
    );
    // No Home-only card styling creeping back in.
    expect(feed()).not.toContain("<SocialMomentCard");
  });

  it("keeps both feed analytics events and emits no identities", () => {
    expect(feed()).toContain("social_feed_viewed");
    expect(feed()).toContain("social_feed_page_loaded");
    expect(feed()).not.toMatch(/trackEvent\([^)]*handle/);
  });
});
