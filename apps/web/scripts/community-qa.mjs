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
 * **Authentication.** It signs in through the product's own `/login` UI and
 * its separately-labelled, development-only sign-in button, so the session is
 * created by the app, stored by the app, and identical to one a Google sign-in
 * produces. This script never mints, reads, or writes a token itself. See
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
 *
 * The interaction pass uses @quietpaws as a disposable relationship. The
 * development seed deliberately leaves that household unfollowed by the QA
 * account, and its discoverability switch is off. The runner follows it,
 * proves Block removes the follow, then unblocks it. A finally block restores
 * that unfollowed/unblocked baseline if an assertion fails after the first
 * mutation. Search and Explore are expected to hide it throughout, which also
 * proves the destructive pass never weakens its existing discovery privacy.
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

const BLOCK_QA = {
  displayName: "Quiet Paws",
  handle: "quietpaws",
  momentTitle: "Morning song",
};

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
async function signIn(browser, returnTo = "/feed") {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.goto(
    `${WEB}/login?redirect=${encodeURIComponent(returnTo)}`,
    { waitUntil: "domcontentloaded" }
  );

  const devLogin = page.getByTestId("owner-development-login");
  if ((await devLogin.count()) === 0) {
    throw new Error(
      "The owner Development sign in button is not rendered. Set NEXT_PUBLIC_DEV_AUTH_ENABLED=true in apps/web/.env.local and restart the web server."
    );
  }

  await devLogin.click();
  await page.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    SESSION_KEY,
    { timeout: 20000 }
  );
  await page.waitForURL(
    (url) => `${url.pathname}${url.search}${url.hash}` === returnTo,
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function responsePath(response) {
  return new URL(response.url()).pathname;
}

async function responseData(response) {
  const payload = await response.json();
  return payload?.data ?? payload;
}

async function loadBlockTarget(page) {
  const relationshipResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      responsePath(response) ===
        `/api/v1/social/owners/${BLOCK_QA.handle}/relationship` &&
      response.status() === 200
  );

  await visit(page, `/u/${BLOCK_QA.handle}`);
  await page.getByRole("heading", { name: BLOCK_QA.displayName }).waitFor();
  return responseData(await relationshipResponse);
}

async function ownerSearchContains(page, handle) {
  await visit(page, `/search?q=${encodeURIComponent(handle)}`);
  await page.getByRole("button", { name: /Pet Parents/ }).click();
  await Promise.race([
    page.getByTestId("search-owners").waitFor(),
    page.getByTestId("search-owners-empty").waitFor(),
  ]);

  return page.getByText(`@${handle}`, { exact: false }).count().then((count) => count > 0);
}

async function routeContains(page, path, text) {
  await visit(page, path);
  return page.getByText(text, { exact: false }).count().then((count) => count > 0);
}

async function clickProfileMenuAction(page, action) {
  await page.getByTestId("owner-profile-menu-trigger").click();
  await page.getByRole("menuitem", { name: action }).click();
}

async function confirmRelationshipAction(page, action, method, path) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      responsePath(response) === path
  );
  const dialog = page.getByRole("dialog", { name: new RegExp(`^${action} `) });
  await dialog.getByRole("button", { name: action, exact: true }).click();
  const response = await responsePromise;
  assert(response.ok(), `${action} returned HTTP ${response.status()}.`);
  return responseData(response);
}

async function cleanupBlockQaRelationship(page, state) {
  if (!state.blockCreated && !state.followCreated) return;

  await visit(page, `/u/${BLOCK_QA.handle}`);
  await page.getByRole("heading", { name: BLOCK_QA.displayName }).waitFor();

  if (state.blockCreated) {
    await page.getByTestId("owner-profile-menu-trigger").click();
    const unblock = page.getByRole("menuitem", {
      name: `Unblock @${BLOCK_QA.handle}`,
    });
    if ((await unblock.count()) > 0) {
      await unblock.click();
      await confirmRelationshipAction(
        page,
        "Unblock",
        "DELETE",
        `/api/v1/social/owners/${BLOCK_QA.handle}/block`
      );
    } else {
      await page.keyboard.press("Escape");
    }
    state.blockCreated = false;
  }

  // Blocking should already have removed the temporary follow. This is a
  // recovery guard for a failed or interrupted assertion, not another product
  // expectation.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const following = page.getByRole("button", {
    name: new RegExp(`^Stop following ${BLOCK_QA.displayName}`),
  });
  if ((await following.count()) > 0) {
    const unfollowResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        responsePath(response) ===
          `/api/v1/social/owners/${BLOCK_QA.handle}/follow`
    );
    await following.click();
    await unfollowResponse;
  }
  state.followCreated = false;
}

