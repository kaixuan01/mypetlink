import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export const productionRoot = path.resolve(scriptDir, "..");
export const xhsRoot = path.resolve(productionRoot, "..");
export const repoRoot = path.resolve(xhsRoot, "..", "..");
export const postsRoot = path.join(xhsRoot, "posts");
export const ffmpeg = ffmpegPath;
export const ffprobe = ffprobeStatic.path;

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function readVisualSystem() {
  return readJson(path.join(productionRoot, "config", "visual-system.json"));
}

export function normalizePostId(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,3}$/.test(raw)) {
    throw new Error("Post id must be a number from 001 to 999.");
  }
  return raw.padStart(3, "0");
}

export async function findPostWorkspace(value) {
  const post = normalizePostId(value);
  const entries = await fs.readdir(postsRoot, { withFileTypes: true });
  const matches = entries.filter(
    (entry) => entry.isDirectory() && entry.name.startsWith(`${post}-`),
  );
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `No workspace found for post ${post}.`
        : `Multiple workspaces found for post ${post}.`,
    );
  }
  return { post, workspace: path.join(postsRoot, matches[0].name) };
}

export async function loadManifest(value) {
  const found = await findPostWorkspace(value);
  const manifestPath = path.join(found.workspace, "assets-manifest.json");
  const manifest = await readJson(manifestPath);
  return { ...found, manifest, manifestPath };
}

export function resolveXhsPath(relativePath) {
  const resolved = path.resolve(xhsRoot, relativePath);
  const relative = path.relative(xhsRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes marketing/xiaohongshu: ${relativePath}`);
  }
  return resolved;
}

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    if (options.quiet) {
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `${path.basename(command)} exited with ${code}${stderr ? `\n${stderr}` : ""}`,
          ),
        );
      }
    });
  });
}

export function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function svgTextLines(lines, { x, y, size, color, weight = 800, lineHeight = 1.18, anchor = "start" }) {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * size * lineHeight}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${color}">${xml(line)}</text>`,
    )
    .join("\n");
}

export function splitLines(value, maxUnits = 15) {
  if (Array.isArray(value)) return value;
  if (String(value).includes("\n")) {
    return String(value).split(/\r?\n/).flatMap((line) => splitLines(line, maxUnits));
  }
  const tokens = String(value).trim().match(/[\u3400-\u9fff]|[^\u3400-\u9fff\s]+|\s+/g) ?? [];
  const lines = [];
  let current = "";
  const units = (text) => [...text].reduce(
    (total, character) => total + (/\s/.test(character) ? 0.3 : /[\u3400-\u9fff]/.test(character) ? 1 : 0.58),
    0,
  );
  for (const token of tokens) {
    if (/^\s+$/.test(token) && !current) continue;
    if (units(current + token) <= maxUnits) {
      current += token;
      continue;
    }
    if (current.trim()) lines.push(current.trim());
    current = "";
    if (units(token) <= maxUnits) {
      current = token.trimStart();
      continue;
    }
    for (const character of [...token]) {
      if (units(current + character) > maxUnits && current) {
        lines.push(current.trim());
        current = "";
      }
      current += character;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines.length ? lines : [""];
}

export async function renderSvg(svg, outputPath, options = {}) {
  await ensureDir(path.dirname(outputPath));
  let pipeline = sharp(Buffer.from(svg));
  if (options.format === "png" || outputPath.toLowerCase().endsWith(".png")) {
    pipeline = pipeline.png();
  } else {
    pipeline = pipeline.jpeg({ quality: options.quality ?? 92, chromaSubsampling: "4:4:4" });
  }
  await pipeline.toFile(outputPath);
}

export function srtTimestamp(seconds) {
  const millis = Math.round(seconds * 1000);
  const hours = Math.floor(millis / 3600000);
  const minutes = Math.floor((millis % 3600000) / 60000);
  const secs = Math.floor((millis % 60000) / 1000);
  const ms = millis % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export async function writeSubtitles(manifest, outputPath) {
  let cursor = 0;
  const blocks = manifest.timeline.map((segment, index) => {
    const start = cursor;
    cursor += segment.duration;
    return `${index + 1}\n${srtTimestamp(start)} --> ${srtTimestamp(cursor)}\n${segment.text}\n`;
  });
  await ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, `${blocks.join("\n")}\n`, "utf8");
}

export async function probeMedia(filePath) {
  const { stdout } = await run(
    ffprobe,
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath],
    { quiet: true },
  );
  return JSON.parse(stdout);
}
