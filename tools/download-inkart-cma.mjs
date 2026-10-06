/**
 * 从 Cleveland Museum of Art Open Access 批量补录中国水墨/书画
 * 用法: node tools/download-inkart-cma.mjs
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
const MAX_TOTAL = 900;
const PER_QUERY = 40;

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

function dynastyFromCulture(culture) {
  const t = (Array.isArray(culture) ? culture.join(" ") : culture || "").toLowerCase();
  if (/tang|唐/.test(t)) return { dynasty: "唐", era: "tang" };
  if (/five dynasties|五代|ten kingdoms/.test(t)) return { dynasty: "五代", era: "northsong" };
  if (/northern song|北宋/.test(t)) return { dynasty: "宋", era: "northsong" };
  if (/southern song|南宋/.test(t)) return { dynasty: "宋", era: "southsong" };
  if (/song|宋/.test(t)) return { dynasty: "宋", era: "song" };
  if (/yuan|元/.test(t)) return { dynasty: "元", era: "yuan" };
  if (/ming|明/.test(t)) return { dynasty: "明", era: "ming" };
  if (/qing|清/.test(t)) return { dynasty: "清", era: "qing" };
  if (/republic|现代|当代|20th/.test(t)) return { dynasty: "现代", era: "modern" };
  return { dynasty: "宋", era: "song" };
}

function inferMotifs(title, type, fallback) {
  const t = `${title} ${type}`.toLowerCase();
  const hits = new Set(fallback || []);
  const rules = [
    [/mountain|landscape|山|峰/, "mountain"],
    [/river|stream|lake|水|江|溪|湖/, "water"],
    [/boat|fisherman|渔|舟/, "boat"],
    [/plum|梅/, "plum"],
    [/bamboo|竹/, "bamboo"],
    [/orchid|兰/, "orchid"],
    [/chrysanthemum|菊/, "chrys"],
    [/pine|松/, "pine"],
    [/willow|柳/, "willow"],
    [/snow|雪/, "snow"],
    [/rain|mist|cloud|雨|云|烟/, "mist"],
    [/moon|月/, "moon"],
    [/bird|crane|goose|duck|鸟|鹤|雁/, "geese"],
    [/flower|blossom|lotus|花|荷/, "blossom"],
    [/pavilion|temple|楼|亭|寺/, "pavilion"],
    [/horse|马/, "horse"],
    [/figure|scholar|隐|人/, "figure"],
    [/hut|dwelling|studio|居|斋|庐/, "hut"],
    [/autumn|秋/, "autumn"],
    [/spring|春/, "spring"],
    [/waterfall|瀑/, "waterfall"],
    [/rock|石/, "rock"],
    [/wine|醉/, "wine"]
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
    horse: "frontier", hut: "home", autumn: "autumn", spring: "spring", waterfall: "mountain",
    wine: "wine", figure: "travel"
  };
  for (const m of motifs) if (map[m]) s.add(map[m]);
  if (!s.size) s.add("mountain");
  return [...s].slice(0, 3);
}

const QUERIES = [
  { q: "Chinese landscape painting", motifs: ["mountain", "mist", "water"], scenes: ["mountain", "river"] },
  { q: "Chinese ink bamboo", motifs: ["bamboo", "rock"], scenes: ["bamboo", "zen"] },
  { q: "Chinese ink plum", motifs: ["plum", "blossom"], scenes: ["plum"] },
  { q: "Chinese orchid painting", motifs: ["orchid"], scenes: ["orchid", "zen"] },
  { q: "Chinese bird flower painting", motifs: ["blossom", "geese"], scenes: ["spring", "autumn"] },
  { q: "Chinese snow landscape", motifs: ["snow", "mountain"], scenes: ["snow"] },
  { q: "Chinese fisherman painting", motifs: ["boat", "water", "figure"], scenes: ["river", "zen"] },
  { q: "Chinese scholar painting", motifs: ["figure", "mountain", "pine"], scenes: ["mountain", "zen"] },
  { q: "Chinese horse painting", motifs: ["horse", "figure"], scenes: ["frontier", "travel"] },
  { q: "Chinese lotus painting", motifs: ["blossom", "water"], scenes: ["spring", "zen"] },
  { q: "Chinese pine painting", motifs: ["pine", "mountain"], scenes: ["pine", "mountain"] },
  { q: "Chinese willow painting", motifs: ["willow", "water", "spring"], scenes: ["spring", "farewell"] },
  { q: "Chinese temple landscape", motifs: ["temple", "mountain", "mist"], scenes: ["mountain", "zen"] },
  { q: "Chinese autumn landscape", motifs: ["autumn", "mountain", "leaves"], scenes: ["autumn"] },
  { q: "Chinese spring landscape", motifs: ["spring", "mountain", "blossom"], scenes: ["spring"] },
  { q: "Chinese rain mist landscape", motifs: ["rain", "mist", "boat"], scenes: ["rain", "river"] },
  { q: "Chinese bridge landscape", motifs: ["bridge", "water", "mountain"], scenes: ["travel", "river"] },
  { q: "Chinese village landscape", motifs: ["hut", "field", "willow"], scenes: ["field", "home"] },
  { q: "Chinese moon night", motifs: ["moon", "night", "mist"], scenes: ["moon", "night"] },
  { q: "Chinese figure painting", motifs: ["figure", "pavilion"], scenes: ["travel", "dream"] },
  { q: "handscroll landscape China", motifs: ["mountain", "water", "mist"], scenes: ["mountain", "river"] },
  { q: "album leaf landscape China", motifs: ["mountain", "mist"], scenes: ["mountain"] },
  { q: "ink wash painting China", motifs: ["mountain", "mist", "water"], scenes: ["mountain"] },
  { q: "Shen Zhou", motifs: ["mountain", "figure", "pine"], scenes: ["mountain", "zen"] },
  { q: "Wen Zhengming", motifs: ["orchid", "bamboo", "mountain"], scenes: ["orchid", "zen"] },
  { q: "Tang Yin", motifs: ["mountain", "figure", "spring"], scenes: ["travel", "spring"] },
  { q: "Qiu Ying", motifs: ["blossom", "pavilion", "spring"], scenes: ["spring", "dream"] },
  { q: "Dong Qichang", motifs: ["mountain", "mist", "water"], scenes: ["mountain", "zen"] },
  { q: "Bada Shanren", motifs: ["geese", "rock", "blossom"], scenes: ["zen", "spring"] },
  { q: "Shitao", motifs: ["mountain", "waterfall", "mist"], scenes: ["mountain", "zen"] },
  { q: "Gong Xian", motifs: ["mountain", "mist", "hut"], scenes: ["mountain", "home"] },
  { q: "Wang Hui", motifs: ["mountain", "mist", "water"], scenes: ["mountain"] },
  { q: "Yun Shouping", motifs: ["blossom", "leaves"], scenes: ["spring", "autumn"] },
  { q: "Zheng Xie", motifs: ["bamboo", "orchid", "rock"], scenes: ["bamboo", "orchid"] },
  { q: "Jin Nong", motifs: ["plum", "blossom"], scenes: ["plum"] },
  { q: "Xu Wei", motifs: ["blossom", "leaves", "wine"], scenes: ["autumn", "wine"] },
  { q: "Zhao Mengfu", motifs: ["horse", "mountain", "figure"], scenes: ["frontier", "mountain"] },
  { q: "Ni Zan", motifs: ["hut", "mist", "water", "bamboo"], scenes: ["home", "zen"] },
  { q: "Huang Gongwang", motifs: ["mountain", "water", "hut"], scenes: ["mountain", "home"] },
  { q: "Wang Meng", motifs: ["mountain", "pine", "mist", "hut"], scenes: ["mountain", "home"] },
  { q: "Wu Zhen", motifs: ["boat", "water", "bamboo"], scenes: ["river", "zen"] },
  { q: "Ma Yuan", motifs: ["mountain", "willow", "water"], scenes: ["spring", "mountain"] },
  { q: "Xia Gui", motifs: ["mountain", "water", "mist", "boat"], scenes: ["river", "mountain"] },
  { q: "Mi Fu", motifs: ["mist", "mountain", "water"], scenes: ["mountain", "rain"] },
  { q: "Li Tang", motifs: ["mountain", "pine", "waterfall"], scenes: ["mountain", "travel"] },
  { q: "Liang Kai", motifs: ["figure", "mist"], scenes: ["zen", "wine"] },
  { q: "Muqi", motifs: ["geese", "mist", "water"], scenes: ["zen", "autumn"] },
  { q: "Hua Yan", motifs: ["mountain", "figure", "geese"], scenes: ["mountain", "travel"] },
  { q: "Luo Ping", motifs: ["figure", "mist"], scenes: ["dream", "zen"] },
  { q: "Chinese hanging scroll landscape", motifs: ["mountain", "mist", "pine"], scenes: ["mountain"] },
  { q: "Chinese painting waterfall", motifs: ["waterfall", "mountain", "pine"], scenes: ["mountain"] },
  { q: "Chinese painting hermit", motifs: ["figure", "hut", "mountain"], scenes: ["home", "zen"] },
  { q: "Chinese painting pavilion", motifs: ["pavilion", "mountain", "water"], scenes: ["travel", "spring"] },
  { q: "Chinese painting chrysanthemum", motifs: ["chrys", "autumn"], scenes: ["chrys", "autumn"] },
  { q: "Chinese painting crane", motifs: ["geese", "pine"], scenes: ["spring", "zen"] },
  { q: "Chinese painting duck", motifs: ["geese", "water", "willow"], scenes: ["spring", "river"] },
  { q: "Chinese painting peach blossom", motifs: ["blossom", "spring", "pavilion"], scenes: ["love", "spring", "dream"] },
  { q: "Yuan dynasty landscape", motifs: ["mountain", "hut", "mist"], scenes: ["mountain", "home"] },
  { q: "Ming dynasty landscape", motifs: ["mountain", "pine", "figure"], scenes: ["mountain", "travel"] },
  { q: "Qing dynasty landscape", motifs: ["mountain", "mist", "water"], scenes: ["mountain"] },
  { q: "Song dynasty painting China", motifs: ["mountain", "mist"], scenes: ["mountain"] },
  { q: "Hongren landscape", motifs: ["mountain", "pine", "rock"], scenes: ["mountain", "zen"] },
  { q: "Kuncan landscape", motifs: ["mountain", "temple", "mist"], scenes: ["mountain", "zen"] },
  { q: "Lan Ying landscape", motifs: ["mountain", "autumn", "mist"], scenes: ["mountain", "autumn"] },
  { q: "Dai Jin landscape", motifs: ["mountain", "snow", "figure"], scenes: ["travel", "snow"] },
  { q: "Chinese painting wine scholar", motifs: ["wine", "figure", "moon"], scenes: ["wine"] },
  { q: "Chinese painting frontier horse", motifs: ["horse", "fort", "figure"], scenes: ["frontier", "nation"] },
  { q: "Chinese painting wind pine scholar", motifs: ["wind", "pine", "figure"], scenes: ["wind", "pine"] },
  { q: "Chinese painting dream immortal", motifs: ["mist", "pavilion", "mountain"], scenes: ["dream"] },
  { q: "Chinese painting Zen monk landscape", motifs: ["zen", "temple", "mist"], scenes: ["zen"] },
  { q: "Chinese painting snow night", motifs: ["snow", "night", "moon"], scenes: ["snow", "night"] },
  { q: "Chinese painting lantern night", motifs: ["lamp", "night", "figure"], scenes: ["night"] },
  { q: "Chinese painting travelers pass", motifs: ["travel", "mountain", "mist"], scenes: ["travel"] }
];

const gallery = loadGallery();
const seenIds = new Set(gallery.map(g => g.id));
const seenUrls = new Set(gallery.map(g => g.source));
let added = 0;

console.log(`现有图库 ${gallery.length} 幅，开始从 CMA 补录…`);

for (const item of QUERIES) {
  if (gallery.length >= MAX_TOTAL) break;
  for (const skip of [0, PER_QUERY, PER_QUERY * 2]) {
    if (gallery.length >= MAX_TOTAL) break;
    try {
      const url = `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(item.q)}&has_image=1&limit=${PER_QUERY}&skip=${skip}`;
      const data = await getJson(url);
      const rows = data.data || [];
      if (!rows.length) break;
      for (const obj of rows) {
        if (gallery.length >= MAX_TOTAL) break;
        const img = obj.images?.web?.url || obj.images?.print?.url || obj.images?.full?.url;
        if (!img) continue;
        const culture = Array.isArray(obj.culture) ? obj.culture.join(" ") : (obj.culture || "");
        const dept = obj.department || "";
        const blob = `${culture} ${dept} ${obj.title || ""} ${(obj.creators || []).map(c => c.description).join(" ")}`;
        if (!/China|Chinese|中国/i.test(blob)) continue;
        /* 偏书画，尽量排除器物雕塑佛像 */
        if (/sculpture|ceramic|bronze|jade|porcelain|vessel|mirror|box|screen with|rank badge|brush holder|ink cake|sutra|amitābha|amitabha|buddha|bodhisattva|shakyamuni|clip for paper|elephant/i.test(`${obj.type || ""} ${obj.title || ""}`)) continue;

        const id = `cma-${obj.id}`;
        if (seenIds.has(id) || seenUrls.has(img)) continue;

        const ext = img.includes(".png") ? ".png" : ".jpg";
        const file = `${id}${ext}`;
        const dest = path.join(OUT_DIR, file);
        try {
          if (!fs.existsSync(dest)) {
            const n = await download(img, dest);
            console.log(`✓ ${id} ${(n / 1024).toFixed(0)}KB — ${obj.title}`);
          } else {
            console.log(`· 已有 ${id}`);
          }
        } catch (e) {
          console.log(`× 下载失败 ${id}: ${e.message}`);
          continue;
        }

        const dyn = dynastyFromCulture(culture);
        const motifs = inferMotifs(obj.title || "", obj.type || "", item.motifs);
        const scenes = inferScenes(motifs, item.scenes);
        const artist = (obj.creators && obj.creators[0]?.description) || "历代名家";

        gallery.push({
          id,
          title: String(obj.title || item.q).slice(0, 48),
          artist: artist.replace(/\s*\(Chinese.*$/, "").trim().slice(0, 40) || "历代名家",
          dynasty: dyn.dynasty,
          era: dyn.era,
          motifs,
          scenes,
          file,
          source: img
        });
        seenIds.add(id);
        seenUrls.add(img);
        added++;
        await sleep(80);
      }
    } catch (e) {
      console.log(`× 查询失败: ${item.q} skip=${skip} — ${e.message}`);
    }
    await sleep(120);
  }
  await sleep(150);
}

const catalogJs = `/* 本地水墨画图库 · 自动生成，勿手改 */
window.INK_GALLERY = ${JSON.stringify(gallery)};
`;
fs.writeFileSync(GALLERY_JS, catalogJs, "utf8");
fs.writeFileSync(CATALOG_JSON, JSON.stringify(gallery, null, 2), "utf8");
console.log(`\n完成：新增 ${added}，图库共 ${gallery.length} 幅`);