function currentDestination(page) {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}${url.hash}`;
}

function expectedLoginPath(returnTo) {
  return `/login?redirect=${encodeURIComponent(returnTo)}`;
}

async function assertLoginTarget(page, returnTo) {
  await page.waitForURL((url) => url.pathname === "/login", { timeout: 20000 });
  const url = new URL(page.url());
  assert(
    url.searchParams.get("redirect") === returnTo,
    `Login preserved ${url.searchParams.get("redirect")}, expected ${returnTo}.`
  );
  await page.getByTestId("community-login-context").waitFor();
}

async function completeDevelopmentSignIn(page, returnTo) {
  const signIn = page.getByTestId("owner-development-login");
  await signIn.waitFor();
  await signIn.click();
  await page.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    SESSION_KEY,
    { timeout: 20000 }
  );
  await page.waitForURL(
    (url) => `${url.pathname}${url.search}${url.hash}` === returnTo,
    { timeout: 20000 }
  );
  assert(
    !currentDestination(page).startsWith("/pets") &&
      currentDestination(page) !== "/dashboard",
    `Sign-in lost Community context at ${currentDestination(page)}.`
  );
}

async function openAnonymousPage(browser, path, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await visit(page, path);
  assert(!(await isAuthenticated(page)), `${path} unexpectedly started signed in.`);
  return { context, page };
}

async function discoverAnonymousMoment(browser) {
  const { context, page } = await openAnonymousPage(browser, "/explore?source=c5");

  try {
    const card = page
      .locator(
        '[data-testid="social-moment-card"], [data-testid="social-moment-tile"]'
      )
      .first();
    await card.waitFor();
    const likeLabel =
      (await card.getByTestId("like-button-signin").getAttribute("aria-label")) ??
      "";
    const title = /^Sign in to like (.+)\. \d+ likes?\.$/.exec(likeLabel)?.[1];
    const route = await card.locator('a[href^="/moments/"]').first().getAttribute("href");
    assert(title && route, "Explore did not expose a public Moment for C5 QA.");
    return { route, title };
  } finally {
    await context.close();
  }
}

async function verifyAnonymousFollow(browser) {
  const returnTo = `/u/${BLOCK_QA.handle}?source=c5-follow`;
  const { context, page } = await openAnonymousPage(browser, returnTo);
  let followWrites = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith(`/${BLOCK_QA.handle}/follow`)
    ) {
      followWrites += 1;
    }
  });

  try {
    const gate = page.getByTestId("follow-button-signin");
    await gate.waitFor();
    assert(
      (await gate.getAttribute("aria-label")) ===
        `Sign in to follow ${BLOCK_QA.displayName}`,
      "Anonymous Follow did not identify its sign-in requirement."
    );
    assert(
      (await gate.getAttribute("href")) === expectedLoginPath(returnTo),
      "Anonymous Follow did not preserve its full origin route."
    );

    await gate.click();
    await assertLoginTarget(page, returnTo);

    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => `${url.pathname}${url.search}` === returnTo);
    await page.getByTestId("follow-button-signin").waitFor();
    assert(!(await isAuthenticated(page)), "Browser Back left a half-authenticated session.");

    await page.getByTestId("follow-button-signin").click();
    await assertLoginTarget(page, returnTo);
    await completeDevelopmentSignIn(page, returnTo);
    await page.getByTestId("follow-button").waitFor();
    assert(
      (await page.getByTestId("follow-button").getAttribute("data-following")) ===
        "false",
      "Follow ran automatically after login."
    );
    assert(followWrites === 0, `Follow wrote ${followWrites} time(s) during login.`);

    return { backReturned: true, returnTo };
  } finally {
    await context.close();
  }
}

async function verifyAnonymousLike(browser, sourceRoute, title) {
  const { context, page } = await openAnonymousPage(browser, sourceRoute);
  let likeWrites = 0;
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "POST" && pathname.endsWith("/like")) {
      likeWrites += 1;
    }
  });

  try {
    const gate = page.getByRole("link", {
      name: new RegExp(`^Sign in to like ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`),
    });
    await gate.first().waitFor();
    assert(
      (await gate.first().getAttribute("href")) === expectedLoginPath(sourceRoute),
      `Anonymous Like did not preserve ${sourceRoute}.`
    );
    await gate.first().click();
    await assertLoginTarget(page, sourceRoute);
    await completeDevelopmentSignIn(page, sourceRoute);

    const activeLike = page.getByRole("button", {
      name: new RegExp(`^Like ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`),
    });
    await activeLike.first().waitFor();
    assert(likeWrites === 0, `Like wrote ${likeWrites} time(s) during login.`);
    return sourceRoute;
  } finally {
    await context.close();
  }
}

async function verifyAnonymousBlock(browser) {
  const returnTo = `/u/${BLOCK_QA.handle}?source=c5-block`;
  const { context, page } = await openAnonymousPage(browser, returnTo);
  let blockWrites = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith(`/${BLOCK_QA.handle}/block`)
    ) {
      blockWrites += 1;
    }
  });

  try {
    await page.getByTestId("owner-profile-menu-trigger").click();
    const gate = page.getByTestId("owner-profile-block-signin");
    await gate.waitFor();
    assert(
      (await gate.getAttribute("href")) === expectedLoginPath(returnTo),
      "Anonymous Block did not preserve its profile route."
    );
    assert(
      (await page.getByRole("dialog").count()) === 0,
      "Anonymous Block opened destructive confirmation before sign-in."
    );

    await gate.click();
    await assertLoginTarget(page, returnTo);
    await completeDevelopmentSignIn(page, returnTo);
    assert(
      (await page.getByRole("dialog").count()) === 0,
      "Block confirmation incorrectly survived login."
    );

    await page.getByTestId("owner-profile-menu-trigger").click();
    await page.getByRole("menuitem", { name: `Block @${BLOCK_QA.handle}` }).click();
    const dialog = page.getByRole("dialog", {
      name: `Block ${BLOCK_QA.displayName}?`,
    });
    await dialog.waitFor();
    assert(blockWrites === 0, "Block executed before fresh confirmation.");
    await dialog.getByRole("button", { name: "Keep as is" }).click();
    assert(blockWrites === 0, "Cancelling the fresh Block confirmation wrote data.");

    return { confirmationRequiredAgain: true, returnTo };
  } finally {
    await context.close();
  }
}

async function verifyProtectedRouteReturns(browser) {
  const protectedRoutes = [
    "/feed?source=c5",
    "/notifications?source=c5",
    "/community/profile?source=c5",
    "/community/profile/edit?source=c5",
  ];

  for (const [index, returnTo] of protectedRoutes.entries()) {
    const { context, page } = await openAnonymousPage(browser, returnTo);
    try {
      await assertLoginTarget(page, returnTo);
      await completeDevelopmentSignIn(page, returnTo);
      assert(currentDestination(page) === returnTo, `${returnTo} was not restored.`);

      if (index === protectedRoutes.length - 1) {
        await mkdir(dirname(SESSION_FILE), { recursive: true });
        await context.storageState({ path: SESSION_FILE });
      }
    } finally {
      await context.close();
    }
  }

  return protectedRoutes;
}

async function verifyUnsafeRedirects(browser) {
  const unsafe = [
    "https://example.com",
    "//example.com",
    "javascript:alert(1)",
    "https%3A%2F%2Fexample.com%2Ffeed",
  ];

  for (const redirect of unsafe) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    try {
      await page.goto(
        `${WEB}/login?redirect=${encodeURIComponent(redirect)}`,
        { waitUntil: "domcontentloaded" }
      );
      await page.getByTestId("owner-development-login").click();
      await page.waitForURL((url) => url.pathname === "/dashboard", {
        timeout: 20000,
      });
      assert(new URL(page.url()).origin === new URL(WEB).origin, "Login left MyPetLink.");
    } finally {
      await context.close();
    }
  }

  return unsafe;
}

async function fulfillExpiredSession(route) {
  await route.fulfill({
    body: JSON.stringify({
      error: { code: "token_expired", message: "Authentication is required." },
    }),
    contentType: "application/json",
    status: 401,
  });
}

async function verifySessionExpiry(browser, momentRoute, momentTitle) {
  const inlineContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const inlinePage = await inlineContext.newPage();
  let likeAttempts = 0;

  try {
    await inlinePage.goto(
      `${WEB}${expectedLoginPath(momentRoute)}`,
      { waitUntil: "domcontentloaded" }
    );
    await completeDevelopmentSignIn(inlinePage, momentRoute);
    await inlinePage.getByRole("button", {
      name: new RegExp(`^Like ${momentTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`),
    }).waitFor();
    await inlinePage.route("**/api/v1/auth/refresh", fulfillExpiredSession);
    await inlinePage.route("**/api/v1/social/moments/*/like", async (route) => {
      likeAttempts += 1;
      await fulfillExpiredSession(route);
    });
    await inlinePage.getByRole("button", {
      name: new RegExp(`^Like ${momentTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`),
    }).click();
    await assertLoginTarget(inlinePage, momentRoute);
    assert(likeAttempts === 1, `Expired Like attempted ${likeAttempts} writes.`);
  } finally {
    await inlineContext.close();
  }

  const routeContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const routePage = await routeContext.newPage();
  const returnTo = "/feed?source=c5-expired";
  try {
    await routePage.goto(`${WEB}${expectedLoginPath(returnTo)}`, {
      waitUntil: "domcontentloaded",
    });
    await completeDevelopmentSignIn(routePage, returnTo);
    await routePage.route("**/api/v1/auth/refresh", fulfillExpiredSession);
    await routePage.route("**/api/v1/auth/me", fulfillExpiredSession);
    await routePage.reload({ waitUntil: "domcontentloaded" });
    await assertLoginTarget(routePage, returnTo);
  } finally {
    await routeContext.close();
  }

  return { inlineWriteAttempts: likeAttempts, protectedRoute: returnTo };
}

async function verifyPublicAnonymousRoutes(browser, profileRoute, momentRoute) {
  const routes = [
    "/explore",
    "/search?q=pet",
    profileRoute,
    momentRoute,
  ];
  const { context, page } = await openAnonymousPage(browser, routes[0]);

  try {
    for (const route of routes) {
      await visit(page, route);
      assert(
        new URL(page.url()).pathname !== "/login",
        `${route} incorrectly required login.`
      );
      assert(!(await isAuthenticated(page)), `${route} created a session.`);
    }
  } finally {
    await context.close();
  }

  return routes;
}

async function verifyC5AnonymousFlows(browser) {
  const moment = await discoverAnonymousMoment(browser);
  const publicRoutes = await verifyPublicAnonymousRoutes(
    browser,
    `/u/${BLOCK_QA.handle}`,
    moment.route
  );
  const anonymousShare = await verifySharePaths(browser, moment.route, null);
  const follow = await verifyAnonymousFollow(browser);
  const exploreLike = await verifyAnonymousLike(
    browser,
    "/explore?source=c5-like",
    moment.title
  );
  const detailLike = await verifyAnonymousLike(browser, moment.route, moment.title);
  const block = await verifyAnonymousBlock(browser);
  const unsafeRedirects = await verifyUnsafeRedirects(browser);
  const expiry = await verifySessionExpiry(browser, moment.route, moment.title);
  const protectedRoutes = await verifyProtectedRouteReturns(browser);

  return {
    anonymousShare,
    block,
    detailLike,
    expiry,
    exploreLike,
    follow,
    moment,
    protectedRoutes,
    publicRoutes,
    unsafeRedirects,
  };
}

async function verifyAnonymousResponsive(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const results = [];

  try {
    for (const { w, h } of VIEWPORTS) {
      await page.setViewportSize({ width: w, height: h });
      const returnTo = `/u/${BLOCK_QA.handle}?source=c5-responsive`;
      await visit(page, returnTo);

      const profileOverflow = await overflowReport(page);
      const profileOverlap = await headerOverlap(page);
      await page.getByTestId("owner-profile-menu-trigger").click();
      assert(
        (await page.getByRole("dialog").count()) === 0,
        `${w}x${h}: signed-out Block opened confirmation.`
      );
      await page.getByTestId("owner-profile-block-signin").click();
      await assertLoginTarget(page, returnTo);

      const [loginOverflow, loginButton] = await Promise.all([
        overflowReport(page),
        page.getByTestId("owner-development-login").boundingBox(),
      ]);
      assert(loginButton, `${w}x${h}: login CTA was not visible.`);
      const loginFits =
        loginButton.x >= -1 && loginButton.x + loginButton.width <= w + 1;

      await page.goBack({ waitUntil: "domcontentloaded" });
      await page.waitForURL((url) => `${url.pathname}${url.search}` === returnTo);
      await page.getByTestId("owner-profile-menu-trigger").waitFor();
      const returnedOverflow = await overflowReport(page);
      const cleanReturn =
        (await page.getByRole("dialog").count()) === 0 &&
        !(await isAuthenticated(page)) &&
        new URL(page.url()).pathname === `/u/${BLOCK_QA.handle}`;

      const notes = [];
      if (profileOverflow.scrolls) notes.push("profile overflow");
      if (profileOverlap) notes.push(profileOverlap);
      if (loginOverflow.scrolls) notes.push("login overflow");
      if (!loginFits) notes.push("login CTA outside viewport");
      if (returnedOverflow.scrolls) notes.push("return overflow");
      if (!cleanReturn) notes.push("Back did not restore a clean visitor profile");

      results.push({ h, notes, w });
    }
  } finally {
    await context.close();
  }

  return results;
}

async function verifySharePaths(browser, momentRoute, storageState = SESSION_FILE) {
  const expectedUrl = new URL(momentRoute, WEB).href;

  const nativeContext = await browser.newContext({
    ...(storageState ? { storageState } : {}),
    viewport: { width: 390, height: 844 },
  });
  await nativeContext.addInitScript(() => {
    window.__communityQaShareCalls = [];
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.__communityQaShareCalls.push({
          title: data?.title ?? null,
          text: data?.text ?? null,
          url: data?.url ?? null,
        });
      },
    });
  });

  let nativeResult;
  try {
    const page = await nativeContext.newPage();
    await visit(page, momentRoute);
    await page.getByTestId("moment-detail").waitFor();
    const title = (await page.getByTestId("moment-title").innerText()).trim();
    const before = page.url();
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await page.waitForFunction(() => window.__communityQaShareCalls?.length === 1);
    const calls = await page.evaluate(() => window.__communityQaShareCalls);

    assert(calls.length === 1, `Web Share ran ${calls.length} times instead of once.`);
    assert(calls[0].url === expectedUrl, `Web Share used ${calls[0].url}, expected ${expectedUrl}.`);
    assert(calls[0].title === title, `Web Share title was ${calls[0].title}, expected ${title}.`);
    assert(calls[0].text === null, "Web Share unexpectedly added separate text.");
    assert(page.url() === before, "Web Share navigated away from the Moment.");
    assert(!new URL(page.url()).pathname.startsWith("/pets"), "Web Share entered the Owner Portal.");

    nativeResult = { calls: calls.length, title, url: calls[0].url };
  } finally {
    await nativeContext.close();
  }

  const fallbackContext = await browser.newContext({
    ...(storageState ? { storageState } : {}),
    viewport: { width: 390, height: 844 },
  });
  await fallbackContext.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(WEB).origin,
  });
  await fallbackContext.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
  });

  let fallbackResult;
  try {
    const page = await fallbackContext.newPage();
    await visit(page, momentRoute);
    await page.getByTestId("moment-detail").waitFor();
    const before = page.url();
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await page.getByRole("button", { name: "Share", exact: true }).click();
    const feedback = page.getByRole("status");
    await feedback.waitFor();
    const copied = await page.evaluate(() => navigator.clipboard.readText());

    assert(copied === expectedUrl, `Copy Link used ${copied}, expected ${expectedUrl}.`);
    assert((await feedback.innerText()).trim() === "Link copied.", "Copy Link feedback was not “Link copied.”");
    assert(page.url() === before, "Copy Link navigated away from the Moment.");
    assert(!new URL(page.url()).pathname.startsWith("/pets"), "Copy Link entered the Owner Portal.");

    fallbackResult = { feedback: "Link copied.", url: copied };
  } finally {
    await fallbackContext.close();
  }

  return { fallback: fallbackResult, native: nativeResult };
}

async function verifyBlockFlow(page, viewerHandle) {
  const mutation = { blockCreated: false, followCreated: false };
  let result;

  try {
    const baseline = await loadBlockTarget(page);
    assert(!baseline.hasBlocked, `@${BLOCK_QA.handle} is already blocked; the disposable baseline is not clean.`);
    assert(!baseline.isFollowing, `@${BLOCK_QA.handle} is already followed; refusing to alter an existing relationship.`);
    assert(baseline.canFollow, `@${BLOCK_QA.handle} cannot be followed from the clean baseline.`);

    assert(
      !(await ownerSearchContains(page, BLOCK_QA.handle)),
      "Search exposed the undiscoverable disposable target before Block."
    );
    assert(
      !(await routeContains(page, "/explore", `@${BLOCK_QA.handle}`)),
      "Explore exposed the undiscoverable disposable target before Block."
    );

    await loadBlockTarget(page);
    const followResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        responsePath(response) ===
          `/api/v1/social/owners/${BLOCK_QA.handle}/follow`
    );
    await page.getByRole("button", {
      name: new RegExp(`^Follow ${BLOCK_QA.displayName}`),
    }).click();
    const followed = await responseData(await followResponse);
    mutation.followCreated = true;
    assert(followed.isFollowing, "The temporary Follow did not persist.");
    assert(
      followed.followerCount === baseline.followerCount + 1,
      "The temporary Follow did not increment the follower count once."
    );
    await page.getByRole("button", {
      name: new RegExp(`^Stop following ${BLOCK_QA.displayName}`),
    }).waitFor();

    assert(
      await routeContains(page, "/feed", BLOCK_QA.momentTitle),
      "The temporary Follow did not add the target Moment to Home."
    );
    assert(
      await routeContains(page, `/u/${viewerHandle}/following`, `@${BLOCK_QA.handle}`),
      "The temporary Follow did not appear in the viewer's Following list."
    );

    await loadBlockTarget(page);
    await clickProfileMenuAction(page, `Block @${BLOCK_QA.handle}`);
    const dialog = page.getByRole("dialog", {
      name: `Block ${BLOCK_QA.displayName}?`,
    });
    await dialog.waitFor();
    assert(
      (await dialog.innerText()).includes("If either of you follows the other, that stops now."),
      "Block confirmation did not explain the relationship consequence."
    );
    const blocked = await confirmRelationshipAction(
      page,
      "Block",
      "POST",
      `/api/v1/social/owners/${BLOCK_QA.handle}/block`
    );
    mutation.blockCreated = true;
    mutation.followCreated = false;

    assert(blocked.hasBlocked, "The server did not return the blocker-visible blocked state.");
    assert(!blocked.isFollowing, "Block did not remove the temporary Follow.");
    assert(!blocked.canFollow, "The blocked relationship still allowed Follow.");
    assert(
      blocked.followerCount === baseline.followerCount,
      "Block did not restore the target's follower count after removing Follow."
    );
    assert(new URL(page.url()).pathname === `/u/${BLOCK_QA.handle}`, "Block changed the current Community route.");
    assert(
      (await page.getByRole("button", { name: new RegExp(`Follow ${BLOCK_QA.displayName}`) }).count()) === 0,
      "Follow remained available in the blocked state."
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await page.getByTestId("owner-profile-menu-trigger").click();
    await page.getByRole("menuitem", { name: `Unblock @${BLOCK_QA.handle}` }).waitFor();
    await page.keyboard.press("Escape");

    const profileAccessible =
      (await page.getByRole("heading", { name: BLOCK_QA.displayName }).count()) === 1;
    const searchHidden = !(await ownerSearchContains(page, BLOCK_QA.handle));
    const exploreHidden = !(await routeContains(page, "/explore", `@${BLOCK_QA.handle}`));
    const feedHidden = !(await routeContains(page, "/feed", BLOCK_QA.momentTitle));
    const followingHidden = !(await routeContains(
      page,
      `/u/${viewerHandle}/following`,
      `@${BLOCK_QA.handle}`
    ));
    const followerHidden = !(await routeContains(
      page,
      `/u/${BLOCK_QA.handle}/followers`,
      `@${viewerHandle}`
    ));

    assert(profileAccessible, "The blocker could not reopen the public profile to reach Unblock.");
    assert(searchHidden, "Search leaked the blocked household.");
    assert(exploreHidden, "Explore leaked the blocked household.");
    assert(feedHidden, "Home retained a Moment from the blocked household.");
    assert(followingHidden && followerHidden, "A follower/following list retained the blocked relationship.");

    await loadBlockTarget(page);
    await clickProfileMenuAction(page, `Unblock @${BLOCK_QA.handle}`);
    const unblocked = await confirmRelationshipAction(
      page,
      "Unblock",
      "DELETE",
      `/api/v1/social/owners/${BLOCK_QA.handle}/block`
    );
    mutation.blockCreated = false;

    assert(!unblocked.hasBlocked, "Unblock did not clear the blocker-visible state.");
    assert(!unblocked.isFollowing, "Unblock silently restored the removed Follow.");
    assert(unblocked.canFollow, "Follow did not become available after Unblock.");
    assert(new URL(page.url()).pathname === `/u/${BLOCK_QA.handle}`, "Unblock changed the current Community route.");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await page.getByRole("button", {
      name: new RegExp(`^Follow ${BLOCK_QA.displayName}`),
    }).waitFor();
    assert(
      !(await ownerSearchContains(page, BLOCK_QA.handle)),
      "Unblock incorrectly made an undiscoverable household searchable."
    );
    assert(
      !(await routeContains(page, "/explore", `@${BLOCK_QA.handle}`)),
      "Unblock incorrectly added an undiscoverable household to Explore."
    );
    assert(
      !(await routeContains(page, "/feed", BLOCK_QA.momentTitle)),
      "Unblock restored feed content without a new Follow."
    );

    result = {
      baselineFollowerCount: baseline.followerCount,
      blockedProfileAccessible: profileAccessible,
      followRemovedByBlock: true,
      privacy: {
        exploreHidden,
        feedHidden,
        followerListsHidden: followingHidden && followerHidden,
        searchHidden,
      },
      reloadPersisted: true,
      requiresManualRefollow: !unblocked.isFollowing,
    };
  } finally {
    await cleanupBlockQaRelationship(page, mutation);
  }

  return result;
}

async function main() {
  await requireServers();

  if (freshSession) await rm(SESSION_FILE, { force: true });

  const executablePath = await resolveExecutable();
  const browser = await chromium.launch({ executablePath, headless });

  try {
    process.stdout.write("C5 anonymous-to-login verification\n");
    const c5 = await verifyC5AnonymousFlows(browser);
    process.stdout.write(
      `  OK    Follow -> ${c5.follow.returnTo}; Back clean=${c5.follow.backReturned}; no auto-follow\n` +
        `  OK    Like -> ${c5.exploreLike} and ${c5.detailLike}; no auto-like\n` +
        `  OK    Block -> ${c5.block.returnTo}; fresh confirmation=${c5.block.confirmationRequiredAgain}; no auto-block\n` +
        `  OK    Anonymous Share -> ${c5.anonymousShare.native.url}; ${c5.anonymousShare.fallback.feedback}\n` +
        `  OK    Protected returns -> ${c5.protectedRoutes.join(", ")}\n` +
        `  OK    Public browsing -> ${c5.publicRoutes.join(", ")}\n` +
        `  OK    Unsafe redirects rejected -> ${c5.unsafeRedirects.length}\n` +
        `  OK    Session expiry -> ${c5.expiry.protectedRoute}; inline writes=${c5.expiry.inlineWriteAttempts}\n\n`
    );

    if (!(await exists(SESSION_FILE))) {
      process.stdout.write("Signing in through the Development login...\n");
      await signIn(browser);
    } else {
      process.stdout.write("Using the signed-in state produced by the C5 return flow.\n");
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

    const momentRoute = routes.find((route) => route.name === "moment detail")?.path;
    assert(momentRoute, "A Moment detail route is required for Share QA.");

    process.stdout.write("C4 interaction verification\n");
    const share = await verifySharePaths(browser, momentRoute);
    process.stdout.write(
      `  OK    Web Share once -> ${share.native.url} (${share.native.title})\n` +
        `  OK    Copy Link -> ${share.fallback.url}; ${share.fallback.feedback}\n`
    );

    const block = await verifyBlockFlow(page, "devadminhouse");
    process.stdout.write(
      `  OK    Block removed Follow; profile remained reachable=${block.blockedProfileAccessible}; reload persisted=${block.reloadPersisted}\n` +
        `  OK    Privacy hid Search=${block.privacy.searchHidden}, Explore=${block.privacy.exploreHidden}, Home=${block.privacy.feedHidden}, connections=${block.privacy.followerListsHidden}\n` +
        `  OK    Unblock restored relationship controls, preserved discovery privacy; manual re-follow required=${block.requiresManualRefollow}\n\n`
    );

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
      process.stdout.write("\nResponsive sweep (anonymous login and Back)\n");
      const anonymousResults = await verifyAnonymousResponsive(browser);
      for (const { w, h, notes } of anonymousResults) {
        if (notes.length > 0) failures += notes.length;
        process.stdout.write(
          notes.length === 0
            ? `  OK    ${w}x${h}\n`
            : `  NOTE  ${w}x${h}: ${notes.join("; ")}\n`
        );
      }

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
