/**
 * Records the MyPetLink brand clips from the running local app.
 *
 *   node marketing/demo/scripts/capture.mjs mpl-v001
 *   node marketing/demo/scripts/capture.mjs mpl-v001 --scene community
 *
 * Deliberately separate from the Xiaohongshu production scripts next door.
 * Those are bound to that channel's post workspaces and asset manifests; this
 * one records four fixed brand scenes from a database that exists only to be
 * filmed. They share conventions — the same 9:16 mobile viewport, the same
 * refusal to record anything that looks like personal data — not code.
 *
 * What comes out, per scene:
 *   <batch>/<batch>-<scene>.webm   the browser's own recording, 1080x1920
 *   <batch>/<batch>-<scene>.mp4    H.264, for editors that dislike webm
 *   <batch>/<batch>-<scene>.png    a still of the opening frame
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { chromium } from "playwright-core";
import { detectPrivateText } from "./privacy-guard.mjs";
import { resolveOutputRoot } from "./output-root.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const demoRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(demoRoot, "..", "..");

function parseArgs(argv) {
  const args = { batch: undefined, baseUrl: "http://localhost:3000", headless: true, scenes: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--base-url") args.baseUrl = argv[++index];
    else if (value === "--scene") args.scenes.push(argv[++index]);
    else if (value === "--output-dir") args.outputDir = argv[++index];
    else if (value === "--headed") args.headless = false;
    else if (!args.batch) args.batch = value;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.batch) {
    throw new Error(
      "Usage: node marketing/demo/scripts/capture.mjs <batch> [--scene NAME] [--base-url URL] [--headed]",
    );
  }
  return args;
}

/**
 * Recording is restricted to a local host.
 *
 * Not a formality. These clips are published, and the only thing standing
 * between "record the brand profile" and "record whatever is on production
 * right now, including a real customer's pet" is this check.
 */
function assertLocalHost(baseUrl) {
  const host = new URL(baseUrl).hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
  if (!isLocal) {
    throw new Error(
      `Marketing capture only runs against a local host, not ${host}. `
        + "The demo profile exists locally; anything else is real data.",
    );
  }
}

function findBrowserExecutable() {
  return process.platform === "win32"
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      ]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve({ stdout, stderr })
        : reject(new Error(`${path.basename(command)} exited with ${code}\n${stderr}`)),
    );
  });
}


/**
 * A page that has genuinely finished: navigation done, network quiet, webfonts
 * swapped in and every image decoded.
 *
 * Skeletons are the usual way a capture is wasted — the recording starts, the
 * placeholder shimmer plays for two of the four seconds, and the clip is
 * unusable. Waiting for `img.decode()` rather than `load` also means the first
 * frame is painted, not merely fetched.
 */
async function waitForStablePage(page, timeoutMs) {
  await page.waitForLoadState("domcontentloaded");
  // Short, and failure is fine. Some pages never go fully idle, and waiting the
  // whole image budget for one of those buys nothing — the decode wait below is
  // what actually establishes that there is a picture on screen.
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
  await page.evaluate(async (budgetMs) => {
    if (document.fonts?.ready) await document.fonts.ready;
    const images = [...document.images];
    await Promise.race([
      Promise.all(
        images.map((image) =>
          image.decode ? image.decode().catch(() => undefined) : Promise.resolve(),
        ),
      ),
      new Promise((resolve) => setTimeout(resolve, budgetMs)),
    ]);
  }, timeoutMs);
}

/**
 * An eased scroll, because a jump-cut scroll reads as automation.
 *
 * `requestAnimationFrame` rather than `scrollTo({behavior:"smooth"})` so the
 * duration is ours: the browser's smooth scroll picks its own speed and a
 * four-second clip has no room for it to guess wrong.
 */
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
          // Ease in and out, so it starts and stops like a thumb rather than a
          // motor.
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

