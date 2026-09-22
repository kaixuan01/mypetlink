import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Proves which Social state a production export was actually built in.
 *
 * The release audit that prompted this found a build assumed to be Social OFF
 * that had quietly inherited `NEXT_PUBLIC_SOCIAL_ENABLED=true` from a
 * developer's gitignored `.env.local`, and a single substring check that
 * happened not to match agreed with the wrong assumption. So this does not ask
 * "is this string missing" — a missing string is exactly what a truncated
 * file, a renamed component, or a wrong path also looks like.
 *
 * Instead it proves three things in order:
 *
 *   1. the artifact is real — the file exists and is substantial;
 *   2. the reader works — a control marker that must be present in BOTH states
 *      is present, so an absence found later means absence and not a bad read;
 *   3. every Social entry point is present (ON) or absent (OFF) — all of them,
 *      not one, so renaming a single component cannot fake either verdict.
 */

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(appRoot, "out");

/**
 * The owner-facing Social entry points, as they appear in the rendered export.
 *
 * What the flag actually does is worth being precise about, because a check
 * built on the wrong assumption is worse than no check. `socialEnabled` is a
 * build-time constant that decides what the page RENDERS; it does not strip
 * Social code from the bundle. The components stay in the JavaScript chunks in
 * both states — as they must, since `/feed`, `/explore` and `/u/{handle}`
 * remain reachable either way by design.
 *
 * So the difference to look for is in the page, not the chunks: `settings.html`
 * carries a client-component boundary for each section the page chose to
 * render. These two are the sections gated on the flag. Searching the whole
 * export instead would find the component code in both states and conclude,
 * wrongly, that Social was on.
 *
 * The per-pet consent UI is deliberately not listed. It is nested inside the
 * Social settings section rather than rendered by the page, so it never becomes
 * a boundary of its own — asserting it here would fail on a correct ON build.
 * That it sits inside that section is covered by the component tests, which is
 * the level that can actually see it.
 *
 * Nor is the Owner Settings link: it is a server component, so it is inlined
 * into the page rather than referenced as a boundary. The two markers below are
 * the ones that genuinely differ between the artifacts — checked in two
 * different files, so a single page changing shape cannot silently fake either
 * verdict.
 */
const socialEntryPoints = [
  { name: "Blocked accounts settings", marker: "BlockedAccountsSettings", file: "settings.html" },
  {
    name: "Community profile editor",
    marker: "SocialProfileSettingsSection",
    file: "community/profile/edit.html",
  },
  {
    // The entry point search engines get. `seo.ts` lists Explore in the sitemap
    // only while Social is on, so this is a real difference between the two
    // artifacts and it lives in a third file — a single page changing shape
    // cannot fake the verdict on its own.
    name: "Explore listed for search engines",
    marker: "/explore",
    file: "sitemap.xml",
  },
];

/**
 * Community entry points that the export cannot be asked about.
 *
 * `SocialLayout`'s visitor header renders after hydration — the prerendered
 * HTML for `/p/{slug}-{publicCode}` carries the neutral "resolving" header in
 * both states — and `socialEnabled` is a function call rather than a literal,
 * so the branch survives minification and sits in the chunks either way.
 * Searching the export for these links finds them in both artifacts and would
 * report a confident, wrong verdict.
 *
 * It is also the entry point that matters most: that header sits above a pet's
 * Share Profile, the page owners actually send to people, and it was offering
 * Explore and Search in a build where every other surface had hidden Community.
 *
 * So it is checked where the answer is knowable — in the source that produced
 * the artifact. This is a weaker kind of evidence than the checks above and is
 * reported as such. The behavioural proof is
 * `src/components/layouts/SocialLayoutVisitorShell.test.tsx`, which renders the
 * shell in both states; this guard exists so that deleting the gate cannot pass
 * a release build even if that test is removed with it.
 */
const gatedSources = [
  {
    name: "Share Profile visitor header",
    file: "src/components/layouts/SocialLayout.tsx",
    // Not "these strings exist somewhere in the file" — that would pass on a
    // file where the gate had been deleted and the links left behind. Both
    // Community links must sit INSIDE the conditional.
    opensGate: "socialEnabled ? (",
    closesGate: ") : null}",
    mustBeInsideGate: ["social-header-explore", "social-header-search"],
  },
];

/**
 * Present whatever the flag says. If one of these is missing, the reader is
 * looking at the wrong file or a broken build, and every "absent" result below
 * would be meaningless.
 */
const controls = [
  { name: "Owner settings page", marker: "Owner settings", file: "settings.html" },
  { name: "Settings panel", marker: "SettingsPanel", file: "settings.html" },
  {
    // The page's own title, which is present whatever the flag says — the flag
    // decides what the page renders inside the shell, not whether it exists.
    name: "Community profile editor page",
    marker: "Edit profile",
    file: "community/profile/edit.html",
  },
  {
    // The sitemap is generated in both states and always lists the marketing
    // pages. Without this, "no /explore in the sitemap" and "no sitemap" would
    // look the same.
    name: "Sitemap lists the marketing pages",
    marker: "<loc>",
    file: "sitemap.xml",
  },
];

/** Routes that must exist in both states — Social is additive, never a gate. */
const requiredRoutes = [
  "settings.html",
  "community/profile.html",
  "community/profile/edit.html",
  "feed.html",
  "explore.html",
  "search.html",
  "notifications.html",
  // The shell the Pages Function rewrites for every real Moment. A real Moment
  // id can never be in the build-time params list, so this placeholder page
  // existing is the only build-time evidence the route was exported at all.
  "moments/00000000-0000-0000-0000-000000000000.html",
  "dashboard.html",
  "404.html",
  "_routes.json",
];

