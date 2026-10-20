/**
 * Renders the October 2026 social posts:
 *   - 4:5 carousel slides (1080 x 1350 PNG) for Instagram, Threads and TikTok photo mode
 *   - 9:16 video (1080 x 1920 MP4, 30 fps, silent AAC track) for Reels and TikTok
 *
 * Frames are HTML, rendered in the local Chrome/Edge. Video is captured frame
 * by frame by pausing every CSS animation at an exact time, so output is
 * deterministic and smooth regardless of machine speed.
 *
 *   node marketing/social/2026-10-posts/render.mjs [--post 01] [--only carousel|video|stills] [--out DIR]
 *
 * Output defaults to the machine's marketing media root (see
 * marketing/demo/output-root.local), never the source drive.
 */

import { spawn } from "node:child_process";
import { promises as fs, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright-core";
import { resolveOutputRoot } from "../../demo/scripts/output-root.mjs";
import { posts } from "./content.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const FPS = 30;

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
    return pairs;
  }, []),
);

const fileUrl = (relative) => pathToFileURL(path.resolve(repoRoot, relative)).href;

// ---------------------------------------------------------------- templates

const icons = {
  check: `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  cross: `<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>`,
  qr: `<svg viewBox="0 0 48 48"><g fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"/><rect x="28" y="4" width="16" height="16" rx="3"/><rect x="4" y="28" width="16" height="16" rx="3"/><rect x="28" y="28" width="6" height="6" rx="1.5"/><rect x="38" y="28" width="6" height="6" rx="1.5"/><rect x="28" y="38" width="6" height="6" rx="1.5"/><rect x="38" y="38" width="6" height="6" rx="1.5"/></g><g fill="#fff"><rect x="9" y="9" width="6" height="6" rx="1"/><rect x="33" y="9" width="6" height="6" rx="1"/><rect x="9" y="33" width="6" height="6" rx="1"/></g></svg>`,
  nfc: `<svg viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M14 16a12 12 0 0 1 0 16"/><path d="M22 10a20 20 0 0 1 0 28"/><path d="M30 5a27 27 0 0 1 0 38"/></g><circle cx="8" cy="24" r="4" fill="currentColor"/></svg>`,
  airtag: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="24" cy="24" r="8" fill="currentColor"/></svg>`,
  gps: `<svg viewBox="0 0 48 48"><path d="M24 44s14-14.5 14-25a14 14 0 0 0-28 0c0 10.5 14 25 14 25z" fill="currentColor"/><circle cx="24" cy="19" r="5.5" fill="#fff"/></svg>`,
};

const a = (delay, extra = "") => `class="a ${extra}" style="--d:${delay.toFixed(2)}s"`;

function brandBar(index, total, mode, dark) {
  // Video keeps the logo to the opening and closing scenes: in between, the
  // bottom of a Reel or TikTok sits under the app's own caption.
  if (mode === "video" && index !== 0 && index !== total - 1) return "";
  const count = mode === "carousel" ? `<span class="count">${index + 1}/${total}</span>` : "";
  const logo = dark ? "apps/web/public/logo-dark.svg" : "apps/web/public/logo-horizontal.svg";
  return `<footer class="brand"><img src="${fileUrl(logo)}" alt="">${count}</footer>`;
}

function chip(text, tone = "") {
  return text ? `<div ${a(0.05, `chip ${tone}`)}>${text}</div>` : "";
}

function itemDelay(i, frame) {
  // Spread the reveals over the first ~60% of the scene.
  const n = frame.items?.length || 1;
  const span = Math.max(1.2, (frame.seconds ?? 5) * 0.55);
  return 0.55 + (i * span) / n;
}

const layouts = {
  hook: (f) => `
    <section class="hook tone-${f.tone ?? "coral"}">
      <div class="blob b1"></div><div class="blob b2"></div>
      <div ${a(0.0, "kicker")}>${f.kicker}</div>
      <h1 ${a(0.15, "big")}>${f.title}</h1>
      <p ${a(0.75, "sub")}>${f.sub}</p>
      <div class="art ${f.artMode === "photo" ? "photo" : "cutout"} n${f.art.length}">
        ${f.art.map((src, i) => `<img ${a(0.35 + i * 0.2, "pop")} src="${fileUrl(src)}" alt="">`).join("")}
      </div>
    </section>`,

  list: (f) => `
    <section class="list ${f.tone ? `tone-${f.tone}` : ""}">
      ${chip(f.chip, f.tone ?? "")}
      <h2 ${a(0.15)}>${f.title}</h2>
      <ol>
        ${f.items.map((text, i) => `<li ${a(itemDelay(i, f), "slide")}><span class="num">${i + 1}</span><span>${text}</span></li>`).join("")}
      </ol>
      ${f.foot ? `<p ${a(itemDelay(f.items.length, f), "foot")}>${f.foot}</p>` : ""}
    </section>`,

  twoCol: (f) => {
    const col = (c, base) => `
      <div ${a(base, `col ${c.tone}`)}>
        <h3>${c.label}</h3>
        <ul>${c.items.map((t, i) => `<li ${a(base + 0.35 + i * 0.4, "slide")}><i>${icons[c.tone === "bad" ? "cross" : "check"]}</i><span>${t}</span></li>`).join("")}</ul>
      </div>`;
    return `
    <section class="two">
      ${chip(f.chip)}
      <h2 ${a(0.15)}>${f.title}</h2>
      <div class="cols">${col(f.left, 0.5)}${col(f.right, 0.5 + 0.4 * (f.left.items.length + 1))}</div>
      ${f.foot ? `<p ${a(3.6, "foot")}>${f.foot}</p>` : ""}
    </section>`;
  },

  option: (f) => `
    <section class="option">
      <div class="opt-head">
        <div ${a(0.0, `opt-icon ${f.icon}`)}>${icons[f.icon]}</div>
        <h2 ${a(0.12)}>${f.name}</h2>
      </div>
      <p ${a(0.4, "what")}>${f.what}</p>
      <ul class="pc">
        ${f.pros.map((t, i) => `<li ${a(1.1 + i * 0.45, "slide good")}><i>${icons.check}</i><span>${t}</span></li>`).join("")}
        ${f.cons.map((t, i) => `<li ${a(1.1 + (f.pros.length + i) * 0.45, "slide bad")}><i>${icons.cross}</i><span>${t}</span></li>`).join("")}
      </ul>
    </section>`,

  table: (f) => {
    const cell = (v) =>
      v === "yes" ? `<td class="y"><i>${icons.check}</i></td>` : v === "no" ? `<td class="n"><i>${icons.cross}</i></td>` : `<td>${v}</td>`;
    return `
    <section class="table">
      <h2 ${a(0.05)}>${f.title}</h2>
      <table>
        <thead ${a(0.3)}><tr>${f.cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>${f.rows.map((r, i) => `<tr ${a(0.8 + i * 0.75, "slide")}><th>${r[0]}</th>${r.slice(1).map(cell).join("")}</tr>`).join("")}</tbody>
      </table>
      <p ${a(0.8 + f.rows.length * 0.75, "foot")}>${f.foot}</p>
    </section>`;
  },

  verdict: (f) => `
    <section class="verdict">
      <h2 ${a(0.05, "big")}>${f.title}</h2>
      ${f.lines.map((t, i) => `<p ${a(0.7 + i * 1.0, "line")}>${t}</p>`).join("")}
    </section>`,

  product: (f) => `
    <section class="product">
      ${chip(f.chip, "mint")}
      <h2 ${a(0.12)}>${f.title}</h2>
      <div class="prod">
        <div ${a(0.35, "phone")}><img src="${fileUrl(f.image)}" alt=""></div>
        <ul>${f.points.map((t, i) => `<li ${a(1.0 + i * 0.7, "slide")}><i>${icons.check}</i><span>${t}</span></li>`).join("")}</ul>
      </div>
      <p ${a(1.0 + f.points.length * 0.7, "price")}>${f.price}</p>
    </section>`,

  cta: (f) => `
    <section class="cta">
      <div class="blob b1"></div><div class="blob b2"></div>
      <div class="art cutout n${f.art.length}">${f.art.map((src, i) => `<img ${a(0.1 + i * 0.15, "pop")} src="${fileUrl(src)}" alt="">`).join("")}</div>
      <h2 ${a(0.3, "big")}>${f.title}</h2>
      <p ${a(0.9, "sub")}>${f.sub}</p>
    </section>`,
};

const css = String.raw`
:root{--cream:#FFF8F2;--white:#fff;--ink:#0D1B3D;--muted:#44506A;--coral:#FF7A6E;--apricot:#FFE9DE;--blue:#1570EF;--sky:#7CC6F4;--mint:#BFEAD7;--sage:#1D7B53;--bad:#D6453A}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:var(--w);height:var(--h);overflow:hidden;background:var(--cream);color:var(--ink);font-family:"Noto Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,h3,.kicker,.chip,.num,th,.price{font-family:Poppins,system-ui,sans-serif}
.stage{position:relative;width:100%;height:100%;padding:var(--pt) var(--pr) var(--pb) var(--pl);display:flex;flex-direction:column}
section{position:relative;flex:1;display:flex;flex-direction:column;gap:calc(26px*var(--s))}
b{color:var(--coral);font-weight:800}
.a{animation:rise .7s cubic-bezier(.2,.8,.2,1) var(--d) both}
.a.slide{animation-name:slide}
.a.pop{animation:pop .8s cubic-bezier(.2,1.3,.4,1) var(--d) both}
@keyframes rise{from{opacity:0;transform:translateY(40px)}}
@keyframes slide{from{opacity:0;transform:translateX(-50px)}}
@keyframes pop{from{opacity:0;transform:scale(.6) translateY(60px)}}
@keyframes drift{from{transform:translate(0,0) scale(1)}to{transform:translate(-60px,40px) scale(1.12)}}
@keyframes grow{from{width:var(--p0)}to{width:var(--p1)}}
.static .a,.static .blob{animation:none!important}
.blob{position:absolute;border-radius:50%;filter:blur(2px);animation:drift 8s ease-in-out both;z-index:0}
.b1{width:620px;height:620px;right:-260px;top:-120px;background:var(--coral);opacity:.16}
.b2{width:520px;height:520px;left:-260px;bottom:-60px;background:var(--mint);opacity:.45}
section>*{position:relative;z-index:1}
.chip{align-self:flex-start;background:var(--ink);color:#fff;font-weight:700;font-size:calc(30px*var(--s));letter-spacing:.04em;text-transform:uppercase;padding:calc(12px*var(--s)) calc(26px*var(--s));border-radius:999px}
.chip.mint{background:var(--sage)}
h2{font-size:calc(74px*var(--s));line-height:1.06;font-weight:800;letter-spacing:-.02em}
h2.big,h1.big{font-size:calc(104px*var(--s));line-height:1.0;letter-spacing:-.03em;font-weight:800}
.kicker{font-weight:700;font-size:calc(30px*var(--s));letter-spacing:.08em;text-transform:uppercase;color:var(--coral)}
.sub{font-size:calc(40px*var(--s));line-height:1.3;color:var(--muted);font-weight:500}
.foot{font-size:calc(30px*var(--s));line-height:1.4;color:var(--muted);font-weight:600;background:var(--white);border:2px solid var(--apricot);border-radius:calc(28px*var(--s));padding:calc(20px*var(--s)) calc(26px*var(--s))}
/* hook */
.hook{justify-content:flex-start}
.hook.tone-coral{--k:var(--coral)}
.hook.tone-ink{color:#fff}
.tone-ink-bg{background:var(--ink)!important}
.tone-ink-bg .sub{color:#C9D3EA}.tone-ink-bg .kicker{color:var(--sky)}
.art{margin-top:auto;display:flex;justify-content:center;align-items:flex-end;gap:calc(10px*var(--s))}
.art.cutout img{filter:drop-shadow(0 18px 18px rgba(13,27,61,.14))}
.art.cutout img{height:calc(560px*var(--s));width:auto}
.art.cutout.n2 img{height:calc(450px*var(--s))}
.cta h2.big{font-size:calc(86px*var(--s))}
.cta .art.cutout img{height:calc(440px*var(--s))}
.art.photo{margin-bottom:calc(70px*var(--s))}
.art.photo img{width:100%;height:calc(640px*var(--s));object-fit:cover;object-position:50% 40%;border-radius:calc(44px*var(--s));box-shadow:0 30px 60px rgba(0,0,0,.35)}
/* list */
ol,ul{list-style:none;display:flex;flex-direction:column;gap:calc(22px*var(--s))}
.static .list li{font-size:calc(35px*var(--s));padding-top:calc(20px*var(--s));padding-bottom:calc(20px*var(--s))}
.list li{display:flex;gap:calc(24px*var(--s));align-items:flex-start;background:var(--white);border-radius:calc(30px*var(--s));padding:calc(24px*var(--s)) calc(28px*var(--s));box-shadow:0 6px 0 var(--apricot);font-size:calc(37px*var(--s));line-height:1.32;font-weight:500}
.num{flex:none;width:calc(58px*var(--s));height:calc(58px*var(--s));border-radius:50%;background:var(--coral);color:#fff;display:grid;place-items:center;font-weight:800;font-size:calc(30px*var(--s));margin-top:calc(-2px*var(--s))}
.list.tone-mint .num{background:var(--sage)}
.list.tone-mint li{box-shadow:0 6px 0 var(--mint)}
/* two columns */
.cols{display:grid;grid-template-columns:var(--cols);gap:calc(24px*var(--s))}
.col{background:var(--white);border-radius:calc(34px*var(--s));padding:calc(30px*var(--s));border-top:calc(12px*var(--s)) solid var(--sage)}
.col.bad{border-color:var(--bad)}.col.blue{border-color:var(--blue)}.col.coral{border-color:var(--coral)}
.col h3{font-size:calc(40px*var(--s));line-height:1.15;font-weight:800;margin-bottom:calc(18px*var(--s))}
.col li,.pc li,.product li{display:flex;gap:calc(16px*var(--s));align-items:flex-start;font-size:calc(34px*var(--s));line-height:1.3;font-weight:500}
i{flex:none;display:grid;place-items:center;width:calc(48px*var(--s));height:calc(48px*var(--s));border-radius:50%;background:#E3F5EC;color:var(--sage)}
i svg{width:62%;height:62%}
.col.bad i,.pc .bad i,td.n i{background:#FDE4E1;color:var(--bad)}
.col.blue i{background:#E3EEFF;color:var(--blue)}.col.coral i{background:#FFE5E1;color:var(--coral)}
/* option */
.opt-head{display:flex;align-items:center;gap:calc(28px*var(--s))}
.opt-icon{width:calc(150px*var(--s));height:calc(150px*var(--s));border-radius:calc(40px*var(--s));display:grid;place-items:center;color:#fff;background:var(--ink)}
.opt-icon svg{width:58%;height:58%}
.opt-icon.qr,.opt-icon.nfc{background:var(--coral)}
.opt-icon.airtag,.opt-icon.gps{background:var(--blue)}
.option h2{font-size:calc(92px*var(--s))}
.what{font-size:calc(42px*var(--s));line-height:1.32;font-weight:600}
.pc{gap:calc(20px*var(--s));background:var(--white);border-radius:calc(34px*var(--s));padding:calc(32px*var(--s))}
.pc li{font-size:calc(36px*var(--s))}
/* table */
table{width:100%;border-collapse:separate;border-spacing:0 calc(12px*var(--s));font-size:calc(var(--tf)*var(--s));table-layout:fixed}
thead th{font-size:calc(var(--th)*var(--s));color:var(--muted);font-weight:700;text-align:center;vertical-align:bottom;padding:0 calc(6px*var(--s)) calc(8px*var(--s));line-height:1.2}
thead th:first-child{width:22%}
tbody tr{background:var(--white)}
tbody th{text-align:left;font-weight:800;padding:calc(22px*var(--s)) calc(20px*var(--s));border-radius:calc(22px*var(--s)) 0 0 calc(22px*var(--s))}
tbody td{text-align:center;font-weight:600;line-height:1.2;padding:calc(14px*var(--s)) calc(6px*var(--s))}
tbody td:last-child{border-radius:0 calc(22px*var(--s)) calc(22px*var(--s)) 0}
td i{margin:0 auto}
/* verdict */
.verdict{justify-content:center;gap:calc(36px*var(--s))}
.verdict .line{font-size:calc(52px*var(--s));line-height:1.25;font-weight:600}
/* product */
.prod{display:grid;grid-template-columns:var(--prodcols);gap:calc(30px*var(--s));align-items:start}
.phone{border-radius:calc(46px*var(--s));overflow:hidden;border:calc(12px*var(--s)) solid var(--ink);background:#fff;box-shadow:0 24px 50px rgba(13,27,61,.25);aspect-ratio:var(--phoneratio)}
.phone img{width:100%;height:100%;object-fit:cover;object-position:top}
.product ul{gap:calc(22px*var(--s));padding-top:calc(10px*var(--s))}
.price{margin-top:auto;align-self:stretch;text-align:center;background:var(--coral);color:#fff;font-weight:700;font-size:calc(34px*var(--s));padding:calc(22px*var(--s));border-radius:calc(40px*var(--s));line-height:1.2}
.price small{display:block;font-size:.72em;font-weight:600;opacity:.92;margin-top:calc(4px*var(--s))}
/* cta */
.cta{justify-content:center;text-align:center;align-items:center}
.cta .art{margin-top:0}
.cta .sub{max-width:90%}
/* brand footer */
.brand{position:absolute;left:var(--pl);right:var(--pr);bottom:var(--brandb);display:flex;justify-content:space-between;align-items:center;z-index:2}
.brand img{height:calc(54px*var(--s))}
.tone-ink-bg .brand img{background:#fff;border-radius:999px;padding:8px 18px;height:calc(70px*var(--s))}
.tone-ink-bg .count{color:#C9D3EA}
.static .list,.static .two,.static .option,.static .table{justify-content:center;padding-bottom:40px}
.list,.two,.option,.table{justify-content:center}
.count{font-family:Poppins;font-weight:700;color:var(--muted);font-size:26px}
.progress{position:absolute;left:var(--pl);right:var(--pr);top:calc(var(--pt) - 70px);height:10px;border-radius:5px;background:rgba(13,27,61,.12);overflow:hidden;z-index:3}
.progress span{display:block;height:100%;background:var(--coral);border-radius:5px;animation:grow var(--dur) linear both}
`;

const formats = {
  carousel: {
    w: 1080, h: 1350, s: 1.1,
    pad: { t: 96, r: 84, b: 150, l: 84 }, brandb: 52,
    vars: "--cols:1fr 1fr;--prodcols:44% 1fr;--phoneratio:9/15;--tf:30px;--th:24px",
  },
  video: {
    // TikTok / Reels safe area: right rail and bottom caption stay clear.
    w: 1080, h: 1920, s: 1,
    pad: { t: 250, r: 150, b: 470, l: 80 }, brandb: 400,
    vars: "--cols:1fr;--prodcols:46% 1fr;--phoneratio:9/16;--tf:34px;--th:26px",
  },
};

function pageHtml(frame, index, total, mode, timing) {
  const f = formats[mode];
  // Video text is read on a phone, so scenes are set larger wherever they fit
  // inside the safe area. Dense two-column and table scenes keep the base size.
  const scale = mode === "video" ? (frame.videoScale ?? (["twoCol", "table"].includes(frame.layout) ? 1 : 1.14)) : f.s;
  const body = layouts[frame.layout](frame);
  const inkBg = frame.tone === "ink" && frame.layout === "hook";
  const progress =
    mode === "video"
      ? `<div class="progress" style="--p0:${(timing.start / timing.total) * 100}%;--p1:${(timing.end / timing.total) * 100}%;--dur:${frame.seconds}s"><span></span></div>`
      : "";
  return `<!doctype html><html class="${mode === "carousel" ? "static" : ""}"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700;800&family=Poppins:wght@600;700;800&display=block" rel="stylesheet">
<style>:root{--w:${f.w}px;--h:${f.h}px;--s:${scale};--pt:${f.pad.t}px;--pr:${f.pad.r}px;--pb:${f.pad.b}px;--pl:${f.pad.l}px;--brandb:${f.brandb}px;${f.vars}}${css}</style>
</head><body class="${inkBg ? "tone-ink-bg" : ""}"><div class="stage">${progress}${body}${brandBar(index, total, mode, inkBg)}</div></body></html>`;
}

// ---------------------------------------------------------------- rendering

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("No Chrome or Edge found. Set CHROME_PATH.");
  return found;
}

async function loadPage(page, html, tmpDir, name) {
  const file = path.join(tmpDir, `${name}.html`);
  await fs.writeFile(file, html, "utf8");
  await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
  await page.evaluate(async () => {
    // Load every face the templates use, not only those this frame happens to use.
    await Promise.all(["600", "700", "800"].map((w) => document.fonts.load(`${w} 40px Poppins`)));
    await Promise.all(["400", "500", "600", "700", "800"].map((w) => document.fonts.load(`${w} 40px "Noto Sans"`)));
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r)))));
  });
  const fontsOk = await page.evaluate(() => document.fonts.check('800 40px Poppins') && document.fonts.check('500 40px "Noto Sans"'));
  if (!fontsOk) console.warn(`  ! brand fonts did not load for ${name}; falling back to system fonts`);
}

async function seek(page, seconds) {
  await page.evaluate((ms) => {
    for (const anim of document.getAnimations()) {
      anim.pause();
      anim.currentTime = ms;
    }
  }, seconds * 1000);
}

async function renderCarousel(browser, post, outDir, tmpDir) {
  const f = formats.carousel;
  const page = await browser.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 1 });
  const frames = post.frames.filter((fr) => fr.carousel !== false);
  const dir = path.join(outDir, "carousel");
  await fs.mkdir(dir, { recursive: true });
  for (const [i, frame] of frames.entries()) {
    await loadPage(page, pageHtml(frame, i, frames.length, "carousel"), tmpDir, `c-${i}`);
    const file = path.join(dir, `slide-${String(i + 1).padStart(2, "0")}.png`);
    await page.screenshot({ path: file, type: "png" });
    console.log(`  carousel ${path.basename(file)}`);
  }
  await page.close();
}

function startEncoder(file) {
  const proc = spawn(ffmpegPath, [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-shortest", "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", file,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
  const write = (buffer) => new Promise((resolve) => (proc.stdin.write(buffer) ? resolve() : proc.stdin.once("drain", resolve)));
  return { write, end: async () => { proc.stdin.end(); await done; } };
}

// Warns when a scene's settled content runs into the app's caption area.
async function checkSafeArea(page, label) {
  const f = formats.video;
  await seek(page, 60);
  const bottom = await page.evaluate(() => Math.max(...[...document.querySelectorAll("section :not(.blob)")].map((el) => el.getBoundingClientRect().bottom)));
  const limit = f.h - f.pad.b + 20;
  if (bottom > limit) console.warn(`  ! ${label}: content reaches y=${Math.round(bottom)}, past the safe area (${limit})`);
}

async function renderVideo(browser, post, outDir, tmpDir) {
  const f = formats.video;
  const page = await browser.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 1 });
  const frames = post.frames.filter((fr) => fr.video !== false);
  const total = frames.reduce((sum, fr) => sum + fr.seconds, 0);
  const stillsOnly = args.only === "stills";
  const file = path.join(outDir, "video.mp4");
  const encoder = stillsOnly ? null : startEncoder(file);
  let start = 0;
  for (const [i, frame] of frames.entries()) {
    const end = start + frame.seconds;
    await loadPage(page, pageHtml(frame, i, frames.length, "video", { start, end, total }), tmpDir, `v-${i}`);
    await checkSafeArea(page, `scene ${i + 1}`);
    if (stillsOnly) {
      const dir = path.join(outDir, "video-stills");
      await fs.mkdir(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `scene-${String(i + 1).padStart(2, "0")}.jpg`), type: "jpeg", quality: 85 });
      start = end;
      continue;
    }
    const count = Math.round(frame.seconds * FPS);
    for (let n = 0; n < count; n += 1) {
      await seek(page, n / FPS);
      await encoder.write(await page.screenshot({ type: "jpeg", quality: 94 }));
    }
    // The settled final state doubles as a still for covers and checks.
    if (i === 0) await page.screenshot({ path: path.join(outDir, "video-cover.jpg"), type: "jpeg", quality: 92 });
    console.log(`  video scene ${i + 1}/${frames.length} (${frame.seconds}s)`);
    start = end;
  }
  await page.close();
  if (stillsOnly) return;
  await encoder.end();
  console.log(`  video.mp4 — ${total.toFixed(1)}s`);
}

async function main() {
  const { root } = await resolveOutputRoot({ explicit: args.out });
  // Marketing media lives beside the capture batches, under Videos/.
  const base = args.out ? root : path.join(path.dirname(root), "Videos", "2026-10-social");
  const selected = posts.filter((p) => !args.post || p.id.startsWith(args.post));
  if (!selected.length) throw new Error(`No post matches ${args.post}`);

  const browser = await chromium.launch({ executablePath: findBrowser(), headless: true, args: ["--hide-scrollbars", "--font-render-hinting=none"] });
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mypetlink-social-"));
  try {
    for (const post of selected) {
      const outDir = path.join(base, post.id);
      await fs.mkdir(outDir, { recursive: true });
      console.log(`${post.id} -> ${outDir}`);
      if (!["video", "stills"].includes(args.only)) await renderCarousel(browser, post, outDir, tmpDir);
      if (args.only !== "carousel") await renderVideo(browser, post, outDir, tmpDir);
    }
  } finally {
    await browser.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
