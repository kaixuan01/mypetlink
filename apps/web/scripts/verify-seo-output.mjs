import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const canonicalOrigin = "https://mypetlink.com.my";
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(appRoot, "out");
const publicPages = [
  { path: "/", lastModified: "2026-07-18" },
  { path: "/how-it-works", lastModified: "2026-07-18" },
  { path: "/pet-profile", lastModified: "2026-07-18" },
  { path: "/pricing", lastModified: "2026-07-18" },
  { path: "/privacy", lastModified: "2026-07-18" },
  { path: "/sample", lastModified: "2026-07-23" },
  { path: "/smart-pet-tags", lastModified: "2026-07-18" },
  { path: "/terms", lastModified: "2026-07-18" },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function htmlFileFor(route) {
  return route === "/"
    ? path.join(outRoot, "index.html")
    : path.join(outRoot, `${route.slice(1)}.html`);
}

function attribute(tag, name) {
  return new RegExp(`${name}=["']([^"']*)["']`, "i").exec(tag)?.[1] ?? "";
}

function tags(html, name) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
}

function visibleText(html) {
  return html
    .replace(/<(script|style|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:[a-z]+|#\d+|#x[\da-f]+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const titles = new Set();
const descriptions = new Set();

for (const page of publicPages) {
  const html = await readFile(htmlFileFor(page.path), "utf8");
  const canonicalTags = tags(html, "link").filter(
    (tag) => attribute(tag, "rel").toLowerCase() === "canonical"
  );
  const descriptionTags = tags(html, "meta").filter(
    (tag) => attribute(tag, "name").toLowerCase() === "description"
  );
  const robotsTags = tags(html, "meta").filter(
    (tag) => attribute(tag, "name").toLowerCase() === "robots"
  );
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const description = attribute(descriptionTags[0] ?? "", "content");
  const robots = attribute(robotsTags[0] ?? "", "content").toLowerCase();
  const expectedCanonical = new URL(page.path, `${canonicalOrigin}/`).toString();

  assert(canonicalTags.length === 1, `${page.path} must have one canonical`);
  assert(
    new URL(attribute(canonicalTags[0], "href")).toString() === expectedCanonical,
    `${page.path} canonical must self-reference ${expectedCanonical}`
  );
  assert(descriptionTags.length === 1, `${page.path} must have one description`);
  assert(robotsTags.length === 1, `${page.path} must have one robots meta tag`);
  assert(robots.includes("index") && robots.includes("follow"), `${page.path} must be index,follow`);
  assert(!robots.includes("noindex"), `${page.path} must not be noindex`);
  assert(title.length > 20, `${page.path} needs a descriptive title`);
  assert(description.length > 70, `${page.path} needs a descriptive meta description`);
  assert(visibleText(html).length > 500, `${page.path} initial HTML is too thin`);

  titles.add(title);
  descriptions.add(description);
}

assert(titles.size === publicPages.length, "Public page titles must be unique");
assert(
  descriptions.size === publicPages.length,
  "Public page descriptions must be unique"
);

const homepage = await readFile(path.join(outRoot, "index.html"), "utf8");
const homepageHrefs = tags(homepage, "a").map((tag) => attribute(tag, "href"));
for (const page of publicPages.filter((page) => page.path !== "/")) {
  assert(
    homepageHrefs.includes(page.path),
    `Homepage must link to ${page.path} with a crawlable anchor`
  );
}
assert(!homepageHrefs.includes(""), "Homepage must not contain an empty href");
assert(!homepageHrefs.includes("#"), "Homepage must not contain href=\"#\"");
assert(
  !homepageHrefs.some((href) =>
    /^(?:http:\/\/mypetlink|https:\/\/www\.mypetlink|https:\/\/(?:api|media)\.mypetlink)/.test(
      href
    )
  ),
  "Homepage contains a non-canonical or subdomain-root link"
);

const robots = await readFile(path.join(outRoot, "robots.txt"), "utf8");
assert(/User-Agent:\s*\*/i.test(robots), "robots.txt needs a wildcard rule");
assert(/Allow:\s*\/(?:\s|$)/i.test(robots), "robots.txt must allow public crawling");
assert(
  robots.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`),
  "robots.txt must declare the canonical sitemap"
);

const sitemap = await readFile(path.join(outRoot, "sitemap.xml"), "utf8");
const sitemapBlocks = sitemap.match(/<url>[\s\S]*?<\/url>/g) ?? [];
const sitemapUrls = sitemapBlocks.map(
  (block) => /<loc>([^<]+)<\/loc>/.exec(block)?.[1] ?? ""
);
for (const page of publicPages) {
  const canonical = new URL(page.path, `${canonicalOrigin}/`).toString();
  const block = sitemapBlocks.find((candidate) =>
    candidate.includes(`<loc>${canonical}</loc>`)
  );
  assert(block, `Sitemap is missing ${canonical}`);
  assert(
    block.includes(`<lastmod>${page.lastModified}</lastmod>`),
    `Sitemap has an inaccurate lastmod for ${canonical}`
  );
}
assert(
  sitemapUrls.every((url) => url.startsWith(`${canonicalOrigin}/`)),
  "Sitemap must contain only canonical HTTPS non-www URLs"
);
assert(
  !sitemapUrls.some((url) =>
    /\/(?:admin|dashboard|login|pets|orders|settings|q|t|activate)(?:\/|$)/.test(
      new URL(url).pathname
    )
  ),
  "Sitemap must exclude private and direct-access routes"
);

const notFound = await readFile(path.join(outRoot, "404.html"), "utf8");
assert(
  /Page not found|We couldn(?:'|&apos;)t find that page/i.test(notFound),
  "The static export must include the branded 404 artifact"
);

console.log(
  `SEO output verified: ${publicPages.length} public pages, ${sitemapUrls.length} sitemap URLs, crawlable navigation, robots.txt, and 404.html.`
);
