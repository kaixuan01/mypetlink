import { promises as fs } from "node:fs";
import { measure } from "./perf-instrument.mjs";

const session = JSON.parse(await fs.readFile(process.env.SESSION_FILE, "utf8"));
const PET = process.env.PET_ID;

const navigations = [
  { type: "goto", route: `/pets/${PET}`, label: "pet page  #1 (cold route)" },
  { type: "goto", route: `/pets/${PET}`, label: "pet page  #2 (warm reload)" },
  { type: "goto", route: `/pets/${PET}`, label: "pet page  #3 (warm reload)" },
  { type: "goto", route: `/pets/${PET}/edit`, label: "edit page #1 (cold route)" },
  { type: "goto", route: `/pets/${PET}/edit`, label: "edit page #2 (warm reload)" },
  { type: "goto", route: `/dashboard`, label: "dashboard #1 (cold route)" },
  { type: "goto", route: `/dashboard`, label: "dashboard #2 (warm reload)" },
  { type: "goto", route: `/pets/${PET}`, label: "pet page  #4 (warm, after others)" },
];

const out = await measure({ session, navigations });

const pad = (v, n) => String(v ?? "-").padStart(n);
console.log(`\n=== ${process.env.LABEL} | viewport ${out.viewport.width}x${out.viewport.height} ===`);
console.log(
  "label".padEnd(34) +
  pad("wall", 7) + pad("doc", 7) + pad("loadUI", 8) + pad("content", 8) + pad("apis", 6) + pad("apiEnd", 8) + pad("assets", 7)
);
for (const r of out.results) {
  console.log(
    r.label.padEnd(34) +
    pad(r.wallMs, 7) +
    pad(r.docResponseEnd, 7) +
    pad(r.loadingVisibleMs, 8) +
    pad(r.contentFirstSeen, 8) +
    pad(r.apiCount, 6) +
    pad(r.apiLastEnd, 8) +
    pad(r.assetCount, 7)
  );
}
console.log("\n(all values ms; doc=document responseEnd, loadUI=loading placeholder visible duration,");
console.log(" content=first meaningful pet content, apiEnd=last API response completed, assets=JS/chunk requests)");

console.log("\n--- per-navigation API calls ---");
for (const r of out.results) {
  console.log(`\n${r.label}  (slowest asset requests)`);
  r.slowestAssets.forEach((a) => console.log("   " + a));
  console.log("  API:");
  r.apiCalls.forEach((a) => console.log("   " + a));
}

await fs.writeFile(process.env.OUT_FILE, JSON.stringify(out, null, 2));
