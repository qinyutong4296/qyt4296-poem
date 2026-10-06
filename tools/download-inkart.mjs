/**
 * 从 Wikimedia Commons 下载公有领域中国水墨画到本地
 * 用法: node tools/download-inkart.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "inkart");
const SRC = path.join(__dirname, "ink-source-catalog.json");
const UA = "MoyunShijing/1.0 (poetry site; educational; contact: local)";
const THUMB = 900;

fs.mkdirSync(OUT_DIR, { recursive: true });

const catalog = JSON.parse(fs.readFileSync(SRC, "utf8"));
const CATALOG_JSON = path.join(OUT_DIR, "catalog.json");
const GALLERY_JS = path.join(ROOT, "js", "data", "ink-gallery.js");

function loadExisting() {
  if (fs.existsSync(CATALOG_JSON)) {
    try { return JSON.parse(fs.readFileSync(CATALOG_JSON, "utf8")); } catch { /* fall through */ }
  }
  return [];
}

async function api(params) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function resolveFile(commonsTitle) {
  const title = commonsTitle.startsWith("File:") ? commonsTitle : `File:${commonsTitle}`;
  const data = await api({
    action: "query",
    titles: title,
    prop: "imageinfo",
    iiprop: "url|mime|size",
    iiurlwidth: String(THUMB)
  });
  const page = Object.values(data.query.pages)[0];
  if (!page || page.missing != null || !page.imageinfo) return null;
  const info = page.imageinfo[0];
  return {
    url: info.thumburl || info.url,
    mime: info.mime,
    title: page.title
  };
}

async function searchFile(query) {
  const data = await api({
    action: "query",
    list: "search",
    srsearch: `filetype:bitmap ${query}`,
    srnamespace: "6",
    srlimit: "8"
  });
  const hits = data.query?.search || [];
  for (const h of hits) {
    const file = await resolveFile(h.title);
    if (file && /^image\/(jpeg|png|webp)/.test(file.mime || "")) return file;
  }
  return null;
}

function extFromMime(mime, url) {
  if (mime?.includes("png")) return ".png";
  if (mime?.includes("webp")) return ".webp";
  if (url?.includes(".png")) return ".png";
  return ".jpg";
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2000) throw new Error("too small");
  fs.writeFileSync(dest, buf);
  return buf.length;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const SCENE_MOTIF = {
  moon: ["moon", "night"], night: ["moon", "night"], dream: ["moon", "mist"],
  mountain: ["mountain"], zen: ["mountain", "mist"], pine: ["pine"],
  river: ["water", "boat"], travel: ["mountain", "boat"], home: ["hut"],
  plum: ["plum"], bamboo: ["bamboo"], rain: ["rain", "mist"], snow: ["snow"],
  autumn: ["autumn", "leaves", "geese"], spring: ["spring", "willow", "blossom"],
  farewell: ["willow", "boat"], love: ["moon", "blossom"], field: ["hut", "willow"],
  frontier: ["fort", "horse"], nation: ["fort"], wine: ["wine", "moon"],
  wind: ["wind", "leaves"], orchid: ["orchid"], chrys: ["chrys"]
};

const existing = loadExisting();
const out = [...existing];
const knownIds = new Set(existing.map(x => x.id));
let ok = 0, fail = 0;

console.log(`已有图库 ${existing.length} 幅；源目录 ${catalog.length} 条，开始补录…`);

