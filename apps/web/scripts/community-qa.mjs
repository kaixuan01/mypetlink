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
  await page.waitForURL((url) => isAtDestination(url, returnTo), { timeout: 20000 });

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
    { active: "Home", name: "feed", path: "/feed" },
    { active: "Explore", name: "explore", path: "/explore" },
    { active: "Explore", name: "search", path: "/search?q=pet" },
    { active: "My profile", name: "community profile", path: "/community/profile" },
    { active: "My profile", name: "community profile edit", path: "/community/profile/edit" },
    { active: "Activity", name: "notifications", path: "/notifications" },
    handle
      ? { active: null, name: "public profile", path: `/u/${handle}` }
      : { name: "public profile", path: null, skip: "no handle on the signed-in profile" },
    handle
      ? { active: null, name: "followers", path: `/u/${handle}/followers` }
      : { name: "followers", path: null, skip: "no handle on the signed-in profile" },
    handle
      ? { active: null, name: "following", path: `/u/${handle}/following` }
      : { name: "following", path: null, skip: "no handle on the signed-in profile" },
    momentId
      ? { active: null, name: "moment detail", path: `/moments/${momentId}` }
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

/**
 * Whether the browser is at a return destination. A Moment's Comments
 * fragment (`#comments`, `#comment-{id}`) is consumed once the thread lands
 * — it is removed from the history entry on purpose — so the same Moment path
 * without it is the same destination.
 */
function isAtDestination(url, returnTo) {
  const current = `${url.pathname}${url.search}${url.hash}`;
  if (current === returnTo) return true;
  const [path, fragment] = returnTo.split("#");
  return (
    Boolean(fragment) &&
    /^comment(s|-)/.test(fragment) &&
    path.startsWith("/moments/") &&
    `${url.pathname}${url.search}` === path &&
    url.hash === ""
  );
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
  await page.waitForURL((url) => isAtDestination(url, returnTo), { timeout: 20000 });
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

async function verifyAnonymousComments(browser, momentRoute) {
  const returnTo = `${momentRoute}#comments`;
  const { context, page } = await openAnonymousPage(browser, returnTo);
  let commentWrites = 0;
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "POST" && pathname.endsWith("/comments")) {
      commentWrites += 1;
    }
  });

  try {
    await page.getByRole("heading", { name: /Comments/ }).waitFor();
    const gate = page.getByRole("link", { name: "Sign in to comment" });
    await gate.waitFor();
    assert(
      (await gate.getAttribute("href")) === expectedLoginPath(returnTo),
      "Anonymous Comments did not preserve the #comments return target."
    );
    assert(
      (await page.getByLabel("Add a comment").count()) === 0,
      "Anonymous Comments rendered a composer."
    );

    await gate.click();
    await assertLoginTarget(page, returnTo);
    await completeDevelopmentSignIn(page, returnTo);
    await ensureQaCommunityProfile(page, returnTo);
    const composer = page.getByLabel("Add a comment");
    await composer.waitFor();
    assert((await composer.inputValue()) === "", "Login restored an undisclosed Comment draft.");
    assert(commentWrites === 0, `Comment wrote ${commentWrites} time(s) during login.`);

    return { returnTo, writesDuringLogin: commentWrites };
  } finally {
    await context.close();
  }
}

/**
 * A brand-new local database gives the development login an ordinary account
 * with no social identity. Comments deliberately require one, so the browser
 * runner creates an explicit QA household through the product UI once. Nothing
 * is inferred from the account/finder identity, and subsequent runs simply see
 * the existing eligible composer and skip this setup.
 */
async function ensureQaCommunityProfile(page, returnTo) {
  const setup = page.getByRole("link", {
    name: "Set up your Community profile to comment",
  });
  const composer = page.getByLabel("Add a comment");
  await composer.or(setup).waitFor();
  if (!(await setup.isVisible())) return;

  await setup.click();
  await page.waitForURL((url) => url.pathname === "/community/profile");
  await page.getByRole("link", { name: "Set up profile" }).click();
  await page.waitForURL((url) => url.pathname === "/community/profile/edit");

  const handle = page.locator("#social-handle-input");
  await handle.fill("devadminhouse");
  const handleResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      responsePath(response) === "/api/v1/social/me/handle"
  );
  await page.getByRole("button", { name: "Claim handle" }).click();
  assert((await handleResponse).ok(), "The QA Community handle could not be claimed.");

  await page.locator("#social-display-name-input").fill("Development Admin Household");
  const detailsResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      responsePath(response) === "/api/v1/social/me/profile"
  );
  await page.getByRole("button", { name: "Save Community Profile" }).click();
  assert((await detailsResponse).ok(), "The QA Community name could not be saved.");

  const socialSwitch = page.getByRole("switch", {
    name: "Turn on my Community Profile",
  });
  await socialSwitch.waitFor();
  if ((await socialSwitch.getAttribute("aria-checked")) !== "true") {
    const enableResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        responsePath(response) === "/api/v1/social/me/profile"
    );
    await socialSwitch.click();
    assert((await enableResponse).ok(), "The QA Community profile could not be enabled.");
  }

  await visit(page, returnTo);
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

