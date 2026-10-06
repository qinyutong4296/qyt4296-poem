/**
 * 把 assets/inkart 中未入清单的 cma-*.jpg 同步进图库
 * 用法: node tools/sync-inkart-orphans.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "assets", "inkart");
const CATALOG = path.join(OUT, "catalog.json");
const GALLERY = path.join(ROOT, "js", "data", "ink-gallery.js");
const UA = "MoyunShijing/1.0 (poetry education; local)";

const gallery = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
const seen = new Set(gallery.map(g => g.id));
const files = fs.readdirSync(OUT).filter(f => /^cma-\d+\.(jpg|png)$/i.test(f));

function dyn(c) {
  const t = (Array.isArray(c) ? c.join(" ") : c || "").toLowerCase();
  if (/tang|唐/.test(t)) return { dynasty: "唐", era: "tang" };
  if (/yuan|元/.test(t)) return { dynasty: "元", era: "yuan" };
  if (/ming|明/.test(t)) return { dynasty: "明", era: "ming" };
  if (/qing|清/.test(t)) return { dynasty: "清", era: "qing" };
  if (/northern song|北宋/.test(t)) return { dynasty: "宋", era: "northsong" };
  if (/southern song|南宋/.test(t)) return { dynasty: "宋", era: "southsong" };
  if (/song|宋/.test(t)) return { dynasty: "宋", era: "song" };
  return { dynasty: "宋", era: "song" };
}

function motifs(title, type) {
  const t = `${title} ${type}`.toLowerCase();
  const hits = new Set();
  const rules = [
    [/mountain|landscape|山|峰/, "mountain"],
    [/bamboo|竹/, "bamboo"],
    [/plum|梅/, "plum"],
    [/orchid|兰/, "orchid"],
    [/willow|柳/, "willow"],
    [/snow|雪/, "snow"],
    [/river|lake|stream|水|江|溪/, "water"],
    [/boat|渔|舟/, "boat"],
    [/pine|松/, "pine"],
    [/moon|月/, "moon"],
    [/bird|crane|鸟|鹤/, "geese"],
    [/flower|lotus|花|荷/, "blossom"],
    [/hut|dwelling|居|斋/, "hut"],
    [/autumn|秋/, "autumn"],
    [/spring|春/, "spring"],
    [/mist|cloud|云|烟/, "mist"],
    [/horse|马/, "horse"],
    [/waterfall|瀑/, "waterfall"],
    [/rock|石/, "rock"],
    [/figure|scholar|人/, "figure"]
  ];
  for (const [re, m] of rules) if (re.test(t)) hits.add(m);
  if (!hits.size) hits.add("mountain");
  return [...hits].slice(0, 5);
}

function scenes(ms) {
  const s = new Set();
  const map = {
    mountain: "mountain", water: "river", boat: "river", plum: "plum", bamboo: "bamboo",
    orchid: "orchid", willow: "spring", snow: "snow", pine: "pine", moon: "moon",
    geese: "autumn", blossom: "spring", hut: "home", autumn: "autumn", spring: "spring",
    horse: "frontier", mist: "mountain"
  };
  for (const m of ms) if (map[m]) s.add(map[m]);
  if (!s.size) s.add("mountain");
  return [...s].slice(0, 3);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

let added = 0;
for (const file of files) {
  const id = file.replace(/\.(jpg|png)$/i, "");
  if (seen.has(id)) continue;
  const oid = id.replace("cma-", "");
  try {
    const res = await fetch(`https://openaccess-api.clevelandart.org/api/artworks/${oid}`, {
      headers: { "User-Agent": UA }
    });
    if (!res.ok) {
      console.log(`× ${id} ${res.status}`);
      continue;
    }
    const data = await res.json();
    const obj = data.data || data;
    const d = dyn(obj.culture);
    const m = motifs(obj.title || "", obj.type || "");
    const artist = (obj.creators && obj.creators[0]?.description) || "历代名家";
    gallery.push({
      id,
      title: String(obj.title || id).slice(0, 48),
      artist: String(artist).replace(/\s*\(Chinese.*$/, "").trim().slice(0, 40) || "历代名家",
      dynasty: d.dynasty,
      era: d.era,
      motifs: m,
      scenes: scenes(m),
      file,
      source: obj.images?.web?.url || `cma:${oid}`
    });
    seen.add(id);
    added++;
    console.log(`✓ ${id} — ${obj.title}`);
  } catch (e) {
    console.log(`× ${id}: ${e.message}`);
  }
  await sleep(120);
}

fs.writeFileSync(CATALOG, JSON.stringify(gallery, null, 2), "utf8");
fs.writeFileSync(GALLERY, `/* 本地水墨画图库 · 自动生成，勿手改 */\nwindow.INK_GALLERY = ${JSON.stringify(gallery)};\n`, "utf8");
console.log(`\n同步 ${added} 幅，图库共 ${gallery.length} 幅`);
