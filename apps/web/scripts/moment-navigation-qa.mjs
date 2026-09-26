/** Read-only browser QA. Run with the local web and API already running. */
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const web = process.env.QA_WEB_ORIGIN ?? "http://localhost:3000";
const api = process.env.QA_API_ORIGIN ?? "http://localhost:5281";
const response = await fetch(`${api}/api/v1/social/explore/moments`);
assert.equal(response.ok, true);
const { data } = await response.json();
const requestedTitle = process.env.QA_MOMENT_TITLE ?? "My Big Boss";
const moment = data.items.find((item) => item.title === requestedTitle && item.author)
  ?? data.items.find((item) => item.author);
assert.ok(moment, "Needs a visible Explore Moment with a household");
console.log(JSON.stringify({ requestedTitle, actualTitle: moment.title, exactFixtureAvailable: moment.title === requestedTitle }));

const browser = await chromium.launch({
  executablePath: process.env.QA_BROWSER_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});

async function back(page, label, destination) {
  const link = page.getByTestId("moment-back");
  await page.getByTestId("moment-detail").waitFor();
  await page.getByRole("link", { name: label, exact: true }).waitFor();
  assert.equal(await link.getAttribute("href"), destination);
  await link.click();
  await page.waitForURL(`${web}${destination}`);
}

try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    await page.goto(`${web}/explore`);
    const title = page.getByTestId("social-moment-stream").getByRole("link", { name: moment.title, exact: true });
    await title.waitFor();
    const href = await title.getAttribute("href");
    assert.equal(new URL(href, web).searchParams.get("returnTo"), "/explore");
    await title.click();
    await back(page, "Back to Explore", "/explore");

    // A new tab and a refresh retain the same deterministic destination.
    const newTab = await context.newPage();
    await newTab.goto(`${web}${href}`);
    await newTab.getByTestId("moment-detail").waitFor();
    await newTab.reload();
    await back(newTab, "Back to Explore", "/explore");
    await newTab.close();

    const profilePath = `/u/${moment.author.handle}`;
    await page.goto(`${web}${profilePath}`);
    await page.getByRole("link", { name: moment.title, exact: true }).click();
    await back(page, `Back to ${moment.author.displayName}`, profilePath);

    // Follow a card's Comments action, including its fragment.
    await page.goto(`${web}/explore`);
    const card = page.getByTestId("social-moment-card").filter({ has: page.getByRole("link", { name: moment.title, exact: true }) });
    assert.ok((await card.getByTestId("moment-comment-action").getAttribute("href")).endsWith("#comments"));
    await card.getByTestId("moment-comment-action").click();
    await page.getByTestId("moment-detail").waitFor();
    await back(page, "Back to Explore", "/explore");

    for (const [returnTo, label] of [
      ["/search?q=Big%20Boss", "Back to Search"],
      ["/explore?species=Dog", "Back to Explore"],
    ]) {
      await page.goto(`${web}/moments/${moment.id}?returnTo=${encodeURIComponent(returnTo)}`);
      await back(page, label, returnTo);
    }
    await page.getByRole("button", { name: "Filter pets by type. Dogs selected.", exact: true }).waitFor();

    await page.goto(`${web}/moments/${moment.id}`);
    await back(page, `Back to ${moment.author.displayName}`, profilePath);
    await page.goto(`${web}/moments/${moment.id}?returnTo=${encodeURIComponent("https://evil.test")}&returnLabel=Bank`);
    await back(page, `Back to ${moment.author.displayName}`, profilePath);
    assert.equal(new URL(page.url()).origin, web);
    console.log(JSON.stringify({ width, explore: "passed", profile: "passed", comments: "passed", refreshAndNewTab: "passed", search: "passed", filter: "passed", directAndMalicious: "passed", anonymous: "passed" }));
    await context.close();
  }
} finally {
  await browser.close();
}
