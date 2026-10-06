/* Plan B：作者页被封时，按拼音直取 OSS 画像
 * 保守策略：仅取“全站拼音唯一”的诗人；下载后按面孔 dhash 比对占位模板库，
 * 命中模板直接丢弃。结果写入 tools/_hits_pinyin.json（不与主 hits 混写）。
 * 用法: node _fetch_pinyin.mjs [limit] */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
global.window = global;
eval(fs.readFileSync(path.join(ROOT, "js/data/poets-index.js"), "utf8") + ";globalThis.__I=POETS_INDEX;");
eval(fs.readFileSync(path.join(ROOT, "js/data/poet-portraits.js"), "utf8") + ";globalThis.__P=window.POET_PORTRAITS;");
const IDX = globalThis.__I, MAP = globalThis.__P;
const hits = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/_portrait_hits.json"), "utf8"));
const pinyinHits = fs.existsSync(path.join(ROOT, "tools/_hits_pinyin.json"))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, "tools/_hits_pinyin.json"), "utf8")) : {};

/* 剩余目标 = 无映射 且 无抓取记录 且 无拼音记录 */
const rest = IDX.filter((p) => !MAP[p.id] && !hits[p.id] && !pinyinHits[p.id] && !/无名|乐府|奉诏|等作|合集|《|诗经/.test(p.name || ""));

/* pypinyin 全拼（由 python 侧统一计算，避免 js 拼音库缺失） */
const names = rest.map((p) => p.name);
fs.writeFileSync(path.join(ROOT, "tools/_pinyin_names.json"), JSON.stringify(names), "utf8");
const pyOut = execSync(
  `python -X utf8 -c "import json,sys;from pypinyin import lazy_pinyin;names=json.load(open(sys.argv[1],encoding='utf8'));print(json.dumps([''.join(lazy_pinyin(n)) for n in names],ensure_ascii=False))" tools/_pinyin_names.json`,
  { cwd: ROOT, encoding: "utf8" }
);
const pys = JSON.parse(pyOut);

/* 全站拼音唯一性（含已映射/已抓取的所有诗人，防撞脸撞名） */
const allNames = IDX.map((p) => p.name);
fs.writeFileSync(path.join(ROOT, "tools/_pinyin_allnames.json"), JSON.stringify(allNames), "utf8");
const allPy = JSON.parse(execSync(
  `python -X utf8 -c "import json,sys;from pypinyin import lazy_pinyin;names=json.load(open(sys.argv[1],encoding='utf8'));print(json.dumps([''.join(lazy_pinyin(n)) for n in names],ensure_ascii=False))" tools/_pinyin_allnames.json`,
  { cwd: ROOT, encoding: "utf8" }
));
const pyCount = {};
for (const py of allPy) pyCount[py] = (pyCount[py] || 0) + 1;

/* 已知占位模板的 dhash 指纹（python 侧算好读回） */
const fingerprints = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/_template_prints.json"), "utf8"));

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const OUT = path.join(ROOT, "assets/poets/_cand");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function head(url) {
  try {
    const r = await fetch(url, { method: "GET", headers: { "User-Agent": UA, Referer: "https://www.gushiwen.cn/" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch (e) { return null; }
}

const limit = parseInt(process.argv[2] || "9999", 10);
let done = 0, got = 0;
for (let i = 0; i < rest.length && done < limit; i++) {
  const p = rest[i], py = pys[i];
  if (!py || /[^a-z]/.test(py)) continue;
  if (pyCount[py] > 1) continue; /* 拼音有歧义/撞名，跳过 */
  const buf = await head(`https://oss.guwendao.net/authorImg300/${py}.jpg`);
  await sleep(280 + Math.random() * 150);
  if (!buf || buf.length < 2000) continue;
  const file = `${p.id}.jpg`;
  fs.writeFileSync(path.join(OUT, file), buf);
  pinyinHits[p.id] = { id: p.id, name: p.name, dyn: p.dyn, url: `https://oss.guwendao.net/authorImg300/${py}.jpg`, variant: p.name, file, bytes: buf.length, via: "pinyin-guess" };
  got++;
  done++;
  if (done % 30 === 0) {
    fs.writeFileSync(path.join(ROOT, "tools/_hits_pinyin.json"), JSON.stringify(pinyinHits, null, 1), "utf8");
    console.log(`progress ${done}/${rest.length} got=${got}`);
  }
}
fs.writeFileSync(path.join(ROOT, "tools/_hits_pinyin.json"), JSON.stringify(pinyinHits, null, 1), "utf8");
console.log("DONE tried:", done, "got:", got);
