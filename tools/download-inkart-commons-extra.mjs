/**
 * Commons 强化搜索：针对未入库名作换关键词重试，并扫分类补录
 * 用法: node tools/download-inkart-commons-extra.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "inkart");
const GALLERY_JS = path.join(ROOT, "js", "data", "ink-gallery.js");
const CATALOG_JSON = path.join(OUT_DIR, "catalog.json");
const SRC = path.join(__dirname, "ink-source-catalog.json");
const UA = "MoyunShijing/1.0 (poetry education; local)";
const THUMB = 900;
const MAX_CAT = 60;

fs.mkdirSync(OUT_DIR, { recursive: true });

function loadGallery() {
  if (fs.existsSync(CATALOG_JSON)) return JSON.parse(fs.readFileSync(CATALOG_JSON, "utf8"));
  return [];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
  return { url: info.thumburl || info.url, mime: info.mime, title: page.title };
}

async function searchFile(query) {
  const data = await api({
    action: "query",
    list: "search",
    srsearch: `filetype:bitmap ${query}`,
    srnamespace: "6",
    srlimit: "10"
  });
  for (const h of data.query?.search || []) {
    const file = await resolveFile(h.title);
    if (file && /^image\/(jpeg|png|webp)/.test(file.mime || "")) return file;
    await sleep(150);
  }
  return null;
}

function extFromMime(mime) {
  if (mime?.includes("png")) return ".png";
  if (mime?.includes("webp")) return ".webp";
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

/* 失败条目的备用查询词 */
const ALT_QUERIES = {
  "qiu-ying-spring": ["Qiu Ying spring outing", "仇英 春游", "Qiu Ying landscape"],
  "dong-qichang-landscape": ["Dong Qichang landscape", "董其昌 山水", "Dong Qichang painting"],
  "bada-lotus": ["Bada Shanren lotus", "八大山人 荷", "Zhu Da birds"],
  "shitao-waterfall": ["Shitao landscape", "石涛 山水", "Daoji landscape painting"],
  "wang-hui-landscape": ["Wang Hui landscape", "王翚 山水", "Wang Hui painting"],
  "xu-daoning-fishing": ["Xu Daoning fishermen", "许道宁", "Fishermen among mountains"],
  "li-cheng-temple": ["Li Cheng temple peaks", "李成 晴峦", "Solitary Temple Amid Clearing Peaks"],
  "zhao-lingrang-river": ["Zhao Lingrang Summer Mist", "赵令穰", "Summer Mist along the Lake"],
  "muqi-persimmons": ["Muqi Six Persimmons", "牧溪 六柿", "Six Persimmons"],
  "muqi-guanyin": ["Muqi Guanyin", "牧溪 观音", "Fachang Guanyin"],
  "yan-wengui-pavilions": ["Yan Wengui", "燕文贵", "Pavilions by the River"],
  "zhao-boju-autumn": ["Zhao Boju", "赵伯驹", "Autumn Colors Rivers Mountains"],
  "wang-xizhi-orchid": ["Orchid Pavilion Gathering painting", "兰亭雅集 图", "Lanting gathering"],
  "anonymous-night-moon": ["Chinese moonlit landscape painting", "月夜 山水 画", "moonlight Chinese painting"],
  "ma-yuan-moon": ["Ma Yuan Viewing Plum Blossoms by Moonlight", "马远 月下", "Ma Yuan plum moonlight"],
  "hua-yan-snow": ["Hua Yan landscape", "华嵒 山水", "Hua Yan snow"],
  "ren-yi-flower": ["Ren Yi birds flowers", "任颐 花鸟", "Ren Bonian"],
  "wu-changshuo-plum": ["Wu Changshuo plum", "吴昌硕 梅", "Wu Changshuo painting"],
  "qi-baishi-shrimp": ["Qi Baishi shrimp", "齐白石 虾", "Qi Baishi painting shrimp"],
  "zhang-daqian-lotus": ["Zhang Daqian lotus", "张大千 荷", "Chang Dai-chien lotus"],
  "jing-hao-mount-lu": ["Jing Hao Mount Lu", "荆浩 匡庐", "Jing Hao landscape"],
  "mi-fu-cloud": ["Mi Fu cloudy mountains", "米芾 云山", "Mi Youren cloudy"],
  "li-di-snow": ["Li Di snow", "李迪 雪", "Li Di bird"],
  "cui-bai-magpies": ["Cui Bai Magpies and Hare", "崔白 双喜", "Cui Bai painting"],
  "lin-chun-grape": ["Lin Chun fruit bird", "林椿", "Fruit ripening birds"],
  "zhao-chang-flower": ["Zhao Chang butterflies", "赵昌", "Sketching from Life"],
  "emperor-huizong-crane": ["Emperor Huizong Auspicious Cranes", "赵佶 瑞鹤", "Song Huizong crane"],
  "li-songnian-boat": ["Li Songnian Red Cliff", "李嵩 赤壁", "Li Tang Red Cliff"],
  "dai-jin-returning": ["Dai Jin Returning Home Snow", "戴进 雪", "Dai Jin landscape"],
  "lan-ying-autumn": ["Lan Ying autumn", "蓝瑛 秋山", "Lan Ying landscape"],
  "su-shi-bamboo": ["Su Shi bamboo rock", "苏轼 竹石", "Su Dongpo bamboo"],
  "li-fangying-plum": ["Li Fangying plum", "李方膺 梅", "Li Fangying painting"],
  "wang-yuanqi-landscape": ["Wang Yuanqi landscape", "王原祁", "Wang Yuanqi painting"],
  "four-wang-yun-shouping-peak": ["Yun Shouping landscape", "恽寿平 山水", "Wang Shimin landscape"],
  "anonymous-frontier": ["Chinese frontier landscape painting", "边塞 行旅 画", "travelers mountain pass Chinese"],
  "zhou-chen-beggars": ["Zhou Chen beggars", "周臣", "Zhou Chen painting"],
  "wen-zhengming-orchid": ["Wen Zhengming orchid bamboo", "文徵明 兰竹", "Wen Zhengming orchid"],
  "shen-zhou-lufu": ["Shen Zhou Lofty Mount Lu", "沈周 庐山高", "Shen Zhou Lushan"],
  "ma-yuan-fishing": ["Ma Yuan fishing alone", "马远 寒江独钓", "Ma Yuan angler"],
  "li-gonglin-horse": ["Li Gonglin horses", "李公麟 马", "Li Gonglin Five Horses"],
  "zhao-mengfu-horse": ["Zhao Mengfu horse", "赵孟頫 人马", "Zhao Mengfu sheep goat"],
  "anonymous-chrys": ["Chinese chrysanthemum ink painting", "墨菊 图", "chrysanthemum Chinese painting"],
  "yun-shouping-chrys": ["Yun Shouping chrysanthemum", "恽寿平 菊", "Yun Shouping flower"],
  "shen-quan-crane": ["Shen Quan crane pine", "沈铨 松鹤", "Shen Quan birds"],
  "jiang-tingxi-bird": ["Jiang Tingxi bird flower", "蒋廷锡 花鸟", "Jiang Tingxi painting"]
};

