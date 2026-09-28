// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MomentMedia, PetMomentPayload } from "@/types";

/**
 * Saving a Moment with media, from the service's point of view.
 *
 * The upload function and the API are replaced by a stand-in that behaves like
 * the real server: uploads come back unattached, a create with an idempotency
 * key it has seen returns the Moment that key FIRST made — its original title,
 * visibility and media, not an echo of the retry — and nothing is attached
 * until a create or update names it. Failures are injected per file.
 *
 * Uploads and creates can be held open (`holdUpload`, `holdCreate`) so a test
 * orders "upload pending → editor closes → upload completes → create settles"
 * explicitly, with no timers.
 */

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void };

const server = vi.hoisted(() => ({
  uploads: [] as { file: string; momentId?: string; cleanupOnFailure?: boolean }[],
  failNames: new Set<string>(),
  requests: [] as { method: string; path: string; body: Record<string, unknown> }[],
  momentsByKey: new Map<string, Record<string, unknown>>(),
  /** Media the server has attached to some Moment. */
  attached: new Set<string>(),
  deleted: [] as string[],
  loseNextCreateAnswer: false,
  rejectNextCreate: null as null | { status: number; code: string },
  nextMedia: 0,
  uploadGates: new Map<string, { promise: Promise<void> }>(),
  createGate: null as { promise: Promise<void> } | null,
}));

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** The next upload of this file waits until the test releases it. */
function holdUpload(name: string) {
  const gate = deferred();
  server.uploadGates.set(name, gate);
  return gate;
}

/** The next create is received, then waits before the server answers. */
function holdCreate() {
  const gate = deferred();
  server.createGate = gate;
  return gate;
}

/** Lets every pending continuation run. */
async function settle() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

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
      const gate = server.uploadGates.get(input.file.name);
      if (gate) {
        server.uploadGates.delete(input.file.name);
        await gate.promise;
      }
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
      // What the real DELETE does to an attached file: detaches it.
      server.attached.delete(id);
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
      const mediaIds = (body.mediaFileIds as string[] | undefined) ?? [];
      const record = (id: string) => ({
        id,
        petId: path.split("/")[4] ?? "pet-1",
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
      });

      if (method === "POST") {
        const rejection = server.rejectNextCreate;
        if (rejection) {
          // Read and refused: nothing is written, the key is not used.
          server.rejectNextCreate = null;
          throw new actual.ApiClientError(rejection.status, rejection.code, "Refused.");
        }
        const key = body.idempotencyKey as string | undefined;
        // The server commits first — attaching the media — and only then does
        // the answer travel (or get lost).
        let saved = key ? server.momentsByKey.get(key) : undefined;
        if (!saved) {
          saved = record(`moment-${server.momentsByKey.size + 1}`);
          if (key) server.momentsByKey.set(key, saved);
          for (const id of mediaIds) server.attached.add(id);
        }
        const gate = server.createGate;
        if (gate) {
          server.createGate = null;
          await gate.promise;
        }
        if (server.loseNextCreateAnswer) {
          server.loseNextCreateAnswer = false;
          throw new actual.ApiClientError(0, "network_error", "We could not reach MyPetLink right now.");
        }
        // A replay answers with the ORIGINAL Moment, never the retry.
        return { data: saved, meta: { requestId: "r" } };
      }

      for (const id of mediaIds) server.attached.add(id);
      return { data: record(path.split("/").at(-1) ?? "moment"), meta: { requestId: "r" } };
    },
  };
});

