import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Verifies the exported site the way a search engine first meets it: the
 * static HTML, before any script runs.
 *
 * The list of pages to check is the generated `sitemap.xml` itself — the set of
 * URLs MyPetLink asks search engines to index — not a copy kept in this file.
 * A page added to the sitemap is verified automatically, and a page that is
 * exported but not listed must say noindex. Run after `next build`:
 *
 *   npm run verify:seo            # checks ./out
 *   node scripts/verify-seo-output.mjs <export-dir>
 */

const canonicalOrigin = "https://mypetlink.com.my";
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.resolve(process.argv[2] ?? path.join(appRoot, "out"));
// Characters of visible text a listed page must carry before any script runs.
// Record pages served by Pages Functions (the sample Share Profile) assemble
// their body in the browser; for those a thin shell is reported as a warning,
// not a failure — see docs/seo/seo-audit.md (SEO-M4).
const minimumVisibleText = 500;

const failures = [];
const warnings = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function attribute(tag, name) {
  return new RegExp(`\\s${name}=["']([^"']*)["']`, "i").exec(tag)?.[1] ?? "";
}

function tags(html, name) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
}

function metaContent(html, name) {
  return tags(html, "meta")
    .filter((tag) => attribute(tag, "name").toLowerCase() === name)
    .map((tag) => attribute(tag, "content").toLowerCase());
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function visibleText(html) {
  return html
    .replace(/<(script|style|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:[a-z]+|#\d+|#x[\da-f]+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlFileFor(route) {
  return route === "/"
    ? path.join(outRoot, "index.html")
    : path.join(outRoot, `${decodeURIComponent(route.slice(1))}.html`);
}

function routeForFile(file) {
  const relative = path.relative(outRoot, file).split(path.sep).join("/");
  if (relative === "index.html") return "/";
  return `/${relative.replace(/\.html$/, "")}`;
}

async function htmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "_next") continue;
      files.push(...(await htmlFiles(full)));
    } else if (entry.name.endsWith(".html")) {
      files.push(full);
    }
  }
  return files;
}

/** Cloudflare `_routes.json` / `_headers` matching: `*` is a greedy splat. */
function patternMatches(pattern, route) {
  const expression = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}$`).test(route);
}

const today = new Date().toISOString().slice(0, 10);

// --- robots.txt -----------------------------------------------------------
const robotsTxt = await readFile(path.join(outRoot, "robots.txt"), "utf8");
check(/User-Agent:\s*\*/i.test(robotsTxt), "robots.txt needs a wildcard rule");
check(/Allow:\s*\/(?:\s|$)/i.test(robotsTxt), "robots.txt must allow public crawling");
// A disallowed page is never fetched, so its noindex is never seen; page-level
// noindex is how MyPetLink keeps pages out of search.
check(!/^\s*Disallow:\s*\S/im.test(robotsTxt), "robots.txt must not Disallow any path; use noindex");
check(
  robotsTxt.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`),
  "robots.txt must declare the canonical sitemap"
);

// --- sitemap.xml ----------------------------------------------------------
const sitemap = await readFile(path.join(outRoot, "sitemap.xml"), "utf8");
const sitemapEntries = (sitemap.match(/<url>[\s\S]*?<\/url>/g) ?? []).map((block) => ({
  url: /<loc>([^<]+)<\/loc>/.exec(block)?.[1] ?? "",
  lastModified: /<lastmod>([^<]+)<\/lastmod>/.exec(block)?.[1] ?? "",
}));
check(sitemapEntries.length > 0, "The sitemap lists no URLs");
check(
  new Set(sitemapEntries.map((entry) => entry.url)).size === sitemapEntries.length,
  "The sitemap lists a URL twice"
);
for (const entry of sitemapEntries) {
  check(entry.url.startsWith(`${canonicalOrigin}/`), `Sitemap URL ${entry.url} is not on ${canonicalOrigin}`);
  check(
    /^\d{4}-\d{2}-\d{2}$/.test(entry.lastModified) && entry.lastModified <= today,
    `Sitemap URL ${entry.url} needs a real past lastmod date, got "${entry.lastModified}"`
  );
}

const routesJson = JSON.parse(await readFile(path.join(outRoot, "_routes.json"), "utf8"));
const isEdgeRoute = (route) => routesJson.include.some((pattern) => patternMatches(pattern, route));

// --- every page the sitemap lists -------------------------------------------
const titles = new Map();
const descriptions = new Map();
const sitemapRoutes = new Set();

