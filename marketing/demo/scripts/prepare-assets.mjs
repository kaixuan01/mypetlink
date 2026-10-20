/**
 * Builds the demo media set from the official IP folder.
 *
 * The originals are 1.5–2.7 MB PNG masters and live outside the repository.
 * This writes web-sized JPEGs into `marketing/demo/assets/` so the marketing
 * seed is reproducible from a clone alone, and records where each one came
 * from in `manifest.json`. The originals are only ever read.
 *
 *   node marketing/demo/scripts/prepare-assets.mjs --ip-root "<path to 02_IP>"
 *
 * Re-running overwrites the derivatives with identical output, so it is safe to
 * run whenever the IP masters change.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ipAssets, repoAssets } from "./asset-map.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const demoRoot = path.resolve(scriptDir, "..");
export const repoRoot = path.resolve(demoRoot, "..", "..");
export const assetsDir = path.join(demoRoot, "assets");

function parseArgs(argv) {
  const args = { ipRoot: process.env.MPL_IP_ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--ip-root") args.ipRoot = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!args.ipRoot) {
    throw new Error(
      "Point --ip-root (or MPL_IP_ROOT) at the official IP folder — the one containing Linko/ and IP_Linko_Linky.png.",
    );
  }
  return args;
}

async function sha256(filePath) {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function main(argv) {
  const args = parseArgs(argv);
  const ipRoot = path.resolve(args.ipRoot);
  await fs.mkdir(assetsDir, { recursive: true });

  const manifest = [];

  for (const asset of ipAssets) {
    const source = path.join(ipRoot, asset.source);
    try {
      await fs.access(source);
    } catch {
      throw new Error(`Missing IP asset: ${asset.source}\n  Looked in: ${ipRoot}`);
    }

    const target = path.join(assetsDir, asset.output);
    let pipeline = sharp(source);

    // A crop is taken before the resize, so the region is expressed in the
    // master's own pixels and stays correct whatever output width is chosen.
    if (asset.crop) {
      pipeline = pipeline.extract(asset.crop);
    }

    await pipeline
      // `withoutEnlargement` is deliberately not applied to a cropped asset: a
      // crop of the board is small by construction, and the profile photos have
      // to be a usable size on a 2x-DPR capture.
      .resize({ width: asset.width, withoutEnlargement: !asset.crop })
      .jpeg({ quality: 86, chromaSubsampling: "4:4:4", mozjpeg: true })
      .toFile(target);

    const { width, height } = await sharp(target).metadata();
    manifest.push({
      file: asset.output,
      purpose: asset.purpose,
      note: asset.note,
      source: `IP folder: ${asset.source}`,
      sourceSha256: await sha256(source),
      width,
      height,
      bytes: (await fs.stat(target)).size,
    });
    console.log(`  ${asset.output}  <-  ${asset.source}`);
  }

  for (const asset of repoAssets) {
    const source = path.join(repoRoot, asset.source);
    const target = path.join(assetsDir, asset.output);
    await fs.copyFile(source, target);
    const { width, height } = await sharp(target).metadata();
    manifest.push({
      file: asset.output,
      purpose: asset.purpose,
      note: asset.note,
      source: `Repository: ${asset.source}`,
      sourceSha256: await sha256(source),
      width,
      height,
      bytes: (await fs.stat(target)).size,
    });
    console.log(`  ${asset.output}  <-  ${asset.source}`);
  }

  await fs.writeFile(
    path.join(assetsDir, "manifest.json"),
    `${JSON.stringify(
      {
        description:
          "Demo media for the local MyPetLink marketing profile. Derived from the official IP masters; the masters themselves are never modified.",
        assets: manifest,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`\nWrote ${manifest.length} assets to marketing/demo/assets.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
