// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MomentMedia, PetMomentPayload } from "@/types";

/**
 * Saving a Moment with media, from the service's point of view.
 *
 * The upload function and the API are replaced by a stand-in that behaves like
 * the real server: uploads come back unattached, a create with an idempotency
 * key it has seen returns the Moment that key made, and nothing is attached
 * until a create or update names it. Failures are injected per file.
 */

const server = vi.hoisted(() => ({
  uploads: [] as { file: string; momentId?: string; cleanupOnFailure?: boolean }[],
  failNames: new Set<string>(),
  requests: [] as { method: string; path: string; body: Record<string, unknown> }[],
  momentsByKey: new Map<string, string>(),
  deleted: [] as string[],
  loseNextCreateAnswer: false,
  nextMedia: 0,
}));

vi.mock("@/services/apiConfig", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiConfig")>("@/services/apiConfig");
  return { ...actual, canUseApi: () => true };
});

vi.mock("@/services/mediaService", async () => {
  const actual = await vi.importActual<typeof import("@/services/mediaService")>("@/services/mediaService");
  return {
    ...actual,
    uploadMediaFile: async (input: { file: File; momentId?: string; cleanupOnFailure?: boolean }) => {
      server.uploads.push({ file: input.file.name, momentId: input.momentId, cleanupOnFailure: input.cleanupOnFailure });
      if (server.failNames.has(input.file.name)) throw new Error("network");
      server.nextMedia += 1;
      return {
        mediaId: `media-${server.nextMedia}`,
        publicUrl: `https://media.test/${input.file.name}`,
        originalFileName: input.file.name,
      };
    },
    deleteMedia: async (id: string) => {
      server.deleted.push(id);
    },
  };
});

vi.mock("@/services/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiClient")>("@/services/apiClient");
  return {
    ...actual,
    apiRequest: async (path: string, options: { method?: string; body?: Record<string, unknown> } = {}) => {
      const method = options.method ?? "GET";
      const body = options.body ?? {};
      server.requests.push({ method, path, body });
      const key = body.idempotencyKey as string | undefined;
      let id = key ? server.momentsByKey.get(key) : undefined;
      if (method === "POST") {
        if (!id) {
          id = `moment-${server.momentsByKey.size + 1}`;
          if (key) server.momentsByKey.set(key, id);
        }
        if (server.loseNextCreateAnswer) {
          server.loseNextCreateAnswer = false;
          throw new actual.ApiClientError(0, "network_error", "We could not reach MyPetLink right now.");
        }
      }
      const mediaIds = (body.mediaFileIds as string[] | undefined) ?? [];
      return {
        data: {
          id: id ?? path.split("/").at(-1),
          petId: "pet-1",
          title: body.title,
          date: "2026-09-28",
          type: body.type,
          caption: body.caption ?? null,
          visibility: body.visibility,
          showOnPublicProfile: body.visibility === "Public",
          showInLifeTimeline: false,
          media: mediaIds.map((mediaId, index) => ({ id: mediaId, type: "image", url: "", sortOrder: index })),
          createdAt: "2026-09-28T00:00:00Z",
          updatedAt: "2026-09-28T00:00:00Z",
          additionalPetIds: [],
        },
        meta: { requestId: "r" },
      };
    },
  };
});

import {
  createMomentSaveSession,
  createPetMoment,
  MomentMediaUploadError,
  releaseMomentSaveSession,
  updatePetMoment,
} from "@/services/momentService";

function file(name: string) {
  return new File(["x"], name, { type: "image/jpeg" });
}

function newMedia(files: File[]): MomentMedia[] {
  return files.map((sourceFile, index) => ({
    id: `local-${index}`,
    type: "image",
    url: "blob:local",
    sortOrder: index,
    sourceFile,
  }));
}

function payload(media: MomentMedia[], visibility: "Public" | "Private" = "Public"): PetMomentPayload {
  return { title: "Beach day", date: "28 Sep 2026", type: "Other", caption: "", media, visibility, showInLifeTimeline: false };
}

