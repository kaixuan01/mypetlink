import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCanonicalPathRedirect,
  buildFinderPreviewHead,
  buildGenericFinderHead,
  fetchFinderPreview,
  handleFinderPreviewRequest,
  handlePublicProfileRequest,
  isValidFinderCode,
  type EdgeFinderPreview,
  type FinderRouteKind,
} from "./publicProfileEdge";

const activePreview: EdgeFinderPreview = {
  state: "active",
  name: "Nori",
  publicSlug: "nori-futurepet1234",
  publicProfileVersion: "0123456789abcdef",
};

const shellHtml = "<html><head><title>Loading | MyPetLink</title></head><body></body></html>";

/**
 * Stand-in for the Cloudflare HTMLRewriter: drops the shell's own head tags and
 * applies the injected metadata, so tests can assert on the head a crawler would
 * actually receive.
 */
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

function envelope(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

function notFound() {
  return new Response(JSON.stringify({ error: { code: "not_found" } }), {
    headers: { "Content-Type": "application/json" },
    status: 404,
  });
}

function createContext(path: string, slug: string, fetcher: ReturnType<typeof vi.fn>) {
  return {
    request: new Request(`https://mypetlink.com.my${path}`),
    env: { PUBLIC_API_BASE_URL: "https://api.mypetlink.test" },
    params: { slug },
    data: {},
    functionPath: "/q/[slug]",
    next: vi.fn(async () =>
      new Response(shellHtml, {
        headers: { "Content-Type": "text/html" },
        status: 404,
      })
    ),
    passThroughOnException: vi.fn(),
    waitUntil: vi.fn(),
    fetcher,
  };
}

async function runFinder(
  path: string,
  slug: string,
  kind: FinderRouteKind,
  fetcher: ReturnType<typeof vi.fn>
) {
  const context = createContext(path, slug, fetcher);
  const response = await handleFinderPreviewRequest(
    context as never,
    kind,
    { fetch: fetcher as never }
  );
  return { response, html: await response.text(), context };
}

describe("canonical path redirect (MPL-GROWTH-PROD-002)", () => {
  it("permanently redirects a trailing-slash profile URL to its canonical form", async () => {
    const fetcher = vi.fn();
    const context = createContext("/p/nori-futurepet1234/", "nori-futurepet1234", fetcher);
    const response = await handlePublicProfileRequest(context as never, {
      fetch: fetcher as never,
    });

    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("/p/nori-futurepet1234");
    // The redirect happens before any origin work.
    expect(fetcher).not.toHaveBeenCalled();
    expect(context.next).not.toHaveBeenCalled();
  });

  it("preserves the share version through the redirect", async () => {
    const fetcher = vi.fn();
    const context = createContext(
      "/p/nori-futurepet1234/?share=0123456789abcdef",
      "nori-futurepet1234",
      fetcher
    );
    const response = await handlePublicProfileRequest(context as never, {
      fetch: fetcher as never,
    });

    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      "/p/nori-futurepet1234?share=0123456789abcdef"
    );
  });

  it("collapses repeated trailing slashes to one canonical URL", () => {
    const response = buildCanonicalPathRedirect(
      new Request("https://mypetlink.com.my/p/nori-futurepet1234///")
    );

    expect(response?.status).toBe(308);
    expect(response?.headers.get("Location")).toBe("/p/nori-futurepet1234");
  });

  it("leaves an already-canonical URL alone, so there is no redirect loop", () => {
    expect(
      buildCanonicalPathRedirect(
        new Request("https://mypetlink.com.my/p/nori-futurepet1234")
      )
    ).toBeNull();
    expect(
      buildCanonicalPathRedirect(
        new Request("https://mypetlink.com.my/p/nori-futurepet1234?share=abc")
      )
    ).toBeNull();
  });

  it("never redirects the site root to an empty path", () => {
    expect(
      buildCanonicalPathRedirect(new Request("https://mypetlink.com.my/"))
    ).toBeNull();
  });

  it("redirects a trailing-slash finder URL too", async () => {
    const fetcher = vi.fn();
    const { response } = await runFinder("/q/abcd1234efgh/", "abcd1234efgh", "safety", fetcher);

    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("/q/abcd1234efgh");
  });
});

