/**
 * 从 Smithsonian Open Access 补录中国书画
 * 用法: node tools/download-inkart-si.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "inkart");
const GALLERY_JS = path.join(ROOT, "js", "data", "ink-gallery.js");
const CATALOG_JSON = path.join(OUT_DIR, "catalog.json");
const UA = "MoyunShijing/1.0 (poetry education; local)";
const MAX_ADD = 180;
const API_KEY = "DEMO_KEY";

fs.mkdirSync(OUT_DIR, { recursive: true });

function loadGallery() {
  if (fs.existsSync(CATALOG_JSON)) return JSON.parse(fs.readFileSync(CATALOG_JSON, "utf8"));
  return [];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`dl ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 3000) throw new Error("too small");
  fs.writeFileSync(dest, buf);
  return buf.length;
}

function dynastyFrom(text) {
  const t = String(text || "").toLowerCase();
  if (/tang|唐/.test(t)) return { dynasty: "唐", era: "tang" };
  if (/yuan|元/.test(t)) return { dynasty: "元", era: "yuan" };
  if (/ming|明/.test(t)) return { dynasty: "明", era: "ming" };
  if (/qing|清/.test(t)) return { dynasty: "清", era: "qing" };
  if (/song|宋/.test(t)) return { dynasty: "宋", era: "song" };
  return { dynasty: "宋", era: "song" };
}

function inferMotifs(title, fallback) {
  const t = String(title || "").toLowerCase();
  const hits = new Set(fallback || []);
  const rules = [
    [/mountain|landscape|山/, "mountain"],
    [/river|stream|lake|水|江/, "water"],
    [/boat|fisherman|渔|舟/, "boat"],
    [/plum|梅/, "plum"],
    [/bamboo|竹/, "bamboo"],
    [/orchid|兰/, "orchid"],
    [/pine|松/, "pine"],
    [/willow|柳/, "willow"],
    [/snow|雪/, "snow"],
    [/mist|cloud|云/, "mist"],
    [/moon|月/, "moon"],
    [/bird|crane|鸟|鹤/, "geese"],
    [/flower|lotus|花|荷/, "blossom"],
    [/horse|马/, "horse"],
    [/autumn|秋/, "autumn"],
    [/spring|春/, "spring"],
    [/hut|dwelling|居/, "hut"],
    [/rock|石/, "rock"]
  ];
  for (const [re, m] of rules) if (re.test(t)) hits.add(m);
  if (!hits.size) hits.add("mountain");
  return [...hits].slice(0, 5);
}

function inferScenes(motifs, fallback) {
  const s = new Set(fallback || []);
  const map = {
    mountain: "mountain", water: "river", boat: "river", plum: "plum", bamboo: "bamboo",
    orchid: "orchid", pine: "pine", willow: "spring", snow: "snow", mist: "mountain",
    moon: "moon", geese: "autumn", blossom: "spring", horse: "frontier", hut: "home",
    autumn: "autumn", spring: "spring"
  };
  for (const m of motifs) if (map[m]) s.add(map[m]);
  if (!s.size) s.add("mountain");
  return [...s].slice(0, 3);
}

const QUERIES = [
  { q: "Chinese landscape painting", motifs: ["mountain", "mist"], scenes: ["mountain"] },
  { q: "Chinese ink painting bamboo", motifs: ["bamboo"], scenes: ["bamboo"] },
  { q: "Chinese plum blossom painting", motifs: ["plum"], scenes: ["plum"] },
  { q: "Chinese bird and flower painting", motifs: ["blossom", "geese"], scenes: ["spring"] },
  { q: "Chinese snow landscape painting", motifs: ["snow", "mountain"], scenes: ["snow"] },
  { q: "Shen Zhou painting", motifs: ["mountain", "figure"], scenes: ["mountain"] },
  { q: "Dong Qichang landscape", motifs: ["mountain", "mist"], scenes: ["mountain"] },
  { q: "Bada Shanren painting", motifs: ["geese", "rock"], scenes: ["zen"] },
  { q: "Chinese orchid painting", motifs: ["orchid"], scenes: ["orchid"] },
  { q: "Chinese willow painting", motifs: ["willow", "spring"], scenes: ["spring"] },
  { q: "Chinese horse painting", motifs: ["horse"], scenes: ["frontier"] },
  { q: "Chinese lotus painting", motifs: ["blossom", "water"], scenes: ["spring"] },
  { q: "Qing dynasty Chinese painting landscape", motifs: ["mountain"], scenes: ["mountain"] },
  { q: "Ming dynasty Chinese painting", motifs: ["mountain"], scenes: ["mountain"] },
  { q: "Song dynasty Chinese painting landscape", motifs: ["mountain", "mist"], scenes: ["mountain"] }
];

const gallery = loadGallery();
const seenIds = new Set(gallery.map(g => g.id));
const seenUrls = new Set(gallery.map(g => g.source));
let added = 0;

console.log(`现有图库 ${gallery.length} 幅，开始从 Smithsonian 补录…`);

for (const item of QUERIES) {
  if (added >= MAX_ADD) break;
  try {
    const url =
      `https://api.si.edu/openaccess/api/v1.0/search` +
      `?api_key=${API_KEY}&q=${encodeURIComponent(item.q + " online_media_type:Images")}` +
      `&rows=25`;
    const data = await getJson(url);
    const rows = data.response?.rows || [];
    for (const row of rows) {
      if (added >= MAX_ADD) break;
      const content = row.content || {};
      const freetext = content.freetext || {};
      const descriptive = content.descriptiveNonRepeating || {};
      const title = descriptive.title?.content || row.title || item.q;
      const media = descriptive.online_media?.media || [];
      const imgObj = media.find(m => m.type === "Images" && (m.content || m.thumbnail));
      if (!imgObj) continue;
      let img = imgObj.content || imgObj.thumbnail;
      if (!img) continue;
      /* 尽量取较大图 */
      if (img.includes("http://") ) img = img.replace("http://", "https://");

      const culture = JSON.stringify(freetext).slice(0, 500);
      const blob = `${title} ${culture} ${descriptive.unit_code || ""}`;
      if (!/China|Chinese|中国|Freer|Sackler|Asian Art/i.test(blob) && !/Chinese/i.test(item.q)) continue;
      if (/sculpture|ceramic|bronze|jade|porcelain|vessel|photograph|textile|coin|snuff/i.test(blob + title)) continue;

      const rawId = row.id || descriptive.record_ID || `${added}-${title}`;
      const id = `si-${String(rawId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48)}`;
      if (seenIds.has(id) || seenUrls.has(img)) continue;

      const file = `${id}.jpg`;
      const dest = path.join(OUT_DIR, file);
      try {
        if (!fs.existsSync(dest)) {
          const n = await download(img, dest);
          console.log(`✓ ${id} ${(n / 1024).toFixed(0)}KB — ${String(title).slice(0, 40)}`);
        } else console.log(`· 已有 ${id}`);
      } catch (e) {
        console.log(`× ${id}: ${e.message}`);
        continue;
      }

      const dateText = JSON.stringify(freetext.date || freetext.datePlace || "");
      const dyn = dynastyFrom(dateText + " " + title);
      const motifs = inferMotifs(title, item.motifs);
      const artist =
        (freetext.name && freetext.name[0]?.content) ||
        (freetext.creator && freetext.creator[0]?.content) ||
        "历代名家";

      gallery.push({
        id,
        title: String(title).slice(0, 48),
        artist: String(artist).slice(0, 40),
        dynasty: dyn.dynasty,
        era: dyn.era,
        motifs,
        scenes: inferScenes(motifs, item.scenes),
        file,
        source: img
      });
      seenIds.add(id);
      seenUrls.add(img);
      added++;
      await sleep(120);
    }
  } catch (e) {
    console.log(`× 查询失败: ${item.q} — ${e.message}`);
  }
  await sleep(250);
}

fs.writeFileSync(GALLERY_JS, `/* 本地水墨画图库 · 自动生成，勿手改 */\nwindow.INK_GALLERY = ${JSON.stringify(gallery)};\n`, "utf8");
fs.writeFileSync(CATALOG_JSON, JSON.stringify(gallery, null, 2), "utf8");
console.log(`\n完成：新增 ${added}，图库共 ${gallery.length} 幅`);