/**
 * A Comment interrupted by an ended session survives the sign-in round trip:
 * the POST and the token refresh are both answered 401, the draft is kept in
 * the tab (never the URL), and after signing in again it is back in the
 * composer without anything being sent.
 */
async function verifyCommentDraftRestore(browser, momentRoute) {
  const returnTo = `${momentRoute}#comments`;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const draft = `Draft QA ${Date.now()} keep me 🐾`;
  let commentPosts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/comments")) {
      commentPosts += 1;
    }
  });

  try {
    await page.goto(`${WEB}${expectedLoginPath(returnTo)}`, { waitUntil: "domcontentloaded" });
    await completeDevelopmentSignIn(page, returnTo);
    const composer = page.getByLabel("Add a comment");
    await composer.waitFor();

    const expire = async (route) => fulfillExpiredSession(route);
    await page.route("**/api/v1/auth/refresh", expire);
    await page.route("**/api/v1/social/moments/*/comments", expire);
    await composer.fill(draft);
    await page.getByRole("button", { name: "Send", exact: true }).click();

    const kept = page.getByText("We’ve kept your comment. Sign in to finish posting it.");
    await kept.waitFor();
    const gate = page.getByRole("link", { name: "Sign in to comment" });
    assert((await gate.getAttribute("href")) === expectedLoginPath(returnTo),
      "Expired Comment sign-in did not return to #comments.");
    assert(!decodeURIComponent(page.url()).includes("keep me"), "Comment draft leaked into the URL.");
    await page.unroute("**/api/v1/auth/refresh", expire);
    await page.unroute("**/api/v1/social/moments/*/comments", expire);

    await gate.click();
    await assertLoginTarget(page, returnTo);
    assert(!decodeURIComponent(page.url()).includes("keep me"), "Comment draft leaked into the login URL.");

    // Back from the login page is an ordinary return, still signed out, with
    // the draft still waiting rather than restored into an empty session.
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => isAtDestination(url, returnTo));
    await page.getByRole("link", { name: "Sign in to comment" }).waitFor();
    assert(!(await isAuthenticated(page)), "Browser Back left a half-authenticated session.");

    await page.getByRole("link", { name: "Sign in to comment" }).click();
    await assertLoginTarget(page, returnTo);
    await completeDevelopmentSignIn(page, returnTo);
    await composer.waitFor();
    await page.waitForFunction(
      (text) => document.querySelector("#comment-body")?.value === text,
      draft,
      { timeout: 20000 }
    );
    await page.getByText("Your unsent comment is back. Press Send when you’re ready.").waitFor();
    await page.waitForTimeout(1500);
    assert(commentPosts === 1, `Restoring the draft posted ${commentPosts - 1} extra time(s).`);
    assert(
      (await page.evaluate(() => window.sessionStorage.getItem("mypetlink_comment_draft_v1"))) === null,
      "The restored draft was left behind in storage."
    );

    // Discard it: QA must not leave a real Comment behind.
    await composer.fill("");
    return { returnTo, extraPosts: commentPosts - 1 };
  } finally {
    await context.close();
  }
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
  const comments = await verifyAnonymousComments(browser, moment.route);
  const block = await verifyAnonymousBlock(browser);
  const unsafeRedirects = await verifyUnsafeRedirects(browser);
  const expiry = await verifySessionExpiry(browser, moment.route, moment.title);
  const protectedRoutes = await verifyProtectedRouteReturns(browser);

  return {
    anonymousShare,
    block,
    comments,
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

/** Only elements that are actually painted count as chrome at this viewport. */
async function visibleElementSummary(page, selector) {
  return page.locator(selector).evaluateAll((elements) =>
    elements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      })
      .map((element) => ({
        href: element instanceof HTMLAnchorElement ? element.getAttribute("href") : null,
        label:
          element.getAttribute("aria-label") ||
          (element.textContent || "").trim().replace(/\s+/g, " "),
      }))
  );
}