async function captureScene({ scene, sceneName, config, args, outputDir, executablePath }) {
  const recordingDir = path.join(outputDir, `.recording-${sceneName}-${Date.now()}`);
  await fs.mkdir(recordingDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath,
    headless: args.headless,
    args: ["--hide-scrollbars", "--force-device-scale-factor=2"],
  });

  const context = await browser.newContext({
    viewport: config.defaults.viewport,
    screen: config.defaults.viewport,
    deviceScaleFactor: config.defaults.deviceScaleFactor,
    isMobile: false,
    locale: config.defaults.locale,
    timezoneId: config.defaults.timezoneId,
    colorScheme: "light",
    recordVideo: { dir: recordingDir, size: config.defaults.video },
  });

  let succeeded = false;
  let page;
  let leadInMs = 0;
  let performanceMs = 0;
  try {
    page = await context.newPage();

    // The recording starts here, with the page blank, and runs until the context
    // closes — so it contains the navigation, the wait for images and the
    // teardown as well as the part worth keeping. Timing the phases lets the
    // finished clip be cut back to exactly the scripted performance, which is
    // why a four-second scene does not arrive as a twenty-eight-second file
    // with a white screen at the front.
    const videoStartedAt = Date.now();
    const url = new URL(scene.path, args.baseUrl).toString();

    // The HTTP status is deliberately not asserted. `next dev` answers 404 for
    // any dynamic segment missing from generateStaticParams — which every
    // runtime-created pet is — and then renders the page anyway through the
    // runtime route fallback. See the note in apps/web/next.config.ts. What the
    // page actually says is the real signal, so `expectText` below carries the
    // assertion instead.
    await page.goto(url, { waitUntil: "domcontentloaded" });

    await waitForStablePage(page, config.defaults.imageTimeoutMs);

    const bodyText = await page.locator("body").innerText();
    const findings = detectPrivateText(bodyText, config.allowedContact);
    if (findings.length) {
      throw new Error(
        `Privacy guard stopped the capture of '${sceneName}': ${findings.join("; ")}. `
          + "Record against the marketing demo database only.",
      );
    }
    // Proof that this is the page we meant to film, and that it has real
    // content on it rather than a skeleton, an empty state or an error.
    for (const expected of scene.expectText ?? []) {
      if (!bodyText.includes(expected)) {
        throw new Error(
          `'${sceneName}' does not show ${JSON.stringify(expected)}. `
            + "Check that the API is running against the marketing demo database and has seeded the profile.",
        );
      }
    }
    if (/something went wrong|couldn.t connect|try again/i.test(bodyText)) {
      throw new Error(`'${sceneName}' is showing an error message. Check that the API is running.`);
    }

    // A still of the opening frame, useful as a thumbnail and as evidence of
    // what was on screen when the recording began.
    await page.screenshot({ path: path.join(outputDir, `${args.batch}-${sceneName}.png`) });

    // `next dev` paints a development indicator over the bottom-left corner of
    // every page, and it sits right on top of the Safety Profile's contact
    // buttons. Hidden for the recording rather than switched off in
    // next.config, because it is a useful thing to have while developing and a
    // capture should not quietly change how the app behaves for everyone else.
    await page.addStyleTag({
      content: "nextjs-portal,[data-nextjs-dev-tools-button],#__next-build-watcher{display:none!important}",
    });

    await page.waitForTimeout(config.defaults.settleMs);

    leadInMs = Date.now() - videoStartedAt;
    const performanceStartedAt = Date.now();
    for (const action of scene.actions ?? []) {
      if (action.type === "wait") await page.waitForTimeout(action.ms);
      else if (action.type === "scroll") await smoothScroll(page, action.y, action.durationMs);
      else throw new Error(`Unsupported action type: ${action.type}`);
    }
    performanceMs = Date.now() - performanceStartedAt;

    const finalFindings = detectPrivateText(await page.locator("body").innerText(), config.allowedContact);
    if (finalFindings.length) {
      throw new Error(`Privacy guard stopped the capture of '${sceneName}': ${finalFindings.join("; ")}.`);
    }

    succeeded = true;
  } finally {
    if (page) await page.close();
    await context.close();
    await browser.close();
    // In the finally, because a scene that throws would otherwise leave its raw
    // recording behind: the throw skips everything after the try block.
    if (!succeeded) await fs.rm(recordingDir, { recursive: true, force: true });
  }

  const recordings = (await fs.readdir(recordingDir)).filter((name) => name.endsWith(".webm"));
  if (recordings.length !== 1) {
    await fs.rm(recordingDir, { recursive: true, force: true });
    throw new Error(`Expected one recording for '${sceneName}', found ${recordings.length}.`);
  }

  const raw = path.join(recordingDir, recordings[0]);
  const webm = path.join(outputDir, `${args.batch}-${sceneName}.webm`);
  const mp4 = path.join(outputDir, `${args.batch}-${sceneName}.mp4`);

  // Cut to the scripted performance, with a little air either side so the clip
  // does not begin on the first pixel of movement or end on the last.
  const preRollMs = 250;
  const start = Math.max(0, leadInMs - preRollMs) / 1000;
  const duration = (performanceMs + preRollMs * 2) / 1000;

  // Seeking before -i is the fast path and is frame-accurate for a re-encode.
  // No scaling anywhere: the recording is already 1080x1920, so touching the
  // geometry would only soften it.
  await fs.rm(webm, { force: true });
  await run(ffmpegPath, [
    "-y", "-ss", start.toFixed(3), "-t", duration.toFixed(3), "-i", raw,
    "-vf", "fps=30,format=yuv420p",
    "-c:v", "libvpx-vp9", "-crf", "28", "-b:v", "0", "-row-mt", "1", "-cpu-used", "4",
    "-an",
    webm,
  ]);

  await fs.rm(mp4, { force: true });
  await run(ffmpegPath, [
    "-y", "-ss", start.toFixed(3), "-t", duration.toFixed(3), "-i", raw,
    "-vf", "fps=30,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18",
    "-an", "-movflags", "+faststart",
    mp4,
  ]);

  await fs.rm(recordingDir, { recursive: true, force: true });

  const probe = JSON.parse(
    (await run(ffprobeStatic.path, ["-v", "error", "-show_streams", "-show_format", "-of", "json", webm])).stdout,
  );
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  return {
    scene: sceneName,
    seconds: Number(probe.format.duration),
    width: video?.width,
    height: video?.height,
    webm,
    mp4,
  };
}

