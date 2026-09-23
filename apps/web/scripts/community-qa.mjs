/**
 * Authenticated Community QA, driven programmatically.
 *
 * The runner owns the browser. Nothing here reads the desktop, guesses which
 * window is in front, or clicks screen coordinates: every navigation is
 * `page.goto`, every assertion is a DOM query, and the current URL is whatever
 * `page.url()` says it is. That is the whole reason this exists — an OS-level
 * automation layer cannot reliably tell you which page it is looking at, and a
 * QA pass that cannot name its own URL cannot report anything trustworthy.
 *
 * No new dependency: `playwright-core` is already a devDependency, and this
 * reuses the Edge/Chrome discovery the marketing capture scripts established
 * rather than downloading a browser.
 *
 * **Authentication.** It signs in through the product's own UI — the
 * Development login button on `/admin/login` — so the session is created by the
 * app, stored by the app, and identical to one a Google sign-in produces. This
 * script never mints, reads, or writes a token itself. See
 * docs/testing/development-admin-login.md, including why the account is
 * `admin.dev@mypetlink.local` and why its admin role is irrelevant to Community.
 *
 * The signed-in storage state is saved to a gitignored path and reused, so a
 * run costs one login rather than one per route.
 *
 * Usage, with the API and web dev servers already running:
 *   node apps/web/scripts/community-qa.mjs
 *   node apps/web/scripts/community-qa.mjs --responsive
 *   node apps/web/scripts/community-qa.mjs --headed --fresh-session
 */

import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(HERE, "..");
const SESSION_FILE = join(WEB_ROOT, "playwright", ".auth", "community.json");

const WEB = process.env.QA_WEB_ORIGIN ?? "http://localhost:3000";
const API = process.env.QA_API_ORIGIN ?? "http://localhost:5281";

/** The session key the app itself writes. Read only to assert it survives. */
const SESSION_KEY = "mypetlink_api_auth_session";

/**
 * Widths a signed-in owner actually uses, smallest first. 320 is the floor the
 * product supports; 768 and up exercise the desktop shell with its sidebar.
 */
const VIEWPORTS = [
  { w: 320, h: 640 },
  { w: 360, h: 800 },
  { w: 375, h: 812 },
  { w: 390, h: 844 },
  { w: 412, h: 915 },
  { w: 768, h: 900 },
  { w: 1024, h: 900 },
  { w: 1280, h: 900 },
];

const args = new Set(process.argv.slice(2));
const wantResponsive = args.has("--responsive");
const headless = !args.has("--headed");
const freshSession = args.has("--fresh-session");

