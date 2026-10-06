# -*- coding: utf-8 -*-
"""面孔聚类（只读，结果打印到 stdout）：
在 cwd（assets/poets）中读全部图片，取面部区域 dhash，汉明距离<=5 聚类，
输出 JSON：{"report":[{size,files}], "manifest":[{path,label}]}"""
import os, json, sys
from PIL import Image

def dhash(im, hash_size=9):
    im = im.convert("L").resize((hash_size, hash_size + 1), Image.LANCZOS)
    px = list(im.getdata())
    rows = [px[i * hash_size:(i + 1) * hash_size] for i in range(hash_size + 1)]
    bits = []
    for r in range(hash_size):
        for c in range(hash_size):
            bits.append(1 if rows[r][c] > rows[r + 1][c] else 0)
    return bits

def ham(a, b):
    return sum(x != y for x, y in zip(a, b))

def face_crop(im):
    w, h = im.size
    cw, ch = int(w * 0.84), int(h * 0.62)
    x0 = (w - cw) // 2
    return im.crop((x0, 0, x0 + cw, ch))

base = os.path.basename(os.getcwd())
if base != "poets":
    raise SystemExit("run inside assets/poets")

items = []
for f in sorted(os.listdir(".")):
    if not f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        continue
    try:
        im = Image.open(f)
        if im.width < 40 or im.height < 40:
            continue
        items.append((f, dhash(face_crop(im))))
    except Exception as e:
        print("ERR", f, e, file=sys.stderr)

n = len(items)
parent = list(range(n))
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x
def union(a, b):
    ra, rb = find(a), find(b)
    if ra != rb:
        parent[ra] = rb

for i in range(n):
    for j in range(i + 1, n):
        if ham(items[i][1], items[j][1]) <= 5:
            union(i, j)

clusters = {}
for i in range(n):
    clusters.setdefault(find(i), []).append(items[i][0])

report = [{"size": len(v), "files": sorted(v)} for v in clusters.values() if len(v) > 1]
report.sort(key=lambda r: -r["size"])
man = []
for r in report:
    for f in r["files"]:
        man.append({"path": os.path.abspath(f), "label": "[c%02d] %s" % (r["size"], f)})
print(json.dumps({"report": report, "manifest": man}, ensure_ascii=False))
