/**
 * Minimal static server for the production export, with the Cloudflare-Pages
 * style 404.html fallback that the real deployment uses.
 * Threaded via Node's async I/O; keep-alive friendly.
 */
import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("apps/web/out");
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const candidates = [
    path.join(ROOT, clean),
    path.join(ROOT, clean + ".html"),
    path.join(ROOT, clean, "index.html"),
  ];
  for (const c of candidates) {
    if (!c.startsWith(ROOT)) continue;
    try { const s = await stat(c); if (s.isFile()) return { file: c, status: 200 }; } catch {}
  }
  return { file: path.join(ROOT, "404.html"), status: 404 };
}

http.createServer(async (req, res) => {
  const { file, status } = await resolve(req.url);
  res.writeHead(status, {
    "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`serving apps/web/out on http://localhost:${PORT}`));
