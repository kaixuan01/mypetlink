import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureDir,
  ffmpeg,
  loadManifest,
  pathExists,
  readVisualSystem,
  renderSvg,
  repoRoot,
  resolveXhsPath,
  run,
  splitLines,
  svgTextLines,
  writeSubtitles,
  xml,
} from "./common.mjs";
import { buildCover } from "./cover.mjs";

function mediaKind(filePath) {
  return /\.(mp4|mov|m4v|webm|mkv)$/i.test(filePath) ? "video" : "image";
}

async function createPlaceholder(filePath, segment, asset, visual, post) {
  const { width, height } = visual.canvas.video;
  const colors = visual.colors;
  const titleLines = splitLines(segment.text, 8).slice(0, 4);
  const noteLines = splitLines(segment.note || asset.description, 24).slice(0, 4);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${colors.cream}"/><stop offset="1" stop-color="${colors.apricot}"/></linearGradient></defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <circle cx="900" cy="260" r="280" fill="${colors.coral}" opacity="0.13"/>
      <rect x="88" y="230" width="904" height="1320" rx="64" fill="white" stroke="${colors.coral}" stroke-width="5" stroke-dasharray="20 16"/>
      <g font-family="${xml(visual.typography.fontFamily)}">
        <rect x="120" y="285" width="300" height="76" rx="38" fill="${colors.ink}"/>
        <text x="270" y="336" text-anchor="middle" font-size="31" font-weight="900" fill="white">待补真实素材</text>
        ${svgTextLines(titleLines, { x: 130, y: 560, size: 86, color: colors.ink, weight: 900, lineHeight: 1.2 })}
        ${svgTextLines(noteLines, { x: 130, y: 1000, size: 40, color: colors.muted, weight: 600, lineHeight: 1.42 })}
        <text x="130" y="1450" font-size="28" font-weight="700" fill="${colors.coral}">${xml(asset.path)}</text>
        <text x="90" y="1760" font-size="34" font-weight="800" fill="${colors.ink}">MyPetLink · 制作样片</text>
        <text x="990" y="1760" text-anchor="end" font-size="30" font-weight="700" fill="${colors.muted}">POST ${xml(post)}</text>
      </g>
    </svg>`;
  await renderSvg(svg, filePath, { format: "png" });
}

async function createOverlay(filePath, segment, visual) {
  const { width, height } = visual.canvas.video;
  const colors = visual.colors;
  const lines = splitLines(segment.text, 16).slice(0, 2);
  const logoPath = path.resolve(repoRoot, visual.brand.logoMark);
  const logoData = (await fs.readFile(logoPath)).toString("base64");
  const boxHeight = 90 + lines.length * 66;
  const y = height - visual.canvas.safeMargins.bottom - boxHeight;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <g font-family="${xml(visual.typography.fontFamily)}">
        <rect x="90" y="${y}" width="900" height="${boxHeight}" rx="40" fill="${colors.ink}" fill-opacity="0.82"/>
        ${svgTextLines(lines, { x: 540, y: y + 82, size: 52, color: "#FFFFFF", weight: 800, lineHeight: 1.18, anchor: "middle" })}
        <image href="data:image/svg+xml;base64,${logoData}" x="910" y="230" width="72" height="72" preserveAspectRatio="xMidYMid meet"/>
      </g>
    </svg>`;
  await renderSvg(svg, filePath, { format: "png" });
}

