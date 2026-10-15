import { readFile } from "node:fs/promises";
import { selectReleaseFlags, verifyReleaseHtml } from "./release-profile.mjs";
try {
  const flags = selectReleaseFlags(process.argv.slice(2), process.env);
  const files = ["index.html", "where-to-buy.html", "tags.html", "orders.html", "tags/order.html"];
  const html = Object.fromEntries(await Promise.all(files.map(async file => [file, await readFile(new URL(`../out/${file}`, import.meta.url), "utf8")])));
  verifyReleaseHtml(html, flags, { previewNoindex: process.env.NEXT_PUBLIC_NOINDEX === "true" });
  console.log("All four release flags verified against exported metadata and rendered Smart Tag availability.");
} catch (error) { console.error(`Release artifact verification failed: ${error.message}`); process.exit(1); }