const EXTRA_TARGETS = [
  { id: "commons-mi-youren-cloud", queries: ["Mi Youren Cloudy Mountains", "米友仁 云山"], title: "云山图", artist: "米友仁", dynasty: "宋", era: "song", motifs: ["mist", "mountain", "rain"], scenes: ["mountain", "rain"] },
  { id: "commons-zhao-mengfu-sheep", queries: ["Zhao Mengfu Sheep and Goat", "赵孟頫 二羊"], title: "二羊图", artist: "赵孟頫", dynasty: "元", era: "yuan", motifs: ["figure"], scenes: ["field"] },
  { id: "commons-chen-rong-dragon", queries: ["Chen Rong Nine Dragons", "陈容 九龙"], title: "九龙图（局部）", artist: "陈容", dynasty: "宋", era: "song", motifs: ["mist", "water", "wind"], scenes: ["wind", "dream"] },
  { id: "commons-wen-zhengming-orch", queries: ["Wen Zhengming Orchids and Bamboo", "文徵明 兰"], title: "兰竹图", artist: "文徵明", dynasty: "明", era: "ming", motifs: ["orchid", "bamboo"], scenes: ["orchid", "bamboo"] },
  { id: "commons-ma-yuan-willow", queries: ["Ma Yuan Bare Willows Distant Mountains", "马远 柳"], title: "柳岸远山", artist: "马远", dynasty: "宋", era: "southsong", motifs: ["willow", "mountain", "mist", "water"], scenes: ["spring", "farewell", "river"] },
  { id: "commons-shitao-home", queries: ["Shitao Returning Home", "石涛 Returning"], title: "石涛山水", artist: "石涛", dynasty: "清", era: "qing", motifs: ["mountain", "waterfall", "figure"], scenes: ["mountain", "home"] },
  { id: "commons-wang-hui-after", queries: ["Wang Hui Landscapes after Song and Yuan", "王翚 landscape"], title: "仿古山水", artist: "王翚", dynasty: "清", era: "qing", motifs: ["mountain", "mist", "water"], scenes: ["mountain"] },
  { id: "commons-dai-jin-snow", queries: ["Dai Jin Returning Home Through Snow", "戴进 snow"], title: "雪归图", artist: "戴进", dynasty: "明", era: "ming", motifs: ["snow", "mountain", "figure"], scenes: ["snow", "travel"] },
  { id: "commons-li-cheng-temple", queries: ["Li Cheng A Solitary Temple Amid Clearing Peaks", "李成 temple"], title: "晴峦萧寺图", artist: "李成", dynasty: "宋", era: "northsong", motifs: ["mountain", "temple", "pine", "mist"], scenes: ["mountain", "zen"] },
  { id: "commons-huizong-crane", queries: ["Emperor Huizong Auspicious Cranes", "瑞鹤图"], title: "瑞鹤图", artist: "赵佶", dynasty: "宋", era: "song", motifs: ["geese", "pavilion", "mist"], scenes: ["spring", "nation"] },
  { id: "commons-muqi-six", queries: ["Muqi Six Persimmons", "六柿图"], title: "六柿图", artist: "牧溪", dynasty: "宋", era: "southsong", motifs: ["zen", "leaves"], scenes: ["zen", "autumn"] },
  { id: "commons-zheng-xie-bamboo2", queries: ["Zheng Xie Bamboo", "郑燮 竹", "Zheng Banqiao bamboo"], title: "板桥墨竹", artist: "郑燮", dynasty: "清", era: "qing", motifs: ["bamboo", "rock"], scenes: ["bamboo"] },
  { id: "commons-zhao-lingrang", queries: ["Zhao Lingrang Summer Mist", "赵令穰"], title: "湖庄清夏图", artist: "赵令穰", dynasty: "宋", era: "song", motifs: ["willow", "water", "mist", "hut"], scenes: ["spring", "home", "river"] },
  { id: "commons-ma-lin-spring", queries: ["Ma Lin Fragrant Spring after Rain", "马麟 芳春"], title: "芳春雨霁", artist: "马麟", dynasty: "宋", era: "southsong", motifs: ["spring", "blossom", "mountain"], scenes: ["spring"] },
  { id: "commons-anonymous-tribute", queries: ["Tribute Bearers Chinese painting", "职贡图"], title: "职贡图意", artist: "佚名", dynasty: "唐", era: "tang", motifs: ["figure", "horse", "fort"], scenes: ["frontier", "nation"] }
];