/**
 * The route-derived shell contract. This intentionally checks structure and
 * accessibility state rather than pixels: Playwright can measure layout, but
 * the durable promise is one mode, one primary nav and one truthful active
 * item at every breakpoint.
 */
async function authenticatedShellNotes(page, route, width) {
  const notes = [];
  const [communityNavs, ownerNavs, switches, headings] = await Promise.all([
    visibleElementSummary(page, 'nav[aria-label="Community"]'),
    visibleElementSummary(page, 'nav[aria-label="My Pets"]'),
    visibleElementSummary(
      page,
      '[data-testid="social-mode-switch"], [data-testid="mode-switch"]'
    ),
    visibleElementSummary(page, "main h1"),
  ]);

  if (communityNavs.length !== 1) {
    notes.push(`expected one Community nav, found ${communityNavs.length}`);
  }
  if (ownerNavs.length !== 0) {
    notes.push(`My Pets nav was visible (${ownerNavs.length})`);
  }
  if (switches.length !== 1 || switches[0]?.href !== "/dashboard") {
    notes.push(
      `mode switch was ${JSON.stringify(switches)} instead of one /dashboard link`
    );
  }
  if (headings.length === 0) notes.push("no visible page heading");

  const current = await visibleElementSummary(
    page,
    'nav[aria-label="Community"] [aria-current="page"]'
  );
  const currentLabels = current.map(({ label }) => label.replace(/, \d+ unread$/, ""));
  if (route.active === null && current.length !== 0) {
    notes.push(`unexpected active item ${currentLabels.join(", ")}`);
  } else if (
    route.active &&
    (current.length !== 1 || currentLabels[0] !== route.active)
  ) {
    notes.push(
      `active item was ${currentLabels.join(", ") || "none"}, expected ${route.active}`
    );
  }

  const bottomNavs = await visibleElementSummary(
    page,
    '[data-testid="mobile-bottom-nav"]'
  );
  if (width < 1024 && bottomNavs.length !== 1) {
    notes.push(`expected one mobile bottom nav, found ${bottomNavs.length}`);
  }
  if (width >= 1024 && bottomNavs.length !== 0) {
    notes.push("mobile bottom nav remained visible on desktop");
  }

  if (width < 1024 && bottomNavs.length === 1) {
    const clearance = await page.evaluate(() => {
      const main = document.querySelector("main");
      const nav = document.querySelector('[data-testid="mobile-bottom-nav"]');
      if (!main || !nav) return null;
      return {
        navHeight: nav.getBoundingClientRect().height,
        paddingBottom: Number.parseFloat(window.getComputedStyle(main).paddingBottom),
      };
    });
    if (
      !clearance ||
      !Number.isFinite(clearance.paddingBottom) ||
      clearance.paddingBottom < clearance.navHeight
    ) {
      notes.push(`main content did not reserve the mobile nav height (${JSON.stringify(clearance)})`);
    }
  }

  if (width >= 1024) {
    const brands = await visibleElementSummary(
      page,
      'a[aria-label="MyPetLink Community home"]'
    );
    if (brands.length !== 1 || brands[0]?.href !== "/feed") {
      notes.push(`desktop Community brand was ${JSON.stringify(brands)}`);
    }
  }

  return notes;
}

async function verifyAnonymousShellResponsive(browser, momentRoute) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const results = [];
  const routes = [
    { active: "Explore", name: "explore", path: "/explore" },
    { active: "Search MyPetLink", name: "search", path: "/search?q=pet" },
    { active: null, name: "public profile", path: `/u/${BLOCK_QA.handle}` },
    { active: null, name: "moment detail", path: momentRoute },
  ];

  try {
    for (const { w, h } of VIEWPORTS) {
      await page.setViewportSize({ width: w, height: h });
      const notes = [];

      for (const route of routes) {
        await visit(page, route.path);
        const [overflow, overlap, small, publicHeaders, signIns, communityNavs, ownerNavs] =
          await Promise.all([
            overflowReport(page),
            headerOverlap(page),
            smallTargets(page),
            visibleElementSummary(page, '[data-testid="social-header-public"]'),
            visibleElementSummary(page, '[data-testid="social-header-sign-in"]'),
            visibleElementSummary(page, 'nav[aria-label="Community"]'),
            visibleElementSummary(page, 'nav[aria-label="My Pets"]'),
          ]);

        if (overflow.scrolls) notes.push(`${route.name}: horizontal overflow`);
        if (overlap) notes.push(`${route.name}: ${overlap}`);
        if (small.length > 0) {
          notes.push(`${route.name}: small targets ${small.join("; ")}`);
        }
        if (publicHeaders.length !== 1) notes.push(`${route.name}: public header missing`);
        if (signIns.length !== 1) notes.push(`${route.name}: Sign in missing`);
        if (communityNavs.length + ownerNavs.length !== 0) {
          notes.push(`${route.name}: authenticated navigation was visible`);
        }
        if (await isAuthenticated(page)) notes.push(`${route.name}: session created`);

        const visibleCurrent = await visibleElementSummary(
          page,
          '[data-testid="social-header-public"] [aria-current="page"]'
        );
        const activeLinkIsExpectedToShow =
          (route.name === "explore" && w >= 380) ||
          (route.name === "search" && w >= 640);
        if (
          activeLinkIsExpectedToShow &&
          (visibleCurrent.length !== 1 || visibleCurrent[0]?.label !== route.active)
        ) {
          notes.push(`${route.name}: public active state was not exposed`);
        }
        if (!activeLinkIsExpectedToShow && visibleCurrent.length !== 0) {
          notes.push(`${route.name}: unexpected public active state`);
        }
      }

      results.push({ h, notes, w });
    }
  } finally {
    await context.close();
  }

  return results;
}

