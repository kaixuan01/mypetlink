import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleMomentRequest } from "./momentEdge";
import { handleOwnerConnectionsRequest } from "./ownerConnectionsEdge";
import { handleOwnerProfileRequest } from "./ownerProfileEdge";
import {
  handleFinderPreviewRequest,
  handlePublicProfileRequest,
  handleSocialCardRequest,
  type EdgePublicProfile,
  type FinderRouteKind,
} from "./publicProfileEdge";
import { withRobotsHeader } from "./robotsHeader";
import { indexableSamplePublicCode } from "../src/data/publicSample";

/**
 * Every response a Pages Function produces states its own indexing policy.
 *
 * Cloudflare does not apply `public/_headers` to Function responses, so these
 * routes cannot borrow the static rules. The header is checked on every path a
 * handler can take — the normal page, HEAD, unavailable, origin failure, and a
 * passed-through asset that is not HTML — because a path without it is a page
 * whose only protection is whatever meta tag the static shell carried.
 */

const env: MyPetLinkPagesEnv = { PUBLIC_API_BASE_URL: "https://api.test" };
const shell = "<!doctype html><html><head><title>Loading | MyPetLink</title></head><body></body></html>";

class TestHtmlRewriter {
  private injected = "";
  on(selector: string, handlers: { element?: (element: unknown) => void }) {
    if (selector === "head" && handlers.element) {
      handlers.element({
        prepend: (html: string) => {
          this.injected = html;
        },
      });
    }
    return this;
  }
  transform(response: Response) {
    return new Response(`<html><head>${this.injected}</head><body></body></html>`, {
      headers: response.headers,
      status: 200,
    });
  }
}

