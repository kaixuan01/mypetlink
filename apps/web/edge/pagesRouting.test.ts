import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every Pages Function must actually be reachable.
 *
 * `public/_routes.json` decides which requests Cloudflare hands to a Function
 * at all. A function whose path is not admitted is simply never invoked — no
 * error, no log, just the static asset served instead. That is exactly what
 * happened to the whole `/u/` profile handler once: it shipped, it was tested,
 * and it could not run.
 *
 * This walks the functions on disk and asks, for each one, whether a request to
 * it would be admitted — rather than restating a list that can drift.
 */

const webRoot = join(__dirname, "..");

/** A concrete request path each Pages Function would have to serve. */
function functionRequestPaths(): string[] {
  const root = join(webRoot, "functions");
  const paths: string[] = [];

  const walk = (directory: string, segments: string[]) => {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry);

      if (statSync(full).isDirectory()) {
        walk(full, [...segments, entry]);
        continue;
      }

      if (!entry.endsWith(".ts") || entry.endsWith(".d.ts")) {
        continue;
      }

      const leaf = entry.replace(/\.ts$/, "");
      const parts = [...segments, leaf].map((segment) =>
        // A [param] segment stands for any single path segment.
        segment.startsWith("[") ? "sample" : segment
      );

      paths.push(`/${parts.join("/")}`);
    }
  };

  walk(root, []);
  return paths.sort();
}

function admits(pattern: string, path: string) {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");

  return new RegExp(`^${escaped}$`).test(path);
}

function routes() {
  return JSON.parse(
    readFileSync(join(webRoot, "public", "_routes.json"), "utf8")
  ) as { include: string[]; exclude: string[] };
}

describe("Cloudflare Pages routing", () => {
  it("admits a request to every Pages Function that exists on disk", () => {
    const { include } = routes();

    for (const path of functionRequestPaths()) {
      expect(
        include.some((pattern) => admits(pattern, path)),
        `A request to ${path} has a Pages Function but no matching entry in ` +
          `_routes.json include (${include.join(", ")}); the function would ` +
          "never run."
      ).toBe(true);
    }
  });

  it("still routes every finder entry point", () => {
    // Safety first: these are the paths a physical tag prints. They must stay
    // admitted whatever else changes.
    for (const path of ["/q/code", "/n/code", "/t/code", "/p/slug"]) {
      expect(routes().include.some((pattern) => admits(pattern, path))).toBe(true);
    }
  });

  it("excludes nothing, which would silently unroute a function", () => {
    expect(routes().exclude).toEqual([]);
  });
});
