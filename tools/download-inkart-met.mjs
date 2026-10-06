/**
 * 从 Met Museum Open Access 补录中国书画到本地图库
 * 用法: node tools/download-inkart-met.mjs
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

fs.mkdirSync(OUT_DIR, { recursive: true });

function loadGallery() {
  if (fs.existsSync(CATALOG_JSON)) return JSON.parse(fs.readFileSync(CATALOG_JSON, "utf8"));
  return [];
}

const QUERIES = [
  { q: "Chinese landscape painting Fan Kuan", motifs: ["mountain", "pine", "mist"], scenes: ["mountain"], dynasty: "宋", era: "northsong", title: "山水", artist: "范宽一系" },
  { q: "Chinese painting Guo Xi", motifs: ["mountain", "mist", "pine"], scenes: ["mountain", "spring"], dynasty: "宋", era: "northsong", title: "早春意", artist: "郭熙一系" },
  { q: "Chinese painting Ma Yuan", motifs: ["mountain", "water", "mist", "willow"], scenes: ["mountain", "spring"], dynasty: "宋", era: "southsong", title: "边角山水", artist: "马远" },
  { q: "Chinese painting Xia Gui", motifs: ["mountain", "water", "mist", "boat"], scenes: ["river", "mountain"], dynasty: "宋", era: "southsong", title: "溪山清远意", artist: "夏圭" },
  { q: "Chinese painting Ni Zan", motifs: ["hut", "mist", "water", "bamboo"], scenes: ["home", "zen"], dynasty: "元", era: "yuan", title: "逸笔山水", artist: "倪瓒" },
  { q: "Chinese painting Wang Meng", motifs: ["mountain", "pine", "mist", "hut"], scenes: ["mountain", "home"], dynasty: "元", era: "yuan", title: "密体山水", artist: "王蒙" },
  { q: "Chinese painting Huang Gongwang", motifs: ["mountain", "water", "hut", "mist"], scenes: ["mountain", "home"], dynasty: "元", era: "yuan", title: "富春意", artist: "黄公望" },
  { q: "Chinese painting Zhao Mengfu", motifs: ["mountain", "autumn", "horse"], scenes: ["autumn", "mountain"], dynasty: "元", era: "yuan", title: "赵氏书画", artist: "赵孟頫" },
  { q: "Chinese painting Shen Zhou", motifs: ["mountain", "figure", "pine"], scenes: ["mountain", "zen"], dynasty: "明", era: "ming", title: "吴门山水", artist: "沈周" },
  { q: "Chinese painting Wen Zhengming", motifs: ["orchid", "bamboo", "pine"], scenes: ["orchid", "zen"], dynasty: "明", era: "ming", title: "兰竹", artist: "文徵明" },
  { q: "Chinese painting Tang Yin", motifs: ["mountain", "figure", "spring"], scenes: ["travel", "spring"], dynasty: "明", era: "ming", title: "唐寅山水", artist: "唐寅" },
  { q: "Chinese painting Qiu Ying", motifs: ["blossom", "pavilion", "spring"], scenes: ["spring", "dream"], dynasty: "明", era: "ming", title: "青绿人物", artist: "仇英" },
  { q: "Chinese painting Dong Qichang", motifs: ["mountain", "mist", "water"], scenes: ["mountain", "zen"], dynasty: "明", era: "ming", title: "南北宗山水", artist: "董其昌" },
  { q: "Chinese painting Bada Shanren", motifs: ["blossom", "geese", "rock", "water"], scenes: ["zen", "spring"], dynasty: "清", era: "qing", title: "花鸟简笔", artist: "八大山人" },
  { q: "Chinese painting Shitao", motifs: ["mountain", "waterfall", "mist"], scenes: ["mountain", "zen"], dynasty: "清", era: "qing", title: "苦瓜和尚山水", artist: "石涛" },
  { q: "Chinese ink plum blossom painting", motifs: ["plum", "blossom", "snow"], scenes: ["plum", "snow"], dynasty: "元", era: "yuan", title: "墨梅", artist: "历代名家" },
  { q: "Chinese ink bamboo painting", motifs: ["bamboo"], scenes: ["bamboo", "zen"], dynasty: "宋", era: "song", title: "墨竹", artist: "历代名家" },
  { q: "Chinese ink orchid painting", motifs: ["orchid"], scenes: ["orchid", "zen"], dynasty: "宋", era: "song", title: "墨兰", artist: "历代名家" },
  { q: "Chinese painting chrysanthemum", motifs: ["chrys", "autumn"], scenes: ["chrys", "autumn"], dynasty: "清", era: "qing", title: "菊花", artist: "历代名家" },
  { q: "Chinese painting snow landscape", motifs: ["snow", "mountain", "mist"], scenes: ["snow", "mountain"], dynasty: "宋", era: "song", title: "雪景", artist: "历代名家" },
  { q: "Chinese painting fishing boat", motifs: ["boat", "water", "figure"], scenes: ["river", "zen"], dynasty: "宋", era: "song", title: "渔父", artist: "历代名家" },
  { q: "Chinese painting willow spring", motifs: ["willow", "spring", "water"], scenes: ["spring", "farewell"], dynasty: "宋", era: "song", title: "杨柳春色", artist: "历代名家" },
  { q: "Chinese bird flower painting Song", motifs: ["blossom", "geese", "leaves"], scenes: ["spring", "autumn"], dynasty: "宋", era: "song", title: "花鸟", artist: "宋人" },
  { q: "Chinese painting horse", motifs: ["horse", "figure"], scenes: ["frontier", "travel"], dynasty: "元", era: "yuan", title: "人马", artist: "历代名家" },
  { q: "Chinese painting pavilion landscape", motifs: ["pavilion", "mountain", "mist"], scenes: ["mountain", "travel"], dynasty: "宋", era: "song", title: "楼阁山水", artist: "历代名家" },
  { q: "Chinese painting moon night", motifs: ["moon", "night", "mist"], scenes: ["moon", "night"], dynasty: "宋", era: "song", title: "月夜", artist: "历代名家" },
  { q: "Chinese painting rain landscape", motifs: ["rain", "mist", "mountain"], scenes: ["rain", "travel"], dynasty: "明", era: "ming", title: "风雨归舟", artist: "历代名家" },
  { q: "Chinese painting Mi Fu cloudy mountain", motifs: ["mist", "mountain", "rain"], scenes: ["mountain", "rain", "mist"], dynasty: "宋", era: "song", title: "米家云山", artist: "米氏" },
  { q: "Gong Xian Chinese landscape", motifs: ["mountain", "mist", "hut"], scenes: ["mountain", "home"], dynasty: "清", era: "qing", title: "龚贤山水", artist: "龚贤" },
  { q: "Wang Hui Chinese landscape painting", motifs: ["mountain", "water", "pine"], scenes: ["mountain", "river"], dynasty: "清", era: "qing", title: "王翚山水", artist: "王翚" },
  { q: "Chinese painting Wu Zhen fisherman", motifs: ["boat", "bamboo", "water"], scenes: ["river", "home"], dynasty: "元", era: "yuan", title: "渔父", artist: "吴镇" },
  { q: "Chinese painting Liang Kai", motifs: ["figure", "wine", "zen"], scenes: ["wine", "zen"], dynasty: "宋", era: "southsong", title: "泼墨人物", artist: "梁楷" },
  { q: "Chinese painting Muqi", motifs: ["zen", "geese", "mist"], scenes: ["zen"], dynasty: "宋", era: "southsong", title: "禅画", artist: "牧溪" },
  { q: "Chinese painting Li Tang", motifs: ["pine", "mountain", "waterfall"], scenes: ["pine", "mountain"], dynasty: "宋", era: "song", title: "李唐山水", artist: "李唐" },
  { q: "Chinese painting Xu Wei", motifs: ["blossom", "leaves", "wine"], scenes: ["autumn", "wine"], dynasty: "明", era: "ming", title: "大写意", artist: "徐渭" },
  { q: "Chinese painting Yun Shouping flower", motifs: ["blossom", "orchid"], scenes: ["spring", "love"], dynasty: "清", era: "qing", title: "没骨花卉", artist: "恽寿平" },
  { q: "Chinese painting Zheng Xie bamboo", motifs: ["bamboo", "rock"], scenes: ["bamboo", "zen"], dynasty: "清", era: "qing", title: "板桥竹石", artist: "郑燮" },
  { q: "Chinese painting Jin Nong plum", motifs: ["plum", "blossom"], scenes: ["plum"], dynasty: "清", era: "qing", title: "金农墨梅", artist: "金农" },
  { q: "Chinese painting Hongren", motifs: ["mountain", "pine", "rock"], scenes: ["mountain", "zen"], dynasty: "清", era: "qing", title: "黄山图", artist: "弘仁" },
  { q: "Chinese painting Kuncan", motifs: ["mountain", "temple", "mist"], scenes: ["mountain", "zen"], dynasty: "清", era: "qing", title: "髡残山水", artist: "髡残" }
];

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

const gallery = loadGallery();
const seenUrls = new Set(gallery.map(g => g.source));
const seenIds = new Set(gallery.map(g => g.id));
let added = 0;

console.log(`现有图库 ${gallery.length} 幅，开始从 Met 补录…`);

for (const item of QUERIES) {
  try {
    const search = await getJson(
      `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(item.q)}`
    );
    const ids = (search.objectIDs || []).slice(0, 6);
    for (const oid of ids) {
      if (gallery.length >= 150) break;
      try {
        const obj = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${oid}`);
        if (!obj.isPublicDomain) continue;
        const img = obj.primaryImageSmall || obj.primaryImage;
        if (!img) continue;
        /* 尽量筛中国书画 */
        const culture = `${obj.culture || ""} ${obj.artistDisplayName || ""} ${obj.title || ""} ${obj.department || ""}`;
        if (!/China|Chinese|Asia/i.test(culture) && !/中国|中国画/.test(culture)) {
          if (!/Chinese|China/i.test(item.q)) continue;
        }
        if (seenUrls.has(img)) continue;

        const id = `met-${oid}`;
        if (seenIds.has(id)) continue;
        const ext = img.includes(".png") ? ".png" : ".jpg";
        const file = `${id}${ext}`;
        const dest = path.join(OUT_DIR, file);
        if (!fs.existsSync(dest)) {
          const n = await download(img, dest);
          console.log(`✓ ${id} ${(n / 1024).toFixed(0)}KB — ${obj.title}`);
        } else {
          console.log(`· 已有 ${id}`);
        }

        gallery.push({
          id,
          title: (obj.title || item.title).slice(0, 48),
          artist: obj.artistDisplayName || item.artist,
          dynasty: item.dynasty,
          era: item.era,
          motifs: item.motifs,
          scenes: item.scenes,
          file,
          source: img
        });
        seenUrls.add(img);
        seenIds.add(id);
        added++;
        await sleep(120);
      } catch (e) {
        /* skip one object */
      }
    }
  } catch (e) {
    console.log(`× 查询失败: ${item.q} — ${e.message}`);
  }
  await sleep(200);
}

