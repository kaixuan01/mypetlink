import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectReleaseFlags, releaseArguments } from "./release-profile.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let flags;
try { flags = selectReleaseFlags(process.argv.slice(2), process.env); }
catch (error) { console.error(error.message); process.exit(1); }
console.log("Release selection:", flags);
function run(command, args) {
  const result = spawnSync(command, args, { cwd: appRoot, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...flags } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run("npx", ["next", "build"]);
run("node", ["--experimental-strip-types", "scripts/verify-release-flags.mjs", ...releaseArguments(flags)]);
run("node", ["scripts/verify-social-flag.mjs", flags.NEXT_PUBLIC_SOCIAL_ENABLED === "true" ? "on" : "off"]);
if (process.env.NEXT_PUBLIC_NOINDEX === "true") console.log("Preview noindex policy verified on the homepage and directory. Run the full production SEO audit on the production-profile export.");
else run("node", ["scripts/verify-seo-output.mjs"]);
