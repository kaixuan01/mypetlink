import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import {
  ensureDir,
  ffmpeg,
  pathExists,
  productionRoot,
  readJson,
  repoRoot,
  run,
} from "./common.mjs";

function parseArgs(argv) {
  const args = { scene: argv[0], mode: "both", baseUrl: "http://localhost:3000" };
  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--base-url") args.baseUrl = argv[++index];
    else if (value === "--storage-state") args.storageState = argv[++index];
    else if (value === "--mode") args.mode = argv[++index];
    else if (value === "--output-dir") args.outputDir = argv[++index];
    else if (value === "--headed") args.headless = false;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.scene) throw new Error("Usage: npm run xhs:capture -- <scene> [--base-url URL] [--storage-state FILE] [--mode screenshot|video|both]");
  if (!new Set(["screenshot", "video", "both"]).has(args.mode)) throw new Error("--mode must be screenshot, video, or both");
  return args;
}

function isSafeAuthenticatedHost(baseUrl) {
  const host = new URL(baseUrl).hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost") || host.includes("staging") || host.includes("qa");
}

function findBrowserExecutable() {
  const candidates = process.platform === "win32"
    ? [
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      ]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates;
}

async function waitForStablePage(page, imageTimeoutMs) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.evaluate(async (timeoutMs) => {
    if (document.fonts?.ready) await document.fonts.ready;
    const images = [...document.images];
    await Promise.race([
      Promise.all(images.map((image) => image.complete ? undefined : new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      }))),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }, imageTimeoutMs);
}

