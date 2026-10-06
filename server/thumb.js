/**
 * 局域网缩略图：按需用 sharp 生成并落盘缓存。
 * 未安装 sharp 时回退原图（仍能流式发送）。
 */
const path = require("path");
const fs = require("fs");
const fsp = require("fs").promises;

let sharp = null;
try {
  sharp = require("sharp");
} catch (_) {
  sharp = null;
}

const SAFE_RE = /^(inkart|poets)\/[A-Za-z0-9._\-]+\.(jpe?g|png|webp|gif)$/i;

function resolveAsset(root, rel) {
  const cleaned = String(rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!SAFE_RE.test(cleaned)) return null;
  const abs = path.resolve(path.join(root, "assets", cleaned));
  const base = path.resolve(path.join(root, "assets"));
  if (!abs.startsWith(base + path.sep) && abs !== base) return null;
  return { abs, rel: cleaned };
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

/**
 * Express 中间件工厂：GET /api/thumb?path=inkart/foo.jpg&w=480
 */
function createThumbHandler(root) {
  const cacheRoot = path.join(__dirname, ".cache", "thumbs");

  return async function thumbHandler(req, res) {
    const resolved = resolveAsset(root, req.query.path);
    if (!resolved) return res.status(400).json({ error: "无效路径" });

    let w = parseInt(req.query.w, 10);
    if (!Number.isFinite(w)) w = 480;
    w = Math.min(960, Math.max(120, w));

    try {
      await fsp.access(resolved.abs, fs.constants.R_OK);
    } catch {
      return res.status(404).json({ error: "图片不存在" });
    }

    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    res.setHeader("Vary", "Accept");

    if (!sharp) {
      return res.sendFile(resolved.abs);
    }

    const cacheName = resolved.rel.replace(/\//g, "__") + ".w" + w + ".jpg";
    const cacheFile = path.join(cacheRoot, cacheName);

    try {
      await fsp.access(cacheFile, fs.constants.R_OK);
      res.type("jpeg");
      return res.sendFile(cacheFile);
    } catch (_) {
      /* generate below */
    }

    try {
      await ensureDir(cacheRoot);
      const buf = await sharp(resolved.abs)
        .rotate()
        .resize({ width: w, height: Math.round(w * 1.4), fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 72, mozjpeg: true, progressive: true })
        .toBuffer();
      await fsp.writeFile(cacheFile, buf);
      res.type("jpeg");
      res.setHeader("Content-Length", buf.length);
      return res.end(buf);
    } catch (err) {
      console.warn("[thumb]", resolved.rel, err.message);
      return res.sendFile(resolved.abs);
    }
  };
}

function sharpReady() {
  return !!sharp;
}

module.exports = { createThumbHandler, sharpReady };
