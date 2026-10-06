/* ============================================================
 * 墨韵诗境 · 诗风语言模型构建脚本（离线，Node 运行）
 *
 * 用法：  node --max-old-space-size=4096 tools/build-style-model.mjs
 * 输入：  js/data/poems/*.js（全站语料，约 27 万首）
 * 输出：  js/data/style/index.js   风格索引（朝代元信息 + 韵部聚类 + 仄尾池，首屏加载）
 *         js/data/style/<id>.js    各朝代 n-gram 模型（觅句时按需懒加载）
 *         js/data/style/hub.js     全库合并模型（生僻朝代与关键词的兜底）
 *
 * 模型内容（每朝代）：
 *   b2  字→下字 接续频次（Bigram，top8）
 *   b3  二字上下文→下字（Trigram，top4）
 *   b4  三字上下文→下字（4-gram，top2）
 *   L   各句长(2..9)的起字表 st 与句尾字表 ed
 * 供 generator.js 以"仿某朝语感"组句：起字/接续皆出自真实语料，
 * 韵脚取自语料聚类出的韵部，遣词造句随朝代而变。
 *
 * 语料更新后重跑本脚本即可重建模型。
 * ============================================================ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "js", "data", "poems");
const OUT = path.join(ROOT, "js", "data", "style");

/* ---- 可调参数 ---- */
const TOP2 = 6, MIN2 = 3;   // bigram：每字保留前 TOP2 个下字，频次≥MIN2
const TOP3 = 3, MIN3 = 3;   // trigram（小语料朝代自动降为 2）
const TOP4 = 2, MIN4 = 4;   // 4-gram（小语料朝代自动降为 2）
const TOP_ST = 110;         // 每句长起字表上限
const TOP_ED = 110;         // 每句长句尾表上限
const TOP_ZE = 260;         // 全局仄尾池上限
const CTX3_CAP = 160000;    // b3 上下文数量上限（按上下文总频次保留）
const CTX4_CAP = 90000;     // b4 上下文数量上限
const SMALL_SEGS = 60000;   // 低于此段数视为小语料，放低频次门槛
const CLUSTER_MIN_PAIR = 3; // 韵部聚类：同诗互押次数≥3 才连边
const CLUSTER_TOP = 26;     // 保留韵部数
const CLUSTER_MIN = 6, CLUSTER_MAX = 64; // 韵部字数上下限
const B3_LIMIT = 700000;    // b3 内存上限（超出即清扫一次频次 1 项）
const B4_LIMIT = 1400000;   // b4 内存上限

/* 朝代 → 模型 id 与风格短介（顺序即界面顺序） */
const DYN_META = [
  ["先秦", "xianqin", "四言古朴 · 诗骚并起"],
  ["汉",   "han",     "乐府叙事 · 古直浑成"],
  ["魏晋", "weijin",  "建安风骨 · 山水初鸣"],
  ["南北朝", "nbeichao", "清丽婉转 · 声律渐兴"],
  ["隋",   "sui",     "南北合流 · 气象初新"],
  ["唐",   "tang",    "格律大成 · 气象万千"],
  ["五代", "wudai",   "花间尊前 · 婉约初成"],
  ["宋",   "song",    "以文为诗词 · 理趣盎然"],
  ["辽",   "liao",    "朔漠雄风 · 朴直劲健"],
  ["金",   "jin",     "苏学北行 · 悲慨苍凉"],
  ["元",   "yuan",    "散曲俚趣 · 晓畅直白"],
  ["明",   "ming",    "拟古各派 · 格调纷陈"],
  ["清",   "qing",    "集大成 · 醇雅深细"],
  ["现代", "xiandai", "白话新诗 · 自由抒写"],
];

/* 不并入 hub 兜底模型的朝代：白话文功能字（的/了/着/我…）
 * 混入 hub 会污染小语料古体的接续与句尾 */
const HUB_EXCLUDE = new Set(["现代"]);

