/**
 * Met Asian Art 部门抽样补录中国书画（search 接口 410 不可用时）
 * 用法: node tools/download-inkart-met-dept.mjs
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
const MAX_ADD = 80;
const SAMPLE = 400; /* 从部门列表中抽样检查的对象数 */

fs.mkdirSync(OUT_DIR, { recursive: true });

function loadGallery() {
  if (fs.existsSync(CATALOG_JSON)) return JSON.parse(fs.readFileSync(CATALOG_JSON, "utf8"));
  return [];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(60000)
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(90000)
  });
  if (!res.ok) throw new Error(`dl ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 3000) throw new Error("too small");
  fs.writeFileSync(dest, buf);
  return buf.length;
}

function dynastyFrom(obj) {
  const t = `${obj.objectDate || ""} ${obj.period || ""} ${obj.dynasty || ""} ${obj.reign || ""}`;
  if (/Tang|唐/.test(t)) return { dynasty: "唐", era: "tang" };
  if (/Yuan|元/.test(t)) return { dynasty: "元", era: "yuan" };
  if (/Ming|明/.test(t)) return { dynasty: "明", era: "ming" };
  if (/Qing|清/.test(t)) return { dynasty: "清", era: "qing" };
  if (/Southern Song|南宋/.test(t)) return { dynasty: "宋", era: "southsong" };
  if (/Northern Song|北宋/.test(t)) return { dynasty: "宋", era: "northsong" };
  if (/Song|宋/.test(t)) return { dynasty: "宋", era: "song" };
  return { dynasty: "宋", era: "song" };
}

function inferMotifs(title) {
  const t = String(title || "").toLowerCase();
  const hits = new Set();
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
    [/bird|crane|goose|magpie|鸟|鹤|雁/, "geese"],
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

function inferScenes(motifs) {
  const s = new Set();
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

function isChinesePainting(obj) {
  const blob = `${obj.culture || ""} ${obj.artistDisplayName || ""} ${obj.title || ""} ${obj.department || ""} ${obj.classification || ""} ${obj.objectName || ""} ${obj.medium || ""}`;
  if (!/China|Chinese|中国/i.test(blob)) return false;
  if (/sculpture|ceramic|bronze|jade|porcelain|vessel|textile|photograph|coin|seal|furniture|lacquer|cloisonn/i.test(blob)) return false;
  if (!/paint|ink|scroll|album|hanging|handscroll|画|墨|卷|轴|册/i.test(blob) && !/Painting/i.test(obj.classification || "")) {
    /* 允许明确标为绘画的 */
    if (!/watercolor|ink and color|ink on/i.test(obj.medium || "")) return false;
  }
  return true;
}

function saveGallery(gallery) {
  fs.writeFileSync(CATALOG_JSON, JSON.stringify(gallery, null, 2), "utf8");
  fs.writeFileSync(GALLERY_JS, `window.INK_GALLERY = ${JSON.stringify(gallery)};\n`, "utf8");
}

const gallery = loadGallery();
const seenIds = new Set(gallery.map(g => g.id));
const seenUrls = new Set(gallery.map(g => g.source).filter(Boolean));
let added = 0;

console.log(`现有图库 ${gallery.length} 幅，从 Met Asian Art 部门抽样…`);

const list = await getJson("https://collectionapi.metmuseum.org/public/collection/v1/objects?departmentIds=6");
const ids = list.objectIDs || [];
/* 均匀抽样，避免总是扫最前面 */
const step = Math.max(1, Math.floor(ids.length / SAMPLE));
const sample = [];
for (let i = 0; i < ids.length && sample.length < SAMPLE; i += step) sample.push(ids[i]);
/* 再补一些靠后的随机偏移 */
for (let k = 0; k < 80; k++) {
  const idx = Math.floor(Math.random() * ids.length);
  sample.push(ids[idx]);
}

for (const oid of sample) {
  if (added >= MAX_ADD) break;
  const id = `met-${oid}`;
  if (seenIds.has(id)) continue;
  try {
    const obj = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${oid}`);
    if (!obj.isPublicDomain) continue;
    if (!isChinesePainting(obj)) continue;
    const img = obj.primaryImageSmall || obj.primaryImage;
    if (!img) continue;
    if (seenUrls.has(img)) continue;

    const ext = /\.png/i.test(img) ? ".png" : ".jpg";
    const file = `${id}${ext}`;
    const dest = path.join(OUT_DIR, file);
    if (!fs.existsSync(dest)) {
      const n = await download(img, dest);
      console.log(`✓ ${id} ${(n / 1024).toFixed(0)}KB — ${String(obj.title || "").slice(0, 40)}`);
    } else {
      console.log(`· 已有文件 ${id}`);
    }

    const dyn = dynastyFrom(obj);
    const motifs = inferMotifs(obj.title);
    gallery.push({
      id,
      title: String(obj.title || "山水").slice(0, 48),
      artist: (obj.artistDisplayName || "历代名家").slice(0, 40),
      dynasty: dyn.dynasty,
      era: dyn.era,
      motifs,
      scenes: inferScenes(motifs),
      file,
      source: img
    });
    seenIds.add(id);
    seenUrls.add(img);
    added++;
    if (added % 10 === 0) saveGallery(gallery);
    await sleep(150);
  } catch (e) {
    process.stdout.write(`× ${oid}:${e.message} `);
  }
}

saveGallery(gallery);
console.log(`\n完成：新增 ${added}，图库共 ${gallery.length} 幅`);
