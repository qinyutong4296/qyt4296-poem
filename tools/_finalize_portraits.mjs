/* 落盘：校验通过的候选图复制到 assets/poets/，重建 poet-portraits.js，写来源清单
 * 输入: tools/_portrait_hits.json + tools/_verified.json（{"<id>": {"verdict":"pass"|"fail","reason":"..."}}
 *       以及可选 {"<id>":{"verdict":"replace"}} 覆盖现有映射） */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
global.window = global;
eval(fs.readFileSync(path.join(ROOT, "js/data/poets-index.js"), "utf8") + ";globalThis.__I=POETS_INDEX;");
const IDX = globalThis.__I;
const byId = {}; IDX.forEach((p) => (byId[p.id] = p));

const hits0 = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/_portrait_hits.json"), "utf8"));
const pyHits = fs.existsSync(path.join(ROOT, "tools/_hits_pinyin.json"))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, "tools/_hits_pinyin.json"), "utf8")) : {};
const hits = { ...pyHits, ...hits0 };
const verified = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/_verified.json"), "utf8"));
const BAD = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "tools/_bad_portraits.json"), "utf8")));
eval(fs.readFileSync(path.join(ROOT, "js/data/poet-portraits.js"), "utf8") + ";globalThis.__P=window.POET_PORTRAITS;");
const oldMap = { ...globalThis.__P };

const added = [], removed = [], rejected = [];
const newMap = {};
for (const [k, v] of Object.entries(oldMap)) {
  if (BAD.has(k)) { removed.push(`${k}(${byId[k]?.name || k})`); continue; }
  /* 抓取覆盖过的 id 一律以最新校验结果为准（可撤销误加） */
  if (hits[k] && verified[k] && verified[k].verdict !== "pass") { removed.push(`${k}(revoked)`); continue; }
  newMap[k] = v;
}
for (const [id, res] of Object.entries(verified)) {
  if (res.verdict !== "pass") { rejected.push(`${id}:${res.reason || res.verdict}`); continue; }
  const h = hits[id];
  if (!h || !fs.existsSync(path.join(ROOT, "assets/poets/_cand", h.file))) { rejected.push(`${id}:missing-file`); continue; }
  fs.copyFileSync(path.join(ROOT, "assets/poets/_cand", h.file), path.join(ROOT, "assets/poets", h.file));
  newMap[id] = h.file;
  added.push(id);
}

/* 按索引顺序输出，便于 diff 阅读 */
const order = new Map(IDX.map((p, i) => [p.id, i]));
const entries = Object.entries(newMap).sort((a, b) => (order.has(a[0]) ? order.get(a[0]) : 1e9) - (order.has(b[0]) ? order.get(b[0]) : 1e9));
const out = [`/* 诗人肖像映射：有公有领域存像者才收录；其余前端显示「无留存像」`,
  ` * 已剔除检索误配（青铜器、现代人物照、无关画作等）`,
  ` * 2026-10-02 全面校订：下架误配 ${removed.length} 张；新增古诗文网（gushiwen.cn，图源 oss.guwendao.net/authorImg300）画像 ${added.length} 张，`,
  ` * 来源与校验记录见 tools/portrait-credits.json */`,
  `window.POET_PORTRAITS = {`];
for (const [k, v] of entries) out.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
out.push("};");
fs.writeFileSync(path.join(ROOT, "js/data/poet-portraits.js"), out.join("\n") + "\n", "utf8");

const credits = Object.values(hits).filter((h) => newMap[h.id]).map((h) => ({
  id: h.id, name: h.name, dynasty: h.dyn, file: h.file,
  source: "https://www.gushiwen.cn/authorv.aspx?name=" + encodeURIComponent(h.variant),
  image: h.url, verified: true,
}));
fs.writeFileSync(path.join(ROOT, "tools/portrait-credits.json"), JSON.stringify(credits, null, 1), "utf8");
console.log("map size:", entries.length, "| added:", added.length, "| removed:", removed.length, "| rejected:", rejected.length);
console.log("removed:", removed.join(", "));
console.log("rejected sample:", rejected.slice(0, 15).join(" | "));
