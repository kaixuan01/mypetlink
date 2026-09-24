// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentCollaborators } from "@/components/social/MomentCollaborators";
import { SocialMomentCard, SocialMomentTile } from "@/components/social/SocialMomentCard";
import {
  allMomentPets,
  formatCollaborators,
  isCollaboratorPet,
} from "@/lib/momentCollaboration";
import type {
  PublicMomentCollaboration,
  PublicMomentListItem,
} from "@/services/publicSocialService";

vi.mock("next/navigation", () => ({
  usePathname: () => "/feed",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(() => cleanup());

const household = (handle: string, displayName: string) => ({
  handle,
  displayName,
  avatarUrl: null,
  avatarThumbnailUrl: null,
});

const pet = (name: string, slug: string) => ({
  name,
  publicSlug: slug,
  photoUrl: null,
  isPrimarySubject: false,
  lostModeEnabled: false,
});

const lee: PublicMomentCollaboration = {
  household: household("leefamily", "The Lee Family"),
  pets: [pet("Mochi", "mochi-publee1"), pet("Milo", "milo-publee2")],
};
const ng: PublicMomentCollaboration = {
  household: household("nghome", "Ng Home"),
  pets: [pet("Pip", "pip-pubng1")],
};

function moment(collaborations: PublicMomentCollaboration[] = []): PublicMomentListItem {
  return {
    id: "1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9",
    title: "Beach day",
    momentDate: null,
    publishedAt: "2026-09-01T00:00:00Z",
    type: "Memory",
    caption: null,
    author: household("tanfamily", "The Tan Family"),
    subjects: [{ ...pet("Topu", "topu-pubtan1"), isPrimarySubject: true }],
    media: [],
    likeCount: 0,
    commentCount: 0,
    collaborations,
    viewerHasLiked: false,
  };
}

describe("collaboration attribution", () => {
  it("keeps the author first and names collaborators as \"with\"", () => {
    render(
      <SocialMomentCard moment={moment([lee])} onLikeChange={vi.fn()} signedIn={false} />
    );

    expect(screen.getByTestId("moment-subjects").textContent).toContain("Topu, Mochi & Milo");
    expect(screen.getByTestId("moment-byline").textContent).toContain("The Tan Family");
    const withLine = screen.getByTestId("moment-collaborators");
    expect(withLine.textContent).toBe("with The Lee Family");
    expect(within(withLine).getByRole("link").getAttribute("href")).toBe("/u/leefamily");
    // Nothing suggests a collaborator shared or can change the Moment.
    expect(document.body.textContent).not.toMatch(/by The Lee Family|co-author|edit/i);
  });

  it("summarises several households", () => {
    render(
      <SocialMomentCard moment={moment([lee, ng])} onLikeChange={vi.fn()} signedIn={false} />
    );

    expect(screen.getByTestId("moment-collaborators").textContent).toContain(
      "The Lee Family and 1 other"
    );
    expect(formatCollaborators([lee.household, ng.household, household("x", "X")])).toBe(
      "The Lee Family and 2 others"
    );
  });

  it("gives a grid tile a compact count with a full spoken name", () => {
    render(
      <SocialMomentTile
        moment={moment([lee, ng])}
        onLikeChange={vi.fn()}
        showAuthor
        signedIn={false}
      />
    );

    const count = screen.getByTestId("moment-collaborators");
    expect(count.textContent).toContain("+2");
    expect(count.textContent).toContain("with The Lee Family and 1 other");
  });

  it("shows \"Moment by\" on a collaborator pet's page only", () => {
    const collaborated = moment([lee]);
    render(
      <SocialMomentCard
        authorPrefix="Moment by"
        moment={collaborated}
        onLikeChange={vi.fn()}
        showAuthor={isCollaboratorPet(collaborated, "publee1")}
        signedIn={false}
      />
    );

    expect(screen.getByText("Moment by")).toBeTruthy();
    expect(isCollaboratorPet(collaborated, "mochi-publee1")).toBe(true);
    expect(isCollaboratorPet(collaborated, "pubtan1")).toBe(false);
    expect(isCollaboratorPet(moment(), "publee1")).toBe(false);
  });

  it("groups pets under their household on the Moment's own page", () => {
    render(<MomentCollaborators collaborations={[lee, ng]} />);

    const region = screen.getByRole("region", { name: "Households in this Moment" });
    const items = within(region).getAllByRole("listitem");
    expect(items[0].textContent).toContain("The Lee Family");
    expect(items[0].textContent).toContain("Mochi & Milo");
    expect(items[1].textContent).toContain("Pip");
    expect(allMomentPets(moment([lee])).map((subject) => subject.name)).toEqual([
      "Topu",
      "Mochi",
      "Milo",
    ]);
  });

  it("renders nothing extra for an ordinary Moment", () => {
    render(<SocialMomentCard moment={moment()} onLikeChange={vi.fn()} signedIn={false} />);

    expect(screen.queryByTestId("moment-collaborators")).toBeNull();
    const { container } = render(<MomentCollaborators collaborations={[]} />);
    expect(container.textContent).toBe("");
  });

  it("keeps \"with\" where the byline is hidden, so pets are never read as the author's", () => {
    render(
      <SocialMomentCard moment={moment([lee])} onLikeChange={vi.fn()} showAuthor={false} signedIn={false} />
    );

    expect(screen.queryByTestId("moment-byline")).toBeNull();
    expect(screen.getByTestId("moment-collaborators").textContent).toBe("with The Lee Family");
  });
});