export async function main(argv) {
  const args = parseArgs(argv);
  assertLocalHost(args.baseUrl);

  const config = JSON.parse(
    await fs.readFile(path.join(demoRoot, "config", "capture-scenes.json"), "utf8"),
  );

  const sceneNames = args.scenes.length ? args.scenes : config.batches[args.batch];
  if (!sceneNames) {
    throw new Error(
      `Unknown batch '${args.batch}'. Known batches: ${Object.keys(config.batches).join(", ")}. `
        + "Add it to marketing/demo/config/capture-scenes.json, or name scenes with --scene.",
    );
  }
  for (const name of sceneNames) {
    if (!config.scenes[name]) {
      throw new Error(`Unknown scene '${name}'. Known scenes: ${Object.keys(config.scenes).join(", ")}.`);
    }
  }

  const [executablePath] = (
    await Promise.all(findBrowserExecutable().map(async (c) => ((await pathExists(c)) ? c : null)))
  ).filter(Boolean);
  if (!executablePath) throw new Error("No supported Chrome or Edge executable was found.");

  // Video is large and this repository lives on a drive better spent on source,
  // so where it lands is configuration rather than a fixed path. See
  // output-root.mjs for the order of precedence.
  const { root: outputRoot, source: outputRootSource, warning } = await resolveOutputRoot({
    explicit: args.outputDir,
  });
  if (warning) console.warn(`\n${warning}\n`);

  // An explicit --output-dir names the folder itself; a root gets the batch
  // appended, so one root holds every batch side by side.
  const outputDir = args.outputDir ? outputRoot : path.join(outputRoot, args.batch);
  await fs.mkdir(outputDir, { recursive: true });
  console.log(`Output: ${outputDir}  (from ${outputRootSource})`);

  // Raw recordings from an interrupted run, which would otherwise sit in the
  // output folder looking like results.
  for (const entry of await fs.readdir(outputDir)) {
    if (entry.startsWith(".recording-")) {
      await fs.rm(path.join(outputDir, entry), { recursive: true, force: true });
    }
  }

  const results = [];
  for (const sceneName of sceneNames) {
    process.stdout.write(`Recording ${sceneName} ... `);
    const result = await captureScene({
      scene: config.scenes[sceneName],
      sceneName,
      config,
      args,
      outputDir,
      executablePath,
    });
    results.push(result);
    const [min, max] = config.scenes[sceneName].targetSeconds;
    const withinTarget = result.seconds >= min && result.seconds <= max;
    console.log(
      `${result.seconds.toFixed(1)}s ${result.width}x${result.height}`
        + (withinTarget ? "" : `  (outside the ${min}-${max}s target)`),
    );
  }

  // Printed absolute, not repository-relative: the output root normally lives on
  // another drive, where a relative path would be a string of "..".
  console.log(`\nWrote ${results.length} clips to ${outputDir}`);
  const offTarget = results.filter((result) => {
    const [min, max] = config.scenes[result.scene].targetSeconds;
    return result.seconds < min || result.seconds > max;
  });
  if (offTarget.length) {
    console.log(
      "\nSome clips fell outside their target length. Adjust that scene's wait/scroll\n"
        + "durations in marketing/demo/config/capture-scenes.json and record it again with --scene.",
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
