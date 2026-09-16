import { describe, expect, it, vi } from "vitest";
import {
  buildMomentHead,
  fetchMoment,
  isValidMomentId,
  type EdgeMoment,
} from "./momentEdge";

/**
 * The edge half of `/moments/{momentId}`.
 *
 * It decides nothing about who may see a Moment — that is the API's answer, and
 * this asks the same public endpoint the browser is about to ask. What it is
 * responsible for is refusing a request that is not shaped like a Moment id
 * before it becomes an origin request, and turning the answer into a link
 * preview that describes the Moment rather than the app.
 */

const env: MyPetLinkPagesEnv = {
  PUBLIC_API_BASE_URL: "https://api.test",
};

const momentId = "9c1f8a2e-1111-4a2b-8c3d-4e5f60718293";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function apiMoment(overrides: Record<string, unknown> = {}) {
  return {
    id: momentId,
    title: "Beach day",
    caption: "A bright afternoon by the water.",
    author: { handle: "tanfamily", displayName: "The Tan Family" },
    subjects: [{ name: "Mochi" }, { name: "Coco" }],
    media: [
      { id: "m0", type: "image", url: "https://media.test/photo.jpg" },
    ],
    ...overrides,
  };
}

describe("isValidMomentId", () => {
  it("accepts the identifier shape a Moment actually has", () => {
    expect(isValidMomentId(momentId)).toBe(true);
    expect(isValidMomentId(momentId.toUpperCase())).toBe(true);
  });

  it.each(["", "beach-day", "123", "../admin", `${momentId}/extra`, `${momentId}x`])(
    "rejects %s before it can reach the origin",
    (value) => {
      expect(isValidMomentId(value)).toBe(false);
    }
  );
});

describe("fetchMoment", () => {
  it("asks the public endpoint and reads the Moment out of the envelope", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(apiMoment()));

    const result = await fetchMoment(env, momentId, fetcher as never);

    expect(fetcher).toHaveBeenCalledWith(
      `https://api.test/api/v1/public/moments/${momentId}`,
      expect.objectContaining({ cache: "no-store" })
    );
    expect(result).toEqual({
      kind: "ok",
      moment: expect.objectContaining({
        id: momentId,
        title: "Beach day",
        petNames: ["Mochi", "Coco"],
        imageUrl: "https://media.test/photo.jpg",
      }),
    });
  });

  it("reports a Moment the API will not serve as not found", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));

    // Private, archived, blocked, never existed — the API answers all of them
    // the same way, and so does this.
    expect(await fetchMoment(env, momentId, fetcher as never)).toEqual({
      kind: "not-found",
    });
  });

  it("never calls the origin for a malformed id", async () => {
    const fetcher = vi.fn();

    expect(await fetchMoment(env, "not-an-id", fetcher as never)).toEqual({
      kind: "error",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("takes no preview image from a video", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse(
        apiMoment({
          media: [{ id: "m0", type: "video", url: "https://media.test/clip.mp4" }],
        })
      )
    );

    const result = await fetchMoment(env, momentId, fetcher as never);

    // A video file is not an image. Handing one to og:image produces a broken
    // preview card, which is worse than a card with no picture.
    expect(result).toMatchObject({ kind: "ok", moment: { imageUrl: null } });
  });

  it("prefers the first image when a Moment leads with a video", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse(
        apiMoment({
          media: [
            { id: "m0", type: "video", url: "https://media.test/clip.mp4" },
            { id: "m1", type: "image", url: "https://media.test/photo.jpg" },
          ],
        })
      )
    );

    expect(await fetchMoment(env, momentId, fetcher as never)).toMatchObject({
      moment: { imageUrl: "https://media.test/photo.jpg" },
    });
  });
});

describe("buildMomentHead", () => {
  const moment: EdgeMoment = {
    id: momentId,
    title: "Beach day",
    caption: "A bright afternoon by the water.",
    authorDisplayName: "The Tan Family",
    petNames: ["Mochi"],
    imageUrl: "https://media.test/photo.jpg",
  };

  it("previews as the Moment, at its own address", () => {
    const head = buildMomentHead(moment);

    expect(head).toContain("<title>Beach day | MyPetLink</title>");
    expect(head).toContain("A bright afternoon by the water.");
    expect(head).toContain(`/moments/${momentId}`);
    expect(head).toContain('content="https://media.test/photo.jpg"');
    expect(head).toContain('content="summary_large_image"');
  });

  it("falls back to the pets and the household when there is no caption", () => {
    const head = buildMomentHead({ ...moment, caption: null });

    expect(head).toContain("Mochi · The Tan Family");
  });

  it("escapes anything an owner typed", () => {
    const head = buildMomentHead({
      ...moment,
      title: '<script>alert("x")</script>',
      caption: 'Quote " and <tag>',
    });

    expect(head).not.toContain("<script>");
    expect(head).toContain("&lt;script&gt;");
    expect(head).toContain("&quot;");
  });

  it("uses the small card when there is no picture to show", () => {
    const head = buildMomentHead({ ...moment, imageUrl: null });

    expect(head).toContain('content="summary"');
    expect(head).not.toContain("og:image");
  });
});
