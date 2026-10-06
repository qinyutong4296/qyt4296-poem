# -*- coding: utf-8 -*-
"""拼图工具：把一批图片做成带标签的 contact sheet，供视觉校验。
用法: python _montage.py manifest.json outprefix [per_sheet]
manifest.json: [{"path": "...", "label": "..."}]
输出: outprefix_001.jpg ...（4列×6行=24张/页，缩略 260px）
"""
import json, math, sys, os
from PIL import Image, ImageDraw, ImageFont

def load_font(size):
    for name in ["msyh.ttc", "simhei.ttf", "simsun.ttc"]:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
    return ImageFont.load_default()

def main():
    manifest = json.load(open(sys.argv[1], encoding="utf-8"))
    outprefix = sys.argv[2]
    per_sheet = int(sys.argv[3]) if len(sys.argv) > 3 else 24
    cols, rows = 4, math.ceil(per_sheet / 4)
    thumb = 260
    label_h = 34
    font = load_font(20)
    os.makedirs(os.path.dirname(outprefix) or ".", exist_ok=True)
    total = len(manifest)
    sheets = math.ceil(total / per_sheet)
    for s in range(sheets):
        chunk = manifest[s * per_sheet:(s + 1) * per_sheet]
        W, H = cols * thumb, rows * (thumb + label_h)
        sheet = Image.new("RGB", (W, H), (245, 243, 238))
        d = ImageDraw.Draw(sheet)
        for i, item in enumerate(chunk):
            cx, cy = (i % cols) * thumb, (i // cols) * (thumb + label_h)
            try:
                im = Image.open(item["path"]).convert("RGB")
                im.thumbnail((thumb - 8, thumb - 8))
                sheet.paste(im, (cx + (thumb - im.width) // 2, cy + (thumb - im.height) // 2))
            except Exception as e:
                d.text((cx + 8, cy + thumb // 2), "ERR " + str(e)[:40], fill=(180, 40, 40), font=font)
            label = item.get("label", os.path.basename(item["path"]))
            d.rectangle([cx, cy + thumb, cx + thumb, cy + thumb + label_h], fill=(40, 36, 30))
            d.text((cx + 6, cy + thumb + 6), label, fill=(240, 235, 220), font=font)
        out = f"{outprefix}_{s+1:03d}.jpg"
        sheet.save(out, quality=88)
        print(out, len(chunk))

if __name__ == "__main__":
    main()
