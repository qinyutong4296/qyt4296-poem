/**
 * 清洗图库：剔除器物、佛像、屏风、盒子等非书画条目
 * 用法: node tools/clean-inkart-gallery.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "assets", "inkart");
const CATALOG = path.join(OUT, "catalog.json");
const GALLERY = path.join(ROOT, "js", "data", "ink-gallery.js");

const BAD = /amitābha|amitabha|buddha|bodhisattva|shakyamuni|manjushri|samantabhadra|guanyin triad|clip for paper|elephant, horse|one hundred children|rank badge|brush holder|screen with|box in form|pair of boxes|ink cake|lotus sutra|calligraphy in cursive|calligraphy in running|poem on imperial|sericulture|odes of bin|nine songs(?! )/i;

const gallery = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
const keep = [];
const drop = [];

for (const g of gallery) {
  const blob = `${g.title} ${g.artist} ${g.source || ""}`;
  if (BAD.test(blob)) drop.push(g);
  else keep.push(g);
}

for (const g of drop) {
  const p = path.join(OUT, g.file);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  console.log(`− ${g.id} | ${g.title}`);
}

fs.writeFileSync(CATALOG, JSON.stringify(keep, null, 2), "utf8");
fs.writeFileSync(GALLERY, `/* 本地水墨画图库 · 自动生成，勿手改 */\nwindow.INK_GALLERY = ${JSON.stringify(keep)};\n`, "utf8");
console.log(`\n剔除 ${drop.length}，保留 ${keep.length}`);
