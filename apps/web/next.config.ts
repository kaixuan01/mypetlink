import path from "node:path";
import type { NextConfig } from "next";

// `output: "export"` enforces, even in `next dev`, that any visited dynamic
// segment must appear in `generateStaticParams()`. Because newly-created pets
// only live in the browser's localStorage, their ids can never appear in the
// build-time params list, and dev mode hard-errors instead of falling through
// to the `not-found.tsx` runtime fallback. Limiting the static-export config
// to production builds keeps the same prod deployment shape while letting the
// dev server render `not-found.tsx` for unknown ids — where
// `RuntimeRouteFallback` re-resolves the pet from localStorage.
const isProductionBuild = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  ...(isProductionBuild ? { output: "export" as const } : {}),
  images: {
    unoptimized: true,
  },
  // This app lives in a workspace monorepo with lockfiles at both the repo
  // root and apps/web (the latter kept for Cloudflare Pages, which builds with
  // apps/web as its root directory). Pin the workspace root explicitly so
  // Turbopack does not have to infer it from the lockfiles.
  turbopack: {
    root: path.resolve(__dirname, "..", ".."),
  },
};

export default nextConfig;
