/* 从古诗文网抓取诗人画像：authorv.aspx?name=... → authorImg 图 URL → 下载
 * 输出: assets/poets/_cand/<id>.<ext> + tools/_portrait_hits.json + _portrait_miss.json
 * 已有良好映射的诗人跳过（BAD_LIST 中的会被移除后重抓，见 _bad_portraits.json） */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
global.window = global;
eval(fs.readFileSync(path.join(ROOT, "js/data/poets-index.js"), "utf8") + ";globalThis.__I=POETS_INDEX;");
eval(fs.readFileSync(path.join(ROOT, "js/data/poet-portraits.js"), "utf8") + ";globalThis.__P=window.POET_PORTRAITS;");
const IDX = globalThis.__I, MAP = globalThis.__P;

const BAD = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "tools/_bad_portraits.json"), "utf8")));
const OUT = path.join(ROOT, "assets/poets/_cand");
fs.mkdirSync(OUT, { recursive: true });

const SKIP_NAME = /无名|乐府|奉诏|等作|合集|《/;
const SKIP_ID = new Set(["xq_001"]); // 诗经（作品非人物）
const NAME_FIX = [
  [/^沙门/, ""],
  [/六首$/, ""],
  [/（.*$/, ""],
];

const targets = [];
for (const p of IDX) {
  if (SKIP_ID.has(p.id) || SKIP_NAME.test(p.name || "")) continue;
  if (MAP[p.id] && !BAD.has(p.id)) continue;
  const variants = [p.name];
  for (const [re, to] of NAME_FIX) {
    const v = (p.name || "").replace(re, to);
    if (v && v !== p.name && !variants.includes(v)) variants.push(v);
  }
  targets.push({ id: p.id, name: p.name, dyn: p.dyn, variants });
}
console.log("targets:", targets.length, "bad-refetch:", [...BAD].length);

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const hits = fs.existsSync(path.join(ROOT, "tools/_portrait_hits.json"))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, "tools/_portrait_hits.json"), "utf8")) : {};
const misses = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let blockedStreak = 0;

async function get(url, asBuf) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Referer": "https://www.gushiwen.cn/" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
      if (r.status === 404) return null;
      if (r.status === 512 || r.status === 403 || r.status === 418 || r.status === 429 || r.status >= 500) {
        blockedStreak++;
        if (r.status === 512 && !asBuf) { await sleep(30000 + Math.random() * 30000); } else { await sleep(2000 * (a + 1)); }
        continue;
      }
      if (!r.ok) return null;
      if (!asBuf) blockedStreak = 0;
      return asBuf ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch (e) { await sleep(1500 * (a + 1)); }
  }
  return null;
}

function pickImage(html) {
  const imgs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
  const cand = imgs.filter((u) => /authorimg|authorpic/i.test(u));
  const u = cand[0] || null;
  if (!u) return null;
  /* 朝代通用模板图（oss 上文件名即朝代词）→ 视为无像 */
  try {
    const base = decodeURIComponent(u.split("/").pop().replace(/\.[a-z]+$/i, ""));
    if (/^(先秦|秦汉|两?汉|汉[代朝]?|三国|魏晋|晋[代朝]?|南北朝|南朝|北朝|隋[代]?|唐[代]?|五代|五代十国|宋[代]?|辽[代]?|金[代朝]?|元[代]?|明[代]?|清[代]?|近现代|现代|当代|民国|外国)$/.test(base)) return null;
  } catch (e) { /* decode 失败则照常下载 */ }
  return u;
}

let done = 0;
for (const t of targets) {
  if (hits[t.id]?.file) { done++; continue; }
  let got = null;
  for (const v of t.variants) {
    if (blockedStreak >= 6) { console.log("BLOCKED pause"); await sleep(120000); blockedStreak = 0; }
    const html = await get(`https://www.gushiwen.cn/authorv.aspx?name=${encodeURIComponent(v)}`);
    if (!html) { await sleep(600); continue; }
    const u = pickImage(html);
    if (u) { got = { variant: v, url: u }; break; }
    await sleep(320);
  }
  if (got) {
    try {
      const buf = await get(got.url, true);
      const ext = (got.url.match(/\.(jpe?g|png|webp|gif)(\?|$)/i)?.[1] || "jpg").toLowerCase();
      const file = `${t.id}.${ext}`;
      if (buf && buf.length > 2000) {
        fs.writeFileSync(path.join(OUT, file), buf);
        hits[t.id] = { id: t.id, name: t.name, dyn: t.dyn, url: got.url, variant: got.variant, file, bytes: buf.length };
      } else { misses[t.id] = { name: t.name, why: "img-too-small" }; }
    } catch (e) { misses[t.id] = { name: t.name, why: "dl-fail" }; }
  } else {
    misses[t.id] = { name: t.name, why: "no-page-or-no-img" };
  }
  done++;
  if (done % 40 === 0) {
    console.log(`progress ${done}/${targets.length} hits=${Object.keys(hits).length}`);
    fs.writeFileSync(path.join(ROOT, "tools/_portrait_hits.json"), JSON.stringify(hits, null, 1), "utf8");
    fs.writeFileSync(path.join(ROOT, "tools/_portrait_miss.json"), JSON.stringify(misses, null, 1), "utf8");
  }
  await sleep(550 + Math.random() * 350);
}
fs.writeFileSync(path.join(ROOT, "tools/_portrait_hits.json"), JSON.stringify(hits, null, 1), "utf8");
fs.writeFileSync(path.join(ROOT, "tools/_portrait_miss.json"), JSON.stringify(misses, null, 1), "utf8");
console.log("DONE hits:", Object.keys(hits).length, "miss:", Object.keys(misses).length);
