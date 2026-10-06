/**
 * 按画名/来源关键词重标图库意象与场景，补齐稀缺标签
 * 用法: node tools/retag-inkart.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "inkart");
const GALLERY_JS = path.join(ROOT, "js", "data", "ink-gallery.js");
const CATALOG_JSON = path.join(OUT_DIR, "catalog.json");

const gallery = JSON.parse(fs.readFileSync(CATALOG_JSON, "utf8"));

const RULES = [
  [/rain|storm|雨|风雨|归舟.*雨|rainstorm/i, { motifs: ["rain", "mist"], scenes: ["rain"] }],
  [/bridge|桥|溪桥/i, { motifs: ["bridge", "water"], scenes: ["travel", "river"] }],
  [/wine|drink|醉|酒|grape|葡萄|immortal.*splash|泼墨仙人/i, { motifs: ["wine"], scenes: ["wine"] }],
  [/pastoral|village|field|farm|sericulture|odes of bin|田|村|农|蚕/i, { motifs: ["field", "hut"], scenes: ["field", "home"] }],
  [/lantern|灯|夜游|night excursion/i, { motifs: ["lamp", "night"], scenes: ["night"] }],
  [/moon|月光|月下|moonlight/i, { motifs: ["moon", "night"], scenes: ["moon", "night"] }],
  [/snow|雪/i, { motifs: ["snow"], scenes: ["snow"] }],
  [/wind|松风|wind in the pines|双喜|magpie/i, { motifs: ["wind"], scenes: ["wind"] }],
  [/willow|柳|farewell|送别/i, { motifs: ["willow"], scenes: ["farewell", "spring"] }],
  [/horse|马|frontier|关山|pass/i, { motifs: ["horse"], scenes: ["frontier", "travel"] }],
  [/fort|palace|palace|palace|palace|关|塞|宫阙|tribute/i, { motifs: ["fort"], scenes: ["frontier", "nation"] }],
  [/dream|immortal|仙|桃源|peach blossom spring/i, { motifs: ["mist"], scenes: ["dream"] }],
  [/zen|chan|monk|arhat|禅|僧|罗汉/i, { motifs: ["zen"], scenes: ["zen"] }],
  [/travel|traveler|行旅|归|returning/i, { motifs: ["travel"], scenes: ["travel"] }],
  [/love|beauty|仕女|美人/i, { motifs: ["figure", "blossom"], scenes: ["love"] }],
  [/chrysanthemum|菊/i, { motifs: ["chrys"], scenes: ["chrys", "autumn"] }],
  [/plum|梅/i, { motifs: ["plum"], scenes: ["plum"] }],
  [/bamboo|竹/i, { motifs: ["bamboo"], scenes: ["bamboo"] }],
  [/orchid|兰/i, { motifs: ["orchid"], scenes: ["orchid"] }],
  [/star|milky|星|河汉/i, { motifs: ["stars", "night"], scenes: ["night", "dream"] }],
  [/qin|zither|琴/i, { motifs: ["figure", "pavilion"], scenes: ["home", "zen"] }]
];

let touched = 0;
for (const g of gallery) {
  const blob = `${g.title} ${g.artist} ${g.source || ""} ${g.id}`;
  const motifs = new Set(g.motifs || []);
  const scenes = new Set(g.scenes || []);
  let hit = false;
  for (const [re, add] of RULES) {
    if (!re.test(blob)) continue;
    hit = true;
    for (const m of add.motifs || []) motifs.add(m);
    for (const s of add.scenes || []) scenes.add(s);
  }
  if (!hit) continue;
  const before = JSON.stringify([g.motifs, g.scenes]);
  g.motifs = [...motifs].slice(0, 7);
  g.scenes = [...scenes].slice(0, 5);
  if (JSON.stringify([g.motifs, g.scenes]) !== before) touched++;
}

fs.writeFileSync(
  GALLERY_JS,
  `/* 本地水墨画图库 · 自动生成，勿手改 */\nwindow.INK_GALLERY = ${JSON.stringify(gallery)};\n`,
  "utf8"
);
fs.writeFileSync(CATALOG_JSON, JSON.stringify(gallery, null, 2), "utf8");
console.log(`重标完成：更新 ${touched} 幅，图库共 ${gallery.length} 幅`);
