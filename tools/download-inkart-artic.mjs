/**
 * 从 Art Institute of Chicago Open Access 补录中国书画
 * 用法: node tools/download-inkart-artic.mjs
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
const MAX_ADD = 100;
const IIIF = "https://www.artic.edu/iiif/2";

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
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "AIC-User-Agent": UA,
      Accept: "image/*,*/*"
    }
  });
  if (!res.ok) throw new Error(`dl ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 3000) throw new Error("too small");
  fs.writeFileSync(dest, buf);
  return buf.length;
}

function dynastyFrom(date, place) {
  const t = `${date || ""} ${place || ""}`.toLowerCase();
  if (/tang|唐/.test(t)) return { dynasty: "唐", era: "tang" };
  if (/yuan|元/.test(t)) return { dynasty: "元", era: "yuan" };
  if (/ming|明/.test(t)) return { dynasty: "明", era: "ming" };
  if (/qing|清/.test(t)) return { dynasty: "清", era: "qing" };
  if (/southern song|南宋/.test(t)) return { dynasty: "宋", era: "southsong" };
  if (/northern song|北宋/.test(t)) return { dynasty: "宋", era: "northsong" };
  if (/song|宋/.test(t)) return { dynasty: "宋", era: "song" };
  if (/five dynasties|五代/.test(t)) return { dynasty: "五代", era: "northsong" };
  return { dynasty: "宋", era: "song" };
}

function inferMotifs(title, fallback) {
  const t = String(title || "").toLowerCase();
  const hits = new Set(fallback || []);
  const rules = [
    [/mountain|landscape|山/, "mountain"],
    [/river|stream|lake|水|江|溪/, "water"],
    [/boat|fisherman|渔|舟/, "boat"],
    [/plum|梅/, "plum"],
    [/bamboo|竹/, "bamboo"],
    [/orchid|兰/, "orchid"],
    [/chrysanthemum|菊/, "chrys"],
    [/pine|松/, "pine"],
    [/willow|柳/, "willow"],
    [/snow|雪/, "snow"],
    [/rain|mist|cloud|雨|云/, "mist"],
    [/moon|月/, "moon"],
    [/bird|crane|goose|鸟|鹤|雁/, "geese"],
    [/flower|blossom|lotus|花|荷/, "blossom"],
    [/pavilion|temple|楼|亭|寺/, "pavilion"],
    [/horse|马/, "horse"],
    [/hut|dwelling|居|斋/, "hut"],
    [/autumn|秋/, "autumn"],
    [/spring|春/, "spring"],
    [/waterfall|瀑/, "waterfall"],
    [/rock|石/, "rock"],
    [/scholar|figure|人/, "figure"]
  ];
  for (const [re, m] of rules) if (re.test(t)) hits.add(m);
  if (!hits.size) hits.add("mountain");
  return [...hits].slice(0, 5);
}

function inferScenes(motifs, fallback) {
  const s = new Set(fallback || []);
  const map = {
    mountain: "mountain", water: "river", boat: "river", plum: "plum", bamboo: "bamboo",
    orchid: "orchid", chrys: "chrys", pine: "pine", willow: "spring", snow: "snow",
    mist: "mountain", moon: "moon", geese: "autumn", blossom: "spring", pavilion: "travel",
    horse: "frontier", hut: "home", autumn: "autumn", spring: "spring", waterfall: "mountain"
  };
  for (const m of motifs) if (map[m]) s.add(map[m]);
  if (!s.size) s.add("mountain");
  return [...s].slice(0, 3);
}

const QUERIES = [
  { q: "Chinese landscape painting", motifs: ["mountain", "mist", "water"], scenes: ["mountain"] },
  { q: "Chinese ink painting bamboo", motifs: ["bamboo"], scenes: ["bamboo", "zen"] },
  { q: "Chinese plum blossom painting", motifs: ["plum", "blossom"], scenes: ["plum"] },
  { q: "Chinese orchid painting", motifs: ["orchid"], scenes: ["orchid"] },
  { q: "Chinese bird and flower painting", motifs: ["blossom", "geese"], scenes: ["spring"] },
  { q: "Chinese snow landscape", motifs: ["snow", "mountain"], scenes: ["snow"] },
  { q: "Chinese fisherman painting", motifs: ["boat", "water"], scenes: ["river"] },
  { q: "Shen Zhou Chinese", motifs: ["mountain", "figure", "pine"], scenes: ["mountain"] },
  { q: "Wen Zhengming Chinese", motifs: ["orchid", "bamboo"], scenes: ["orchid"] },
  { q: "Tang Yin Chinese painting", motifs: ["mountain", "figure"], scenes: ["travel"] },
  { q: "Dong Qichang landscape", motifs: ["mountain", "mist"], scenes: ["mountain", "zen"] },
  { q: "Bada Shanren", motifs: ["geese", "rock", "blossom"], scenes: ["zen"] },
  { q: "Shitao Chinese", motifs: ["mountain", "waterfall"], scenes: ["mountain"] },
  { q: "Ma Yuan Chinese painting", motifs: ["mountain", "willow", "water"], scenes: ["spring"] },
  { q: "Xia Gui Chinese", motifs: ["mountain", "mist", "water"], scenes: ["river"] },
  { q: "Ni Zan Chinese", motifs: ["hut", "mist", "bamboo"], scenes: ["home", "zen"] },
  { q: "Wang Meng Chinese", motifs: ["mountain", "pine", "hut"], scenes: ["mountain"] },
  { q: "Huang Gongwang", motifs: ["mountain", "water", "hut"], scenes: ["mountain", "home"] },
  { q: "Chinese horse painting", motifs: ["horse", "figure"], scenes: ["frontier"] },
  { q: "Chinese willow painting", motifs: ["willow", "spring"], scenes: ["spring", "farewell"] },
  { q: "Chinese moon painting", motifs: ["moon", "night"], scenes: ["moon", "night"] },
  { q: "Chinese chrysanthemum painting", motifs: ["chrys", "autumn"], scenes: ["chrys"] },
  { q: "Chinese pine painting", motifs: ["pine", "mountain"], scenes: ["pine"] },
  { q: "Chinese lotus painting", motifs: ["blossom", "water"], scenes: ["spring"] },
  { q: "Qing dynasty Chinese landscape", motifs: ["mountain", "mist"], scenes: ["mountain"] },
  { q: "Ming dynasty Chinese painting", motifs: ["mountain", "figure"], scenes: ["mountain"] },
  { q: "Song dynasty Chinese painting", motifs: ["mountain", "mist"], scenes: ["mountain"] },
  { q: "Yuan dynasty Chinese landscape", motifs: ["mountain", "hut"], scenes: ["mountain", "home"] },
  { q: "Chinese rain landscape painting", motifs: ["rain", "mist", "boat"], scenes: ["rain"] },
  { q: "Chinese bridge landscape painting", motifs: ["bridge", "water"], scenes: ["travel", "river"] },
  { q: "Chinese village landscape painting", motifs: ["hut", "field", "willow"], scenes: ["field", "home"] },
  { q: "Chinese moon night landscape", motifs: ["moon", "night"], scenes: ["moon", "night"] },
  { q: "Chinese wine drinking painting", motifs: ["wine", "figure"], scenes: ["wine"] },
  { q: "Chinese horse painting Yuan", motifs: ["horse", "figure"], scenes: ["frontier"] },
  { q: "Chinese wind pine painting", motifs: ["wind", "pine"], scenes: ["wind", "pine"] },
  { q: "Chinese peach blossom spring painting", motifs: ["blossom", "spring"], scenes: ["love", "spring", "dream"] }
];

const gallery = loadGallery();
const seenIds = new Set(gallery.map(g => g.id));
const seenUrls = new Set(gallery.map(g => g.source));
let added = 0;

console.log(`现有图库 ${gallery.length} 幅，开始从 Art Institute of Chicago 补录…`);

for (const item of QUERIES) {
  if (added >= MAX_ADD) break;
  try {
    const url =
      `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(item.q)}` +
      `&query[term][is_public_domain]=true&limit=20` +
      `&fields=id,title,artist_title,date_display,place_of_origin,image_id,is_public_domain,artwork_type_title,department_title,classification_title`;
    const data = await getJson(url);
    for (const obj of data.data || []) {
      if (added >= MAX_ADD) break;
      if (!obj.is_public_domain || !obj.image_id) continue;
      const blob = `${obj.title || ""} ${obj.artist_title || ""} ${obj.place_of_origin || ""} ${obj.department_title || ""} ${obj.classification_title || ""}`;
      if (!/China|Chinese|中国|Asia/i.test(blob) && !/China|Chinese/i.test(item.q)) continue;
      if (/sculpture|ceramic|bronze|jade|porcelain|vessel|textile|photograph|coin/i.test(
        `${obj.artwork_type_title || ""} ${obj.classification_title || ""} ${obj.title || ""}`
      )) continue;

      const id = `artic-${obj.id}`;
      if (seenIds.has(id)) continue;
      const img = `${IIIF}/${obj.image_id}/full/843,/0/default.jpg`;
      if (seenUrls.has(img)) continue;

      const file = `${id}.jpg`;
      const dest = path.join(OUT_DIR, file);
      try {
        if (!fs.existsSync(dest)) {
          const n = await download(img, dest);
          console.log(`✓ ${id} ${(n / 1024).toFixed(0)}KB — ${obj.title}`);
        } else {
          console.log(`· 已有 ${id}`);
        }
      } catch (e) {
        console.log(`× ${id}: ${e.message}`);
        continue;
      }

      const dyn = dynastyFrom(obj.date_display, obj.place_of_origin);
      const motifs = inferMotifs(obj.title, item.motifs);
      gallery.push({
        id,
        title: String(obj.title || item.q).slice(0, 48),
        artist: (obj.artist_title || "历代名家").slice(0, 40),
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
      await sleep(100);
    }
  } catch (e) {
    console.log(`× 查询失败: ${item.q} — ${e.message}`);
  }
  await sleep(200);
}

fs.writeFileSync(GALLERY_JS, `/* 本地水墨画图库 · 自动生成，勿手改 */\nwindow.INK_GALLERY = ${JSON.stringify(gallery)};\n`, "utf8");
fs.writeFileSync(CATALOG_JSON, JSON.stringify(gallery, null, 2), "utf8");
console.log(`\n完成：新增 ${added}，图库共 ${gallery.length} 幅`);
