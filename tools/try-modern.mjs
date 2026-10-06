/* Node 试验台：验证「现代风」觅句质量
 * 运行：node tools/try-modern.mjs > /tmp/modern-out.txt 2>&1
 * （GBK 终端显示乱码时看输出文件即可，文件为 UTF-8） */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
global.window = global;

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

const show = res => {
  console.log(`\n【${res.title}】 ${res.formName}${res.rhymeName ? " · 押" + res.rhymeName : ""}${res.style ? " · 仿" + res.style + "风" : ""}${res.fallback ? " ·(备路)" : ""}`);
  console.log(res.lines.map(l => l ? "  " + l : "  ◇").join("\n"));
};

/* 一、现代风 · 自由体 */
console.log("======== 现代风 · 自由体 ========");
for (const kw of ["月 思乡", "海", "母亲", "雪", "梦", "远方", "花", "夜 雨"]) {
  const res = await PoemEngine.generate({ keywords: kw.split(/\s+/), form: "modern", style: "xiandai", theme: "auto" });
  show(res);
}

/* 二、现代风 · 旧体裁（无韵新裁） */
console.log("\n======== 现代风 · 旧体裁 ========");
for (const form of ["wjue", "qjue", "syan", "cishu"]) {
  const res = await PoemEngine.generate({ keywords: ["夜"], form, style: "xiandai", theme: "auto" });
  show(res);
}
for (const c of Object.keys(CIPAI).slice(0, 3)) {
  const res = await PoemEngine.generate({ keywords: ["春"], form: "ci_" + c, style: "xiandai", theme: "auto" });
  show(res);
}

/* 三、现代自由体 × 古风（跨时代尝试） */
console.log("\n======== 唐风 · 现代自由体 ========");
for (const kw of ["山", "江"]) {
  const res = await PoemEngine.generate({ keywords: kw.split(/\s+/), form: "modern", style: "tang", theme: "auto" });
  show(res);
}

/* 四、回归：旧体裁老风格仍正常 */
console.log("\n======== 回归抽查 ========");
const ci0 = Object.keys(CIPAI)[0];
for (const [form, style] of [["qjue", "tang"], ["ci_" + ci0, "song"], ["wgu", "xianqin"]]) {
  const res = await PoemEngine.generate({ keywords: ["月"], form, style, theme: "auto" });
  show(res);
}

console.log("\nDBG:", JSON.stringify(PoemEngine._dbg));
const idx = window.STYLE_INDEX;
console.log("dyns:", idx.dyns.map(d => `${d.id}(${d.segs})`).join(" "), "· v" + idx.v);
