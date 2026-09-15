import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Builds a release artifact in a Social state that is stated, not inherited.
 *
 * `next build` reads `.env.local`, which is gitignored and therefore different
 * on every machine. A release command that simply omits
 * `NEXT_PUBLIC_SOCIAL_ENABLED` gets whatever that file happens to say — which
 * is how an artifact assumed to be Social OFF was built with Social ON during
 * the release audit.
 *
 * Shell environment variables win over `.env` files in Next, so setting the
 * value here in `process.env` before spawning the build is decisive whatever
 * `.env.local` contains. It is set in the child's environment rather than
 * written on a command line because `FOO=bar npm run build` is not valid
 * PowerShell, and this repository is developed on Windows and built on Linux.
 *
 * The build is then verified against the artifact itself, so the answer comes
 * from what was produced rather than from what was asked for.
 */

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const state = process.argv[2];

if (state !== "on" && state !== "off") {
  console.error("Usage: node scripts/build-release.mjs <on|off>");
  process.exit(1);
}

const socialEnabled = state === "on" ? "true" : "false";

console.log(
  `\nBuilding the release export with NEXT_PUBLIC_SOCIAL_ENABLED=${socialEnabled}` +
    ` (explicit — any value in .env.local is overridden).\n`
);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: appRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NEXT_PUBLIC_SOCIAL_ENABLED: socialEnabled,
    },
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("npx", ["next", "build"]);
run("node", ["scripts/verify-social-flag.mjs", state]);
