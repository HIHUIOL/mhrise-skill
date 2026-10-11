#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================
#  mhrise-skill / scrape_anomaly_icons.py
#  从 Kiranico CDN 下载「怪异材料」图标 → 压缩 32×32 → anomaly-icons/
#  并输出 材料名 → 图标文件名 映射（写入 anomaly_icons.js）
# ============================================================
import csv, json, os, re, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
try:
    import requests
    from PIL import Image
except ImportError as e:
    sys.exit("缺少依赖：pip install requests Pillow（缺 %s）" % e.name)

BASE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE, "anomaly-icons")
CDN = "https://cdn.kiranico.net/file/kiranico/mhrise-web"
IDX_CACHE = "/tmp/idx.csv"
ICON_SIZE = 32
WORKERS = 8
os.makedirs(OUT_DIR, exist_ok=True)

# ---------- 1. 索引（name -> 图标路径） ----------
if not os.path.exists(IDX_CACHE):
    print("下载索引 ...")
    r = requests.get(
        "https://mhrise.kiranico.com/storage/search/algolia_16.0.0_zh.csv",
        timeout=90,
    )
    r.raise_for_status()
    open(IDX_CACHE, "wb").write(r.content)

idx = {}
with open(IDX_CACHE, encoding="utf-8") as f:
    for row in csv.reader(f):
        if len(row) >= 4 and row[3].startswith("/data/items/"):
            idx[row[1]] = row[2]      # 素材名 -> /images/items/XXXX.png

# ---------- 2. 我们的怪异材料名单（从 anomaly_materials.js 抽） ----------
js = open(os.path.join(BASE, "anomaly_materials.js"), encoding="utf-8").read()
names = re.findall(r"name: '([^']+)'", js)
# 去重、保序
seen, order = set(), []
for n in names:
    if n not in seen:
        seen.add(n)
        order.append(n)
names = order
print("怪异材料数:", len(names))
miss = [n for n in names if n not in idx]
if miss:
    print("⚠️ 索引缺：", miss)

# ---------- 3. 下载 + 压缩 ----------
def safe(name):
    return re.sub(r"[^\w\u4e00-\u9fff\-]", "_", name)

def fetch(name):
    src = idx.get(name)
    if not src:
        return name, None, "无索引"
    url = CDN + src
    out = os.path.join(OUT_DIR, safe(name) + ".png")
    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        import io
        im = Image.open(io.BytesIO(resp.content)).convert("RGBA")
        im = im.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
        im.save(out, "PNG", optimize=True)
        return name, safe(name) + ".png", None
    except Exception as e:
        return name, None, str(e)[:80]

mapping = {}
fail = []
with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    futs = {ex.submit(fetch, n): n for n in names}
    for i, fu in enumerate(as_completed(futs), 1):
        name, fn, err = fu.result()
        if fn:
            mapping[name] = fn
        else:
            fail.append((name, err))
        print("\r  %d/%d" % (i, len(names)), end="", flush=True)
print()

if fail:
    print("❌ 失败 %d 个：" % len(fail))
    for n, e in fail:
        print("   ", n, e)

# ---------- 4. 写映射 ----------
out_js = os.path.join(BASE, "anomaly_icons.js")
with open(out_js, "w", encoding="utf-8") as f:
    f.write("// 自动生成：怪异材料名 → 图标文件名（anomaly-icons/）\n")
    f.write("// 由 scrape_anomaly_icons.py 生成，请勿手改\n")
    f.write("window.ANOMALY_ICONS = ")
    f.write(json.dumps(mapping, ensure_ascii=False, indent=0).replace("\n", ""))
    f.write(";\n")

print("✅ 完成：%d 个图标 → anomaly-icons/" % len(mapping))
print("   映射写入 anomaly_icons.js")