/* 现代新诗一行可长达数十字，若无标点会被整段丢弃；
 * 仅对现代语料把超长汉字串对半递归切开（各半仍 ≥2 字） */
function splitLong(s) {
  if (s.length <= 12) return s.length >= 2 ? [s] : [];
  const k = Math.ceil(s.length / 2);
  return [...splitLong(s.slice(0, k)), ...splitLong(s.slice(k))];
}

/* 近体诗体裁（用于韵部聚类与仄尾池） */
const JINTI = new Set(["五言绝句", "七言绝句", "五言律诗", "七言律诗"]);
const CJK_OK = s => /^[\u3400-\u9fff]+$/.test(s);

/* ---------- 分段：按非汉字切开，只留 2..12 字段（allowLong 供现代长句递归切分） ---------- */
function segmentsOf(contentLines, allowLong) {
  const segs = [];
  for (const line of contentLines) {
    for (const raw of String(line).split(/[^\u3400-\u9fff]+/)) {
      if (raw.length >= 2 && raw.length <= 12) segs.push(raw);
      else if (allowLong && raw.length > 12) segs.push(...splitLong(raw));
    }
  }
  return segs;
}
function bucketOf(len) { return len <= 9 ? String(len) : "9"; } // 8..12 归入 9 桶

/* 现代语料额外内置真实句块池 S（分句长桶、按频次保留）：
 * 白话 n-gram 语料太稀，采样易串生涩句；直接取原句为行可保语感 */
const SEG_TOP = 260;        // 每句长桶保留句块数
function packS(freqMap) {
  const byBk = {};
  for (const [s, c] of freqMap) {
    const bk = bucketOf(s.length);
    (byBk[bk] || (byBk[bk] = [])).push([s, c]);
  }
  const out = {};
  for (const bk in byBk) {
    byBk[bk].sort((a, b) => b[1] - a[1]);
    out[bk] = byBk[bk].slice(0, SEG_TOP);
  }
  return out;
}

/* ---------- 计数容器：线性数组 + 定期清扫频次 1 的项 ---------- */
class Counter {
  constructor(limit) { this.m = new Map(); this.limit = limit; }
  bump(ctx, ch) {
    let arr = this.m.get(ctx);
    if (!arr) {
      if (this.m.size >= this.limit) this.sweep();
      arr = []; this.m.set(ctx, arr);
    }
    for (const e of arr) if (e[0] === ch) { e[1]++; return; }
    arr.push([ch, 1]);
  }
  sweep() {
    for (const [k, arr] of this.m) {
      if (arr.length === 1 && arr[0][1] === 1) this.m.delete(k);
      else if (arr.length > 1) {
        const keep = arr.filter(e => e[1] >= 2);
        if (keep.length) this.m.set(k, keep); else this.m.delete(k);
      }
    }
  }
  packed(top, min, cap) {
    let entries = [...this.m.entries()];
    if (cap && entries.length > cap) {
      /* 按上下文总频次保留前 cap 个上下文 */
      const mass = e => e[1].reduce((s, x) => s + x[1], 0);
      entries.sort((a, b) => mass(b) - mass(a));
      entries = entries.slice(0, cap);
    }
    const out = {};
    for (const [ctx, arr] of entries) {
      const keep = arr.filter(e => e[1] >= min).sort((a, b) => b[1] - a[1]).slice(0, top);
      if (keep.length) out[ctx] = keep;
    }
    return out;
  }
}

/* ---------- 读取一个文件，回调每个诗人条目 ---------- */
function eachPoetFile(fn) {
  for (const f of fs.readdirSync(SRC)) {
    if (!f.endsWith(".js")) continue;
    let db = {};
    try {
      new Function("POEM_DB",
        fs.readFileSync(path.join(SRC, f), "utf8").replace("window.POEM_DB=window.POEM_DB||{};", "")
      )(db);
    } catch (e) { console.warn("跳过解析失败文件:", f, e.message); continue; }
    for (const id in db) fn(db[id]);
  }
}

console.time("第一遍：扫描");

