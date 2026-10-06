# -*- coding: utf-8 -*-
"""从已知占位模板成员生成指纹库（只读+stdout）。
在 cwd=assets/poets/_cand 下运行；成员清单来自 ../tools/_clusters.json，
排除同人两页白名单。stdout 输出 [{"file","bits"}]。"""
import json, os, sys
from PIL import Image

clu_path = os.path.join("..", "..", "..", "tools", "_clusters.json")
if not os.path.isfile(clu_path):
    raise SystemExit("run inside assets/poets/_cand with ../../../tools present")
clu = json.load(open(clu_path, encoding="utf-8"))
keep = {"han_010.jpg", "nbc_020.jpg", "han_069.jpg", "wj_012.jpg"}

def dhash_bits(im, hash_size=9):
    im = im.convert("L").resize((hash_size, hash_size + 1), Image.LANCZOS)
    px = list(im.getdata())
    rows = [px[i * hash_size:(i + 1) * hash_size] for i in range(hash_size + 1)]
    return [1 if rows[r][c] > rows[r + 1][c] else 0 for r in range(hash_size) for c in range(hash_size)]

def face_crop(im):
    w, h = im.size
    cw, ch = int(w * 0.84), int(h * 0.62)
    x0 = (w - cw) // 2
    return im.crop((x0, 0, x0 + cw, ch))

prints = []
missing = []
for r in clu:
    if r["size"] < 2:
        continue
    for f in r["files"]:
        if f in keep:
            continue
        if not os.path.isfile(f):
            missing.append(f)
            continue
        im = Image.open(f)
        if im.width >= 40 and im.height >= 40:
            prints.append({"file": f, "bits": dhash_bits(face_crop(im))})
print(json.dumps(prints, ensure_ascii=False))
print("missing:", len(missing), file=sys.stderr)