describe("finder preview metadata (MPL-GROWTH-PROD-003)", () => {
  it("replaces the generic shell title for a resolvable safety code", async () => {
    const fetcher = vi.fn(async () => envelope(activePreview));
    const { response, html } = await runFinder(
      "/q/abcd1234efgh",
      "abcd1234efgh",
      "safety",
      fetcher
    );

    expect(response.headers.get("X-MyPetLink-Metadata")).toBe("dynamic-finder-profile");
    expect(html).not.toContain("Loading | MyPetLink");
    expect(html).toContain("<title>Found Nori? | MyPetLink</title>");
    expect(html).toContain(
      'href="https://mypetlink.com.my/q/abcd1234efgh"'
    );
    expect(html).toContain(
      "https://mypetlink.com.my/social/pets/nori-futurepet1234.jpg?v=0123456789abcdef"
    );
  });

  it("uses urgent wording while the pet is in Lost Mode", () => {
    const head = buildFinderPreviewHead(
      { ...activePreview, state: "lostMode" },
      "/q/abcd1234efgh"
    );

    expect(head).toContain("<title>Help Nori get home | MyPetLink</title>");
    expect(head).toContain("Nori is missing.");
  });

  it("uses respectful wording for a memorial pet", () => {
    const head = buildFinderPreviewHead(
      { ...activePreview, state: "memorial", publicSlug: null, publicProfileVersion: null },
      "/q/abcd1234efgh"
    );

    expect(head).toContain("<title>In memory of Nori | MyPetLink</title>");
    expect(head).toContain("https://mypetlink.com.my/og-image.png");
  });

  it("falls back to generic branding when the Public Share Profile is off", () => {
    const head = buildFinderPreviewHead(
      { ...activePreview, publicSlug: null, publicProfileVersion: null },
      "/q/abcd1234efgh"
    );

    expect(head).toContain("<title>Found Nori? | MyPetLink</title>");
    expect(head).toContain("https://mypetlink.com.my/og-image.png");
    expect(head).not.toContain("/social/pets/");
  });

  it("serves useful generic metadata rather than the shell for an unresolvable code", async () => {
    const fetcher = vi.fn(async () => notFound());
    const { response, html } = await runFinder(
      "/t/mpl-9f3k-h7q2",
      "mpl-9f3k-h7q2",
      "tag",
      fetcher
    );

    expect(response.headers.get("X-MyPetLink-Metadata")).toBe("generic-finder");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(html).not.toContain("Loading | MyPetLink");
    expect(html).toContain("<title>Pet Tag | MyPetLink</title>");
  });

  it("tries the safety code first and then the tag code for a /q link", async () => {
    const requested: string[] = [];
    const fetcher = vi.fn(async (input: URL) => {
      requested.push(input.pathname);
      return input.pathname.includes("/safety/") ? notFound() : envelope(activePreview);
    });

    const { html } = await runFinder("/q/mpl-9f3k-h7q2", "mpl-9f3k-h7q2", "safety", fetcher);

    expect(requested).toEqual([
      "/api/v1/public/safety/mpl-9f3k-h7q2/social",
      "/api/v1/public/tags/mpl-9f3k-h7q2/social",
    ]);
    expect(html).toContain("<title>Found Nori? | MyPetLink</title>");
  });

  it("only asks the tag endpoint for /t and /n links", async () => {
    for (const path of ["/t/mpl-9f3k-h7q2", "/n/mpl-9f3k-h7q2"]) {
      const requested: string[] = [];
      const fetcher = vi.fn(async (input: URL) => {
        requested.push(input.pathname);
        return envelope(activePreview);
      });

      await runFinder(path, "mpl-9f3k-h7q2", "tag", fetcher);
      expect(requested).toEqual(["/api/v1/public/tags/mpl-9f3k-h7q2/social"]);
    }
  });

  it("never asks the origin about a malformed code", async () => {
    const fetcher = vi.fn(async () => envelope(activePreview));
    const { response, html } = await runFinder("/q/..%2Fsecret", "../secret", "safety", fetcher);

    expect(fetcher).not.toHaveBeenCalled();
    expect(response.headers.get("X-MyPetLink-Metadata")).toBe("generic-finder");
    expect(html).toContain("<title>Pet Safety Profile | MyPetLink</title>");
  });

  it("rejects a projection that does not match the expected shape", async () => {
    const fetcher = vi.fn(async () => envelope({ state: "active" }));

    expect(
      await fetchFinderPreview(
        { PUBLIC_API_BASE_URL: "https://api.mypetlink.test" },
        "safety",
        "abcd1234efgh",
        fetcher as never
      )
    ).toBeNull();
  });

  it("accepts only well-formed finder codes", () => {
    expect(isValidFinderCode("abcd1234efgh")).toBe(true);
    expect(isValidFinderCode("MPL-9F3K-H7Q2")).toBe(true);
    expect(isValidFinderCode("abc")).toBe(false);
    expect(isValidFinderCode("../secret")).toBe(false);
    expect(isValidFinderCode("a/b")).toBe(false);
    expect(isValidFinderCode("-leading")).toBe(false);
  });
});

