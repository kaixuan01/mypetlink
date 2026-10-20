import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const workspace = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(workspace, "source", "reference-storyboard.png");
// Real Safety Profile capture of the marketing demo account (/q/linkodemo); its
// only contact option on screen is the WhatsApp button, so no number is shown.
const safetyProfilePath = path.join(workspace, "..", "..", "assets", "product", "safety-profile-linko-demo.png");
const logoPath = path.join(workspace, "..", "..", "..", "..", "apps", "web", "public", "logo-horizontal.svg");
const outputDir = path.join(workspace, "generated");
const canvas = { width: 1080, height: 1920 };

const panels = {
  lost: { left: 0, top: 0, width: 504, height: 508 },
  finder: { left: 520, top: 0, width: 504, height: 508 },
  scan: { left: 0, top: 522, width: 504, height: 456 },
  reunion: { left: 0, top: 992, width: 504, height: 544 }
};

// Every storyboard scene is AI artwork of a fictional situation and says so on screen.
const aiLabel = "AI 情境示意 · LINKO";

function svgBuffer(svg) {
  return Buffer.from(svg);
}

async function panelBuffer(name) {
  return sharp(sourcePath).extract(panels[name]).png().toBuffer();
}

function frameDecor(label) {
  return svgBuffer(`
    <svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFF8F2" stop-opacity="0.18"/>
          <stop offset="0.64" stop-color="#0D1B3D" stop-opacity="0.06"/>
          <stop offset="1" stop-color="#0D1B3D" stop-opacity="0.28"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#veil)"/>
      <rect x="72" y="188" width="936" height="1120" rx="52" fill="none" stroke="#FFFFFF" stroke-width="12" stroke-opacity="0.92"/>
      <rect x="92" y="110" width="420" height="64" rx="32" fill="#0D1B3D" fill-opacity="0.86"/>
      <text x="302" y="153" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="28" font-weight="700" fill="#FFFFFF">${label}</text>
    </svg>`);
}

async function makeFramedScene(panelName, outputName, options = {}) {
  const panel = await panelBuffer(panelName);
  const background = await sharp(panel)
    .resize(canvas.width, canvas.height, { fit: "cover", position: options.position ?? "centre" })
    .blur(32)
    .modulate({ brightness: 0.78, saturation: 0.88 })
    .png()
    .toBuffer();
  const foreground = await sharp(panel)
    .resize({ width: 912, height: 1100, fit: "contain", background: "#FFF8F2" })
    .png()
    .toBuffer();

  await sharp(background)
    .composite([
      { input: foreground, left: 84, top: 198 },
      { input: frameDecor(options.label ?? aiLabel), left: 0, top: 0 }
    ])
    .png()
    .toFile(path.join(outputDir, outputName));
}

async function makeLostClose() {
  const panel = await panelBuffer("lost");
  const background = await sharp(panel)
    .resize(canvas.width, canvas.height, { fit: "cover", position: "centre" })
    .blur(28)
    .modulate({ brightness: 0.68, saturation: 0.8 })
    .png()
    .toBuffer();
  const close = await sharp(panel)
    .extract({ left: 115, top: 118, width: 330, height: 330 })
    .resize(912, 912, { fit: "cover" })
    .png()
    .toBuffer();
  await sharp(background)
    .composite([
      { input: close, left: 84, top: 276 },
      { input: frameDecor(aiLabel), left: 0, top: 0 }
    ])
    .png()
    .toFile(path.join(outputDir, "scene-02-lost-close.png"));
}

async function makeContactScene() {
  // Header through the WhatsApp and Send Found Location buttons; leaves out the
  // lower page and the development indicator in the bottom corner.
  const page = await sharp(safetyProfilePath)
    .extract({ left: 0, top: 0, width: 1080, height: 1300 })
    .png()
    .toBuffer();
  const background = await sharp(page)
    .resize(canvas.width, canvas.height, { fit: "cover" })
    .blur(38)
    .modulate({ brightness: 0.62, saturation: 0.7 })
    .png()
    .toBuffer();
  const foreground = await sharp(page)
    .resize({ width: 912, height: 1100, fit: "contain", background: "#F5F9FF" })
    .png()
    .toBuffer();
  await sharp(background)
    .composite([
      { input: foreground, left: 84, top: 198 },
      { input: frameDecor("真实页面 · SAFETY PROFILE"), left: 0, top: 0 }
    ])
    .png()
    .toFile(path.join(outputDir, "scene-05-contact.png"));
}

async function makeEndCard() {
  const logoData = (await fs.readFile(logoPath)).toString("base64");
  const card = svgBuffer(`
    <svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#FFF8F2"/>
          <stop offset="0.7" stop-color="#FFFFFF"/>
          <stop offset="1" stop-color="#7CC6F4" stop-opacity="0.3"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#bg)"/>
      <circle cx="940" cy="300" r="300" fill="#FF7A6E" opacity="0.1"/>
      <circle cx="120" cy="1500" r="260" fill="#BFEAD7" opacity="0.4"/>
      <image href="data:image/svg+xml;base64,${logoData}" x="190" y="480" width="700" height="225" preserveAspectRatio="xMidYMid meet"/>
      <g font-family="Microsoft YaHei, Arial, sans-serif" text-anchor="middle">
        <text x="540" y="890" font-size="50" font-weight="800" fill="#0D1B3D">扫描 QR 或轻触 NFC</text>
        <text x="540" y="970" font-size="50" font-weight="800" fill="#0D1B3D">打开 Safety Profile</text>
        <text x="540" y="1150" font-size="30" font-weight="600" fill="#44506A">Linko 是 MyPetLink 的 AI 角色 · 本片为情境示意</text>
      </g>
    </svg>`);
  await sharp(card).png().toFile(path.join(outputDir, "scene-07-endcard.png"));
}

await fs.mkdir(outputDir, { recursive: true });
await makeFramedScene("lost", "scene-01-lost.png");
await makeLostClose();
await makeFramedScene("finder", "scene-03-finder.png");
await makeFramedScene("scan", "scene-04-scan.png", { label: "AI 情境示意 · SMART TAG" });
await makeContactScene();
await makeFramedScene("reunion", "scene-06-reunion.png");
await makeEndCard();

console.log(`Prepared 7 vertical scenes in ${outputDir}`);
