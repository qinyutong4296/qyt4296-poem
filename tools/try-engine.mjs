/* Node 试验台：验证 PoemEngine 在真实风格模型下的生成质量 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
global.window = global; /* 别名，浏览器里裸标识符即 window 属性 */

const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");
const parts = [read("js/data-corpus.js"), read("js/data/style/index.js"), read("js/data/style/hub.js")];
for (const f of fs.readdirSync(path.join(ROOT, "js/data/style"))) {
  if (f === "index.js" || f === "hub.js") continue;
  parts.push(read("js/data/style/" + f));
}
parts.push(read("js/generator.js"));
parts.push("globalThis.__X={PoemEngine,CIPAI,POEM_FORMS};");
(0, eval)(parts.join("\n;\n"));
const { PoemEngine, CIPAI, POEM_FORMS } = globalThis.__X;

/* ---------- 格律校验 ---------- */
function check(res, form) {
  const problems = [];
  let lens;
  if (form.startsWith("ci_")) {
    const cp = CIPAI[form.slice(3)];
    lens = cp.lines;
  } else {
    const f = POEM_FORMS[form];
    lens = Array(f.lineCount).fill(f.lineLen);
    if (f.xi) f.xi.forEach(i => lens[i] += 1);
  }
  res.lines.forEach((l, i) => {
    if (lens[i] !== undefined && l.length !== lens[i])
      problems.push(`第${i + 1}句字数 ${l.length}≠${lens[i]}:「${l}」`);
  });
  /* 韵脚一致性：同组 ping 句尾须同韵部 */
  const idx = window.STYLE_INDEX;
  res.lines.forEach((l, i) => {
    if (i === 0 || !lens[i]) return;
  });
  return problems;
}

function rhymeCheck(res, form) {
  /* 找出所有同韵句组检查尾字 */
  const problems = [];
  const ping = [];
  if (!form.startsWith("ci_")) {
    const f = POEM_FORMS[form];
    f.rhymeLines.forEach(i => ping.push(res.lines[i]));
  }
  if (ping.length >= 2) {
    const idx = window.STYLE_INDEX;
    if (ping.some(l => !l)) { problems.push("缺句"); return problems; }
    const ok = idx.clusters.some(c => ping.every(l => c.includes(l.slice(-1))));
    if (!ok) problems.push(`韵脚不齐: ${ping.map(l => l.slice(-1)).join("")} 「${res.title}」`);
  }
  return problems;
}

/* ---------- 抽样生成 ---------- */
const styles = ["xianqin", "han", "weijin", "nbeichao", "tang", "song", "yuan", "ming", "qing"];
const forms = ["wjue", "qjue", "wlv", "qlv", "ljue", "syan", "wgu", "qgu", "cishu",
  ...Object.keys(CIPAI).map(c => "ci_" + c)];
const kws = ["月 思乡", "梅", "江南 春", "雪 边塞", "相思", "秋 雨", "竹 禅", "酒"];

let bad = 0, total = 0;
for (const style of styles) {
  console.log(`\n======== 风格 ${style} ========`);
  for (let n = 0; n < 3; n++) {
    const form = forms[Math.floor(Math.random() * forms.length)];
    const kw = kws[Math.floor(Math.random() * kws.length)];
    const res = await PoemEngine.generate({ keywords: kw.split(/\s+/), form, style, theme: "auto" });
    total++;
    const probs = [...check(res, form), ...rhymeCheck(res, form)];
    bad += probs.length ? 1 : 0;
    console.log(`\n【${res.title}】 ${res.formName} · 押${res.rhymeName} · ${res.style ? "仿" + res.style : "备路"}`);
    console.log(res.lines.join("\n"));
    if (probs.length) console.log("  ⚠ " + probs.join(" | "));
  }
}

/* 每种体裁至少来一遍（唐风） */
console.log("\n======== 唐风 · 全体裁巡检 ========");
for (const form of forms) {
  const res = await PoemEngine.generate({ keywords: ["月"], form, style: "tang", theme: "auto" });
  total++;
  const probs = [...check(res, form), ...rhymeCheck(res, form)];
  bad += probs.length ? 1 : 0;
  console.log(`【${res.title}】 ${res.formName} · 押${res.rhymeName}${probs.length ? "  ⚠ " + probs.join("|") : ""}`);
  console.log("  " + res.lines.join(" / "));
}

console.log(`\n=== 共 ${total} 篇，异常 ${bad} 篇 ===`);
