#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
爬取百龙装饰品（Kiranico），生成 rampage_decorations.js
只抓：名字 + 对应技能 + 说明（不含素材）
用法: python3 scrape_ramdeco.py
"""
import re, gzip, json, os, time, urllib.request

BASE = "https://mhrise.kiranico.com"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "rampage_decorations.js")


def fetch(url, timeout=45):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept-Encoding": "gzip",
        "Accept-Language": "zh-CN,zh;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            d = gzip.decompress(d)
        return d.decode("utf-8", "replace")


def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s).strip()


def main():
    print("→ 抓取百龙装饰品列表…")
    h = fetch(BASE + "/zh/data/rampage-decorations")
    rows = re.findall(r"<tr>(.*?)</tr>", h, re.S)

    items = []
    for r in rows:
        tds = re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)
        if len(tds) != 3:
            continue
        name = strip_tags(tds[0])
        m = re.search(r"/rampage-skills/\d+\">([^<]+)</a>", tds[1])
        skill = m.group(1) if m else strip_tags(tds[1])
        desc = strip_tags(tds[2])
        # 提取孔位（名字里的【N】）
        slot_m = re.search(r"【(\d+)】", name)
        slot = int(slot_m.group(1)) if slot_m else 0
        items.append({"name": name, "skill": skill, "slot": slot, "desc": desc})

    print("   解析到 %d 条" % len(items))

    # 生成 JS
    L = []
    L.append("// ============================================================")
    L.append("// 百龙装饰品（百龙珠）数据")
    L.append("// 抓取自 Kiranico: /zh/data/rampage-decorations")
    L.append("// ============================================================")
    L.append("// 字段说明:")
    L.append("//   name   百龙珠名（含【孔位】）")
    L.append("//   skill  对应百龙技能名（关联 SKILL_DATA.rampage_skills）")
    L.append("//   slot   孔位大小 (1/2/3)")
    L.append("//   desc   说明文字")
    L.append("// ============================================================")
    L.append("var rampage_decorations = [")
    for it in items:
        L.append('  { name: "%s", skill: "%s", slot: %d, desc: "%s" },'
                 % (it["name"], it["skill"], it["slot"], it["desc"].replace('"', '\\"')))
    L.append("];")
    L.append("")
    L.append("if (typeof window !== 'undefined') { window.rampage_decorations = rampage_decorations; }")

    open(OUT, "w", encoding="utf-8").write("\n".join(L))
    print("✅ 输出: rampage_decorations.js (%d 条)" % len(items))

    # 打印预览
    for it in items:
        print("   %-14s → %-16s [%d孔]" % (it["name"], it["skill"], it["slot"]))


if __name__ == "__main__":
    main()