async function executeAction(page, action, defaultPauseMs) {
  if (action.type === "wait") {
    await page.waitForTimeout(action.ms ?? defaultPauseMs);
  } else if (action.type === "click") {
    const locator = action.role
      ? page.getByRole(action.role, { name: action.name, exact: action.exact ?? false })
      : page.locator(action.selector);
    await locator.first().click();
    await page.waitForTimeout(action.pauseMs ?? defaultPauseMs);
  } else if (action.type === "scroll") {
    const start = await page.evaluate(() => window.scrollY);
    const target = start + action.y;
    const duration = action.durationMs ?? 900;
    await page.evaluate(async ({ startY, targetY, durationMs }) => {
      await new Promise((resolve) => {
        const started = performance.now();
        const tick = (now) => {
          const progress = Math.min(1, (now - started) / durationMs);
          const eased = 1 - Math.pow(1 - progress, 3);
          window.scrollTo(0, startY + (targetY - startY) * eased);
          if (progress < 1) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame(tick);
      });
    }, { startY: start, targetY: target, durationMs: duration });
  } else {
    throw new Error(`Unsupported action type: ${action.type}`);
  }
}

function detectPrivateText(text) {
  const findings = [];
  const allowedPublishedEmails = new Set(["support@mypetlink.com.my"]);
  const emails = (text.match(/\b[A-Z0-9._%+-]+@(?!example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? [])
    .filter((email) => !allowedPublishedEmails.has(email.toLowerCase()));
  const phones = text.match(/(?:\+?60|0)1\d[-\s]?\d{3,4}[-\s]?\d{4}\b/g) ?? [];
  if (emails.length) findings.push(`${emails.length} email-like value(s)`);
  if (phones.length) findings.push(`${phones.length} Malaysia phone-like value(s)`);
  return findings;
}

export async function captureScene(argv) {
  const args = parseArgs(argv);
  const config = await readJson(path.join(productionRoot, "config", "capture-scenes.json"));
  const scene = config.scenes[args.scene];
  if (!scene) throw new Error(`Unknown scene '${args.scene}'. Available: ${Object.keys(config.scenes).join(", ")}`);
  const authRequired = scene.auth === "storage-state";
  if (authRequired && !args.storageState) throw new Error("This scene requires an approved Playwright storage-state file. Authentication will not be bypassed.");
  if (authRequired && !isSafeAuthenticatedHost(args.baseUrl)) throw new Error("Authenticated capture is restricted to localhost, QA, or staging hosts to prevent production-user exposure.");
  if (args.storageState && !(await pathExists(path.resolve(args.storageState)))) throw new Error(`Storage-state file not found: ${args.storageState}`);
  const scenePath = scene.path ?? process.env[scene.pathEnv];
  if (!scenePath) throw new Error(`Set ${scene.pathEnv} to the approved route for this scene.`);
  if (!scenePath.startsWith("/")) throw new Error("Scene path must be a route beginning with '/'.");

  const wantsVideo = args.mode === "video" || args.mode === "both";
  const outputDir = args.outputDir
    ? path.resolve(args.outputDir)
    : path.join(productionRoot, "generated", "captures", args.scene);
  await ensureDir(outputDir);
  const recordingDir = wantsVideo
    ? path.join(outputDir, `.recording-${Date.now()}`)
    : null;
  if (recordingDir) await ensureDir(recordingDir);
  const [executablePath] = (await Promise.all(findBrowserExecutable().map(async (candidate) => (await pathExists(candidate)) ? candidate : null))).filter(Boolean);
  if (!executablePath) throw new Error("No supported Chrome or Edge executable was found.");

  const browser = await chromium.launch({ executablePath, headless: args.headless !== false, args: ["--hide-scrollbars"] });
  const context = await browser.newContext({
    viewport: config.defaults.viewport,
    screen: config.defaults.viewport,
    locale: config.defaults.locale,
    timezoneId: config.defaults.timezoneId,
    deviceScaleFactor: config.defaults.deviceScaleFactor,
    reducedMotion: "reduce",
    colorScheme: "light",
    storageState: args.storageState ? path.resolve(args.storageState) : undefined,
    recordVideo: wantsVideo ? { dir: recordingDir, size: config.defaults.viewport } : undefined,
  });
  let page;
  let captureSucceeded = false;
  try {
    page = await context.newPage();
    await page.goto(new URL(scenePath, args.baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await waitForStablePage(page, config.defaults.imageTimeoutMs);
    const initialFindings = detectPrivateText(await page.locator("body").innerText());
    if (initialFindings.length) throw new Error(`Privacy guard stopped capture: ${initialFindings.join(", ")}. Use a sanitized QA/sample profile.`);
    if (args.mode === "screenshot" || args.mode === "both") {
      await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
      await page.screenshot({ path: path.join(outputDir, `${args.scene}.png`), fullPage: false });
    }
    if (wantsVideo) {
      for (const action of scene.actions ?? []) await executeAction(page, action, config.defaults.pauseMs);
      const finalFindings = detectPrivateText(await page.locator("body").innerText());
      if (finalFindings.length) throw new Error(`Privacy guard stopped capture: ${finalFindings.join(", ")}.`);
    }
    captureSucceeded = true;
  } finally {
    if (page) await page.close();
    await context.close();
    await browser.close();
    if (!captureSucceeded && recordingDir) {
      await fs.rm(recordingDir, { recursive: true, force: true });
    }
  }

  if (wantsVideo) {
    const webmFiles = (await fs.readdir(recordingDir)).filter((name) => name.endsWith(".webm"));
    if (webmFiles.length !== 1) throw new Error(`Expected one browser recording, found ${webmFiles.length}.`);
    const webm = path.join(recordingDir, webmFiles[0]);
    const mp4 = path.join(outputDir, `${args.scene}.mp4`);
    await run(ffmpeg, [
      "-y",
      "-i",
      webm,
      "-vf",
      `scale=${config.defaults.output.width}:${config.defaults.output.height}:flags=lanczos,fps=30,format=yuv420p`,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-an",
      "-movflags",
      "+faststart",
      mp4,
    ], { quiet: true });
    await fs.rm(recordingDir, { recursive: true, force: true });
  }
  console.log(`Captured ${args.scene} to ${path.relative(repoRoot, outputDir)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  captureScene(process.argv.slice(2)).catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
