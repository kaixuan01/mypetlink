import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadManifest,
  readVisualSystem,
  renderSvg,
  repoRoot,
  svgTextLines,
  xml,
} from "./common.mjs";

export async function buildCover(postArg) {
  const { post, workspace, manifest } = await loadManifest(postArg);
  const visual = await readVisualSystem();
  const { width, height } = visual.canvas.cover;
  const colors = visual.colors;
  const font = visual.typography.fontFamily;
  const accent = colors[manifest.cover.accent] ?? manifest.cover.accent ?? colors.coral;
  const logoPath = path.resolve(repoRoot, visual.brand.logo);
  const logoData = (await fs.readFile(logoPath)).toString("base64");
  const hookLines = manifest.cover.hook;
  const hookStart = 380;
  const hookSize = hookLines.length >= 3 ? 92 : 108;
  const subheadLines = manifest.cover.subhead
    ? String(manifest.cover.subhead).split("\n")
    : [];
  const badge = manifest.cover.prototypeBadge;
  const footer = manifest.cover.footer ?? (badge ? "真实素材到位后再发布" : "mypetlink.com.my");

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${colors.cream}"/>
        <stop offset="0.72" stop-color="${colors.white}"/>
        <stop offset="1" stop-color="${colors.sky}" stop-opacity="0.28"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <circle cx="930" cy="170" r="250" fill="${accent}" opacity="0.13"/>
    <circle cx="110" cy="1220" r="220" fill="${colors.mint}" opacity="0.36"/>
    <rect x="72" y="76" width="${width - 144}" height="${height - 152}" rx="56" fill="${colors.white}" fill-opacity="0.88" stroke="${colors.apricot}" stroke-width="4"/>
    <g font-family="${xml(font)}">
      <text x="120" y="210" font-size="34" font-weight="800" fill="${accent}" letter-spacing="2">${xml(manifest.cover.kicker)}</text>
      ${badge ? `<rect x="770" y="142" width="190" height="74" rx="37" fill="${colors.ink}"/><text x="865" y="192" text-anchor="middle" font-size="30" font-weight="800" fill="white">${xml(badge)}</text>` : ""}
      <rect x="116" y="274" width="150" height="16" rx="8" fill="${accent}"/>
      ${svgTextLines(hookLines, { x: 116, y: hookStart, size: hookSize, color: colors.ink, weight: 900, lineHeight: 1.2 })}
      ${subheadLines.length ? svgTextLines(subheadLines, { x: 120, y: 820, size: 44, color: colors.muted, weight: 600, lineHeight: 1.35 }) : ""}
      <rect x="116" y="1050" width="848" height="128" rx="42" fill="${accent}"/>
      <text x="540" y="1132" text-anchor="middle" font-size="43" font-weight="900" fill="white">${xml(footer)}</text>
      <image href="data:image/svg+xml;base64,${logoData}" x="116" y="1225" width="280" height="90" preserveAspectRatio="xMinYMid meet"/>
      <text x="958" y="1285" text-anchor="end" font-size="29" font-weight="700" fill="${colors.muted}">${xml(`POST ${post}`)}</text>
    </g>
  </svg>`;

  const outputPath = path.join(workspace, "output", "cover.jpg");
  await renderSvg(svg, outputPath);
  console.log(`Cover created: ${path.relative(repoRoot, outputPath)}`);
  return outputPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildCover(process.argv[2]).catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