for (const entry of sitemapEntries) {
  const route = new URL(entry.url).pathname.replace(/(.)\/$/, "$1");
  sitemapRoutes.add(route);
  let html;
  try {
    html = await readFile(htmlFileFor(route), "utf8");
  } catch {
    failures.push(`${route} is in the sitemap but was not exported`);
    continue;
  }

  const canonicalTags = tags(html, "link").filter(
    (tag) => attribute(tag, "rel").toLowerCase() === "canonical"
  );
  const robots = metaContent(html, "robots");
  const description = decodeEntities(metaContent(html, "description")[0] ?? "");
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "");
  const h1Count = tags(html, "h1").length;
  const text = visibleText(html);
  const expectedCanonical = new URL(route, `${canonicalOrigin}/`).toString();

  check(canonicalTags.length === 1, `${route} must have exactly one canonical`);
  if (canonicalTags.length === 1) {
    const href = new URL(attribute(canonicalTags[0], "href")).toString().replace(/\/$/, "");
    check(
      href === expectedCanonical.replace(/\/$/, ""),
      `${route} canonical must self-reference ${expectedCanonical}, got ${href}`
    );
  }
  check(robots.length === 1, `${route} must have exactly one robots meta tag`);
  check(
    robots.every((value) => value.includes("index") && !value.includes("noindex")),
    `${route} is in the sitemap but is not index,follow (${robots.join(" | ")})`
  );
  check(title.length > 20, `${route} needs a descriptive title`);
  // A record's description is built from the pet's name, so it can be shorter
  // than a marketing page's hand-written one.
  const minimumDescription = isEdgeRoute(route) ? 50 : 70;
  check(
    description.length > minimumDescription,
    `${route} needs a descriptive meta description (${description.length} characters)`
  );
  titles.set(title, [...(titles.get(title) ?? []), route]);
  descriptions.set(description, [...(descriptions.get(description) ?? []), route]);

  for (const script of html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) ?? []) {
    const json = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      const parsed = JSON.parse(json);
      const serialized = JSON.stringify(parsed);
      check(parsed["@context"] === "https://schema.org", `${route} JSON-LD needs the schema.org context`);
      check(
        !/"(?:aggregateRating|review|reviewCount)"/i.test(serialized),
        `${route} JSON-LD must not claim ratings or reviews`
      );
    } catch (error) {
      failures.push(`${route} has JSON-LD that does not parse: ${error.message}`);
    }
  }

  if (isEdgeRoute(route)) {
    // A record page (the sample Share Profile). Its head is rewritten at the
    // edge and its body is assembled in the browser.
    if (text.length <= minimumVisibleText) {
      warnings.push(
        `${route} is indexable but its initial HTML has ${text.length} characters of text (docs/seo/seo-audit.md, SEO-M4)`
      );
    }
  } else {
    check(h1Count === 1, `${route} must have exactly one H1 in its initial HTML, found ${h1Count}`);
    check(
      text.length > minimumVisibleText,
      `${route} initial HTML is too thin (${text.length} characters of text)`
    );
  }
}

for (const [value, routes] of [...titles, ...descriptions]) {
  check(routes.length === 1, `Duplicate title or description "${value}" on ${routes.join(", ")}`);
}

// --- the homepage --------------------------------------------------------------
const homepage = await readFile(path.join(outRoot, "index.html"), "utf8");
const homepageHrefs = tags(homepage, "a").map((tag) => attribute(tag, "href"));
for (const route of sitemapRoutes) {
  if (route === "/" || isEdgeRoute(route)) continue;
  check(homepageHrefs.includes(route), `Homepage must link to ${route} with a crawlable anchor`);
}
check(!homepageHrefs.includes(""), "Homepage must not contain an empty href");
check(!homepageHrefs.includes("#"), 'Homepage must not contain href="#"');
check(
  !homepageHrefs.some((href) =>
    /^(?:http:\/\/mypetlink|https:\/\/www\.mypetlink|https:\/\/(?:api|media)\.mypetlink)/.test(href)
  ),
  "Homepage contains a non-canonical or subdomain-root link"
);
check(/<html[^>]*\slang="en-MY"/i.test(homepage), 'The site must declare lang="en-MY"');
const structuredData = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i.exec(homepage)?.[1];
check(Boolean(structuredData), "The homepage must carry Organization and WebSite structured data");
if (structuredData) {
  const types = (JSON.parse(structuredData)["@graph"] ?? []).map((node) => node["@type"]);
  check(
    types.includes("Organization") && types.includes("WebSite"),
    `Homepage structured data must describe the Organization and WebSite, found ${types.join(", ")}`
  );
}

// --- everything exported but not listed ---------------------------------------
let unlistedPages = 0;
for (const file of await htmlFiles(outRoot)) {
  const route = routeForFile(file);
  if (sitemapRoutes.has(route) || route === "/404" || route === "/_not-found") continue;
  unlistedPages += 1;
  const html = await readFile(file, "utf8");
  const robots = metaContent(html, "robots");
  check(
    robots.length > 0 && robots.every((value) => value.includes("noindex")),
    `${route} is exported but not in the sitemap, so it must be noindex (${robots.join(" | ") || "no robots tag"})`
  );
}

// --- response headers -------------------------------------------------------------
const headersFile = await readFile(path.join(outRoot, "_headers"), "utf8").catch(() => "");
check(/X-Robots-Tag:\s*noindex/i.test(headersFile), "The export must ship _headers with X-Robots-Tag rules");

// --- 404 -----------------------------------------------------------------------------
const notFound = await readFile(path.join(outRoot, "404.html"), "utf8");
check(
  /Page not found|We couldn(?:'|&apos;|&#x27;)t find that page/i.test(notFound),
  "The static export must include the branded 404 artifact"
);
check(
  metaContent(notFound, "robots").some((value) => value.includes("noindex")),
  "The 404 page must be noindex"
);

for (const warning of warnings) {
  console.warn(`warning: ${warning}`);
}

if (failures.length > 0) {
  console.error(`SEO output verification failed (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `SEO output verified: ${sitemapEntries.length} sitemap URLs (from sitemap.xml), ${unlistedPages} unlisted pages confirmed noindex, robots.txt, _headers, and 404.html.`
);
