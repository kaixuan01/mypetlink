import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadManifest,
  pathExists,
  probeMedia,
  readVisualSystem,
  repoRoot,
} from "./common.mjs";

export async function inspectPost(postArg, { quiet = false } = {}) {
  const { post, workspace } = await loadManifest(postArg);
  const visual = await readVisualSystem();
  const preview = path.join(workspace, "output", "preview.mp4");
  const cover = path.join(workspace, "output", "cover.jpg");
  const subtitles = path.join(workspace, "output", "subtitles.srt");
  const caption = path.join(workspace, "output", "caption.txt");
  const checks = [];

  for (const [label, file] of [["preview", preview], ["cover", cover], ["subtitles", subtitles], ["caption", caption]]) {
    checks.push({ label: `${label} exists`, ok: await pathExists(file), detail: path.relative(repoRoot, file) });
  }

  let metadata = null;
  if (await pathExists(preview)) {
    metadata = await probeMedia(preview);
    const video = metadata.streams.find((stream) => stream.codec_type === "video");
    const audio = metadata.streams.find((stream) => stream.codec_type === "audio");
    const fpsParts = String(video?.avg_frame_rate ?? "0/1").split("/").map(Number);
    const fps = fpsParts[1] ? fpsParts[0] / fpsParts[1] : 0;
    checks.push(
      { label: "video dimensions", ok: video?.width === visual.canvas.video.width && video?.height === visual.canvas.video.height, detail: `${video?.width ?? "?"}x${video?.height ?? "?"}` },
      { label: "video fps", ok: Math.abs(fps - visual.canvas.video.fps) < 0.01, detail: `${fps.toFixed(3)} fps` },
      { label: "video codec", ok: video?.codec_name === "h264", detail: video?.codec_name ?? "missing" },
      { label: "audio stream", ok: Boolean(audio), detail: audio ? `${audio.codec_name}, ${audio.sample_rate ?? "?"} Hz` : "missing" },
      { label: "duration", ok: Number(metadata.format?.duration) > 0, detail: `${Number(metadata.format?.duration ?? 0).toFixed(2)}s` },
    );
  }

  if (await pathExists(cover)) {
    const coverProbe = await probeMedia(cover);
    const image = coverProbe.streams.find((stream) => stream.codec_type === "video");
    checks.push({
      label: "cover dimensions",
      ok: image?.width === visual.canvas.cover.width && image?.height === visual.canvas.cover.height,
      detail: `${image?.width ?? "?"}x${image?.height ?? "?"}`,
    });
  }

  if (await pathExists(subtitles)) {
    const value = await fs.readFile(subtitles, "utf8");
    checks.push({ label: "subtitles not empty", ok: value.trim().length > 0, detail: `${value.split("\n\n").filter(Boolean).length} cues` });
  }

  if (!quiet) {
    console.log(`POST ${post} OUTPUT INSPECTION`);
    for (const check of checks) {
      console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.label} — ${check.detail}`);
    }
  }
  return { ok: checks.every((check) => check.ok), checks, metadata };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  inspectPost(process.argv[2]).then((result) => {
    if (!result.ok) process.exitCode = 1;
  }).catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
