#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 Kiranico 抓取所有珠子的「必要素材」，生成 decoration_materials.js
用法: python3 scrape_decorations.py
特性: 断点续爬（缓存到 .deco_cache.json）、限速、匹配验证
"""
import re, json, time, os, sys, gzip, urllib.request, urllib.error

BASE = "https://mhrise.kiranico.com"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".deco_cache.json")
OUT = os.path.join(HERE, "decoration_materials.js")
DELAY = 0.5  # 每页间隔秒数


def fetch(url, timeout=45, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept-Encoding": "gzip",
                "Accept-Language": "zh-CN,zh;q=0.9",
                "Referer": BASE + "/zh/data/decorations",
            })
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    data = gzip.decompress(data)
                return data.decode("utf-8", "replace")
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def load_cache():
    if os.path.exists(CACHE):
        try:
            return json.load(open(CACHE, encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_cache(c):
    json.dump(c, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def parse_materials(html):
    """从详情页解析「必要素材」"""
    pos = html.find("必要素材")
    if pos == -1:
        return []
    seg = html[pos:]
    # <a .../items/xxx">素材名</a> ... x数量
    mats = re.findall(r'/data/items/\d+"[^>]*>([^<]+)</a>\s*x(\d+)', seg)
    out = []
    for name, cnt in mats:
        name = name.strip()
        if name and name not in [m["item"] for m in out]:
            out.append({"item": name, "count": int(cnt)})
    return out


def main():
    cache = load_cache()

    # 1) 列表页
    print("→ 抓取珠子列表…")
    try:
        html = fetch(BASE + "/zh/data/decorations")
    except Exception as e:
        print("❌ 列表页抓取失败:", e)
        sys.exit(1)

    rows = re.findall(
        r'href="' + re.escape(BASE) + r'/zh/data/decorations/(\d+)"[^>]*>([^<]+)</a>',
        html)
    # 去重（同名只留一个）
    seen = {}
    for rid, name in rows:
        seen.setdefault(name.strip(), rid)
    print("   共 %d 颗珠子" % len(seen))

    # 2) 逐颗抓详情
    total = len(seen)
    done = 0
    for i, (name, rid) in enumerate(seen.items(), 1):
        if name in cache and cache[name]:
            done += 1
            continue
        try:
            h = fetch(BASE + "/zh/data/decorations/" + rid)
            mats = parse_materials(h)
            cache[name] = mats
            status = "%d 项素材" % len(mats) if mats else "⚠️ 无素材"
            print("  [%d/%d] %s → %s" % (i, total, name, status))
        except Exception as e:
            print("  [%d/%d] %s → ❌ %s" % (i, total, name, e))
            cache[name] = cache.get(name, [])
        # 每 10 个存一次缓存
        if i % 10 == 0:
            save_cache(cache)
        time.sleep(DELAY)

    save_cache(cache)

    # 3) 生成 JS
    lines = []
    lines.append("// 珠子必要素材数据（抓取自 Kiranico）")
    lines.append("// 结构: 珠子名 -> [{ item: 素材名, count: 数量 }, ...]")
    lines.append("var decoration_materials = {")
    keys = list(cache.keys())
    for k in keys:
        mats = cache[k]
        if not mats:
            continue
        items = ", ".join(
            '{ item: "%s", count: %d }' % (m["item"].replace('"', '\\"'), m["count"])
            for m in mats)
        lines.append('  "%s": [%s],' % (k.replace('"', '\\"'), items))
    lines.append("};")
    lines.append("")
    lines.append("if (typeof window !== 'undefined') { window.decoration_materials = decoration_materials; }")
    open(OUT, "w", encoding="utf-8").write("\n".join(lines))

    ok = sum(1 for v in cache.values() if v)
    print("\n✅ 完成！成功抓取 %d / %d 颗珠子的素材" % (ok, total))
    print("   输出: decoration_materials.js")


if __name__ == "__main__":
    main()