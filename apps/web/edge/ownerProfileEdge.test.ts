import { describe, expect, it, vi } from "vitest";
import {
  buildOwnerProfileHead,
  fetchOwnerProfile,
  isValidOwnerHandle,
  resolveOwnerHandle,
  unavailableOwnerResponse,
  type EdgeOwnerProfile,
} from "./ownerProfileEdge";
import {
  ownerProfileNotFoundTitle,
  ownerProfileTitleMetaName,
  ownerProfileTitleText,
  ownerProfileUnavailableTitle,
} from "../src/lib/ownerProfileDocumentTitle";

const env: MyPetLinkPagesEnv = {
  PUBLIC_API_BASE_URL: "https://api.test",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("isValidOwnerHandle", () => {
  it.each(["mochi", "mochi.coco", "mochi_coco", "tanpets88", "the_tan_family"])(
    "accepts %s",
    (handle) => {
      expect(isValidOwnerHandle(handle)).toBe(true);
    }
  );

  it.each(["ab", "2mochi", ".mochi", "mochi.", "mochi coco", "mochi-coco", ""])(
    "rejects %s",
    (handle) => {
      expect(isValidOwnerHandle(handle)).toBe(false);
    }
  );

  it("rejects a path traversal attempt before it reaches the origin", () => {
    expect(isValidOwnerHandle("../admin")).toBe(false);
    expect(isValidOwnerHandle("a/../b")).toBe(false);
  });
});

describe("resolveOwnerHandle", () => {
  it("reports a live handle as current", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ handle: "TanFamily", state: "current", currentHandle: "TanFamily" })
    );

    const result = await resolveOwnerHandle(env, "tanfamily", fetcher as never);

    expect(result).toEqual({ kind: "current", handle: "TanFamily" });
  });

  it("reports a renamed handle as moved, with the destination", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ handle: "tanfamily", state: "moved", currentHandle: "tanhousehold" })
    );

    const result = await resolveOwnerHandle(env, "tanfamily", fetcher as never);

    expect(result).toEqual({ kind: "moved", currentHandle: "tanhousehold" });
  });

  it("reports an unknown handle as not found", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));

    expect(await resolveOwnerHandle(env, "nobody", fetcher as never)).toEqual({
      kind: "not-found",
    });
  });

  it("treats an origin failure as an error rather than a missing profile", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));

    expect(await resolveOwnerHandle(env, "tanfamily", fetcher as never)).toEqual({
      kind: "error",
    });
  });

  it("never calls the origin for a malformed handle", async () => {
    const fetcher = vi.fn();

    expect(await resolveOwnerHandle(env, "../admin", fetcher as never)).toEqual({
      kind: "error",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does nothing without a configured API base", async () => {
    const fetcher = vi.fn();

    expect(await resolveOwnerHandle({}, "tanfamily", fetcher as never)).toEqual({
      kind: "error",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("fetchOwnerProfile", () => {
  it("parses the public projection", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        handle: "tanfamily",
        displayName: "The Tan Family",
        bio: "Two cats.",
        avatarUrl: "https://media.test/a.jpg",
        generalArea: "Petaling Jaya",
        pets: [{ name: "Mochi" }, { name: "Coco" }],
      })
    );

    const result = await fetchOwnerProfile(env, "tanfamily", fetcher as never);

    expect(result.kind).toBe("ok");
    expect(result.kind === "ok" && result.profile.petNames).toEqual(["Mochi", "Coco"]);
  });

  it("rejects a payload missing the identity fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ bio: "orphan" }));

    expect((await fetchOwnerProfile(env, "tanfamily", fetcher as never)).kind).toBe(
      "error"
    );
  });
});

describe("buildOwnerProfileHead", () => {
  const profile: EdgeOwnerProfile = {
    handle: "tanfamily",
    displayName: "The Tan Family",
    bio: "Two cats, one very patient sofa.",
    avatarUrl: "https://media.test/a.jpg",
    generalArea: "Petaling Jaya",
    petNames: ["Mochi", "Coco"],
  };

  it("titles the preview with the household's social name", () => {
    const head = buildOwnerProfileHead(profile);

    expect(head).toContain("<title>The Tan Family | MyPetLink</title>");
    expect(head).toContain(
      `<meta name="${ownerProfileTitleMetaName}" content="tanfamily" data-title="The Tan Family">`
    );
    expect(head).toContain('property="og:title" content="The Tan Family on MyPetLink"');
    expect(head).toContain('content="Two cats, one very patient sofa."');
  });

  it("uses exactly the browser's title rule for long display names", () => {
    const displayName = `GBB Software Solutions ${"Malaysia ".repeat(10)}`;
    const head = buildOwnerProfileHead({ ...profile, displayName });

    expect(head).toContain(
      `<title>${ownerProfileTitleText(displayName)} | MyPetLink</title>`
    );
    expect(ownerProfileTitleText(displayName).length).toBeLessThanOrEqual(70);
  });

  it("points the canonical URL at the lowercase handle", () => {
    const head = buildOwnerProfileHead({ ...profile, handle: "TanFamily" });

    expect(head).toContain('href="https://mypetlink.com.my/u/tanfamily"');
  });

  it("falls back to the pets when there is no bio", () => {
    const head = buildOwnerProfileHead({ ...profile, bio: null });

    expect(head).toContain("Pets: Mochi, Coco");
  });

  it("escapes markup so a display name cannot inject tags", () => {
    const head = buildOwnerProfileHead({
      ...profile,
      displayName: '<img src=x onerror="alert(1)">',
      bio: null,
    });

    expect(head).not.toContain("<img");
    expect(head).toContain("&lt;img");
  });

  it("omits the image tag when there is no avatar", () => {
    const head = buildOwnerProfileHead({ ...profile, avatarUrl: null });

    expect(head).not.toContain("og:image");
  });
});

describe("unavailableOwnerResponse", () => {
  it("uses one not-found title for every profile the public API withholds", async () => {
    const response = unavailableOwnerResponse("not-found");

    expect(response.status).toBe(404);
    expect(await response.text()).toContain(
      `<title>${ownerProfileNotFoundTitle} | MyPetLink</title>`
    );
  });

  it("does not call an origin failure not found", async () => {
    const response = unavailableOwnerResponse("error");

    expect(response.status).toBe(503);
    expect(await response.text()).toContain(
      `<title>${ownerProfileUnavailableTitle} | MyPetLink</title>`
    );
  });
});