async function firstVisible(page, selector) {
  const locator = page.locator(selector);
  for (let index = 0; index < (await locator.count()); index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) return candidate;
  }
  return null;
}

async function verifyModeTransitions(browser) {
  const results = [];

  for (const viewport of [
    { label: "mobile", width: 390, height: 844 },
    { label: "desktop", width: 1280, height: 900 },
  ]) {
    const context = await browser.newContext({
      storageState: SESSION_FILE,
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();

    try {
      await visit(page, "/dashboard");
      const toCommunity = await firstVisible(
        page,
        '[data-testid="social-mode-switch"], [data-testid="mode-switch"]'
      );
      assert(toCommunity, `${viewport.label}: Community mode switch was not visible.`);
      assert(
        (await toCommunity.getAttribute("href")) === "/feed",
        `${viewport.label}: Community mode switch did not target /feed.`
      );
      await toCommunity.click();
      await page.waitForURL((url) => url.pathname === "/feed");
      await page.goBack({ waitUntil: "domcontentloaded" });
      await page.waitForURL((url) => url.pathname === "/dashboard");

      await visit(page, "/feed");
      const toPets = await firstVisible(
        page,
        '[data-testid="social-mode-switch"], [data-testid="mode-switch"]'
      );
      assert(toPets, `${viewport.label}: My Pets mode switch was not visible.`);
      assert(
        (await toPets.getAttribute("href")) === "/dashboard",
        `${viewport.label}: My Pets mode switch did not target /dashboard.`
      );
      await toPets.click();
      await page.waitForURL((url) => url.pathname === "/dashboard");
      await page.goBack({ waitUntil: "domcontentloaded" });
      await page.waitForURL((url) => url.pathname === "/feed");

      results.push(viewport.label);
    } finally {
      await context.close();
    }
  }

  return results;
}

async function verifyDirectMomentExit(browser, momentRoute) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  try {
    await visit(page, momentRoute);
    await page.getByTestId("moment-detail").waitFor();
    const exit = page.locator('main a[href^="/u/"]').filter({ hasText: /^Back to / }).first();
    await exit.waitFor();
    const href = await exit.getAttribute("href");
    assert(/^\/u\/[^/]+$/.test(href || ""), `Direct Moment exit was ${href}.`);
    await exit.click();
    await page.waitForURL((url) => url.pathname === href);
    await page.getByTestId("social-header-public").waitFor();
    assert(
      (await visibleElementSummary(page, '[data-testid="social-header-public"]')).length === 1,
      "Direct Moment exit left the public Community shell."
    );
    return href;
  } finally {
    await context.close();
  }
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

function commentCountFromHeading(text) {
  const match = /Comments\s*·\s*(\d+)/i.exec(text ?? "");
  return match ? Number(match[1]) : null;
}

async function createCommentThroughUi(page, momentRoute, body) {
  await visit(page, `${momentRoute}#comments`);
  const heading = page.getByRole("heading", { name: /Comments/ });
  await heading.waitFor();
  const before = commentCountFromHeading(await heading.innerText());
  assert(before !== null, "Comments heading did not expose its count.");

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      responsePath(response) ===
        `/api/v1/social/moments/${momentRoute.split("/").pop()}/comments`
  );
  const composer = page.getByLabel("Add a comment");
  await composer.fill(body);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const response = await responsePromise;
  assert(response.ok(), `Create Comment returned HTTP ${response.status()}.`);
  const created = await responseData(response);
  const row = page.locator(`#comment-${created.comment.id}`);
  await row.waitFor();
  assert((await row.innerText()).includes(body), "Created Comment did not appear at the bottom.");
  assert(
    commentCountFromHeading(await heading.innerText()) === before + 1,
    "Creating a Comment did not increment the visible count once."
  );
  return { before, id: created.comment.id };
}

async function deleteOwnCommentThroughUi(page, momentRoute, commentId) {
  await visit(page, `${momentRoute}#comment-${commentId}`);
  const row = page.locator(`#comment-${commentId}`);
  if ((await row.count()) === 0) return false;

  await row.getByRole("button", { name: /Comment actions/ }).click();
  await row.getByRole("button", { name: "Delete comment", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your comment?" });
  await dialog.waitFor();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      responsePath(response).endsWith(`/comments/${commentId}`)
  );
  await dialog.getByRole("button", { name: "Delete comment", exact: true }).click();
  const response = await responsePromise;
  assert(response.ok(), `Delete Comment returned HTTP ${response.status()}.`);
  await row.waitFor({ state: "detached" });
  return true;
}

async function verifyCommentCrud(page, momentRoute, momentTitle) {
  const body = `Community QA ${Date.now()} 🐾\nMultiline Comment`;
  let commentId = null;

  try {
    const created = await createCommentThroughUi(page, momentRoute, body);
    commentId = created.id;

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(`#comment-${commentId}`).waitFor();
    assert(
      (await page.locator(`#comment-${commentId}`).innerText()).includes(body),
      "Comment did not persist after reload."
    );

    await visit(page, "/explore");
    const card = page
      .locator('[data-testid="social-moment-card"], [data-testid="social-moment-tile"]')
      .filter({ hasText: momentTitle })
      .first();
    const commentLink = card.locator(`a[href="${momentRoute}#comments"]`);
    await commentLink.waitFor();
    assert(Number((await commentLink.innerText()).trim()) >= created.before + 1,
      "Moment card Comment count did not update.");

    const deleted = await deleteOwnCommentThroughUi(page, momentRoute, commentId);
    assert(deleted, "Own Comment could not be deleted through its menu.");
    commentId = null;

    return { persisted: true, countUpdated: true, cardLinked: true };
  } finally {
    if (commentId) {
      await deleteOwnCommentThroughUi(page, momentRoute, commentId).catch(() => {});
    }
  }
}

async function resolveBlockQaMoment(page) {
  await visit(page, `/u/${BLOCK_QA.handle}`);
  const card = page
    .locator('[data-testid="social-moment-card"], [data-testid="social-moment-tile"]')
    .filter({ hasText: BLOCK_QA.momentTitle })
    .first();
  await card.waitFor();
  const href = await card.locator('a[href^="/moments/"]').first().getAttribute("href");
  assert(href, "Disposable Block household did not expose its Moment route.");
  return href;
}

async function verifyCommentBlockFlow(browser, page) {
  const mutation = { blockCreated: false, followCreated: false };
  const momentRoute = await resolveBlockQaMoment(page);
  const body = `Block restore QA ${Date.now()}`;
  let commentId = null;
  let anonymousContext = null;

  try {
    const baseline = await loadBlockTarget(page);
    assert(!baseline.hasBlocked, "Disposable Comment Block pair was not clean.");
    const created = await createCommentThroughUi(page, momentRoute, body);
    commentId = created.id;

    const anonymous = await openAnonymousPage(browser, `${momentRoute}#comments`);
    anonymousContext = anonymous.context;
    await anonymous.page.getByText(body, { exact: true }).waitFor();

    await loadBlockTarget(page);
    await clickProfileMenuAction(page, `Block @${BLOCK_QA.handle}`);
    await confirmRelationshipAction(
      page,
      "Block",
      "POST",
      `/api/v1/social/owners/${BLOCK_QA.handle}/block`
    );
    mutation.blockCreated = true;

    await visit(page, momentRoute);
    await page.getByTestId("moment-unavailable").waitFor();
    await anonymous.page.reload({ waitUntil: "domcontentloaded" });
    await anonymous.page.getByTestId("moment-detail").waitFor();
    assert(
      (await anonymous.page.getByText(body, { exact: true }).count()) === 0,
      "Third-party viewer still saw a Comment across the author pair Block."
    );

    await loadBlockTarget(page);
    await clickProfileMenuAction(page, `Unblock @${BLOCK_QA.handle}`);
    await confirmRelationshipAction(
      page,
      "Unblock",
      "DELETE",
      `/api/v1/social/owners/${BLOCK_QA.handle}/block`
    );
    mutation.blockCreated = false;

    await anonymous.page.reload({ waitUntil: "domcontentloaded" });
    await anonymous.page.getByText(body, { exact: true }).waitFor();
    await deleteOwnCommentThroughUi(page, momentRoute, commentId);
    commentId = null;

    return { hiddenFromPair: true, hiddenFromThirdViewer: true, restored: true };
  } finally {
    await anonymousContext?.close();
    await cleanupBlockQaRelationship(page, mutation);
    if (commentId && !mutation.blockCreated) {
      await deleteOwnCommentThroughUi(page, momentRoute, commentId).catch(() => {});
    }
  }
}

async function verifyCommentsResponsive(browser, momentRoute) {
  const momentId = momentRoute.split("/").pop();
  const author = {
    handle: "responsiveqa",
    displayName: "Responsive QA Household With A Long Name",
    avatarUrl: null,
    avatarThumbnailUrl: null,
  };
  const newest = Array.from({ length: 20 }, (_, index) => ({
    id: `responsive-${index + 1}`,
    body:
      index === 0
        ? `${"Unbroken".repeat(58)}🐾`
        : index === 1
          ? "First line\nSecond line with family emoji 👩‍👩‍👧‍👦"
          : `Comment ${index + 1}`,
    createdAt: new Date(Date.UTC(2026, 8, 24, 12, index)).toISOString(),
    author,
    viewerDeleteAction: "delete",
  }));
  const older = {
    id: "responsive-older",
    body: "Earlier Comment",
    createdAt: "2026-09-23T12:00:00.000Z",
    author,
    viewerDeleteAction: "remove",
  };
  // Older than the first page: only an anchored read returns it.
  const linked = {
    id: "5f0c2d1e-7a3b-4c11-8d2e-000000000021",
    body: "Linked older Comment",
    createdAt: "2026-09-23T11:00:00.000Z",
    author,
    viewerDeleteAction: "delete",
  };
  const results = [];

  for (const { w, h } of VIEWPORTS) {
    const touch = w < 768;
    const context = await browser.newContext({
      hasTouch: touch,
      storageState: SESSION_FILE,
      viewport: { width: w, height: h },
    });
    const page = await context.newPage();
    const anchorsSent = [];

    try {
      await page.route(`**/api/v1/public/moments/${momentId}/comments**`, async (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.has("anchor")) anchorsSent.push(url.searchParams.get("anchor"));
        const pageData = url.searchParams.has("cursor")
          ? { items: [older], nextCursor: null }
          : url.searchParams.get("anchor") === linked.id
            ? { items: [...[...newest].reverse(), linked], nextCursor: "older-page" }
            : { items: [...newest].reverse(), nextCursor: "older-page" };
        await route.fulfill({
          body: JSON.stringify({
            data: {
              ...pageData,
              commentCount: 21,
              viewer: { canComment: true, requirement: null, identity: author },
            },
          }),
          contentType: "application/json",
          status: 200,
        });
      });
      await page.route(`**/api/v1/social/moments/${momentId}/comments`, async (route) => {
        const body = route.request().postDataJSON()?.body ?? "";
        await route.fulfill({
          body: JSON.stringify({
            data: {
              comment: {
                id: "responsive-created",
                body,
                createdAt: "2026-09-24T13:00:00.000Z",
                author,
                viewerDeleteAction: "delete",
              },
              commentCount: 22,
            },
          }),
          contentType: "application/json",
          status: 200,
        });
      });

      // Deep link to a Comment older than the first page.
      await visit(page, `${momentRoute}#comment-${linked.id}`);
      const linkedRow = page.locator(`#comment-${linked.id}`);
      await linkedRow.waitFor();
      await page.waitForFunction(
        (id) => document.getElementById(`comment-${id}`)?.dataset.highlighted === "true",
        linked.id,
        { timeout: 10000 }
      );
      assert(anchorsSent.includes(linked.id), `${w}x${h}: the deep link did not send its anchor.`);
      const linkedState = await linkedRow.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          focused: document.activeElement === element,
          inView: rect.top >= 0 && rect.bottom <= window.innerHeight,
        };
      });
      assert(linkedState.inView, `${w}x${h}: the linked Comment was not scrolled into view.`);
      assert(linkedState.focused, `${w}x${h}: the linked Comment was not focused.`);

      await page.goto("about:blank");
      await visit(page, `${momentRoute}#comments`);
      const region = page.getByRole("region", { name: /Comments\s*·\s*\d+/ });
      await region.waitFor();
      assert((await region.getAttribute("id")) === "comments",
        `${w}x${h}: the Comments section is not named by its heading.`);
      await page.getByText("Earlier Comment").count();
      const showEarlier = page.getByRole("button", { name: "Show earlier comments" });
      await showEarlier.waitFor();
      await showEarlier.click();
      await page.getByText("Earlier Comment", { exact: true }).waitFor();

      // The action menu: Escape returns focus, a pointer elsewhere does not.
      const menuRow = page.locator("#comment-responsive-2");
      const menuTrigger = menuRow.getByRole("button", { name: /Comment actions/ });
      await menuTrigger.click();
      await menuRow.getByRole("button", { name: "Delete comment", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await menuRow.getByRole("button", { name: "Delete comment", exact: true }).waitFor({ state: "detached" });
      assert(await menuTrigger.evaluate((element) => element === document.activeElement),
        `${w}x${h}: Escape did not return focus to the Comment menu trigger.`);
      await menuTrigger.click();
      await page.locator("#comments-heading").click();
      await menuRow.getByRole("button", { name: "Delete comment", exact: true }).waitFor({ state: "detached" });
      assert(await menuTrigger.evaluate((element) => element !== document.activeElement),
        `${w}x${h}: an outside click pulled focus back to the menu trigger.`);

      // The author link's hit area on touch layouts.
      if (touch) {
        const hit = await menuRow.getByTestId("comment-author-link").evaluate((link) => {
          link.scrollIntoView({ block: "center", behavior: "instant" });
          const rect = link.getBoundingClientRect();
          const x = rect.left + Math.min(rect.width / 2, 20);
          let height = 0;
          for (let y = Math.floor(rect.top - 24); y <= Math.ceil(rect.bottom + 24); y += 1) {
            if (document.elementFromPoint(x, y)?.closest("[data-testid='comment-author-link']") === link) {
              height += 1;
            }
          }
          return {
            coarse: window.matchMedia("(pointer: coarse)").matches,
            height,
            textHeight: Math.round(rect.height),
          };
        });
        assert(hit.coarse, `${w}x${h}: touch emulation did not report a coarse pointer.`);
        assert(
          hit.height >= 42,
          `${w}x${h}: author link hit area is only ${hit.height}px tall (text ${hit.textHeight}px).`
        );
      }

      const row = page.locator("#comment-responsive-1");
      await row.getByRole("button", { name: /Comment actions/ }).click();
      const trigger = row.getByRole("button", { name: /Comment actions/ });
      await row.getByRole("button", { name: "Delete comment", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Delete your comment?" });
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      assert(await trigger.evaluate((element) => element === document.activeElement),
        `${w}x${h}: cancelling Comment deletion did not restore focus.`);

      const olderRow = page.locator("#comment-responsive-older");
      await olderRow.getByRole("button", { name: /Comment actions/ }).click();
      await olderRow.getByRole("button", { name: "Remove comment", exact: true }).click();
      const removeDialog = page.getByRole("dialog", { name: "Remove this comment?" });
      await removeDialog.waitFor();
      await removeDialog.getByRole("button", { name: "Cancel" }).click();

      const composer = page.getByLabel("Add a comment");
      await composer.fill(`${"n".repeat(448)}🐾`);
      await page.getByText("450 / 500", { exact: true }).waitFor();
      await composer.press("Control+Enter");
      await page.getByText(`${"n".repeat(448)}🐾`, { exact: true }).waitFor();
      // The composer is disabled while posting and focus is put back on the
      // next frame, so wait for it rather than sampling one instant.
      const refocused = await page
        .waitForFunction(() => document.activeElement?.id === "comment-body", null, { timeout: 2000 })
        .then(() => true, () => false);
      assert(refocused, `${w}x${h}: posting did not keep focus in the Comment composer.`);

      // Scrolled as far down as a reader can go — the page and any scrolling
      // container around the thread — the composer's Send clears any fixed
      // bottom navigation.
      const covered = await page.getByRole("button", { name: "Send", exact: true }).evaluate((send) => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
        for (let node = send.parentElement; node; node = node.parentElement) {
          const overflowY = getComputedStyle(node).overflowY;
          if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
            node.scrollTo({ top: node.scrollHeight, behavior: "instant" });
          }
        }
        const sendRect = send.getBoundingClientRect();
        const bars = [...document.querySelectorAll("body *")].filter((element) => {
          if (getComputedStyle(element).position !== "fixed") return false;
          const rect = element.getBoundingClientRect();
          return rect.height > 0 && rect.height < 200 && rect.bottom >= window.innerHeight - 2;
        });
        const top = Math.min(window.innerHeight, ...bars.map((bar) => bar.getBoundingClientRect().top));
        return sendRect.bottom > top + 1 ? { sendBottom: sendRect.bottom, barTop: top } : null;
      });
      assert(!covered, `${w}x${h}: bottom navigation covers the composer ${JSON.stringify(covered)}.`);

      await composer.scrollIntoViewIfNeeded();
      const [overflow, box] = await Promise.all([
        overflowReport(page),
        composer.boundingBox(),
      ]);
      assert(!overflow.scrolls,
        `${w}x${h}: Comments caused horizontal overflow ${overflow.documentWidth}>${overflow.viewportWidth}.`);
      assert(box && box.x >= 0 && box.x + box.width <= w + 1,
        `${w}x${h}: Comment composer escaped the viewport.`);

      const controls = await page.locator(
        '#comments button, #comments a[aria-label^="Comments"], #comments a[href*="login"], #comments a[href="/community/profile"]'
      ).evaluateAll((elements) =>
        elements
          .map((element) => ({
            label: element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName,
            height: element.getBoundingClientRect().height,
            width: element.getBoundingClientRect().width,
          }))
          .filter((item) => item.height > 0)
      );
      const undersized = controls.filter((item) => item.height < 44 || item.width < 44);
      assert(
        undersized.length === 0,
        `${w}x${h}: undersized Comment controls ${JSON.stringify(undersized)}.`
      );
      results.push(`${w}x${h}`);
    } finally {
      await context.close();
    }
  }

  return results;
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
        `  OK    Comments -> ${c5.comments.returnTo}; readable anonymously; no auto-comment\n` +
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

    // A new QA household has no pets or followed feed yet; the anonymous C5
    // discovery pass already resolved a real public Moment we can reuse.
    const momentRoute =
      routes.find((route) => route.name === "moment detail")?.path ??
      c5.moment.route;
    assert(momentRoute, "A Moment detail route is required for Share QA.");

    process.stdout.write("C6 navigation shell verification\n");
    const modeTransitions = await verifyModeTransitions(browser);
    const directMomentExit = await verifyDirectMomentExit(browser, momentRoute);
    process.stdout.write(
      `  OK    Owner ↔ Community transitions (${modeTransitions.join(", ")})\n` +
        `  OK    Direct Moment exit -> ${directMomentExit}\n\n`
    );

    process.stdout.write("C4 interaction verification\n");
    const share = await verifySharePaths(browser, momentRoute);
    process.stdout.write(
      `  OK    Web Share once -> ${share.native.url} (${share.native.title})\n` +
        `  OK    Copy Link -> ${share.fallback.url}; ${share.fallback.feedback}\n`
    );

    process.stdout.write("\nPhase 2A Comment verification\n");
    const commentCrud = await verifyCommentCrud(
      page,
      c5.moment.route,
      c5.moment.title
    );
    const commentBlock = await verifyCommentBlockFlow(browser, page);
    const commentDraft = await verifyCommentDraftRestore(browser, c5.moment.route);
    process.stdout.write(
      `  OK    Create/reload/delete; card link=${commentCrud.cardLinked}; count=${commentCrud.countUpdated}\n` +
        `  OK    Block hid Comment from pair and third viewer; unblock restored=${commentBlock.restored}\n` +
        `  OK    Expired-session draft restored after sign-in -> ${commentDraft.returnTo}; extra posts=${commentDraft.extraPosts}\n\n`
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
      process.stdout.write(
        "\nResponsive Comments matrix (older-Comment deep link, section name, menu Escape/outside click, touch targets, bottom navigation)\n"
      );
      const commentViewports = await verifyCommentsResponsive(
        browser,
        c5.moment.route
      );
      for (const viewport of commentViewports) {
        process.stdout.write(`  OK    ${viewport}\n`);
      }

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

      process.stdout.write("\nResponsive sweep (anonymous Community shell)\n");
      const anonymousShellResults = await verifyAnonymousShellResponsive(
        browser,
        momentRoute
      );
      for (const { w, h, notes } of anonymousShellResults) {
        if (notes.length > 0) failures += notes.length;
        process.stdout.write(
          notes.length === 0
            ? `  OK    ${w}x${h}\n`
            : `  NOTE  ${w}x${h}\n${notes.map((note) => `          ${note}`).join("\n")}\n`
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
          const shellNotes = await authenticatedShellNotes(page, route, w);
          notes.push(...shellNotes.map((note) => `${route.name}: ${note}`));
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