describe("finder preview privacy", () => {
  const forbidden = [
    "+60123456789",
    "owner@example.com",
    "Sarah Tan",
    "Bangsar",
    "safetyCode",
    "tagCode",
  ];

  it("never emits contact, owner, location or code values, whatever the origin returns", async () => {
    // The origin projection is deliberately tiny; even if it were widened by
    // accident, only the fields below may reach a public preview.
    const leaky = {
      ...activePreview,
      contact: { phoneE164: "+60123456789", ownerDisplayName: "Sarah Tan" },
      ownerEmail: "owner@example.com",
      generalArea: "Bangsar",
      safetyCode: "abcd1234efgh",
      tagCode: "MPL-9F3K-H7Q2",
      petId: "6145c961-1051-4dfa-9eea-c07e80820abb",
    };
    const fetcher = vi.fn(async () => envelope(leaky));
    const { html, response } = await runFinder(
      "/q/abcd1234efgh",
      "abcd1234efgh",
      "safety",
      fetcher
    );

    const head = html.slice(0, html.indexOf("</head>"));
    for (const value of forbidden) {
      expect(head).not.toContain(value);
    }
    expect(head).not.toContain("6145c961");
    // Only the pet's own name is public here.
    expect(head).toContain("Nori");
    expect(response.headers.get("X-MyPetLink-Metadata")).toBe("dynamic-finder-profile");

    // The finder code is inherent to the URL the owner chose to share, so it may
    // appear as the canonical address — but nowhere else.
    const codeOccurrences = head.split("abcd1234efgh").length - 1;
    expect(codeOccurrences).toBe(2);
    expect(head).toContain(
      '<link rel="canonical" href="https://mypetlink.com.my/q/abcd1234efgh">'
    );
    expect(head).toContain(
      '<meta property="og:url" content="https://mypetlink.com.my/q/abcd1234efgh">'
    );
  });

  it("keeps every finder preview out of search indexes", () => {
    const heads = [
      buildFinderPreviewHead(activePreview, "/q/abcd1234efgh"),
      buildFinderPreviewHead({ ...activePreview, state: "lostMode" }, "/q/abcd1234efgh"),
      buildGenericFinderHead("safety", "/q/abcd1234efgh"),
      buildGenericFinderHead("tag", "/t/mpl-9f3k-h7q2"),
    ];

    for (const head of heads) {
      expect(head).toContain('<meta name="robots" content="noindex,follow">');
      expect(head).toContain('<meta name="googlebot" content="noindex,follow">');
    }
  });

  it("does not leak the finder code into the social image URL", () => {
    const head = buildFinderPreviewHead(activePreview, "/q/abcd1234efgh");
    const imageMatch = head.match(/property="og:image" content="([^"]*)"/);

    expect(imageMatch).not.toBeNull();
    expect(imageMatch![1]).not.toContain("abcd1234efgh");
  });
});
