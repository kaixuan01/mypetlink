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
};

export default nextConfig;