beforeEach(() => {
  vi.stubGlobal("HTMLRewriter", TestHtmlRewriter);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function htmlShell(status = 200) {
  return new Response(shell, { headers: { "Content-Type": "text/html" }, status });
}

function context(
  path: string,
  params: Record<string, string>,
  options: { method?: string; next?: () => Promise<Response> } = {}
) {
  const waitUntilPromises: Promise<unknown>[] = [];
  return {
    request: new Request(`https://mypetlink.com.my${path}`, { method: options.method ?? "GET" }),
    env,
    params,
    data: {},
    functionPath: path,
    next: vi.fn(options.next ?? (async () => htmlShell(404))),
    passThroughOnException: vi.fn(),
    waitUntil(promise: Promise<unknown>) {
      waitUntilPromises.push(promise);
    },
    waitUntilPromises,
  };
}

describe("withRobotsHeader", () => {
  it("adds the header without touching status, body or other headers", async () => {
    const original = new Response("body", {
      headers: { "Content-Type": "image/png", ETag: '"x"' },
      status: 404,
      statusText: "Not Found",
    });

    const response = withRobotsHeader(original, "noindex, follow");

    expect(response.status).toBe(404);
    expect(response.statusText).toBe("Not Found");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("etag")).toBe('"x"');
    expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
    expect(await response.text()).toBe("body");
  });

  it("works on a response whose headers are immutable", async () => {
    const immutable = Response.redirect("https://mypetlink.com.my/", 302);

    expect(withRobotsHeader(immutable, "noindex").headers.get("x-robots-tag")).toBe("noindex");
  });
});

describe("finder Safety Profile and Smart Tag routes", () => {
  const routes: Array<[string, FinderRouteKind]> = [
    ["/q/abcd1234efgh", "safety"], // Safety Profile or printed QR tag
    ["/n/abcd1234efgh", "tag"], // NFC tap
    ["/t/abcd1234efgh", "tag"], // legacy printed tag
  ];

  it.each(routes)("%s is noindex when the pet resolves", async (path, kind) => {
    const fetcher = vi.fn(async () =>
      envelope({ state: "active", name: "Nori", publicSlug: null, publicProfileVersion: null })
    );
    const ctx = context(path, { slug: "abcd1234efgh" });

    const response = await handleFinderPreviewRequest(ctx as never, kind, { fetch: fetcher as never });
    const html = await response.text();

    expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
    expect(html).toContain('name="robots" content="noindex,follow"');
    // The link preview still works: the edge rewrote the head for this pet.
    expect(html).toContain("Found Nori? | MyPetLink");
  });

  it.each(routes)("%s is noindex for an unknown or not-yet-activated code", async (path, kind) => {
    const fetcher = vi.fn(async () => envelope(null, 404));
    const ctx = context(path, { slug: "abcd1234efgh" });

    const response = await handleFinderPreviewRequest(ctx as never, kind, { fetch: fetcher as never });

    expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
    expect(response.headers.get("x-mypetlink-metadata")).toBe("generic-finder");
  });

  it.each(routes)("%s stays noindex when the platform answers with something that is not HTML", async (path, kind) => {
    const fetcher = vi.fn();
    const ctx = context(path, { slug: "abcd1234efgh" }, {
      next: async () =>
        new Response("not html", { headers: { "Content-Type": "text/plain" }, status: 404 }),
    });

    const response = await handleFinderPreviewRequest(ctx as never, kind, { fetch: fetcher as never });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("not html");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
  });
});

describe("Public Share Profile", () => {
  const ownerPet: EdgePublicProfile = {
    publicCode: "futurepet1234",
    publicSlug: "nori-futurepet1234",
    publicProfileVersion: "0123456789abcdef",
    name: "Nori",
    species: "Cat",
    customSpecies: null,
    breed: null,
    ageDisplayLabel: "2 years old",
    lifecycleStatus: "Active",
    lostModeEnabled: false,
    profilePhotoUrl: null,
    coverPhotoUrl: null,
    coverPositionX: 50,
    coverPositionY: 50,
  };
  const samplePet: EdgePublicProfile = {
    ...ownerPet,
    publicCode: indexableSamplePublicCode,
    publicSlug: `topu-${indexableSamplePublicCode}`,
    name: "Topu",
  };

  async function run(
    pet: EdgePublicProfile | null,
    options: { method?: string; apiStatus?: number } = {}
  ) {
    const slug = pet?.publicSlug ?? "nori-futurepet1234";
    const fetcher = vi.fn(async () =>
      options.apiStatus ? new Response("", { status: options.apiStatus }) : envelope(pet)
    );
    const ctx = context(`/p/${slug}`, { slug }, { method: options.method, next: async () => htmlShell(200) });
    const response = await handlePublicProfileRequest(ctx as never, { fetch: fetcher as never });
    return { response, html: options.method === "HEAD" ? "" : await response.text() };
  }

  it("keeps an owner's Share Profile out of search, by header and by meta tag", async () => {
    const { response, html } = await run(ownerPet);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
    expect(html).toContain('name="robots" content="noindex,follow"');
    // Social previews are unchanged.
    expect(html).toContain('property="og:title" content="Meet Nori | MyPetLink"');
    expect(html).toContain("/social/pets/nori-futurepet1234.jpg?v=0123456789abcdef");
  });

  it("answers HEAD with the same policy", async () => {
    const { response } = await run(ownerPet, { method: "HEAD" });

    expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
  });

  it("leaves the approved sample indexable and sends it no noindex header", async () => {
    const { response, html } = await run(samplePet);

    expect(response.headers.get("x-robots-tag")).toBeNull();
    expect(html).toContain('name="robots" content="index,follow"');
  });

  it("keeps a missing or private profile out of search", async () => {
    const { response } = await run(ownerPet, { apiStatus: 404 });

    expect(response.status).toBe(404);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
  });

  it("keeps the operational fallback out of search when the API is down", async () => {
    const { response } = await run(ownerPet, { apiStatus: 503 });

    expect(response.headers.get("x-mypetlink-metadata")).toBe("generic-api-fallback");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
  });

  it("keeps a malformed slug out of search", async () => {
    const ctx = context("/p/bad", { slug: "bad" });

    const response = await handlePublicProfileRequest(ctx as never, { fetch: vi.fn() as never });

    expect(response.status).toBe(404);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
  });
});

describe("link-preview images", () => {
  const pet = {
    publicCode: "futurepet1234",
    publicSlug: "nori-futurepet1234",
    publicProfileVersion: "0123456789abcdef",
    name: "Nori",
    species: "Cat",
    ageDisplayLabel: "2 years old",
    lifecycleStatus: "Active",
    lostModeEnabled: false,
    coverPositionX: 50,
    coverPositionY: 50,
  };

  function memoryCache() {
    const values = new Map<string, Response>();
    return {
      async match(request: Request) {
        return values.get(request.url)?.clone();
      },
      async put(request: Request, response: Response) {
        values.set(request.url, response.clone());
      },
      async delete(request: Request) {
        return values.delete(request.url);
      },
    } as Cache;
  }

  it("serves the card, fresh and cached, but never into image search", async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) =>
      String(input).endsWith("/social")
        ? envelope(pet)
        : new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
            headers: { "Content-Type": "image/jpeg" },
            status: 200,
          })
    );
    const cache = memoryCache();

    const firstContext = context("/social/pets/nori-futurepet1234.jpg", { slug: "nori-futurepet1234.jpg" });
    const first = await handleSocialCardRequest(firstContext as never, { cache, fetch: fetcher as never });
    await Promise.all(firstContext.waitUntilPromises);
    const second = await handleSocialCardRequest(
      context("/social/pets/nori-futurepet1234.jpg", { slug: "nori-futurepet1234.jpg" }) as never,
      { cache, fetch: fetcher as never }
    );

    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("image/jpeg");
    expect(first.headers.get("x-robots-tag")).toBe("noindex");
    expect(second.headers.get("x-social-card-cache")).toBe("HIT");
    expect(second.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("is noindex when the card does not exist or cannot be drawn", async () => {
    const missing = await handleSocialCardRequest(
      context("/social/pets/nori-futurepet1234.jpg", { slug: "nori-futurepet1234.jpg" }) as never,
      { cache: memoryCache(), fetch: vi.fn(async () => envelope(null, 404)) as never }
    );
    const failing = await handleSocialCardRequest(
      context("/social/pets/nori-futurepet1234.jpg", { slug: "nori-futurepet1234.jpg" }) as never,
      { cache: memoryCache(), fetch: vi.fn(async () => new Response("", { status: 500 })) as never }
    );

    expect(missing.status).toBe(404);
    expect(missing.headers.get("x-robots-tag")).toBe("noindex");
    expect(failing.status).toBe(503);
    expect(failing.headers.get("x-robots-tag")).toBe("noindex");
  });
});

