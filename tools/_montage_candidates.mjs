/* 校验拼图：把 _cand/ 下载的候选图做成带标签 contact sheet
 * 用法: node _montage_candidates.mjs  （24张/页 → tools/_sheet_cand_NNN.jpg） */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const hits = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/_portrait_hits.json"), "utf8"));
const manifest = Object.values(hits).map((h) => ({
  path: path.join(ROOT, "assets/poets/_cand", h.file).replace(/\\/g, "/"),
  label: `${h.name}(${h.dyn}) | ${h.file}`,
})).filter((m) => fs.existsSync(m.path));
fs.writeFileSync(path.join(ROOT, "tools/_sheet_cand.json"), JSON.stringify(manifest), "utf8");
console.log("candidates:", manifest.length);
execSync(`python tools/_montage.py tools/_sheet_cand.json tools/_sheet_cand 24`, { cwd: ROOT, stdio: "inherit" });
