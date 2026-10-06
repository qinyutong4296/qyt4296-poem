import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "js");
for (const f of ["data-poets-tang.js", "data-poets-song.js", "data-poets-other.js"]) {
  const t = fs.readFileSync(path.join(dir, f), "utf8");
  const ids = [...t.matchAll(/id:\s*"([^"]+)"/g)].map(m => m[1]);
  const names = [...t.matchAll(/name:\s*"([^"]+)"/g)].map(m => m[1]);
  console.log(f, ids.length);
  ids.forEach((id, i) => console.log(id + "\t" + names[i]));
}