/* 第一遍：小内存统计 —— 各朝代 b2 / 起尾字表 / 韵部聚类 / 仄尾池 / 文件归属 */
const dynAgg = new Map(); // dyn -> {b2:Counter, L:Map, segs, poems}
function aggBox(dyn) {
  let b = dynAgg.get(dyn);
  if (!b) {
    b = { b2: new Counter(Infinity), L: new Map(), segs: 0, poems: 0,
      S: dyn === "现代" ? new Map() : null };
    dynAgg.set(dyn, b);
  }
  return b;
}
const endFreq = new Map(), zeEndFreq = new Map(), pairCnt = new Map();
const fileDyns = new Map(); // 文件名 → dyn 集合

{
  let fi = 0;
  for (const f of fs.readdirSync(SRC)) {
    if (!f.endsWith(".js")) continue;
    fi++;
    if (fi % 200 === 0) console.log("  …", fi, "个文件");
    let db = {};
    try {
      new Function("POEM_DB",
        fs.readFileSync(path.join(SRC, f), "utf8").replace("window.POEM_DB=window.POEM_DB||{};", "")
      )(db);
    } catch (e) { continue; }
    const ds = new Set();
    for (const id in db) {
      const entry = db[id];
      ds.add(entry.dyn);
      const allowLong = entry.dyn === "现代";
      const box = aggBox(entry.dyn);
      for (const p of entry.poems) {
        box.poems++;
        const segs = segmentsOf(p.c, allowLong);
        box.segs += segs.length;
        if (box.S) for (const s of segs) box.S.set(s, (box.S.get(s) || 0) + 1);
        for (const s of segs) {
          const bk = bucketOf(s.length);
          let L = box.L.get(bk);
          if (!L) { L = { st: new Map(), ed: new Map() }; box.L.set(bk, L); }
          L.st.set(s[0], (L.st.get(s[0]) || 0) + 1);
          L.ed.set(s[s.length - 1], (L.ed.get(s[s.length - 1]) || 0) + 1);
          for (let i = 0; i < s.length - 1; i++) box.b2.bump(s[i], s[i + 1]);
        }
        /* 近体：韵脚频次与互押对（严格两个半句、各为五/七言，防错位连边） */
        if (JINTI.has(p.f)) {
          const ends = new Set();
          for (const line of p.c) {
            const halves = String(line).split(/[^\u3400-\u9fff]+/).filter(s => s.length >= 2 && CJK_OK(s));
            for (let h = 0; h + 1 < halves.length; h += 2) {
              const a = halves[h], b = halves[h + 1];
              if ((a.length !== 5 && a.length !== 7) || (b.length !== 5 && b.length !== 7)) continue;
              zeEndFreq.set(a.slice(-1), (zeEndFreq.get(a.slice(-1)) || 0) + 1);
              const py = b.slice(-1);
              if (CJK_OK(py)) endFreq.set(py, (endFreq.get(py) || 0) + 1);
              ends.add(py);
            }
          }
          const arr = [...ends];
          for (let i = 0; i < arr.length; i++)
            for (let j = i + 1; j < arr.length; j++) {
              const key = arr[i] < arr[j] ? arr[i] + "|" + arr[j] : arr[j] + "|" + arr[i];
              pairCnt.set(key, (pairCnt.get(key) || 0) + 1);
            }
        }
      }
    }
    fileDyns.set(f, ds);
  }
}
console.timeEnd("第一遍：扫描");
console.log("韵部互押对:", pairCnt.size);

/* 韵部聚类：互为近邻法（防止常见平声字连成一个巨块）
 * 对每个高频韵脚字，取"共押得分"最高的 K 个伙伴；仅当互相都在对方前列才连边。 */