function fail(message) {
  console.error(`\nSocial flag verification FAILED\n  ${message}\n`);
  process.exit(1);
}

/**
 * @param minBytes Only meaningful for files an absence is read from. A small
 * file is a real failure there — you cannot conclude "the marker is gone" from
 * a truncated page — but `_routes.json` is legitimately tiny and is parsed
 * rather than searched, so it passes 0.
 */
async function readArtifact(file, minBytes) {
  const full = path.join(outRoot, file);

  let info;
  try {
    info = await stat(full);
  } catch {
    fail(`Expected ${file} in the export, but it is not there. Build first.`);
  }

  if (info.size < minBytes) {
    fail(
      `${file} is only ${info.size} bytes, under the ${minBytes} expected. A ` +
        `file this small cannot be used to prove anything is absent from it.`
    );
  }

  return readFile(full, "utf8");
}

/**
 * Source rather than artifact, for the one entry point an export cannot answer
 * for. Read from the same tree the build was produced from.
 */
async function readSource(file) {
  const full = path.join(appRoot, file);

  try {
    return await readFile(full, "utf8");
  } catch {
    return fail(`Expected ${file} in the source tree, but it is not there.`);
  }
}

async function main() {
  const expected = process.argv[2];

  if (expected !== "on" && expected !== "off") {
    fail('Usage: node scripts/verify-social-flag.mjs <on|off>');
  }

  for (const route of requiredRoutes) {
    try {
      await stat(path.join(outRoot, route));
    } catch {
      fail(`${route} is missing from the export. Social is additive — every route must build in both states.`);
    }
  }

  const cache = new Map();
  // The sitemap is a short, complete document rather than a page an absence is
  // read out of the middle of; ten URLs is plenty to trust and it sits just
  // under the page threshold.
  const minimumBytes = { "sitemap.xml": 512 };
  const load = async (file, minBytes) => {
    const floor = minBytes ?? minimumBytes[file] ?? 1024;
    if (!cache.has(file)) cache.set(file, await readArtifact(file, floor));
    return cache.get(file);
  };

  // 2. Prove the reader works before trusting any absence.
  for (const control of controls) {
    const html = await load(control.file);
    if (!html.includes(control.marker)) {
      fail(
        `Control marker "${control.marker}" (${control.name}) was not found in ` +
          `${control.file}. The check cannot tell a real absence from a bad ` +
          `read, so it refuses to report a verdict.`
      );
    }
  }

  // 3. All entry points must agree with the expected state.
  const present = [];
  const absent = [];

  for (const entry of socialEntryPoints) {
    const html = await load(entry.file);
    (html.includes(entry.marker) ? present : absent).push(entry);
  }

  if (expected === "off" && present.length > 0) {
    fail(
      `Expected a Social OFF artifact, but these entry points are in it:\n` +
        present.map((e) => `    - ${e.name} (${e.marker} in ${e.file})`).join("\n") +
        `\n  A build that inherited NEXT_PUBLIC_SOCIAL_ENABLED=true from a ` +
        `local .env file looks exactly like this.`
    );
  }

  if (expected === "on" && absent.length > 0) {
    fail(
      `Expected a Social ON artifact, but these entry points are missing:\n` +
        absent.map((e) => `    - ${e.name} (${e.marker} in ${e.file})`).join("\n")
    );
  }

  // 4. The entry points the export cannot answer for. State-independent: this
  //    asks whether the gate is still there, not which side of it we built.
  for (const source of gatedSources) {
    const text = await readSource(source.file);
    const opens = text.indexOf(source.opensGate);

    if (opens === -1) {
      fail(
        `${source.name}: ${source.file} no longer contains "${source.opensGate}". ` +
          `Its Community links are rendered in the browser, so no export can ` +
          `show whether they are gated — the gate has to be visible here.`
      );
    }

    const closes = text.indexOf(source.closesGate, opens);

    if (closes === -1) {
      fail(
        `${source.name}: found "${source.opensGate}" in ${source.file} but no ` +
          `closing "${source.closesGate}" after it, so the guarded region ` +
          `cannot be read.`
      );
    }

    const guarded = text.slice(opens, closes);
    const loose = source.mustBeInsideGate.filter((marker) => !guarded.includes(marker));

    if (loose.length > 0) {
      fail(
        `${source.name}: these Community links are not inside the ` +
          `socialEnabled gate in ${source.file}:\n` +
          loose.map((marker) => `    - ${marker}`).join("\n") +
          `\n  This header sits above every shared Share Profile. With Community ` +
          `off it must offer no Community destination at all.`
      );
    }
  }

  const routes = JSON.parse(await load("_routes.json", 0));
  const requiredIncludes = [
    "/p/*",
    "/q/*",
    "/t/*",
    "/n/*",
    "/u/*",
    // Without this, functions/moments/[momentId].ts is never invoked and every
    // real Moment link serves the 404 asset instead. That is precisely how the
    // whole /u/ handler shipped unreachable once.
    "/moments/*",
    "/social/pets/*",
  ];
  const missingIncludes = requiredIncludes.filter((p) => !routes.include?.includes(p));

  if (missingIncludes.length > 0) {
    fail(`_routes.json is missing: ${missingIncludes.join(", ")}`);
  }

  console.log(
    `Social flag verified: the export is Social ${expected.toUpperCase()}.\n` +
      `  ${socialEntryPoints.length} entry points checked in the export, ` +
      `${controls.length} control markers confirmed, ` +
      `${gatedSources.length} client-rendered entry point ` +
      `${gatedSources.length === 1 ? "gate" : "gates"} confirmed at source, ` +
      `${requiredRoutes.length} routes present, ` +
      `_routes.json admits every finder and social path.`
  );
}

main().catch((error) => fail(error.message));
