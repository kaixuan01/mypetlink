import { describe, expect, it, vi } from "vitest";
import {
  buildOwnerConnectionsHead,
  handleOwnerConnectionsRequest,
} from "./ownerConnectionsEdge";

const env: MyPetLinkPagesEnv = {
  PUBLIC_API_BASE_URL: "https://api.test",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function shellResponse(
  html = "<!doctype html><html><head><title>Followers</title></head><body></body></html>"
) {
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", etag: "W/\"shell\"" },
    status: 200,
  });
}

type ContextOverrides = {
  handle?: string;
  method?: string;
  next?: () => Promise<Response>;
};

function makeContext({
  handle = "tanfamily",
  method = "GET",
  next = async () => shellResponse(),
}: ContextOverrides = {}) {
  return {
    env,
    params: { handle },
    request: new Request(`https://mypetlink.test/u/${handle}/followers`, {
      method,
    }),
    next: vi.fn(next),
  } as unknown as Parameters<typeof handleOwnerConnectionsRequest>[0];
}

describe("buildOwnerConnectionsHead", () => {
  it("keeps both lists out of search results", () => {
    expect(buildOwnerConnectionsHead("followers")).toContain(
      '<meta name="robots" content="noindex, nofollow">'
    );
    expect(buildOwnerConnectionsHead("following")).toContain(
      '<meta name="robots" content="noindex, nofollow">'
    );
  });

  it("names the list without naming the household", () => {
    const head = buildOwnerConnectionsHead("following");

    expect(head).toContain("<title>Following | MyPetLink</title>");
    expect(head).not.toContain("tanfamily");
  });
});

describe("handleOwnerConnectionsRequest", () => {
  it("serves the shell with the list title and no caching", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ handle: "tanfamily", state: "current", currentHandle: "tanfamily" })
    );
    const context = makeContext();

    const response = await handleOwnerConnectionsRequest(context, "followers", {
      fetch: fetcher as never,
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("etag")).toBeNull();
    expect(html).toContain("<title>Followers | MyPetLink</title>");
    expect(html).toContain('content="noindex, nofollow"');
  });

  it("never reaches the origin for a malformed handle", async () => {
    const fetcher = vi.fn();
    const context = makeContext({ handle: "../admin" });

    const response = await handleOwnerConnectionsRequest(context, "followers", {
      fetch: fetcher as never,
    });

    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("answers an unknown household with not found", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));

    const response = await handleOwnerConnectionsRequest(
      makeContext({ handle: "nobody" }),
      "followers",
      { fetch: fetcher as never }
    );

    expect(response.status).toBe(404);
  });

  it("reports an origin failure as unavailable rather than as a missing household", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));

    const response = await handleOwnerConnectionsRequest(
      makeContext(),
      "following",
      { fetch: fetcher as never }
    );

    expect(response.status).toBe(503);
  });

  it("redirects a renamed handle to the same list on the current one", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ handle: "tanfamily", state: "moved", currentHandle: "TanHousehold" })
    );

    const response = await handleOwnerConnectionsRequest(
      makeContext(),
      "following",
      { fetch: fetcher as never }
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/u/tanhousehold/following");
  });

  it("redirects mixed casing so one list has one URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ handle: "tanfamily", state: "current", currentHandle: "tanfamily" })
    );

    const response = await handleOwnerConnectionsRequest(
      makeContext({ handle: "TanFamily" }),
      "followers",
      { fetch: fetcher as never }
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/u/tanfamily/followers");
  });

  it("answers HEAD without asking for the shell", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ handle: "tanfamily", state: "current", currentHandle: "tanfamily" })
    );
    const context = makeContext({ method: "HEAD" });

    const response = await handleOwnerConnectionsRequest(context, "followers", {
      fetch: fetcher as never,
    });

    expect(response.status).toBe(200);
    expect((context as unknown as { next: ReturnType<typeof vi.fn> }).next)
      .not.toHaveBeenCalled();
  });

  it("does not pass a non-HTML asset off as a page", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ handle: "tanfamily", state: "current", currentHandle: "tanfamily" })
    );
    const context = makeContext({
      next: async () =>
        new Response("{}", { headers: { "content-type": "application/json" } }),
    });

    const response = await handleOwnerConnectionsRequest(context, "followers", {
      fetch: fetcher as never,
    });

    expect(response.status).toBe(503);
  });

  it("never sends the household's name or numbers to the edge response", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ handle: "tanfamily", state: "current", currentHandle: "tanfamily" })
    );

    const html = await (
      await handleOwnerConnectionsRequest(makeContext(), "followers", {
        fetch: fetcher as never,
      })
    ).text();

    // The list itself is fetched by the app, where the API decides what this
    // viewer may see. Nothing about the graph is baked into the HTML.
    expect(html).not.toContain("The Tan Family");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
