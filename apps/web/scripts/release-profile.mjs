import { findReleaseFlagProblems, statedReleaseFlags } from "../src/lib/releaseFlags.ts";

const aliases = { "smart-tags": statedReleaseFlags[0], "tag-orders": statedReleaseFlags[1], ordering: statedReleaseFlags[2], community: statedReleaseFlags[3] };
export function selectReleaseFlags(args, environment = {}) {
  const values = Object.fromEntries(statedReleaseFlags.map(key => [key, environment[key]]));
  const seen = new Set();
  for (const argument of args) {
    if (argument === "on" || argument === "off") {
      if (seen.has("community")) throw new Error("Community was selected twice.");
      seen.add("community"); values[aliases.community] = String(argument === "on"); continue;
    }
    const match = /^--([a-z-]+)=(true|false)$/.exec(argument);
    if (!match || !aliases[match[1]] || seen.has(match[1])) throw new Error(`Invalid or duplicate release selection: ${argument}`);
    seen.add(match[1]); values[aliases[match[1]]] = match[2];
  }
  const problems = findReleaseFlagProblems(values);
  if (problems.length) throw new Error(`Select all four release flags explicitly in the command or shell environment. Local dotenv files are not release selections.\n${problems.join("\n")}`);
  return values;
}
export function releaseArguments(values) { return Object.entries(aliases).map(([alias, key]) => `--${alias}=${values[key]}`); }
export function verifyReleaseHtml(htmlByFile, flags, { previewNoindex = false } = {}) {
  const expected = {
    "smart-tags": flags.NEXT_PUBLIC_SMART_TAGS_ENABLED === "true",
    "tag-orders": flags.NEXT_PUBLIC_SMART_TAGS_ENABLED === "true" && flags.NEXT_PUBLIC_TAG_ORDERS_ENABLED === "true",
    ordering: flags.NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED === "true",
    community: flags.NEXT_PUBLIC_SOCIAL_ENABLED === "true",
  };
  for (const file of ["index.html", "where-to-buy.html"]) {
    const html = htmlByFile[file];
    if (!html || html.length < 1024 || !html.includes("MyPetLink")) throw new Error(`Missing or incomplete release page: ${file}`);
    for (const [alias, value] of Object.entries(expected)) {
      if (!html.includes(`<meta name="mypetlink-release-${alias}" content="${value}"`)) throw new Error(`${file}: ${alias} does not match the selected release.`);
    }
  }
  for (const [file, marker, enabled] of [
    ["tags.html", "TagManagementPanel", expected["smart-tags"]],
    ["orders.html", "OrdersList", expected["tag-orders"]],
    ["tags/order.html", "SmartTagOrderEntry", expected["tag-orders"] && expected.ordering],
  ]) {
    const html = htmlByFile[file];
    if (!html || html.length < 1024 || !html.includes("MyPetLink")) throw new Error(`Missing or incomplete release page: ${file}`);
    if (html.includes(marker) !== enabled || html.includes("Smart Tags coming soon") === enabled) throw new Error(`${file}: rendered availability disagrees with the release selection.`);
  }
  const directory = htmlByFile["where-to-buy.html"];
  const expectedRobots = previewNoindex ? "noindex, nofollow" : "index, follow";
  for (const file of ["index.html", "where-to-buy.html"]) {
    if (!htmlByFile[file].includes(`<meta name="robots" content="${expectedRobots}`)) throw new Error(`${file}: indexing does not match the selected production/preview policy.`);
  }
  const checkout = expected["tag-orders"] && expected.ordering;
  if (directory.includes('href="/tags/order"') !== checkout) throw new Error("The directory checkout link disagrees with the release selection.");
}
