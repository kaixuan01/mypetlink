import { describe, expect, it, vi } from "vitest";
import {
  buildUnavailableProfileHead,
  buildPublicProfileHead,
  fetchPublicSocialProfile,
  handlePublicProfileRequest,
  handleSocialCardRequest,
  isValidPublicProfileSlug,
  type EdgePublicProfile,
} from "./publicProfileEdge";

const newPet: EdgePublicProfile = {
  publicCode: "futurepet1234",
  publicSlug: "nori-futurepet1234",
  publicProfileVersion: "0123456789abcdef",
  name: "Nori",
  species: "Cat",
  customSpecies: null,
  breed: "Domestic Shorthair",
  ageDisplayLabel: "2 years old",
  lifecycleStatus: "Active",
  lostModeEnabled: false,
  profilePhotoUrl: "https://media.mypetlink.com.my/pets/nori/profile.jpg",
  coverPhotoUrl: "https://media.mypetlink.com.my/pets/nori/cover.jpg",
  coverPositionX: 50,
  coverPositionY: 40,
};

describe("Cloudflare public-profile edge metadata", () => {
  it("builds complete pet-specific metadata for a post-build pet", () => {
    const head = buildPublicProfileHead(newPet);

    expect(head).toContain("<title>Meet Nori | MyPetLink</title>");
    expect(head).toContain(
      "View Nori&#39;s owner-approved pet profile, memories and safety information on MyPetLink."
    );
    expect(head).toContain(
      'rel="canonical" href="https://mypetlink.com.my/p/nori-futurepet1234"'
    );
    expect(head).toContain(
      'property="og:image" content="https://mypetlink.com.my/social/pets/nori-futurepet1234.jpg?v=0123456789abcdef"'
    );
    expect(head).toContain('property="og:image:type" content="image/jpeg"');
    expect(head).toContain('property="og:image:width" content="1200"');
    expect(head).toContain('property="og:image:height" content="630"');
    expect(head).toContain('name="twitter:card" content="summary_large_image"');
    expect(head.match(/property="og:title"/g)).toHaveLength(1);
    expect(head).not.toContain("og-image.png");
  });

  it("escapes malicious pet names before inserting HTML metadata", () => {
    const head = buildPublicProfileHead({
      ...newPet,
      name: '\"><script>alert("x")</script>&Mochi',
    });

    expect(head).not.toContain("<script>");
    expect(head).not.toContain('\"><script');
    expect(head).toContain("&lt;script&gt;");
    expect(head).toContain("&quot;");
  });

  it("rejects traversal, encoded separators, and malformed slugs", () => {
    expect(isValidPublicProfileSlug("nori-futurepet1234")).toBe(true);
    expect(isValidPublicProfileSlug("../private-pet")).toBe(false);
    expect(isValidPublicProfileSlug("nori%2fprivate-code")).toBe(false);
    expect(isValidPublicProfileSlug("nori\\private-code")).toBe(false);
    expect(isValidPublicProfileSlug("nori--code")).toBe(false);
  });

  it("reads a new profile from the restricted API without static discovery", async () => {
    const fetcher = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit) => {
        void input;
        void init;
        return jsonResponse({ data: newPet });
      }
    );

    const result = await fetchPublicSocialProfile(
      { PUBLIC_API_BASE_URL: "https://api.mypetlink.test" },
      newPet.publicSlug,
      fetcher as typeof fetch
    );

    expect(result).toEqual({ kind: "ok", profile: newPet });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain(
      "/api/v1/public/pets/nori-futurepet1234/social"
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("keeps the application HTML operational with generic metadata on API failure", async () => {
    class PassthroughHtmlRewriter {
      on() {
        return this;
      }

      transform(response: Response) {
        return response;
      }
    }
    vi.stubGlobal("HTMLRewriter", PassthroughHtmlRewriter);
    const context = createContext(
      newPet.publicSlug,
      vi.fn(async () => new Response("upstream unavailable", { status: 503 }))
    );

    const response = await handlePublicProfileRequest(context);
    const genericHead = buildUnavailableProfileHead("error");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mypetlink-metadata")).toBe(
      "generic-api-fallback"
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(context.next).toHaveBeenCalledTimes(1);
    expect(genericHead).toContain("Pet Profile Temporarily Unavailable");
    expect(genericHead).toContain("noindex,follow");
    expect(genericHead).not.toContain(newPet.publicSlug);
    vi.unstubAllGlobals();
  });
});

describe("Cloudflare social-card proxy", () => {
  it("caches and reuses the JPEG for the same public profile version", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/social")) return jsonResponse({ data: newPet });
      return new Response(jpeg, {
        headers: { "Content-Type": "image/jpeg" },
        status: 200,
      });
    });
    const cache = createMemoryCache();

    const firstContext = createContext(`${newPet.publicSlug}.jpg`, fetcher);
    const first = await handleSocialCardRequest(firstContext, {
      cache: cache.value,
      fetch: fetcher as typeof fetch,
    });
    await Promise.all(firstContext.waitUntilPromises);

    const secondContext = createContext(`${newPet.publicSlug}.jpg`, fetcher);
    const second = await handleSocialCardRequest(secondContext, {
      cache: cache.value,
      fetch: fetcher as typeof fetch,
    });

    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("image/jpeg");
    expect(first.headers.get("x-social-card-cache")).toBe("MISS");
    expect(second.headers.get("x-social-card-cache")).toBe("HIT");
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes("social-card.jpg"))).toHaveLength(1);
  });

  it("revalidates profile visibility before consulting an old image cache", async () => {
    const fetcher = vi.fn(async () => new Response("not found", { status: 404 }));
    const cache = createMemoryCache();
    await cache.value.put(
      new Request(
        `https://mypetlink.com.my/social/pets/${newPet.publicSlug}.jpg?v=${newPet.publicProfileVersion}`
      ),
      new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
        headers: { "Content-Type": "image/jpeg" },
      })
    );
    const context = createContext(`${newPet.publicSlug}.jpg`, fetcher);

    const response = await handleSocialCardRequest(context, {
      cache: cache.value,
      fetch: fetcher as typeof fetch,
    });

    expect(response.status).toBe(404);
    expect(cache.matchCalls()).toBe(0);
  });

  it("rejects origin redirects instead of following them", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      if (String(input).endsWith("/social")) {
        return jsonResponse({ data: newPet });
      }

      return new Response(null, {
        headers: { Location: "https://attacker.example/private.jpg" },
        status: 302,
      });
    });
    const context = createContext(`${newPet.publicSlug}.jpg`, fetcher);

    const response = await handleSocialCardRequest(context, {
      cache: createMemoryCache().value,
      fetch: fetcher as typeof fetch,
    });

    expect(response.status).toBe(503);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ redirect: "manual" });
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

function createContext(slug: string, fetcher: ReturnType<typeof vi.fn>) {
  const waitUntilPromises: Promise<unknown>[] = [];
  return {
    request: new Request(`https://mypetlink.com.my/p/${slug}`),
    env: { PUBLIC_API_BASE_URL: "https://api.mypetlink.test" },
    params: { slug },
    data: {},
    functionPath: "/p/[slug]",
    next: vi.fn(async () => new Response("<html><head></head><body></body></html>", {
      headers: { "Content-Type": "text/html" },
      status: 404,
    })),
    passThroughOnException: vi.fn(),
    waitUntil(promise: Promise<unknown>) {
      waitUntilPromises.push(promise);
    },
    waitUntilPromises,
    fetcher,
  };
}

function createMemoryCache() {
  const values = new Map<string, Response>();
  let matches = 0;
  const value = {
    async match(request: Request) {
      matches += 1;
      return values.get(request.url)?.clone();
    },
    async put(request: Request, response: Response) {
      values.set(request.url, response.clone());
    },
    async delete(request: Request) {
      return values.delete(request.url);
    },
  } as Cache;

  return { value, matchCalls: () => matches };
}
