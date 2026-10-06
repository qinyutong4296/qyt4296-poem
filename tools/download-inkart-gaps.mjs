/**
 * 缺口补录：针对雨/桥/酒/边塞/田园/月夜/灯/星等稀缺意象
 * 从 Wikimedia Commons + Met Open Access 定向扩库
 * 用法: node tools/download-inkart-gaps.mjs
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
const THUMB = 900;
const MAX_ADD = 120;

fs.mkdirSync(OUT_DIR, { recursive: true });

function loadGallery() {
  if (fs.existsSync(CATALOG_JSON)) return JSON.parse(fs.readFileSync(CATALOG_JSON, "utf8"));
  return [];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function commonsApi(params) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`commons ${res.status}`);
  return res.json();
}

async function resolveCommons(title) {
  const t = title.startsWith("File:") ? title : `File:${title}`;
  const data = await commonsApi({
    action: "query",
    titles: t,
    prop: "imageinfo",
    iiprop: "url|mime|size",
    iiurlwidth: String(THUMB)
  });
  const page = Object.values(data.query.pages)[0];
  if (!page || page.missing != null || !page.imageinfo) return null;
  const info = page.imageinfo[0];
  return { url: info.thumburl || info.url, mime: info.mime, title: page.title };
}

async function searchCommons(query, limit = 8) {
  const data = await commonsApi({
    action: "query",
    list: "search",
    srsearch: `filetype:bitmap ${query}`,
    srnamespace: "6",
    srlimit: String(limit)
  });
  const out = [];
  for (const h of data.query?.search || []) {
    const file = await resolveCommons(h.title);
    if (file && /^image\/(jpeg|png|webp)/.test(file.mime || "")) out.push(file);
    await sleep(120);
  }
  return out;
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
  if (buf.length < 2500) throw new Error("too small");
  fs.writeFileSync(dest, buf);
  return buf.length;
}

function extFromMime(mime, url) {
  if (mime?.includes("png") || url?.includes(".png")) return ".png";
  if (mime?.includes("webp")) return ".webp";
  return ".jpg";
}

function saveGallery(gallery) {
  fs.writeFileSync(
    GALLERY_JS,
    `/* 本地水墨画图库 · 自动生成，勿手改 */\nwindow.INK_GALLERY = ${JSON.stringify(gallery)};\n`,
    "utf8"
  );
  fs.writeFileSync(CATALOG_JSON, JSON.stringify(gallery, null, 2), "utf8");
}

/* 定向缺口：稀缺意象 / 场景 */
const TARGETS = [
  /* 雨 */
  { id: "gap-xia-gui-rainstorm", commons: "Xia Gui - Sailboat in Rainstorm.jpg", title: "风雨归舟", artist: "夏圭", dynasty: "宋", era: "southsong", motifs: ["rain", "boat", "mist", "water", "mountain"], scenes: ["rain", "river", "travel"] },
  { id: "gap-mi-rain", commons: "Mi Youren - Cloudy Mountains.jpg", title: "云山墨戏", artist: "米友仁", dynasty: "宋", era: "song", motifs: ["rain", "mist", "mountain"], scenes: ["rain", "mountain", "mist"] },
  { id: "gap-rain-boat-search", search: "Chinese painting rain boat landscape", title: "烟雨归舟", artist: "历代名家", dynasty: "明", era: "ming", motifs: ["rain", "boat", "mist", "water"], scenes: ["rain", "river"] },
  { id: "gap-rain-search2", search: "Chinese ink painting rain landscape", title: "雨山图", artist: "历代名家", dynasty: "清", era: "qing", motifs: ["rain", "mist", "mountain"], scenes: ["rain", "mountain"] },

  /* 桥 */
  { id: "gap-bridge-search", search: "Chinese painting bridge landscape", title: "溪桥图", artist: "历代名家", dynasty: "宋", era: "song", motifs: ["bridge", "water", "mountain", "mist"], scenes: ["travel", "river"] },
  { id: "gap-bridge-zhao", search: "Chinese painting willow bridge spring", title: "柳桥春色", artist: "历代名家", dynasty: "明", era: "ming", motifs: ["bridge", "willow", "spring", "water"], scenes: ["spring", "farewell"] },
  { id: "gap-tangyin-bridge", search: "Tang Yin landscape bridge", title: "唐寅桥意", artist: "唐寅", dynasty: "明", era: "ming", motifs: ["bridge", "figure", "mountain"], scenes: ["travel", "farewell"] },

  /* 酒 / 醉 */
  { id: "gap-liang-kai-immortal", commons: "Liang Kai - Immortal in Splashed Ink.jpg", title: "泼墨仙人图", artist: "梁楷", dynasty: "宋", era: "southsong", motifs: ["wine", "figure", "zen"], scenes: ["wine", "zen", "dream"] },
  { id: "gap-xu-wei-grapes", commons: "Xu Wei - Grapes.jpg", title: "墨葡萄图", artist: "徐渭", dynasty: "明", era: "ming", motifs: ["wine", "leaves", "blossom"], scenes: ["wine", "autumn"] },
  { id: "gap-wine-search", search: "Chinese painting drinking scholar", title: "高士饮酒", artist: "历代名家", dynasty: "明", era: "ming", motifs: ["wine", "figure", "moon"], scenes: ["wine", "moon"] },
  { id: "gap-li-bai-wine", search: "Li Bai drinking painting Chinese", title: "李白醉酒意", artist: "历代名家", dynasty: "清", era: "qing", motifs: ["wine", "figure", "moon"], scenes: ["wine", "moon", "dream"] },

  /* 边塞 / 城关 / 马 */
  { id: "gap-fort-search", search: "Chinese painting frontier fortress", title: "关山图", artist: "历代名家", dynasty: "宋", era: "song", motifs: ["fort", "mountain", "horse", "mist"], scenes: ["frontier", "nation"] },
  { id: "gap-horse-zhao", search: "Zhao Mengfu horse painting", title: "人马图", artist: "赵孟頫", dynasty: "元", era: "yuan", motifs: ["horse", "figure"], scenes: ["frontier", "travel"] },
  { id: "gap-tribute", search: "Chinese painting tribute horse Tang", title: "职贡图意", artist: "佚名", dynasty: "唐", era: "tang", motifs: ["horse", "figure", "fort"], scenes: ["frontier", "nation"] },
  { id: "gap-guan-tong", commons: "Guan Tong - Travelers in a Mountain Pass.jpg", title: "关山行旅图", artist: "关仝", dynasty: "五代", era: "northsong", motifs: ["fort", "mountain", "travel", "mist"], scenes: ["frontier", "travel", "mountain"] },

  /* 田园 / 家居 / 农家 */
  { id: "gap-field-search", search: "Chinese painting village fields landscape", title: "田园图", artist: "历代名家", dynasty: "清", era: "qing", motifs: ["hut", "willow", "field", "water"], scenes: ["field", "home"] },
  { id: "gap-farm-search", search: "Chinese painting rice paddy landscape", title: "水田图", artist: "历代名家", dynasty: "明", era: "ming", motifs: ["field", "water", "hut"], scenes: ["field", "home"] },
  { id: "gap-peasant", search: "Chinese painting farmer landscape Song", title: "农家图意", artist: "历代名家", dynasty: "宋", era: "song", motifs: ["field", "hut", "figure"], scenes: ["field", "home"] },

  /* 月夜 / 灯 / 星 */
  { id: "gap-ma-yuan-moon", commons: "Ma Yuan - Viewing Plum Blossoms by Moonlight.jpg", title: "月下赏梅", artist: "马远", dynasty: "宋", era: "southsong", motifs: ["moon", "plum", "night", "figure"], scenes: ["moon", "plum", "night"] },
  { id: "gap-moon-night", search: "Chinese painting moonlight landscape night", title: "月夜山水", artist: "历代名家", dynasty: "宋", era: "song", motifs: ["moon", "night", "mist", "mountain"], scenes: ["moon", "night", "dream"] },
  { id: "gap-lantern", search: "Chinese painting lantern night festival", title: "灯夜图", artist: "历代名家", dynasty: "明", era: "ming", motifs: ["lamp", "night", "figure"], scenes: ["night", "love"] },
  { id: "gap-stars", search: "Chinese painting milky way stars night", title: "星河图意", artist: "历代名家", dynasty: "清", era: "qing", motifs: ["stars", "night", "moon"], scenes: ["night", "dream"] },

  /* 风 / 梦 / 情恋 */
  { id: "gap-wind-pine", commons: "Ma Lin - Listening to the Wind in the Pines.jpg", title: "静听松风图", artist: "马麟", dynasty: "宋", era: "southsong", motifs: ["wind", "pine", "figure", "mountain"], scenes: ["wind", "pine", "zen"] },
  { id: "gap-cui-bai", commons: "Cui Bai - Magpies and Hare.jpg", title: "双喜图", artist: "崔白", dynasty: "宋", era: "northsong", motifs: ["wind", "geese", "leaves", "autumn"], scenes: ["wind", "autumn"] },
  { id: "gap-love-peach", search: "Qiu Ying peach blossom spring painting", title: "桃源仙境", artist: "仇英", dynasty: "明", era: "ming", motifs: ["blossom", "pavilion", "spring", "figure"], scenes: ["love", "dream", "spring"] },
  { id: "gap-love-orchid", search: "Chinese painting beauty orchid", title: "仕女兰韵", artist: "历代名家", dynasty: "清", era: "qing", motifs: ["orchid", "figure", "blossom"], scenes: ["love", "orchid"] },
  { id: "gap-dream", search: "Chinese painting dream immortal landscape", title: "仙山梦境", artist: "历代名家", dynasty: "明", era: "ming", motifs: ["mist", "pavilion", "mountain", "moon"], scenes: ["dream", "moon"] },

  /* 旅 / 禅 */
  { id: "gap-travel-search", search: "Chinese painting travelers mountain path", title: "山径行旅", artist: "历代名家", dynasty: "宋", era: "song", motifs: ["travel", "mountain", "figure", "mist"], scenes: ["travel", "mountain"] },
  { id: "gap-zen-muqi", search: "Muqi Zen painting Chinese", title: "禅画", artist: "牧溪", dynasty: "宋", era: "southsong", motifs: ["zen", "mist", "geese"], scenes: ["zen"] },
  { id: "gap-zen-temple", search: "Chinese painting Zen temple mist mountain", title: "禅寺云山", artist: "历代名家", dynasty: "元", era: "yuan", motifs: ["temple", "mist", "mountain", "zen"], scenes: ["zen", "mountain"] },

  /* 风更多 + 雪夜 */
  { id: "gap-wind-geese", search: "Chinese painting geese wind autumn", title: "风雁图", artist: "历代名家", dynasty: "宋", era: "song", motifs: ["wind", "geese", "autumn", "leaves"], scenes: ["wind", "autumn"] },
  { id: "gap-snow-night", search: "Chinese painting snow night moon", title: "雪夜月色", artist: "历代名家", dynasty: "明", era: "ming", motifs: ["snow", "moon", "night", "mountain"], scenes: ["snow", "night", "moon"] },
  { id: "gap-pavilion-rain", search: "Chinese painting pavilion rain mist", title: "雨亭图", artist: "历代名家", dynasty: "清", era: "qing", motifs: ["pavilion", "rain", "mist"], scenes: ["rain", "travel"] },
  { id: "gap-bridge-snow", search: "Chinese painting snow bridge landscape", title: "雪桥图", artist: "历代名家", dynasty: "清", era: "qing", motifs: ["bridge", "snow", "mountain"], scenes: ["snow", "travel"] },
  { id: "gap-wine-moon2", search: "Chinese painting moon wine boat", title: "月下对酌", artist: "历代名家", dynasty: "明", era: "ming", motifs: ["wine", "moon", "boat", "night"], scenes: ["wine", "moon", "night"] },
  { id: "gap-field-willow", search: "Chinese painting willow hut village", title: "柳舍田家", artist: "历代名家", dynasty: "清", era: "qing", motifs: ["willow", "hut", "field"], scenes: ["field", "home", "spring"] },
  { id: "gap-nation-palace", search: "Chinese painting palace pavilion Tang", title: "宫阙图意", artist: "历代名家", dynasty: "唐", era: "tang", motifs: ["pavilion", "fort", "figure"], scenes: ["nation", "dream"] },
  { id: "gap-chrys-more", search: "Chinese ink chrysanthemum painting", title: "墨菊", artist: "历代名家", dynasty: "清", era: "qing", motifs: ["chrys", "autumn"], scenes: ["chrys", "autumn"] },
  { id: "gap-lamp-scholar", search: "Chinese painting scholar reading lamp night", title: "夜读图", artist: "历代名家", dynasty: "明", era: "ming", motifs: ["lamp", "figure", "night"], scenes: ["night", "home"] }
];

const MET_GAPS = [
  { q: "Chinese painting rain landscape", motifs: ["rain", "mist", "mountain"], scenes: ["rain", "mountain"] },
  { q: "Chinese painting bridge landscape", motifs: ["bridge", "water", "mountain"], scenes: ["travel", "river"] },
  { q: "Chinese painting drinking wine scholar", motifs: ["wine", "figure", "moon"], scenes: ["wine"] },
  { q: "Chinese painting horse Tang Yuan", motifs: ["horse", "figure"], scenes: ["frontier"] },
  { q: "Chinese painting village landscape", motifs: ["hut", "field", "willow"], scenes: ["field", "home"] },
  { q: "Chinese painting moonlight", motifs: ["moon", "night", "mist"], scenes: ["moon", "night"] },
  { q: "Chinese painting wind pine", motifs: ["wind", "pine"], scenes: ["wind", "pine"] },
  { q: "Chinese painting farewell willow boat", motifs: ["willow", "boat", "water"], scenes: ["farewell"] },
  { q: "Chinese painting Zen temple", motifs: ["temple", "mist", "zen"], scenes: ["zen"] },
  { q: "Chinese painting snow night", motifs: ["snow", "night", "moon"], scenes: ["snow", "night"] },
  { q: "Chinese painting chrysanthemum ink", motifs: ["chrys", "autumn"], scenes: ["chrys"] },
  { q: "Chinese painting peach blossom spring", motifs: ["blossom", "spring", "pavilion"], scenes: ["love", "dream", "spring"] },
  { q: "Chinese painting lantern festival", motifs: ["lamp", "night", "figure"], scenes: ["night"] },
  { q: "Chinese painting travelers mountain pass", motifs: ["travel", "mountain", "fort"], scenes: ["travel", "frontier"] },
  { q: "Chinese painting immortal dream landscape", motifs: ["mist", "pavilion", "mountain"], scenes: ["dream"] }
];

const gallery = loadGallery();
const seenIds = new Set(gallery.map(g => g.id));
const seenUrls = new Set(gallery.map(g => g.source));
let added = 0;

async function pushItem(meta, fileInfo) {
  if (added >= MAX_ADD) return false;
  if (seenIds.has(meta.id) || seenUrls.has(fileInfo.url) || seenUrls.has(fileInfo.title)) return false;
  const ext = extFromMime(fileInfo.mime, fileInfo.url);
  const filename = `${meta.id}${ext}`;
  const dest = path.join(OUT_DIR, filename);
  if (!fs.existsSync(dest)) {
    const n = await download(fileInfo.url, dest);
    console.log(`✓ ${meta.id} ${(n / 1024).toFixed(0)}KB — ${meta.title}`);
  } else {
    console.log(`· 已有 ${meta.id}`);
  }
  gallery.push({
    id: meta.id,
    title: meta.title,
    artist: meta.artist,
    dynasty: meta.dynasty,
    era: meta.era,
    motifs: meta.motifs,
    scenes: meta.scenes,
    file: filename,
    source: fileInfo.title || fileInfo.url
  });
  seenIds.add(meta.id);
  seenUrls.add(fileInfo.url);
  if (fileInfo.title) seenUrls.add(fileInfo.title);
  added++;
  return true;
}

console.log(`现有图库 ${gallery.length} 幅，开始缺口补录（Commons）…`);

for (const item of TARGETS) {
  if (added >= MAX_ADD) break;
  if (seenIds.has(item.id)) continue;
  try {
    let files = [];
    if (item.commons) {
      const f = await resolveCommons(item.commons);
      if (f) files = [f];
      else files = await searchCommons(item.commons.replace(/\.(jpg|png)$/i, ""), 5);
    } else if (item.search) {
      files = await searchCommons(item.search, 6);
    }
    let ok = false;
    for (const f of files) {
      const id = files.length === 1 ? item.id : `${item.id}-${added}`;
      ok = await pushItem({ ...item, id }, f);
      if (ok) break;
    }
    if (!ok) console.log(`× 未找到: ${item.id}`);
  } catch (e) {
    console.log(`× ${item.id}: ${e.message}`);
  }
  await sleep(350);
}

console.log(`\n再补 Met 缺口查询…`);
for (const item of MET_GAPS) {
  if (added >= MAX_ADD) break;
  try {
    const search = await getJson(
      `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(item.q)}`
    );
    for (const oid of (search.objectIDs || []).slice(0, 8)) {
      if (added >= MAX_ADD) break;
      try {
        const obj = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${oid}`);
        if (!obj.isPublicDomain) continue;
        const img = obj.primaryImageSmall || obj.primaryImage;
        if (!img) continue;
        const culture = `${obj.culture || ""} ${obj.artistDisplayName || ""} ${obj.title || ""} ${obj.department || ""}`;
        if (!/China|Chinese|Asia/i.test(culture)) continue;
        if (/sculpture|ceramic|bronze|jade|porcelain|vessel|textile|photograph/i.test(`${obj.objectName || ""} ${obj.title || ""}`)) continue;
        const id = `met-gap-${oid}`;
        if (seenIds.has(id) || seenUrls.has(img)) continue;
        await pushItem(
          {
            id,
            title: String(obj.title || item.q).slice(0, 48),
            artist: (obj.artistDisplayName || "历代名家").slice(0, 40),
            dynasty: item.dynasty || "宋",
            era: item.era || "song",
            motifs: item.motifs,
            scenes: item.scenes
          },
          { url: img, mime: "image/jpeg", title: img }
        );
        await sleep(100);
      } catch {
        /* skip */
      }
    }
  } catch (e) {
    console.log(`× Met: ${item.q} — ${e.message}`);
  }
  await sleep(200);
}

saveGallery(gallery);
console.log(`\n完成：新增 ${added}，图库共 ${gallery.length} 幅`);