const CATEGORIES = [
  "Category:Shan shui",
  "Category:Chinese landscape paintings",
  "Category:Ink and wash paintings of China",
  "Category:Chinese paintings of the Song Dynasty",
  "Category:Chinese paintings of the Ming Dynasty",
  "Category:Chinese paintings of the Qing Dynasty",
  "Category:Bird-and-flower paintings of China",
  "Category:Paintings of bamboo from China"
];

const gallery = loadGallery();
const seenIds = new Set(gallery.map(g => g.id));
const seenSources = new Set(gallery.map(g => g.source));
const source = JSON.parse(fs.readFileSync(SRC, "utf8"));
let added = 0;

console.log(`现有 ${gallery.length} 幅，开始 Commons 强化补录…`);

/* 1) 源目录缺失项换词重试 */
for (const item of source) {
  if (seenIds.has(item.id)) continue;
  const alts = ALT_QUERIES[item.id] || [];
  const queries = [
    item.commons,
    `${item.artist} ${item.title}`,
    `${item.artist} painting`,
    ...alts
  ].filter(Boolean);

  let file = null;
  let used = "";
  for (const q of queries) {
    try {
      if (/\.(jpg|png|jpeg|webp)$/i.test(q) || q.startsWith("File:")) {
        file = await resolveFile(q);
      }
      if (!file) file = await searchFile(q.replace(/\.(jpg|png)$/i, ""));
      if (file) { used = q; break; }
    } catch { /* next */ }
    await sleep(280);
  }

  if (!file) {
    console.log(`× 仍未找到: ${item.id}`);
    await sleep(200);
    continue;
  }
  if (seenSources.has(file.title)) {
    console.log(`· 源已用: ${item.id}`);
    continue;
  }

  const ext = extFromMime(file.mime);
  const filename = `${item.id}${ext}`;
  const dest = path.join(OUT_DIR, filename);
  try {
    if (!fs.existsSync(dest)) {
      const n = await download(file.url, dest);
      console.log(`✓ ${item.id} ← ${used} (${(n / 1024).toFixed(0)} KB)`);
    } else console.log(`· 已有文件 ${item.id}`);
    gallery.push({
      id: item.id,
      title: item.title,
      artist: item.artist,
      dynasty: item.dynasty,
      era: item.era || null,
      motifs: item.motifs || [],
      scenes: item.scenes || [],
      file: filename,
      source: file.title
    });
    seenIds.add(item.id);
    seenSources.add(file.title);
    added++;
  } catch (e) {
    console.log(`× 下载失败 ${item.id}: ${e.message}`);
  }
  await sleep(450);
}