describe("Community Profiles, Moments and connection lists", () => {
  const ownerFetcher = () =>
    vi.fn(async (input: URL | RequestInfo) =>
      String(input).endsWith("/resolve")
        ? envelope({ handle: "tanfamily", state: "current", currentHandle: "tanfamily" })
        : envelope({
            handle: "tanfamily",
            displayName: "The Tan Family",
            bio: "Two cats.",
            avatarUrl: null,
            pets: [{ name: "Mochi" }],
          })
    );

  it("keeps a Community Profile out of search on every path", async () => {
    const page = await handleOwnerProfileRequest(
      context("/u/tanfamily", { handle: "tanfamily" }, { next: async () => htmlShell(200) }) as never,
      { fetch: ownerFetcher() as never }
    );
    const head = await handleOwnerProfileRequest(
      context("/u/tanfamily", { handle: "tanfamily" }, { method: "HEAD" }) as never,
      { fetch: ownerFetcher() as never }
    );
    const missing = await handleOwnerProfileRequest(
      context("/u/nobody", { handle: "nobody" }) as never,
      { fetch: vi.fn(async () => new Response(null, { status: 404 })) as never }
    );

    expect(page.status).toBe(200);
    expect(await page.text()).toContain('property="og:title"');
    for (const response of [page, head, missing]) {
      expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
    }
  });

  it("keeps a Moment out of search on every path", async () => {
    const momentId = "9c1f8a2e-1111-4a2b-8c3d-4e5f60718293";
    const momentFetcher = vi.fn(async () =>
      envelope({
        id: momentId,
        title: "Beach day",
        caption: "A bright afternoon.",
        author: { handle: "tanfamily", displayName: "The Tan Family" },
        subjects: [{ name: "Mochi" }],
        media: [],
      })
    );

    const page = await handleMomentRequest(
      context(`/moments/${momentId}`, { momentId }, { next: async () => htmlShell(200) }) as never,
      { fetch: momentFetcher as never }
    );
    const missing = await handleMomentRequest(
      context(`/moments/${momentId}`, { momentId }) as never,
      { fetch: vi.fn(async () => new Response(null, { status: 404 })) as never }
    );

    expect(page.status).toBe(200);
    expect(await page.text()).toContain('property="og:type" content="article"');
    expect(page.headers.get("x-robots-tag")).toBe("noindex, follow");
    expect(missing.headers.get("x-robots-tag")).toBe("noindex, follow");
  });

  it("keeps followers and following lists, and their links, out of search", async () => {
    for (const relation of ["followers", "following"] as const) {
      const page = await handleOwnerConnectionsRequest(
        context(`/u/tanfamily/${relation}`, { handle: "tanfamily" }, { next: async () => htmlShell(200) }) as never,
        relation,
        { fetch: ownerFetcher() as never }
      );
      const head = await handleOwnerConnectionsRequest(
        context(`/u/tanfamily/${relation}`, { handle: "tanfamily" }, { method: "HEAD" }) as never,
        relation,
        { fetch: ownerFetcher() as never }
      );

      expect(page.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(head.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
  });
});