import type { CollaborationInvite } from "@/services/momentCollaborationService";
import {
  claimCollaboratorInvites,
  createMomentSaveSession,
  createPetMoment,
  MomentMediaUploadError,
  MomentSaveCancelledError,
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
  server.attached = new Set();
  server.deleted = [];
  server.loseNextCreateAnswer = false;
  server.rejectNextCreate = null;
  server.nextMedia = 0;
  server.uploadGates = new Map();
  server.createGate = null;
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

describe("a replay answers with the Moment first saved", () => {
  it("public first, retried as Only me: the saved Moment is still public", async () => {
    const session = createMomentSaveSession();
    server.loseNextCreateAnswer = true;
    await expect(
      createPetMoment("pet-1", { ...payload([]), title: "First", visibility: "Public" }, session)
    ).rejects.toThrow();

    const replay = await createPetMoment(
      "pet-1",
      { ...payload([]), title: "Changed", visibility: "Private" },
      session
    );

    expect(replay.data.visibility).toBe("Public");
    expect(replay.data.title).toBe("First");
    expect(server.momentsByKey.size).toBe(1);
  });

  it("private first, retried as Shared publicly: the saved Moment is still private", async () => {
    const session = createMomentSaveSession();
    server.loseNextCreateAnswer = true;
    await expect(createPetMoment("pet-1", payload([], "Private"), session)).rejects.toThrow();

    const replay = await createPetMoment("pet-1", payload([], "Public"), session);

    expect(replay.data.visibility).toBe("Private");
  });

  it("the replay's media is the first save's, not the retry draft's", async () => {
    const session = createMomentSaveSession();
    server.loseNextCreateAnswer = true;
    await expect(
      createPetMoment("pet-1", payload(newMedia([file("a.jpg")])), session)
    ).rejects.toThrow();

    const replay = await createPetMoment("pet-1", payload([]), session);

    expect(replay.data.media.map((media) => media.id)).toEqual(["media-1"]);
  });
});

describe("closing the editor while it saves", () => {
  it("A: closed during the first upload — nothing is created, the upload is cleaned", async () => {
    const session = createMomentSaveSession();
    const gate = holdUpload("a.jpg");
    const save = createPetMoment("pet-1", payload(newMedia([file("a.jpg")])), session);
    await settle();

    const closed = releaseMomentSaveSession(session);
    gate.resolve();

    await expect(save).rejects.toBeInstanceOf(MomentSaveCancelledError);
    await closed;
    expect(creates()).toHaveLength(0);
    expect(server.deleted).toEqual(["media-1"]);
    expect(server.attached.size).toBe(0);
  });

  it("B: closed after file 1 while file 2 uploads — no create, both cleaned, no third upload", async () => {
    const session = createMomentSaveSession();
    const gate = holdUpload("b.jpg");
    const save = createPetMoment(
      "pet-1",
      payload(newMedia([file("a.jpg"), file("b.jpg"), file("c.jpg")])),
      session
    );
    await settle();
    expect(server.uploads.map((upload) => upload.file)).toEqual(["a.jpg", "b.jpg"]);

    const closed = releaseMomentSaveSession(session);
    gate.resolve();

    await expect(save).rejects.toBeInstanceOf(MomentSaveCancelledError);
    await closed;
    expect(server.uploads.map((upload) => upload.file)).toEqual(["a.jpg", "b.jpg"]);
    expect(creates()).toHaveLength(0);
    expect([...server.deleted].sort()).toEqual(["media-1", "media-2"]);
  });

  it("C: closed after every upload but before the create — no Moment, uploads cleaned", async () => {
    const session = createMomentSaveSession();
    const gate = holdUpload("a.jpg");
    const save = createPetMoment("pet-1", payload(newMedia([file("a.jpg")])), session);
    await settle();

    // The last upload finishes and, in the same turn, the editor closes —
    // before the save's next step can send the create.
    gate.resolve();
    const closed = releaseMomentSaveSession(session);

    await expect(save).rejects.toBeInstanceOf(MomentSaveCancelledError);
    await closed;
    expect(creates()).toHaveLength(0);
    expect(server.deleted).toEqual(["media-1"]);
  });

  it("D: closed while the create is in flight and it succeeds — attached media is never deleted", async () => {
    const session = createMomentSaveSession();
    const createGate = holdCreate();
    const save = createPetMoment(
      "pet-1",
      payload(newMedia([file("a.jpg"), file("b.jpg")])),
      session
    );
    await settle();
    expect(creates()).toHaveLength(1);

    const closed = releaseMomentSaveSession(session);
    await settle();
    // Cleanup is waiting for the save; it has deleted nothing yet.
    expect(server.deleted).toEqual([]);

    createGate.resolve();
    const created = await save;
    await closed;

    expect(created.data.media.map((media) => media.id)).toEqual(["media-1", "media-2"]);
    expect(server.deleted).toEqual([]);
    expect([...server.attached].sort()).toEqual(["media-1", "media-2"]);
  });

  it("D: closed while the create is in flight and it fails — offered media is still kept", async () => {
    const session = createMomentSaveSession();
    const createGate = holdCreate();
    server.loseNextCreateAnswer = true;
    const save = createPetMoment("pet-1", payload(newMedia([file("a.jpg")])), session);
    await settle();

    const closed = releaseMomentSaveSession(session);
    createGate.resolve();

    await expect(save).rejects.toThrow();
    await closed;
    // The answer was lost, not the Moment: the server may well have attached
    // it (here it did), so the client must not delete it.
    expect(server.deleted).toEqual([]);
    expect(server.attached.has("media-1")).toBe(true);
  });

  it("E: after a lost answer, closing later deletes nothing that was offered", async () => {
    const session = createMomentSaveSession();
    server.loseNextCreateAnswer = true;
    await expect(
      createPetMoment("pet-1", payload(newMedia([file("a.jpg")])), session)
    ).rejects.toThrow();

    await releaseMomentSaveSession(session);

    expect(server.deleted).toEqual([]);
    expect(server.attached.has("media-1")).toBe(true);
  });

  it("a failed save, then close: unused uploads are cleaned, exactly once", async () => {
    const session = createMomentSaveSession();
    server.failNames.add("b.jpg");
    await expect(
      createPetMoment("pet-1", payload(newMedia([file("a.jpg"), file("b.jpg")])), session)
    ).rejects.toBeInstanceOf(MomentMediaUploadError);

    const first = releaseMomentSaveSession(session);
    const second = releaseMomentSaveSession(session);
    await Promise.all([first, second, releaseMomentSaveSession(session)]);

    expect(second).toBe(first);
    expect(server.deleted).toEqual(["media-1"]);
  });

  it("F/G: no save can start after the session is closed", async () => {
    const session = createMomentSaveSession();
    await releaseMomentSaveSession(session);

    await expect(
      createPetMoment("pet-1", payload(newMedia([file("a.jpg")])), session)
    ).rejects.toBeInstanceOf(MomentSaveCancelledError);
    await expect(
      updatePetMoment("moment-9", payload(newMedia([file("a.jpg")])), "pet-1", session)
    ).rejects.toBeInstanceOf(MomentSaveCancelledError);

    expect(server.uploads).toHaveLength(0);
    expect(server.requests).toHaveLength(0);
  });

  it("an edit closed mid-upload sends no update and cleans its upload", async () => {
    const session = createMomentSaveSession();
    const gate = holdUpload("new.jpg");
    const save = updatePetMoment(
      "moment-9",
      payload(newMedia([file("new.jpg")])),
      "pet-1",
      session
    );
    await settle();

    const closed = releaseMomentSaveSession(session);
    gate.resolve();

    await expect(save).rejects.toBeInstanceOf(MomentSaveCancelledError);
    await closed;
    expect(updates()).toHaveLength(0);
    expect(server.deleted).toEqual(["media-1"]);
  });

  it("two overlapping saves in one session upload each file once", async () => {
    const session = createMomentSaveSession();
    const gate = holdUpload("a.jpg");
    const media = newMedia([file("a.jpg")]);
    const first = createPetMoment("pet-1", payload(media), session);
    const second = createPetMoment("pet-1", payload(media), session);
    await settle();

    gate.resolve();
    const [one, two] = await Promise.all([first, second]);

    expect(server.uploads).toHaveLength(1);
    expect(one.data.id).toBe(two.data.id);
    expect(server.momentsByKey.size).toBe(1);
  });
});

describe("a replay keeps the first attempt's collaborator intent", () => {
  function household(handle: string): CollaborationInvite {
    return {
      household: { handle, displayName: `The ${handle}`, avatarUrl: null, avatarThumbnailUrl: null },
      pets: [],
    };
  }
  const handles = (invites: CollaborationInvite[]) => invites.map((invite) => invite.household.handle);

  /** First request carries `first`; its answer is lost; the retry carries `retry`. */
  async function replay(
    first: CollaborationInvite[],
    retry: CollaborationInvite[],
    visibility: "Public" | "Private" = "Public"
  ) {
    const session = createMomentSaveSession();
    server.loseNextCreateAnswer = true;
    await expect(
      createPetMoment("pet-1", payload([], visibility), session, { collaboratorInvites: first })
    ).rejects.toThrow();
    // The owner changes the still-open draft, then retries the same attempt.
    const replayed = await createPetMoment(
      "pet-1",
      payload([], visibility === "Public" ? "Private" : "Public"),
      session,
      { collaboratorInvites: retry }
    );
    return { session, saved: replayed.data };
  }

  it("A: none, then B added on retry — B is not invited", async () => {
    const { session, saved } = await replay([], [household("bravo")]);

    expect(claimCollaboratorInvites(session, saved)).toEqual([]);
  });

  it("B: B, then removed on retry — B is still invited", async () => {
    const { session, saved } = await replay([household("bravo")], []);

    expect(handles(claimCollaboratorInvites(session, saved))).toEqual(["bravo"]);
  });

  it("C: B, then changed to C on retry — B, never C", async () => {
    const { session, saved } = await replay([household("bravo")], [household("charlie")]);

    expect(handles(claimCollaboratorInvites(session, saved))).toEqual(["bravo"]);
  });

  it("D: the same B, replayed — invited once, never twice", async () => {
    const { session, saved } = await replay([household("bravo")], [household("bravo")]);

    expect(handles(claimCollaboratorInvites(session, saved))).toEqual(["bravo"]);
    // A second answer for the same Moment in this session sends nothing more.
    const again = await createPetMoment("pet-1", payload([]), session, {
      collaboratorInvites: [household("bravo")],
    });
    expect(claimCollaboratorInvites(session, again.data)).toEqual([]);
  });

  it("E: a Moment SAVED private invites nobody, whatever the retry draft says", async () => {
    const { session, saved } = await replay([household("bravo")], [household("bravo")], "Private");

    expect(saved.visibility).toBe("Private");
    expect(claimCollaboratorInvites(session, saved)).toEqual([]);
  });

  it("F: a public Moment replayed from a private retry draft still invites the original households", async () => {
    // Saved Shared publicly; the retry draft says Only me.
    const { session, saved } = await replay([household("bravo")], [], "Public");

    expect(saved.visibility).toBe("Public");
    expect(handles(claimCollaboratorInvites(session, saved))).toEqual(["bravo"]);
  });

  it("a request the server definitely refused frees the draft's intent again", async () => {
    const session = createMomentSaveSession();
    server.rejectNextCreate = { status: 422, code: "validation_failed" };
    await expect(
      createPetMoment("pet-1", payload([]), session, { collaboratorInvites: [household("bravo")] })
    ).rejects.toThrow();

    // Nothing was created, so the next send is the attempt's first real one.
    const created = await createPetMoment("pet-1", payload([]), session, {
      collaboratorInvites: [household("charlie")],
    });

    expect(handles(claimCollaboratorInvites(session, created.data))).toEqual(["charlie"]);
  });

  it("before any request is sent, the draft may change freely", async () => {
    const session = createMomentSaveSession();
    server.failNames.add("a.jpg");
    await expect(
      createPetMoment("pet-1", payload(newMedia([file("a.jpg")])), session, {
        collaboratorInvites: [household("bravo")],
      })
    ).rejects.toThrow();
    expect(session.createIntent).toBeNull();

    server.failNames.clear();
    const created = await createPetMoment("pet-1", payload([]), session, {
      collaboratorInvites: [household("charlie")],
    });

    expect(handles(claimCollaboratorInvites(session, created.data))).toEqual(["charlie"]);
  });
});
