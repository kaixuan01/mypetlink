import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { selectReleaseFlags, releaseArguments, verifyReleaseHtml } from "./release-profile.mjs";

const selections = (tags, orders, ordering, community) => [`--smart-tags=${tags}`, `--tag-orders=${orders}`, `--ordering=${ordering}`, `--community=${community}`];
test("the build entry point rejects missing selections before Next loads local dotenv files", () => {
  const environment = { ...process.env };
  for (const key of ["NEXT_PUBLIC_SMART_TAGS_ENABLED", "NEXT_PUBLIC_TAG_ORDERS_ENABLED", "NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED", "NEXT_PUBLIC_SOCIAL_ENABLED"]) delete environment[key];
  const result = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(new URL("./build-release.mjs", import.meta.url))], { env: environment, encoding: "utf8" });
  assert.equal(result.status, 1); assert.match(result.stderr, /Select all four/); assert.doesNotMatch(result.stdout, /Creating an optimized production build/);
});
test("fails before building when any selection is missing, invalid or inconsistent", () => {
  assert.throws(() => selectReleaseFlags([], {}), /all four/);
  for (let missing = 0; missing < 4; missing++) assert.throws(() => selectReleaseFlags(selections(false, false, false, false).filter((_, i) => i !== missing)), /explicitly/);
  assert.throws(() => selectReleaseFlags(selections(false, false, true, false)), /requires/);
  assert.throws(() => selectReleaseFlags(["--community=maybe"]), /Invalid/);
  assert.throws(() => selectReleaseFlags(["off", "--community=true"]), /duplicate/);
  assert.throws(() => selectReleaseFlags(["off"]), /all four/);
});
test("explicit choices override inherited shell flags and preserve legacy Social aliases", () => {
  const inherited = selectReleaseFlags(selections(true, true, true, true));
  const selected = selectReleaseFlags(selections(false, false, false, false), inherited);
  assert.equal(selected.NEXT_PUBLIC_SOCIAL_ENABLED, "false");
  assert.equal(selectReleaseFlags(["off"], inherited).NEXT_PUBLIC_SMART_TAGS_ENABLED, "true");
  assert.deepEqual(releaseArguments(selected), selections(false, false, false, false));
});

function artifact(tags, orders, ordering, community) {
  const effectiveOrders = tags && orders;
  const metadata = Object.entries({ "smart-tags": tags, "tag-orders": effectiveOrders, ordering, community }).map(([key, value]) => `<meta name="mypetlink-release-${key}" content="${value}"/>`).join("");
  const shell = "MyPetLink" + " ".repeat(1100);
  const page = metadata + '<meta name="robots" content="index, follow"/>' + shell;
  return { "index.html": page, "where-to-buy.html": page + (effectiveOrders && ordering ? '<a href="/tags/order">Get a Smart Tag</a>' : "Ordering is not open yet."),
    "tags.html": shell + (tags ? "TagManagementPanel" : "Smart Tags coming soon"),
    "orders.html": shell + (effectiveOrders ? "OrdersList" : "Smart Tags coming soon"),
    "tags/order.html": shell + (effectiveOrders && ordering ? "SmartTagOrderEntry" : "Smart Tags coming soon") };
}
for (const tags of [false, true]) for (const orders of [false, true]) for (const ordering of [false, true]) for (const community of [false, true]) {
  if (ordering && (!tags || !orders)) continue;
  test(`checks an exported profile: tags=${tags}, orders=${orders}, ordering=${ordering}, community=${community}`, () => {
    const flags = selectReleaseFlags(selections(tags, orders, ordering, community));
    assert.doesNotThrow(() => verifyReleaseHtml(artifact(tags, orders, ordering, community), flags));
  });
}
test("rejects a wrong artifact, missing metadata, truncated output, wrong checkout and noindex directory", () => {
  const flags = selectReleaseFlags(selections(false, false, false, false));
  assert.throws(() => verifyReleaseHtml(artifact(true, true, true, true), flags), /selected release/);
  for (const change of [
    html => { html["index.html"] = "MyPetLink"; },
    html => { html["index.html"] = html["index.html"].replace('content="false"', 'content="true"'); },
    html => { html["tags/order.html"] += "SmartTagOrderEntry"; },
    html => { html["where-to-buy.html"] += '<a href="/tags/order">Buy</a>'; },
    html => { html["where-to-buy.html"] = html["where-to-buy.html"].replace("index, follow", "noindex, follow"); },
  ]) { const html = artifact(false, false, false, false); change(html); assert.throws(() => verifyReleaseHtml(html, flags)); }
});
test("preview noindex remains an independent explicit deployment safeguard", () => {
  const flags = selectReleaseFlags(selections(false, false, false, false));
  const html = artifact(false, false, false, false);
  for (const file of ["index.html", "where-to-buy.html"]) html[file] = html[file].replace("index, follow", "noindex, nofollow");
  assert.doesNotThrow(() => verifyReleaseHtml(html, flags, { previewNoindex: true }));
  assert.throws(() => verifyReleaseHtml(html, flags), /indexing/);
});