/* Commons 已知可用文件名再补一轮 */
const COMMONS_EXTRA = [
  { id: "commons-fan-kuan-sig", commons: "Fan Kuan - Travelers Among Mountains and Streams.jpg", title: "溪山行旅图", artist: "范宽", dynasty: "宋", era: "northsong", motifs: ["mountain", "travel", "pine"], scenes: ["mountain", "travel"] },
  { id: "commons-ma-yuan-willow", commons: "Ma Yuan - Bare Willows and Distant Mountains.jpg", title: "柳岸远山", artist: "马远", dynasty: "宋", era: "southsong", motifs: ["willow", "mountain", "mist", "water"], scenes: ["spring", "farewell", "river"] },
  { id: "commons-ma-yuan-plum-moon", commons: "Ma Yuan - Viewing Plum Blossoms by Moonlight.jpg", title: "月下赏梅", artist: "马远", dynasty: "宋", era: "southsong", motifs: ["moon", "plum", "night", "figure"], scenes: ["moon", "plum", "night"] },
  { id: "commons-cui-bai", commons: "Cui Bai - Magpies and Hare.jpg", title: "双喜图", artist: "崔白", dynasty: "宋", era: "northsong", motifs: ["geese", "leaves", "autumn", "wind"], scenes: ["autumn", "wind"] },
  { id: "commons-huizong-crane", commons: "Emperor Huizong - Auspicious Cranes.jpg", title: "瑞鹤图", artist: "赵佶", dynasty: "宋", era: "song", motifs: ["geese", "pavilion", "mist"], scenes: ["spring", "nation"] },
  { id: "commons-shen-zhou-lu", commons: "Shen Zhou - Lofty Mount Lu.jpg", title: "庐山高图", artist: "沈周", dynasty: "明", era: "ming", motifs: ["mountain", "waterfall", "pine", "figure"], scenes: ["mountain", "zen"] },
  { id: "commons-wang-mian-plum", commons: "Wang Mian - Ink Plum.jpg", title: "墨梅图", artist: "王冕", dynasty: "元", era: "yuan", motifs: ["plum", "blossom"], scenes: ["plum"] },
  { id: "commons-xu-wei", commons: "Xu Wei - Grapes.jpg", title: "墨葡萄图", artist: "徐渭", dynasty: "明", era: "ming", motifs: ["blossom", "leaves", "wine"], scenes: ["autumn", "wine"] },
  { id: "commons-bada", commons: "Bada Shanren - Two Birds.jpg", title: "花鸟", artist: "八大山人", dynasty: "清", era: "qing", motifs: ["geese", "rock", "blossom"], scenes: ["zen"] },
  { id: "commons-muqi-six", commons: "Muqi - Six Persimmons.jpg", title: "六柿图", artist: "牧溪", dynasty: "宋", era: "southsong", motifs: ["zen", "leaves"], scenes: ["zen", "autumn"] },
  { id: "commons-li-cheng", commons: "Li Cheng - A Solitary Temple Amid Clearing Peaks.jpg", title: "晴峦萧寺图", artist: "李成", dynasty: "宋", era: "northsong", motifs: ["mountain", "temple", "pine", "mist"], scenes: ["mountain", "zen"] },
  { id: "commons-zhao-lingrang", commons: "Zhao Lingrang - Summer Mist along the Lake Shore.jpg", title: "湖庄清夏图", artist: "赵令穰", dynasty: "宋", era: "song", motifs: ["willow", "water", "mist", "hut"], scenes: ["spring", "home", "river"] },
  { id: "commons-dai-jin", commons: "Dai Jin - Returning Home Through Snow.jpg", title: "雪归图", artist: "戴进", dynasty: "明", era: "ming", motifs: ["snow", "mountain", "figure"], scenes: ["snow", "travel"] },
  { id: "commons-wen-zhengming-orch", commons: "Wen Zhengming - Orchids and Bamboo.jpg", title: "兰竹图", artist: "文徵明", dynasty: "明", era: "ming", motifs: ["orchid", "bamboo"], scenes: ["orchid", "bamboo"] },
  { id: "commons-zheng-xie", commons: "Zheng Xie - Bamboo.jpg", title: "墨竹", artist: "郑燮", dynasty: "清", era: "qing", motifs: ["bamboo", "rock"], scenes: ["bamboo"] },
  { id: "commons-wang-hui", commons: "Wang Hui - Landscapes after Song and Yuan Masters.jpg", title: "仿古山水", artist: "王翚", dynasty: "清", era: "qing", motifs: ["mountain", "mist", "water"], scenes: ["mountain"] },
  { id: "commons-shitao", commons: "Shitao - Returning Home.jpg", title: "石涛山水", artist: "石涛", dynasty: "清", era: "qing", motifs: ["mountain", "waterfall", "figure"], scenes: ["mountain", "home"] },
  { id: "commons-hongren", commons: "Hongren - Landscape.jpg", title: "弘仁山水", artist: "弘仁", dynasty: "清", era: "qing", motifs: ["mountain", "pine", "rock"], scenes: ["mountain", "zen"] },
  { id: "commons-jinghao", commons: "Jing Hao - Mount Lu.jpg", title: "匡庐图", artist: "荆浩", dynasty: "五代", era: "northsong", motifs: ["mountain", "waterfall", "pine"], scenes: ["mountain"] },
  { id: "commons-wu-zhen", commons: "Wu Zhen - Fisherman.jpg", title: "渔父图", artist: "吴镇", dynasty: "元", era: "yuan", motifs: ["boat", "water", "bamboo"], scenes: ["river"] },
  { id: "commons-wang-meng", commons: "Wang Meng - Forest Chamber Grotto at Juqu.jpg", title: "具区林屋图", artist: "王蒙", dynasty: "元", era: "yuan", motifs: ["mountain", "hut", "pine", "mist"], scenes: ["mountain", "home"] },
  { id: "commons-mi-youren", commons: "Mi Youren - Cloudy Mountains.jpg", title: "云山图", artist: "米友仁", dynasty: "宋", era: "song", motifs: ["mist", "mountain", "rain"], scenes: ["mountain", "rain", "mist"] },
  { id: "commons-li-di", commons: "Li Di - Maple Falcon and Pheasant.jpg", title: "枫鹰雉鸡图", artist: "李迪", dynasty: "宋", era: "song", motifs: ["geese", "leaves", "autumn"], scenes: ["autumn"] },
  { id: "commons-anonymous-snow", commons: "Anonymous-Snowscape.jpg", title: "雪景", artist: "佚名", dynasty: "宋", era: "song", motifs: ["snow", "mountain"], scenes: ["snow"] },
  { id: "commons-ma-lin-wall", commons: "Ma Lin - Fragrant Spring after Rain.jpg", title: "芳春雨霁", artist: "马麟", dynasty: "宋", era: "southsong", motifs: ["spring", "blossom", "mountain"], scenes: ["spring"] },
  { id: "commons-zhao-mengfu-sheep", commons: "Zhao Mengfu - Sheep and Goat.jpg", title: "二羊图", artist: "赵孟頫", dynasty: "元", era: "yuan", motifs: ["figure"], scenes: ["field"] },
  { id: "commons-chen-rong-dragon", commons: "Chen Rong - Nine Dragons.jpg", title: "九龙图（局部）", artist: "陈容", dynasty: "宋", era: "song", motifs: ["mist", "water", "wind"], scenes: ["wind", "dream"] },
  { id: "commons-li-song", commons: "Li Song - The Knickknack Peddler.jpg", title: "货郎图", artist: "李嵩", dynasty: "宋", era: "song", motifs: ["figure", "blossom"], scenes: ["field", "home"] },
  { id: "commons-anonymous-tribute", commons: "Anonymous - Tribute Bearers.jpg", title: "职贡图意", artist: "佚名", dynasty: "唐", era: "tang", motifs: ["figure", "horse", "fort"], scenes: ["frontier", "nation"] }
];

