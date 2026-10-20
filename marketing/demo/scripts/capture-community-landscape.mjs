/** Record the real local Community Explore page at a tablet-native 16:10 ratio. */

import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import ffmpegPath from "ffmpeg-static";
import { detectPrivateText } from "./privacy-guard.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const outputDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(repoRoot, "marketing", "demo", "output", "landscape");
const baseUrl = "http://localhost:3000";
const width = Number.parseInt(process.argv[3] ?? "1280", 10);
const height = Number.parseInt(process.argv[4] ?? "800", 10);
if (!Number.isInteger(width) || !Number.isInteger(height) || width < 600 || height < 500) {
  throw new Error("Usage: capture-community-landscape.mjs [outputDir] [width>=600] [height>=500]");
}
const viewport = { width, height };
const captureName = `mpl-v001-community-${width}x${height}`;
const allowedContact = [
  "+601110000000",
  "+60 11-1000 0000",
  "support@mypetlink.com.my",
];

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with ${code}\n${stderr}`)),
    );
  });
}

async function smoothScroll(page, deltaY, durationMs) {
  await page.evaluate(
    async ({ delta, duration }) => {
      const startY = window.scrollY;
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const targetY = Math.min(maxY, startY + delta);
      await new Promise((resolve) => {
        const started = performance.now();
        const tick = (now) => {
          const progress = Math.min(1, (now - started) / duration);
          const eased = progress < 0.5
            ? 4 * progress ** 3
            : 1 - (-2 * progress + 2) ** 3 / 2;
          window.scrollTo(0, startY + (targetY - startY) * eased);
          if (progress < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
    },
    { delta: deltaY, duration: durationMs },
  );
}

await fs.mkdir(outputDir, { recursive: true });
const recordingDir = path.join(outputDir, `.recording-${Date.now()}`);
await fs.mkdir(recordingDir, { recursive: true });

const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--hide-scrollbars"],
});
const context = await browser.newContext({
  viewport,
  screen: viewport,
  deviceScaleFactor: 1,
  locale: "en-MY",
  timezoneId: "Asia/Kuala_Lumpur",
  colorScheme: "light",
  recordVideo: { dir: recordingDir, size: viewport },
});

let page;
let leadInMs = 0;
let performanceMs = 0;
try {
  page = await context.newPage();
  const videoStartedAt = Date.now();
  await page.goto(`${baseUrl}/explore`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.race([
      Promise.all([...document.images].map((image) => image.decode?.().catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
  });
  await page.addStyleTag({
    content: "nextjs-portal,[data-nextjs-dev-tools-button],#__next-build-watcher{display:none!important}",
  });
  const openingText = await page.locator("body").innerText();
  const findings = detectPrivateText(openingText, allowedContact);
  if (findings.length) throw new Error(`Privacy guard: ${findings.join("; ")}`);
  for (const expected of ["Explore", "Linko", "Linky", "@mypetlink"]) {
    if (!openingText.includes(expected)) throw new Error(`Community page is missing ${expected}`);
  }
  await page.screenshot({
    path: path.join(outputDir, `${captureName}.png`),
    fullPage: false,
  });
  await page.waitForTimeout(700);
  leadInMs = Date.now() - videoStartedAt;
  const performanceStartedAt = Date.now();
  await page.waitForTimeout(650);
  await smoothScroll(page, 300, 1700);
  await page.waitForTimeout(650);
  await smoothScroll(page, 360, 1700);
  await page.waitForTimeout(750);
  performanceMs = Date.now() - performanceStartedAt;
  const finalFindings = detectPrivateText(await page.locator("body").innerText(), allowedContact);
  if (finalFindings.length) throw new Error(`Privacy guard: ${finalFindings.join("; ")}`);
} finally {
  if (page) await page.close();
  await context.close();
  await browser.close();
}

const recordings = (await fs.readdir(recordingDir)).filter((name) => name.endsWith(".webm"));
if (recordings.length !== 1) throw new Error(`Expected one recording, found ${recordings.length}`);
const raw = path.join(recordingDir, recordings[0]);
const output = path.join(outputDir, `${captureName}.mp4`);
const start = Math.max(0, leadInMs - 250) / 1000;
const duration = (performanceMs + 500) / 1000;
await run(ffmpegPath, [
  "-y", "-ss", start.toFixed(3), "-t", duration.toFixed(3), "-i", raw,
  "-vf", "fps=30,format=yuv420p",
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-an", "-movflags", "+faststart",
  output,
]);
await fs.rm(recordingDir, { recursive: true, force: true });
console.log(JSON.stringify({ output, viewport, durationSeconds: duration }, null, 2));
