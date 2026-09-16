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
  const load = async (file, minBytes = 1024) => {
    if (!cache.has(file)) cache.set(file, await readArtifact(file, minBytes));
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

  const routes = JSON.parse(await load("_routes.json", 0));
  const requiredIncludes = ["/p/*", "/q/*", "/t/*", "/n/*", "/u/*", "/social/pets/*"];
  const missingIncludes = requiredIncludes.filter((p) => !routes.include?.includes(p));

  if (missingIncludes.length > 0) {
    fail(`_routes.json is missing: ${missingIncludes.join(", ")}`);
  }

  console.log(
    `Social flag verified: the export is Social ${expected.toUpperCase()}.\n` +
      `  ${socialEntryPoints.length} entry points checked, ` +
      `${controls.length} control markers confirmed, ` +
      `${requiredRoutes.length} routes present, ` +
      `_routes.json admits every finder and social path.`
  );
}

main().catch((error) => fail(error.message));