function findBrowserExecutable() {
  return process.platform === "win32"
    ? [
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      ]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveExecutable() {
  for (const candidate of findBrowserExecutable()) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error("No supported Chrome or Edge executable was found.");
}

/** Fail early and specifically rather than after a confusing timeout. */
async function requireServers() {
  const problems = [];

  try {
    const response = await fetch(WEB, { redirect: "manual" });
    if (response.status >= 500) problems.push(`${WEB} returned ${response.status}`);
  } catch {
    problems.push(`${WEB} is not reachable — start the web dev server`);
  }

  try {
    // 404 is the correct answer when DevAuth is off; 200 means it is on. Both
    // prove the API is up, and only the second allows a sign-in.
    const response = await fetch(`${API}/api/v1/dev-auth/admin-login`, {
      method: "POST",
    });
    if (response.status === 404) {
      problems.push(
        `${API} is up but the Development login is disabled — see docs/testing/development-admin-login.md`
      );
    }
  } catch {
    problems.push(`${API} is not reachable — start the API`);
  }

  if (problems.length > 0) {
    throw new Error(`Cannot start QA:\n  - ${problems.join("\n  - ")}`);
  }
}

/**
 * One sign-in, through the product's own button.
 *
 * Deliberately the UI path rather than a direct call to the endpoint: it proves
 * the affordance works, and it leaves the session entirely in the app's hands.
 */
async function signIn(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${WEB}/admin/login`, { waitUntil: "domcontentloaded" });

  const devLogin = page.getByRole("button", { name: "Development login" });
  if ((await devLogin.count()) === 0) {
    throw new Error(
      "The Development login button is not rendered. Set NEXT_PUBLIC_DEV_AUTH_ENABLED=true in apps/web/.env.local and restart the web server."
    );
  }

  await devLogin.click();
  await page.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    SESSION_KEY,
    { timeout: 20000 }
  );

  await mkdir(dirname(SESSION_FILE), { recursive: true });
  await context.storageState({ path: SESSION_FILE });
  await context.close();
}

/** Who we are, from the app's own session. Never the token. */
async function describeViewer(page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      email: parsed?.user?.email ?? null,
      roles: parsed?.user?.roles ?? [],
    };
  }, SESSION_KEY);
}

/** Still signed in? The question every navigation has to keep answering. */
async function isAuthenticated(page) {
  return page.evaluate(
    (key) => Boolean(window.localStorage.getItem(key)),
    SESSION_KEY
  );
}

/**
 * Anything painting outside the viewport, ignoring containers that scroll on
 * purpose and the off-screen measurement row the tab strip uses.
 */
async function overflowReport(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("main *, header *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (el.closest('[class*="overflow-x-auto"], [class*="overflow-auto"]')) return false;
        if (el.closest('[aria-hidden="true"][class*="absolute"]')) return false;
        return r.right > vw + 1 || r.left < -1;
      })
      .slice(0, 5)
      .map((el) => `${el.tagName}.${String(el.className).slice(0, 48)}`);

    return {
      viewportWidth: vw,
      documentWidth: document.documentElement.scrollWidth,
      scrolls: document.documentElement.scrollWidth > vw + 1,
      offenders,
    };
  });
}

/**
 * Controls below the 24px minimum target size (WCAG 2.5.8 AA), which is also
 * the floor this codebase already sets for itself — `SocialPetCard` pads its
 * handle link specifically to clear it.
 *
 * A link flowing inside a sentence is exempt under that criterion and is
 * excluded here, so what remains is standalone controls that genuinely are too
 * small. Guessing a stricter number would bury those in noise.
 */
async function smallTargets(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("main button, main a[href], header button, header a[href]")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.height >= 24) return false;

        // Inline-in-text exemption: does the parent hold words beside the link?
        const beside = [...el.parentElement.childNodes]
          .filter((node) => node !== el && node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent.trim())
          .join("");
        return beside.length === 0;
      })
      .slice(0, 5)
      .map((el) => `${el.tagName} "${(el.textContent || "").trim().slice(0, 28)}" ${Math.round(el.getBoundingClientRect().height)}px`)
  );
}

/** Two elements drawn on top of one another in the page chrome. */
async function headerOverlap(page) {
  return page.evaluate(() => {
    const header = document.querySelector("header");
    if (!header) return null;
    const boxes = [...header.querySelectorAll("a, button")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0);

    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const hit =
          a.r.right > b.r.left + 1 &&
          b.r.right > a.r.left + 1 &&
          a.r.bottom > b.r.top + 1 &&
          b.r.bottom > a.r.top + 1;
        if (hit) {
          const label = (el) => `${el.tagName} "${(el.textContent || "").trim().slice(0, 20)}"`;
          return `${label(a.el)} overlaps ${label(b.el)}`;
        }
      }
    }
    return null;
  });
}

/**
 * The routes to prove reachable. Two are resolved at run time because their
 * addresses belong to the seeded data rather than to this script.
 */
async function resolveRoutes(page) {
  await page.goto(`${WEB}/community/profile`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const handle = await page.evaluate(() => {
    const match = document.body.innerText.match(/@([a-z0-9_.-]+)/i);
    return match ? match[1] : null;
  });

  await page.goto(`${WEB}/feed`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const momentId = await page.evaluate(() => {
    const link = document.querySelector('a[href^="/moments/"]');
    return link ? link.getAttribute("href").split("/").pop() : null;
  });

  return [
    { name: "feed", path: "/feed" },
    { name: "explore", path: "/explore" },
    { name: "community profile", path: "/community/profile" },
    { name: "community profile edit", path: "/community/profile/edit" },
    { name: "notifications", path: "/notifications" },
    handle
      ? { name: "public profile", path: `/u/${handle}` }
      : { name: "public profile", path: null, skip: "no handle on the signed-in profile" },
    momentId
      ? { name: "moment detail", path: `/moments/${momentId}` }
      : { name: "moment detail", path: null, skip: "no Moment link in the feed" },
  ];
}

async function visit(page, path) {
  await page.goto(`${WEB}${path}`, { waitUntil: "domcontentloaded" });
  // The Community views fetch after mount; give them a beat to settle.
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function main() {
  await requireServers();

  if (freshSession) await rm(SESSION_FILE, { force: true });

  const executablePath = await resolveExecutable();
  const browser = await chromium.launch({ executablePath, headless });

  try {
    if (!(await exists(SESSION_FILE))) {
      process.stdout.write("Signing in through the Development login...\n");
      await signIn(browser);
    } else {
      process.stdout.write("Reusing the saved signed-in state.\n");
    }

    const context = await browser.newContext({
      storageState: SESSION_FILE,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    const routes = await resolveRoutes(page);
    const viewer = await describeViewer(page);
    process.stdout.write(
      `\nSigned in as ${viewer?.email ?? "unknown"} (${(viewer?.roles ?? []).join(", ")})\n\n`
    );

    let failures = 0;

    process.stdout.write("Route reachability\n");
    for (const route of routes) {
      if (!route.path) {
        process.stdout.write(`  SKIP  ${route.name} — ${route.skip}\n`);
        continue;
      }

      await visit(page, route.path);
      const stillIn = await isAuthenticated(page);
      const landed = new URL(page.url()).pathname;
      const bouncedToLogin = landed.startsWith("/login");
      const ok = stillIn && !bouncedToLogin;
      if (!ok) failures += 1;

      process.stdout.write(
        `  ${ok ? "OK  " : "FAIL"}  ${route.name.padEnd(24)} ${route.path.padEnd(34)} -> ${landed}${stillIn ? "" : "  [session lost]"}\n`
      );
    }

    if (wantResponsive) {
      process.stdout.write("\nResponsive sweep (authenticated)\n");
      const sweepRoutes = routes.filter((route) => route.path);

      for (const { w, h } of VIEWPORTS) {
        await page.setViewportSize({ width: w, height: h });
        const notes = [];

        for (const route of sweepRoutes) {
          await visit(page, route.path);
          const [overflow, overlap, small, stillIn] = await Promise.all([
            overflowReport(page),
            headerOverlap(page),
            smallTargets(page),
            isAuthenticated(page),
          ]);

          if (overflow.scrolls) {
            notes.push(
              `${route.name}: scrolls ${overflow.documentWidth}>${overflow.viewportWidth} ${overflow.offenders.join(", ")}`
            );
          }
          if (overlap) notes.push(`${route.name}: ${overlap}`);
          if (small.length > 0) notes.push(`${route.name}: small targets ${small.join("; ")}`);
          if (!stillIn) notes.push(`${route.name}: SESSION LOST`);
        }

        if (notes.length > 0) failures += notes.length;
        process.stdout.write(
          notes.length === 0
            ? `  OK    ${w}x${h}\n`
            : `  NOTE  ${w}x${h}\n${notes.map((note) => `          ${note}`).join("\n")}\n`
        );
      }
    }

    await context.close();

    process.stdout.write(
      failures === 0
        ? "\nCommunity QA passed.\n"
        : `\nCommunity QA finished with ${failures} note(s) above.\n`
    );
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
