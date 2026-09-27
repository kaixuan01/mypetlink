import { describe, expect, it } from "vitest";
import {
  clearCommentDraft,
  COMMENT_DRAFT_MAX_AGE_MS,
  COMMENT_DRAFT_STORAGE_KEY,
  hasCommentDraft,
  saveCommentDraft,
  takeCommentDraft,
  takeCommentDraftContext,
} from "@/lib/commentDraftRecovery";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const now = new Date("2026-09-24T08:00:00Z");

describe("comment draft recovery", () => {
  it("preserves Reply context and the separate Comment draft, but legacy recovery never promotes it", () => {
    const storage = memoryStorage();
    const draft = { momentId: "m1", userId: "u1", body: "Reply", parentCommentId: "parent", replyToCommentId: "reply", topLevelBody: "Comment" };
    saveCommentDraft(storage, draft, now);
    expect(takeCommentDraftContext(storage, draft, now)).toEqual({ body: "Reply", parentCommentId: "parent", replyToCommentId: "reply", topLevelBody: "Comment" });
    saveCommentDraft(storage, draft, now);
    expect(takeCommentDraft(storage, draft, now)).toBeNull();
  });

  it.each([
    { parentCommentId: 42 }, { parentCommentId: "" }, { parentCommentId: null, replyToCommentId: "reply" },
    { parentCommentId: "parent", replyToCommentId: {} }, { parentCommentId: "parent", topLevelBody: [] },
  ])("discards malformed Reply context %j without recovering as a Comment", (context) => {
    const storage = memoryStorage();
    storage.setItem(COMMENT_DRAFT_STORAGE_KEY, JSON.stringify({ momentId: "m1", userId: "u1", body: "Reply", savedAt: now.toISOString(), ...context }));
    expect(takeCommentDraftContext(storage, { momentId: "m1", userId: "u1" }, now)).toBeNull();
    expect(storage.values.size).toBe(0);
  });

  it("never gives another Moment a Reply's parent or text", () => {
    const storage = memoryStorage();
    saveCommentDraft(storage, { momentId: "m1", userId: "u1", body: "Reply", parentCommentId: "p1" }, now);
    expect(takeCommentDraftContext(storage, { momentId: "m2", userId: "u1" }, now)).toBeNull();
    expect(takeCommentDraftContext(storage, { momentId: "m1", userId: "u1" }, now)?.parentCommentId).toBe("p1");
  });
  it("returns a draft once, to the same account on the same Moment", () => {
    const storage = memoryStorage();
    saveCommentDraft(storage, { momentId: "m1", userId: "u1", body: "Hello Mochi" }, now);

    expect(takeCommentDraft(storage, { momentId: "m1", userId: "u1" }, now)).toBe("Hello Mochi");
    expect(takeCommentDraft(storage, { momentId: "m1", userId: "u1" }, now)).toBeNull();
  });

  it("never gives one Moment's draft to another, and keeps it for its own", () => {
    const storage = memoryStorage();
    saveCommentDraft(storage, { momentId: "m1", userId: "u1", body: "For m1" }, now);

    expect(takeCommentDraft(storage, { momentId: "m2", userId: "u1" }, now)).toBeNull();
    expect(hasCommentDraft(storage, "m2")).toBe(false);
    expect(takeCommentDraft(storage, { momentId: "m1", userId: "u1" }, now)).toBe("For m1");
  });

  it("discards a draft when a different account signs in", () => {
    const storage = memoryStorage();
    saveCommentDraft(storage, { momentId: "m1", userId: "u1", body: "Mine" }, now);

    expect(takeCommentDraft(storage, { momentId: "m1", userId: "u2" }, now)).toBeNull();
    expect(storage.values.has(COMMENT_DRAFT_STORAGE_KEY)).toBe(false);
  });

  it("does not restore without a signed-in account", () => {
    const storage = memoryStorage();
    saveCommentDraft(storage, { momentId: "m1", userId: "u1", body: "Mine" }, now);

    expect(takeCommentDraft(storage, { momentId: "m1", userId: null }, now)).toBeNull();
    expect(hasCommentDraft(storage, "m1")).toBe(true);
  });

  it("expires stale and unreadable drafts", () => {
    const storage = memoryStorage();
    saveCommentDraft(storage, { momentId: "m1", userId: "u1", body: "Old" }, now);
    const later = new Date(now.getTime() + COMMENT_DRAFT_MAX_AGE_MS + 1);
    expect(takeCommentDraft(storage, { momentId: "m1", userId: "u1" }, later)).toBeNull();
    expect(storage.values.size).toBe(0);

    storage.setItem(COMMENT_DRAFT_STORAGE_KEY, "{not json");
    expect(takeCommentDraft(storage, { momentId: "m1", userId: "u1" }, now)).toBeNull();
    expect(storage.values.size).toBe(0);
  });

  it("saves nothing empty, bounds the body, and clears on request", () => {
    const storage = memoryStorage();
    expect(saveCommentDraft(storage, { momentId: "m1", userId: "u1", body: "   " }, now)).toBe(false);
    expect(storage.values.size).toBe(0);

    saveCommentDraft(storage, { momentId: "m1", userId: "u1", body: "x".repeat(700) }, now);
    expect(takeCommentDraft(storage, { momentId: "m1", userId: "u1" }, now)).toHaveLength(500);

    saveCommentDraft(storage, { momentId: "m1", userId: "u1", body: "Bye" }, now);
    clearCommentDraft(storage);
    expect(storage.values.size).toBe(0);
  });

  it("survives storage the browser refuses", () => {
    const refusing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };

    expect(saveCommentDraft(refusing, { momentId: "m1", userId: "u1", body: "Hi" }, now)).toBe(false);
    expect(takeCommentDraft(refusing, { momentId: "m1", userId: "u1" }, now)).toBeNull();
    expect(hasCommentDraft(refusing, "m1")).toBe(false);
    expect(() => clearCommentDraft(refusing)).not.toThrow();
    expect(saveCommentDraft(null, { momentId: "m1", userId: "u1", body: "Hi" }, now)).toBe(false);
  });
});
