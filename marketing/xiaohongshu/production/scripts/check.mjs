import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadManifest,
  pathExists,
  resolveXhsPath,
} from "./common.mjs";
import { inspectPost } from "./inspect.mjs";

const allowedSources = new Set(["human", "automated", "shared"]);
const allowedTypes = new Set(["image", "video", "screen-recording", "audio"]);

async function collectTextFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "generated") files.push(...await collectTextFiles(full));
    } else if (/\.(md|txt|json|srt)$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function unsupportedClaim(line) {
  const lower = line.toLowerCase();
  if (/buy now|buy (a )?(smart )?tag|立即购买|马上购买|购买实体牌/.test(lower)) return "Smart Tag purchase language";
  const gpsPositive = /实时定位|live gps|gps tracking|track your pet|追踪.{0,8}(宠物|猫|狗)/i.test(line);
  const negated = /not|does not|doesn't|cannot|can't|no gps|不是|不会|没有|不提供|不追踪|≠/i.test(line);
  if (gpsPositive && !negated) return "unsupported GPS/location claim";
  return null;
}

function privateTextFinding(line) {
  const email = line.match(/\b[A-Z0-9._%+-]+@(?!example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  if (email) return `email-like text: ${email[0]}`;
  const phone = line.match(/(?:\+?60|0)1\d[-\s]?\d{3,4}[-\s]?\d{4}\b/);
  if (phone) return `Malaysia phone-like text: ${phone[0]}`;
  return null;
}

export async function checkPost(postArg) {
  const { post, workspace, manifest } = await loadManifest(postArg);
  const schemaErrors = [];
  if (manifest.version !== 1) schemaErrors.push("version must be 1");
  if (manifest.post !== post) schemaErrors.push(`manifest post must be ${post}`);
  if (!Array.isArray(manifest.assets)) schemaErrors.push("assets must be an array");
  if (!Array.isArray(manifest.timeline) || manifest.timeline.length === 0) schemaErrors.push("timeline must contain at least one segment");
  const ids = new Set();
  for (const asset of manifest.assets ?? []) {
    if (ids.has(asset.id)) schemaErrors.push(`duplicate asset id: ${asset.id}`);
    ids.add(asset.id);
    if (!allowedSources.has(asset.source)) schemaErrors.push(`invalid source for ${asset.id}`);
    if (!allowedTypes.has(asset.type)) schemaErrors.push(`invalid type for ${asset.id}`);
    try { resolveXhsPath(asset.path); } catch (error) { schemaErrors.push(error.message); }
  }
  for (const segment of manifest.timeline ?? []) {
    if (!ids.has(segment.asset)) schemaErrors.push(`unknown timeline asset: ${segment.asset}`);
    if (!(Number(segment.duration) > 0)) schemaErrors.push(`invalid duration for ${segment.asset}`);
  }

  const missing = [];
  for (const asset of manifest.assets ?? []) {
    if (asset.required && !(await pathExists(resolveXhsPath(asset.path)))) missing.push(asset);
  }

  const contentFindings = [];
  for (const file of await collectTextFiles(workspace)) {
    const lines = (await fs.readFile(file, "utf8")).split(/\r?\n/);
    lines.forEach((line, index) => {
      const claim = unsupportedClaim(line);
      const privateText = privateTextFinding(line);
      if (claim) contentFindings.push(`${path.basename(file)}:${index + 1} — ${claim}`);
      if (privateText) contentFindings.push(`${path.basename(file)}:${index + 1} — ${privateText}`);
    });
  }

  const output = await inspectPost(post, { quiet: true });
  console.log(`POST ${post}`);
  if (schemaErrors.length) {
    console.log("\nMANIFEST ERRORS");
    schemaErrors.forEach((item) => console.log(`- ${item}`));
  }
  if (missing.length) {
    console.log("\nMISSING ASSETS");
    missing.forEach((asset) => console.log(`- ${asset.path} — ${asset.description}`));
  } else {
    console.log("\nASSETS READY");
  }
  if (contentFindings.length) {
    console.log("\nCONTENT/PRIVACY FINDINGS");
    contentFindings.forEach((item) => console.log(`- ${item}`));
  }
  console.log("\nOUTPUTS");
  output.checks.forEach((item) => console.log(`- ${item.ok ? "PASS" : "FAIL"}: ${item.label} (${item.detail})`));
  console.log("\nMANUAL PRIVACY REVIEW REQUIRED");
  console.log("- Automated text checks cannot reliably detect private details baked into images or video.");

  const ready = !schemaErrors.length && !missing.length && !contentFindings.length && output.ok;
  console.log(`\n${ready ? "READY" : missing.length ? "MISSING ASSETS" : "NOT READY"}`);
  return { ready, schemaErrors, missing, contentFindings, output };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkPost(process.argv[2]).then((result) => {
    if (!result.ready) process.exitCode = 2;
  }).catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