const NEIGH_K = 7, NEIGH_MIN = 4;
const neigh = new Map(); // char -> [[伙伴,得分],…]
for (const [key, n] of pairCnt) {
  if (n < NEIGH_MIN) continue;
  const [a, b] = key.split("|");
  if ((endFreq.get(a) || 0) < 25 || (endFreq.get(b) || 0) < 25) continue;
  const score = n / Math.sqrt(endFreq.get(a) * endFreq.get(b));
  if (!neigh.has(a)) neigh.set(a, []);
  if (!neigh.has(b)) neigh.set(b, []);
  neigh.get(a).push([b, score]);
  neigh.get(b).push([a, score]);
}
const mutual = [];
for (const [a, arr] of neigh) {
  arr.sort((x, y) => y[1] - x[1]);
  const top = arr.slice(0, NEIGH_K);
  for (const [b] of top) {
    const bt = (neigh.get(b) || []).slice(0, NEIGH_K).map(e => e[0]);
    if (bt.includes(a) && a < b) mutual.push([a, b]);
  }
}
const parent = new Map();
const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
for (const [a, b] of mutual) {
  for (const c of [a, b]) if (!parent.has(c)) parent.set(c, c);
  const ra = find(a), rb = find(b);
  if (ra !== rb) parent.set(ra, rb);
}
const groups = new Map();
for (const ch of parent.keys()) {
  const r = find(ch);
  if (!groups.has(r)) groups.set(r, []);
  groups.get(r).push(ch);
}
const CLUSTERS = [...groups.values()]
  .filter(cs => cs.length >= CLUSTER_MIN && cs.length <= CLUSTER_MAX)
  .map(cs => cs.map(c => [c, endFreq.get(c) || 0]).sort((a, b) => b[1] - a[1]).map(e => e[0]).join(""))
  .sort((a, b) => (endFreq.get(b[0]) || 0) - (endFreq.get(a[0]) || 0))
  .slice(0, CLUSTER_TOP);
console.log("韵部聚类:", CLUSTERS.length, "示例:", CLUSTERS.slice(0, 4).map(c => c.slice(0, 12)).join(" / "));

/* ---------- 第二遍：逐朝代构建 b3/b4 并落盘 ---------- */
fs.mkdirSync(OUT, { recursive: true });

function topSorted(map, n, min) {
  return [...map.entries()].filter(e => e[1] >= min)
    .sort((a, b) => b[1] - a[1]).slice(0, n);
}

function packL(L) {
  const out = {};
  for (const [bk, v] of L) { /* box.L 是 Map，须用 for...of */
    out[bk] = {
      st: topSorted(v.st, TOP_ST, 2),
      ed: topSorted(v.ed, TOP_ED, 2),
    };
  }
  return out;
}

function mergeB(list, top, min) {
  /* list: 各朝代 packed bN 对象 → 合并（计数相加） */
  const acc = new Map(); // ctx -> Map(char->cnt)
  for (const src of list) {
    for (const ctx in src) {
      let m = acc.get(ctx);
      if (!m) { m = new Map(); acc.set(ctx, m); }
      for (const [ch, c] of src[ctx]) m.set(ch, (m.get(ch) || 0) + c);
    }
  }
  const out = {};
  for (const [ctx, m] of acc) {
    const keep = [...m.entries()].filter(e => e[1] >= min).sort((a, b) => b[1] - a[1]).slice(0, top);
    if (keep.length) out[ctx] = keep;
  }
  return out;
}

function mergeL(list) {
  const acc = {}; // bucket -> Map(char->cnt) for st/ed
  for (const src of list) {
    for (const bk in src) {
      if (!acc[bk]) acc[bk] = { st: new Map(), ed: new Map() };
      for (const [ch, c] of src[bk].st) acc[bk].st.set(ch, (acc[bk].st.get(ch) || 0) + c);
      for (const [ch, c] of src[bk].ed) acc[bk].ed.set(ch, (acc[bk].ed.get(ch) || 0) + c);
    }
  }
  const out = {};
  for (const bk in acc) {
    out[bk] = { st: topSorted(acc[bk].st, TOP_ST, 2), ed: topSorted(acc[bk].ed, TOP_ED, 2) };
  }
  return out;
}

