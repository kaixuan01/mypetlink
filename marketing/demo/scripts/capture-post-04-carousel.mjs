/** Capture privacy-safe, real MyPetLink UI for Instagram post 04. */

import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { detectPrivateText } from "./privacy-guard.mjs";

const outputDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : "D:\\Project\\MyPetLink\\marketing\\assets\\social\\post-04";
const baseUrl = "http://localhost:3000";
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const allowedContact = [
  "+601110000000",
  "+60 11-1000 0000",
  "support@mypetlink.com.my",
];

const routes = {
  shareProfile: "/p/linky-linkydemo",
  community: "/explore",
};

async function waitForStablePage(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.race([
      Promise.all([...document.images].map((image) => image.decode?.().catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 10_000)),
    ]);
  });
  await page.addStyleTag({
    content: [
      "nextjs-portal,[data-nextjs-dev-tools-button],#__next-build-watcher{display:none!important}",
      "html,body,*{cursor:none!important}",
    ].join("\n"),
  });
  await page.waitForTimeout(450);
}

async function assertPublishable(page, expectedText) {
  const bodyText = await page.locator("body").innerText();
  const findings = detectPrivateText(bodyText, allowedContact);
  if (findings.length) throw new Error(`Privacy guard: ${findings.join("; ")}`);
  for (const expected of expectedText) {
    if (!bodyText.includes(expected)) {
      throw new Error(`Missing expected text: ${expected}\nVisible text:\n${bodyText.slice(0, 2000)}`);
    }
  }
  if (/something went wrong|couldn.t connect|try again|loading moments/i.test(bodyText)) {
    throw new Error("The page still contains an error or loading state.");
  }
  const visibleAlerts = (await page.locator('[role="alert"]:visible').allTextContents())
    .map((value) => value.trim())
    .filter(Boolean);
  if (visibleAlerts.length) throw new Error(`Visible alert/toast: ${visibleAlerts.join(" | ")}`);
  const brokenImages = await page.locator("img").evaluateAll((images) =>
    images
      .filter((image) => {
        const rect = image.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0
          && rect.bottom > 0 && rect.right > 0
          && rect.top < window.innerHeight && rect.left < window.innerWidth;
        return visible && (!image.complete || image.naturalWidth === 0);
      })
      .map((image) => image.getAttribute("src") ?? "<missing src>"),
  );
  if (brokenImages.length) throw new Error(`Broken image(s): ${brokenImages.join(", ")}`);
}

async function openPage(context, route, expectedText) {
  const page = await context.newPage();
  await page.goto(new URL(route, baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await waitForStablePage(page);
  await assertPublishable(page, expectedText);
  return page;
}

async function activateMoments(page) {
  await page.getByRole("button", { name: "Moments", exact: true }).click();
  await page.locator('[data-testid="pet-moments-loading"]').waitFor({ state: "hidden", timeout: 10_000 });
  const firstMoment = page.locator('[data-testid="social-moment-card"]').first();
  await firstMoment.waitFor({ state: "visible", timeout: 10_000 });
  await firstMoment.scrollIntoViewIfNeeded();
  await firstMoment.evaluate((element) => {
    const scrollable = (node) => {
      const style = getComputedStyle(node);
      return /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    };
    let ancestor = element.parentElement;
    while (ancestor && !scrollable(ancestor)) ancestor = ancestor.parentElement;
    if (ancestor) ancestor.scrollBy({ top: -16, behavior: "instant" });
    else window.scrollBy({ top: -16, behavior: "instant" });
  });
  await page.waitForTimeout(350);
  await assertPublishable(page, ["Linky"]);
}

async function captureSet(browser, { viewport, deviceScaleFactor, suffix }) {
  const context = await browser.newContext({
    viewport,
    screen: viewport,
    deviceScaleFactor,
    locale: "en-MY",
    timezoneId: "Asia/Kuala_Lumpur",
    colorScheme: "light",
    reducedMotion: "reduce",
  });

  const profile = await openPage(context, routes.shareProfile, [
    "Linky",
    "Kampung Dog",
    "SHARED BY",
    "MyPetLink",
    "Loyal",
    "Protective",
    "Affectionate",
  ]);
  await profile.screenshot({ path: path.join(outputDir, `02_share_profile${suffix}.png`) });

  await activateMoments(profile);
  await profile.screenshot({ path: path.join(outputDir, `03_share_profile_moments${suffix}.png`) });
  await profile.close();

  const community = await openPage(context, routes.community, [
    "Community",
    "Suggested pets",
    "Latest Moments",
    "Linko",
    "Linky",
    "@mypetlink",
  ]);
  await community.locator('[data-testid="explore-pets"]').waitFor({ state: "visible" });
  await community.locator('[data-testid="social-moment-stream"]').waitFor({ state: "visible" });
  await assertPublishable(community, ["Community", "Latest Moments"]);
  await community.screenshot({ path: path.join(outputDir, `04_community${suffix}.png`) });
  await community.close();

  await context.close();
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--hide-scrollbars"],
});

try {
  await captureSet(browser, {
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    suffix: "_mobile",
  });
  await captureSet(browser, {
    viewport: { width: 720, height: 900 },
    deviceScaleFactor: 1.5,
    suffix: "",
  });
} finally {
  await browser.close();
}

console.log(JSON.stringify({
  outputDir,
  routes,
  mobileViewport: { width: 430, height: 932, deviceScaleFactor: 3 },
  carouselViewport: { width: 720, height: 900, deviceScaleFactor: 1.5 },
}, null, 2));