for (const item of catalog) {
  if (knownIds.has(item.id)) {
    const hit = out.find(x => x.id === item.id);
    if (hit && fs.existsSync(path.join(OUT_DIR, hit.file))) {
      console.log(`· 已有 ${item.id}`);
      continue;
    }
  }
  const queries = [
    item.commons,
    `${item.artist} ${item.title}`,
    `${item.title} Chinese painting`,
    `${item.artist} landscape painting`
  ].filter(Boolean);

  let file = null;
  let used = "";
  for (const q of queries) {
    try {
      if (q === item.commons || q.endsWith(".jpg") || q.endsWith(".png")) {
        file = await resolveFile(q);
      }
      if (!file) file = await searchFile(q.replace(/\.jpg$/i, "").replace(/\.png$/i, ""));
      if (file) { used = q; break; }
    } catch (e) {
      /* try next */
    }
    await sleep(200);
  }

  if (!file) {
    console.log(`× 未找到: ${item.id} (${item.title})`);
    fail++;
    await sleep(300);
    continue;
  }

  const ext = extFromMime(file.mime, file.url);
  const filename = `${item.id}${ext}`;
  const dest = path.join(OUT_DIR, filename);
  try {
    if (!fs.existsSync(dest)) {
      const n = await download(file.url, dest);
      console.log(`✓ ${item.id} ← ${used} (${(n / 1024).toFixed(0)} KB)`);
    } else {
      console.log(`· 已有 ${item.id}`);
    }
    const entry = {
      id: item.id,
      title: item.title,
      artist: item.artist,
      dynasty: item.dynasty,
      era: item.era || null,
      motifs: item.motifs || [],
      scenes: item.scenes || [],
      file: filename,
      source: file.title || item.commons
    };
    const idx = out.findIndex(x => x.id === item.id);
    if (idx >= 0) out[idx] = entry;
    else out.push(entry);
    knownIds.add(item.id);
    ok++;
  } catch (e) {
    console.log(`× 下载失败: ${item.id} ${e.message}`);
    fail++;
  }
  await sleep(350);
}

/* 再从 Commons 分类补一批山水 */
const CATEGORIES = [
  "Category:Shan shui",
  "Category:Chinese landscape paintings",
  "Category:Ink and wash paintings of China"
];

const existingIds = new Set(out.map(x => x.id));
let extraIdx = out.filter(x => String(x.id).startsWith("commons-")).length;

for (const cat of CATEGORIES) {
  try {
    const data = await api({
      action: "query",
      list: "categorymembers",
      cmtitle: cat,
      cmtype: "file",
      cmlimit: "40"
    });
    const members = data.query?.categorymembers || [];
    for (const m of members) {
      if (out.length >= 200) break;
      const id = `commons-cat-${++extraIdx}`;
      if (existingIds.has(id)) continue;
      if ([...existingIds].some(x => m.title.toLowerCase().includes(String(x).replace(/-/g, " ")))) continue;
      const file = await resolveFile(m.title);
      if (!file || !/^image\/(jpeg|png|webp)/.test(file.mime || "")) continue;
      const ext = extFromMime(file.mime, file.url);
      const filename = `${id}${ext}`;
      const dest = path.join(OUT_DIR, filename);
      try {
        if (!fs.existsSync(dest)) await download(file.url, dest);
        const name = m.title.replace(/^File:/, "").replace(/\.[^.]+$/, "");
        out.push({
          id,
          title: name.slice(0, 40),
          artist: "历代名家",
          dynasty: "宋",
          era: "song",
          motifs: ["mountain", "water", "mist"],
          scenes: ["mountain", "river"],
          file: filename,
          source: m.title
        });
        existingIds.add(id);
        ok++;
        console.log(`+ 分类补录 ${id}: ${name.slice(0, 36)}`);
      } catch { /* skip */ }
      await sleep(350);
    }
  } catch (e) {
    console.log(`分类失败 ${cat}: ${e.message}`);
  }
}

const catalogJs = `/* 本地水墨画图库 · 自动生成，勿手改 */
window.INK_GALLERY = ${JSON.stringify(out)};
`;
fs.writeFileSync(GALLERY_JS, catalogJs, "utf8");
fs.writeFileSync(CATALOG_JSON, JSON.stringify(out, null, 2), "utf8");

console.log(`\n完成: 本次新增/更新 ${ok}，失败 ${fail}，图库 ${out.length} 幅`);
console.log(`目录: ${OUT_DIR}`);
console.log(`清单: js/data/ink-gallery.js`);