const packed = {}; // dyn -> model（供 hub 合并）
let done = 0;
for (const [dyn, id, desc] of DYN_META) {
  const box = dynAgg.get(dyn);
  if (!box || box.segs < 400) { console.warn("语料过少，跳过:", dyn); continue; }
  console.time("  " + dyn);
  const b3 = new Counter(B3_LIMIT), b4 = new Counter(B4_LIMIT);
  for (const [f, ds] of fileDyns) {
    if (!ds.has(dyn)) continue;
    let db = {};
    try {
      new Function("POEM_DB",
        fs.readFileSync(path.join(SRC, f), "utf8").replace("window.POEM_DB=window.POEM_DB||{};", "")
      )(db);
    } catch (e) { continue; }
    for (const pid in db) {
      if (db[pid].dyn !== dyn) continue;
      const allowLong = dyn === "现代";
      for (const p of db[pid].poems) {
        for (const s of segmentsOf(p.c, allowLong)) {
          for (let i = 0; i < s.length - 2; i++) b3.bump(s.slice(i, i + 2), s[i + 2]);
          for (let i = 0; i < s.length - 3; i++) b4.bump(s.slice(i, i + 3), s[i + 3]);
        }
      }
    }
  }
  const small = box.segs < SMALL_SEGS;
  const model = {
    c: box.poems, s: box.segs,
    b2: box.b2.packed(TOP2, small ? 2 : MIN2, 0),
    b3: b3.packed(TOP3, small ? 2 : MIN3, small ? 0 : CTX3_CAP),
    b4: b4.packed(TOP4, small ? 2 : MIN4, small ? 0 : CTX4_CAP),
    L: packL(box.L),
  };
  if (box.S && box.S.size) model.S = packS(box.S);
  const file = path.join(OUT, id + ".js");
  fs.writeFileSync(file, "window.STYLE_MODELS=window.STYLE_MODELS||{};STYLE_MODELS[" + JSON.stringify(id) + "]=" + JSON.stringify(model) + ";");
  packed[dyn] = model;
  done++;
  console.timeEnd("  " + dyn);
  console.log(`    ${dyn} 诗${box.poems} 段${box.segs} → ${(fs.statSync(file).size / 1024).toFixed(0)}KB`);
}

/* hub：各朝代打包结果合并（兜底模型；HUB_EXCLUDE 朝代不并入） */
{
  const list = Object.entries(packed).filter(([dyn]) => !HUB_EXCLUDE.has(dyn)).map(([, m]) => m);
  const model = {
    c: list.reduce((s, m) => s + m.c, 0), s: list.reduce((s, m) => s + m.s, 0),
    b2: mergeB(list.map(m => m.b2), TOP2, MIN2),
    b3: mergeB(list.map(m => m.b3), TOP3, MIN3),
    b4: mergeB(list.map(m => m.b4), TOP4, MIN4),
    L: mergeL(list.map(m => m.L)),
  };
  const file = path.join(OUT, "hub.js");
  fs.writeFileSync(file, "window.STYLE_MODELS=window.STYLE_MODELS||{};STYLE_MODELS[\"__hub__\"]=" + JSON.stringify(model) + ";");
  console.log("hub 兜底模型:", (fs.statSync(file).size / 1024).toFixed(0) + "KB");
}

/* 索引 */
const meta = [];
for (const [dyn, id, desc] of DYN_META) {
  const m = packed[dyn];
  if (m) meta.push({ id, name: dyn, desc, poems: m.c, segs: m.s });
}
const ZE_POOL = topSorted(zeEndFreq, TOP_ZE, 3).map(e => e[0]);
fs.writeFileSync(path.join(OUT, "index.js"),
  "window.STYLE_INDEX=" + JSON.stringify({ v: 3, dyns: meta, clusters: CLUSTERS, zePool: ZE_POOL }) + ";");
console.log("index.js:", (fs.statSync(path.join(OUT, "index.js")).size / 1024).toFixed(1) + "KB",
  "仄尾池", ZE_POOL.length, "字 · 韵部", CLUSTERS.length);
console.log("完成 ✓  共构建", done, "个朝代模型");