async function resolveCommons(title) {
  const t = title.startsWith("File:") ? title : `File:${title}`;
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", t);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime");
  url.searchParams.set("iiurlwidth", "900");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const data = await res.json();
  const page = Object.values(data.query.pages)[0];
  if (!page?.imageinfo) return null;
  const info = page.imageinfo[0];
  return { url: info.thumburl || info.url, mime: info.mime, title: page.title };
}

async function searchCommons(q) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", `filetype:bitmap ${q}`);
  url.searchParams.set("srnamespace", "6");
  url.searchParams.set("srlimit", "5");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const data = await res.json();
  for (const h of data.query?.search || []) {
    const f = await resolveCommons(h.title);
    if (f) return f;
    await sleep(250);
  }
  return null;
}

console.log("\n再补 Commons 已知名作…");
for (const item of COMMONS_EXTRA) {
  if (seenIds.has(item.id)) continue;
  try {
    let file = await resolveCommons(item.commons);
    if (!file) {
      await sleep(400);
      file = await searchCommons(item.commons.replace(/\.jpg$/i, "").replace(/\.png$/i, ""));
    }
    if (!file) {
      await sleep(400);
      file = await searchCommons(`${item.artist} ${item.title}`);
    }
    if (!file) { console.log(`× ${item.id}`); await sleep(500); continue; }
    const ext = (file.mime || "").includes("png") ? ".png" : ".jpg";
    const filename = `${item.id}${ext}`;
    const dest = path.join(OUT_DIR, filename);
    if (!fs.existsSync(dest)) {
      const n = await download(file.url, dest);
      console.log(`✓ ${item.id} ${(n / 1024).toFixed(0)}KB`);
    } else console.log(`· 已有 ${item.id}`);
    gallery.push({
      id: item.id,
      title: item.title,
      artist: item.artist,
      dynasty: item.dynasty,
      era: item.era,
      motifs: item.motifs,
      scenes: item.scenes,
      file: filename,
      source: file.title || item.commons
    });
    seenIds.add(item.id);
    added++;
  } catch (e) {
    console.log(`× ${item.id}: ${e.message}`);
  }
  await sleep(600);
}

const catalogJs = `/* 本地水墨画图库 · 自动生成，勿手改 */
window.INK_GALLERY = ${JSON.stringify(gallery)};
`;
fs.writeFileSync(GALLERY_JS, catalogJs, "utf8");
fs.writeFileSync(CATALOG_JSON, JSON.stringify(gallery, null, 2), "utf8");
console.log(`\n完成：新增 ${added}，图库共 ${gallery.length} 幅`);