async function makeSegment({ input, output, overlay, duration, motion, freezeTailSeconds = 0, isVideo, visual }) {
  const { width, height, fps } = visual.canvas.video;
  const frames = Math.ceil(duration * fps);
  const inputArgs = isVideo ? ["-i", input] : ["-loop", "1", "-i", input];
  const freeze = Math.min(Math.max(Number(freezeTailSeconds) || 0, 0), Math.max(duration - 0.1, 0));
  const playDuration = duration - freeze;
  const baseFilter = isVideo
    ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},trim=duration=${playDuration},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${freeze || duration},fps=${fps}`
    : motion === "none"
      ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps}`
      : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},zoompan=z='min(zoom+0.0008,1.04)':d=${frames}:s=${width}x${height}:fps=${fps}`;
  await run(ffmpeg, [
    "-y",
    ...inputArgs,
    "-loop",
    "1",
    "-i",
    overlay,
    "-filter_complex",
    `[0:v]${baseFilter}[base];[base][1:v]overlay=0:0:shortest=1,format=yuv420p[out]`,
    "-map",
    "[out]",
    "-an",
    "-t",
    String(duration),
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    output,
  ], { quiet: true });
}

async function muxAudio(videoPath, outputPath, manifest, visual) {
  const voice = manifest.audio?.voiceover ? resolveXhsPath(manifest.audio.voiceover) : null;
  const bgm = manifest.audio?.bgm ? resolveXhsPath(manifest.audio.bgm) : null;
  const hasVoice = voice && (await pathExists(voice));
  const hasBgm = bgm && (await pathExists(bgm));
  const common = ["-map", "0:v", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", String(visual.audio.sampleRate), "-shortest", "-movflags", "+faststart", outputPath];

  if (hasVoice && hasBgm) {
    await run(ffmpeg, [
      "-y", "-i", videoPath, "-i", voice, "-stream_loop", "-1", "-i", bgm,
      "-filter_complex",
      `[1:a]loudnorm=I=${visual.audio.voiceTargetLufs}:TP=-1.5:LRA=11,apad[voice];[2:a]loudnorm=I=-24:TP=-2:LRA=11,volume=${visual.audio.bgmGain}[music];[music][voice]sidechaincompress=threshold=${visual.audio.ducking.threshold}:ratio=${visual.audio.ducking.ratio}:attack=${visual.audio.ducking.attackMs}:release=${visual.audio.ducking.releaseMs}[ducked];[voice][ducked]amix=inputs=2:duration=longest[a]`,
      "-map", "0:v", "-map", "[a]", ...common.slice(2),
    ], { quiet: true });
  } else if (hasVoice) {
    await run(ffmpeg, ["-y", "-i", videoPath, "-i", voice, "-filter_complex", `[1:a]loudnorm=I=${visual.audio.voiceTargetLufs}:TP=-1.5:LRA=11,apad[a]`, "-map", "0:v", "-map", "[a]", ...common.slice(2)], { quiet: true });
  } else if (hasBgm) {
    await run(ffmpeg, ["-y", "-i", videoPath, "-stream_loop", "-1", "-i", bgm, "-filter_complex", `[1:a]loudnorm=I=-24:TP=-2:LRA=11,volume=${visual.audio.bgmGain}[a]`, "-map", "0:v", "-map", "[a]", ...common.slice(2)], { quiet: true });
  } else {
    await run(ffmpeg, [
      "-y",
      "-i",
      videoPath,
      "-f",
      "lavfi",
      "-i",
      `anullsrc=channel_layout=stereo:sample_rate=${visual.audio.sampleRate}`,
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      String(visual.audio.sampleRate),
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath,
    ], { quiet: true });
  }
}

export async function buildPost(postArg) {
  const { post, workspace, manifest } = await loadManifest(postArg);
  const visual = await readVisualSystem();
  const assetMap = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const outputDir = path.join(workspace, "output");
  const generatedDir = path.join(workspace, "generated");
  await ensureDir(outputDir);
  await ensureDir(generatedDir);
  await buildCover(post);
  await writeSubtitles(manifest, path.join(outputDir, "subtitles.srt"));

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `mypetlink-xhs-${post}-`));
  try {
    const segmentPaths = [];
    for (let index = 0; index < manifest.timeline.length; index += 1) {
      const segment = manifest.timeline[index];
      const asset = assetMap.get(segment.asset);
      if (!asset) throw new Error(`Timeline references unknown asset: ${segment.asset}`);
      const assetPath = resolveXhsPath(asset.path);
      const available = await pathExists(assetPath);
      const inputPath = available ? assetPath : path.join(tempDir, `placeholder-${index}.png`);
      if (!available) await createPlaceholder(inputPath, segment, asset, visual, post);
      const overlayPath = path.join(tempDir, `overlay-${index}.png`);
      await createOverlay(overlayPath, segment, visual);
      const segmentPath = path.join(tempDir, `segment-${String(index).padStart(3, "0")}.mp4`);
      await makeSegment({
        input: inputPath,
        output: segmentPath,
        overlay: overlayPath,
        duration: segment.duration,
        motion: segment.motion ?? visual.motion.defaultImageMotion,
        freezeTailSeconds: segment.freezeTailSeconds ?? 0,
        isVideo: available && mediaKind(assetPath) === "video",
        visual,
      });
      segmentPaths.push(segmentPath);
    }

    const concatPath = path.join(tempDir, "concat.txt");
    await fs.writeFile(concatPath, segmentPaths.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"), "utf8");
    const videoOnly = path.join(tempDir, "video-only.mp4");
    await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", videoOnly], { quiet: true });
    const outputPath = path.join(outputDir, "preview.mp4");
    await muxAudio(videoOnly, outputPath, manifest, visual);
    console.log(`Preview created: ${path.relative(repoRoot, outputPath)}`);
    console.log("Missing real assets remain visible as labelled placeholder scenes.");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildPost(process.argv[2]).catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