/* 2) 额外目标 */
for (const item of EXTRA_TARGETS) {
  if (seenIds.has(item.id)) continue;
  let file = null;
  for (const q of item.queries) {
    try {
      file = await searchFile(q);
      if (file) break;
    } catch { /* next */ }
    await sleep(280);
  }
  if (!file || seenSources.has(file.title)) {
    console.log(`× extra ${item.id}`);
    continue;
  }
  const ext = extFromMime(file.mime);
  const filename = `${item.id}${ext}`;
  const dest = path.join(OUT_DIR, filename);
  try {
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
      source: file.title
    });
    seenIds.add(item.id);
    seenSources.add(file.title);
    added++;
  } catch (e) {
    console.log(`× ${item.id}: ${e.message}`);
  }
  await sleep(500);
}

/* 3) 分类扫录 */
let catAdded = 0;
let catIdx = gallery.filter(x => String(x.id).startsWith("commons-cat-")).length;
for (const cat of CATEGORIES) {
  if (catAdded >= MAX_CAT) break;
  try {
    const data = await api({
      action: "query",
      list: "categorymembers",
      cmtitle: cat,
      cmtype: "file",
      cmlimit: "50"
    });
    for (const m of data.query?.categorymembers || []) {
      if (catAdded >= MAX_CAT) break;
      if (seenSources.has(m.title)) continue;
      const file = await resolveFile(m.title);
      if (!file || !/^image\/(jpeg|png|webp)/.test(file.mime || "")) continue;
      const id = `commons-cat-${++catIdx}`;
      const ext = extFromMime(file.mime);
      const filename = `${id}${ext}`;
      const dest = path.join(OUT_DIR, filename);
      try {
        if (!fs.existsSync(dest)) await download(file.url, dest);
        const name = m.title.replace(/^File:/, "").replace(/\.[^.]+$/, "");
        gallery.push({
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
        seenIds.add(id);
        seenSources.add(m.title);
        added++;
        catAdded++;
        console.log(`+ 分类 ${id}: ${name.slice(0, 36)}`);
      } catch { /* skip */ }
      await sleep(400);
    }
  } catch (e) {
    console.log(`分类失败 ${cat}: ${e.message}`);
  }
  await sleep(600);
}

fs.writeFileSync(GALLERY_JS, `/* 本地水墨画图库 · 自动生成，勿手改 */\nwindow.INK_GALLERY = ${JSON.stringify(gallery)};\n`, "utf8");
fs.writeFileSync(CATALOG_JSON, JSON.stringify(gallery, null, 2), "utf8");
console.log(`\n完成：新增 ${added}，图库共 ${gallery.length} 幅`);