const creates = () => server.requests.filter((request) => request.method === "POST");
const updates = () => server.requests.filter((request) => request.method === "PUT");

beforeEach(() => {
  server.uploads = [];
  server.failNames = new Set();
  server.requests = [];
  server.momentsByKey = new Map();
  server.deleted = [];
  server.loseNextCreateAnswer = false;
  server.nextMedia = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("creating a Moment", () => {
  it("with no media: one create, carrying the attempt's key", async () => {
    const session = createMomentSaveSession();

    await createPetMoment("pet-1", payload([]), session);

    expect(creates()).toHaveLength(1);
    expect(creates()[0].body.idempotencyKey).toBe(session.idempotencyKey);
    expect(creates()[0].body.mediaFileIds).toEqual([]);
    expect(updates()).toHaveLength(0);
  });

  it("with media: uploads everything first, unattached, then ONE create naming it", async () => {
    const files = [file("a.jpg"), file("b.jpg"), file("c.jpg")];

    const created = await createPetMoment("pet-1", payload(newMedia(files)));

    // No upload names a Moment; there is none yet.
    expect(server.uploads.map((upload) => upload.momentId)).toEqual([undefined, undefined, undefined]);
    expect(server.uploads.every((upload) => upload.cleanupOnFailure)).toBe(true);
    // The create is the first and only Moment request, and it names every file.
    expect(server.requests.map((request) => request.method)).toEqual(["POST"]);
    expect(creates()[0].body.mediaFileIds).toEqual(["media-1", "media-2", "media-3"]);
    expect(created.data.media.map((media) => media.id)).toEqual(["media-1", "media-2", "media-3"]);
  });

  it.each([
    ["first", 0],
    ["middle", 1],
    ["last", 2],
  ])("when the %s upload fails, nothing is created or published", async (_label, failing) => {
    const files = [file("a.jpg"), file("b.jpg"), file("c.jpg")];
    server.failNames.add(files[failing].name);

    await expect(createPetMoment("pet-1", payload(newMedia(files)))).rejects.toBeInstanceOf(
      MomentMediaUploadError
    );

    expect(server.requests).toHaveLength(0);
    expect(server.uploads).toHaveLength(failing + 1);
  });

  it("says plainly that nothing was saved, and that retrying is safe", async () => {
    server.failNames.add("a.jpg");

    const error = await createPetMoment("pet-1", payload(newMedia([file("a.jpg")]))).catch((caught) => caught);

    expect(error.message).toContain("hasn't been saved yet");
    expect(error.message).toContain("won't upload twice");
  });

  it("a retry uploads only what failed, then creates once", async () => {
    const files = [file("a.jpg"), file("b.jpg"), file("c.jpg")];
    const session = createMomentSaveSession();
    server.failNames.add("c.jpg");
    await expect(createPetMoment("pet-1", payload(newMedia(files)), session)).rejects.toThrow();

    server.failNames.clear();
    const created = await createPetMoment("pet-1", payload(newMedia(files)), session);

    expect(server.uploads.map((upload) => upload.file)).toEqual(["a.jpg", "b.jpg", "c.jpg", "c.jpg"]);
    expect(creates()).toHaveLength(1);
    expect(creates()[0].body.mediaFileIds).toEqual(["media-1", "media-2", "media-3"]);
    expect(created.data.id).toBe("moment-1");
  });

  it("a retry after the server created it but the answer was lost returns the same Moment", async () => {
    const files = [file("a.jpg")];
    const session = createMomentSaveSession();
    server.loseNextCreateAnswer = true;
    await expect(createPetMoment("pet-1", payload(newMedia(files)), session)).rejects.toThrow();

    const created = await createPetMoment("pet-1", payload(newMedia(files)), session);

    // Same key, same files, no second upload — and the server's first Moment.
    expect(creates()).toHaveLength(2);
    expect(creates()[1].body.idempotencyKey).toBe(creates()[0].body.idempotencyKey);
    expect(creates()[1].body.mediaFileIds).toEqual(creates()[0].body.mediaFileIds);
    expect(server.uploads).toHaveLength(1);
    expect(created.data.id).toBe("moment-1");
    expect(server.momentsByKey.size).toBe(1);
  });

  it("two quick presses in one session are one Moment", async () => {
    const session = createMomentSaveSession();

    const [first, second] = await Promise.all([
      createPetMoment("pet-1", payload([]), session),
      createPetMoment("pet-1", payload([]), session),
    ]);

    expect(first.data.id).toBe(second.data.id);
    expect(new Set(creates().map((request) => request.body.idempotencyKey)).size).toBe(1);
  });

  it("separate editors are separate Moments", async () => {
    await createPetMoment("pet-1", payload([]), createMomentSaveSession());
    await createPetMoment("pet-1", payload([]), createMomentSaveSession());

    expect(server.momentsByKey.size).toBe(2);
  });

  it("an Only me Moment that fails part-way sends nothing at all", async () => {
    server.failNames.add("b.jpg");

    await expect(
      createPetMoment("pet-1", payload(newMedia([file("a.jpg"), file("b.jpg")]), "Private"))
    ).rejects.toThrow();

    expect(server.requests).toHaveLength(0);
  });
});

describe("releasing a session", () => {
  it("deletes uploads that were never sent in a save, and nothing else", async () => {
    const session = createMomentSaveSession();
    server.failNames.add("b.jpg");
    await expect(
      createPetMoment("pet-1", payload(newMedia([file("a.jpg"), file("b.jpg")])), session)
    ).rejects.toThrow();

    // The draft is discarded: "a" uploaded but was never sent.
    await releaseMomentSaveSession(session);

    expect(server.deleted).toEqual(["media-1"]);
  });

  it("never deletes a file a save request named, even if its answer was lost", async () => {
    const session = createMomentSaveSession();
    server.loseNextCreateAnswer = true;
    await expect(
      createPetMoment("pet-1", payload(newMedia([file("a.jpg")])), session)
    ).rejects.toThrow();

    // The Moment exists on the server with "a" attached; closing must not
    // take its media away.
    await releaseMomentSaveSession(session);

    expect(server.deleted).toEqual([]);
  });
});

describe("editing a Moment", () => {
  const existing: MomentMedia = { id: "media-kept", type: "image", url: "https://media.test/kept.jpg", sortOrder: 0 };

  it("a failed new upload sends no update, so the Moment is unchanged", async () => {
    server.failNames.add("new.jpg");
    const media = [existing, ...newMedia([file("new.jpg")]).map((item) => ({ ...item, sortOrder: 1 }))];

    await expect(updatePetMoment("moment-9", payload(media), "pet-1")).rejects.toBeInstanceOf(
      MomentMediaUploadError
    );

    expect(updates()).toHaveLength(0);
    expect(server.uploads[0].momentId).toBeUndefined();
  });

  it("a retry reuses finished uploads and replaces the list in one update, without a create key", async () => {
    const session = createMomentSaveSession();
    const added = newMedia([file("one.jpg"), file("two.jpg")]).map((item, index) => ({ ...item, sortOrder: index + 1 }));
    server.failNames.add("two.jpg");
    await expect(updatePetMoment("moment-9", payload([existing, ...added]), "pet-1", session)).rejects.toThrow();

    server.failNames.clear();
    await updatePetMoment("moment-9", payload([existing, ...added]), "pet-1", session);

    expect(server.uploads.map((upload) => upload.file)).toEqual(["one.jpg", "two.jpg", "two.jpg"]);
    expect(updates()).toHaveLength(1);
    expect(updates()[0].body.mediaFileIds).toEqual(["media-kept", "media-1", "media-2"]);
    expect(updates()[0].body).not.toHaveProperty("idempotencyKey");
  });
});
