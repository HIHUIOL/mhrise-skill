#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 Kiranico 爬取【全部怪物】信息（并发 + 断点续爬）
============================================================
数据来源:
  索引  https://mhrise.kiranico.com/storage/search/algolia_16.0.0_zh.csv
  详情  https://mhrise.kiranico.com/zh/data/monsters/<id>

抓取字段（怪物页各表）:
  name      怪物名
  materials ⭐ 素材表 [{item,rank,way,part,count,rate}]
            rank = 下位 / 上位 / 大师等级
            way  = 剥取素材 / 目标报酬 / 捕获报酬 / 部位破坏报酬 / 掉落物 / 随从艾露猫的收集物
  hitzones  部位与肉质
  ailments  状态异常有效度
  quests    任务列表

特性:
  - 并发抓取（默认 6 线程，-j 可调）
  - 断点续爬：进度存 .monster_cache.json
  - 自动补 /zh 语言前缀
  - 失败跳过、可反复运行

用法:
  python3 scrape_monsters.py            # 抓取（6 线程）
  python3 scrape_monsters.py -j 12      # 12 线程
  python3 scrape_monsters.py --stat
  python3 scrape_monsters.py --build
"""
import re
import os
import csv
import sys
import json
import time
import gzip
import threading
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "https://mhrise.kiranico.com"
LANG_PREFIX = "/zh"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".monster_cache.json")
INDEX_CACHE = os.path.join(HERE, ".monster_index.json")
OUT = os.path.join(HERE, "monsters.js")

RETRY = 3
TIMEOUT = 40


# ------------------------------------------------------------
def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Accept-Encoding": "gzip",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        data = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            data = gzip.decompress(data)
        return data.decode("utf-8", "ignore")


def fetch_retry(url):
    last = None
    for i in range(RETRY):
        try:
            return fetch(url)
        except Exception as e:
            last = e
            time.sleep(0.8 * (i + 1))
    raise last


def strip(s):
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("&nbsp;", " ").replace("&amp;", "&")
    s = s.replace("&rarr;", "→").replace("&times;", "×")
    return re.sub(r"\s+", " ", s).strip()


# ------------------------------------------------------------
def get_index():
    if os.path.exists(INDEX_CACHE):
        return json.load(open(INDEX_CACHE, encoding="utf-8"))

    print("→ 下载全站索引 …", flush=True)
    raw = fetch_retry(BASE + "/storage/search/algolia_16.0.0_zh.csv")
    reader = csv.DictReader(raw.splitlines())
    items = []
    for row in reader:
        u = (row.get("url") or "").strip()
        if "/data/monsters/" in u:
            if not u.startswith(LANG_PREFIX + "/"):
                u = LANG_PREFIX + u
            items.append({"name": row["name"].strip(), "url": u})
    json.dump(items, open(INDEX_CACHE, "w", encoding="utf-8"),
              ensure_ascii=False, indent=0)
    print("  索引怪物数: %d" % len(items), flush=True)
    return items


# ------------------------------------------------------------
def parse_monster(html):
    out = {}

    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    out["name"] = strip(m.group(1)) if m else ""

    tables = re.findall(r"<table[^>]*>(.*?)</table>", html, re.S)

    def rows_of(t):
        return re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.S)

    def cells(r):
        return [strip(x) for x in
                re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S)]

    # 素材表：6 列且第 2 列是等级
    mats, seen = [], set()
    for t in tables:
        for r in rows_of(t):
            c = cells(r)
            if len(c) == 6 and c[1] in ("下位", "上位", "大师等级"):
                key = tuple(c)
                if key in seen:
                    continue
                seen.add(key)
                mats.append({"item": c[0], "rank": c[1], "way": c[2],
                             "part": c[3], "count": c[4], "rate": c[5]})
    out["materials"] = mats

    # 部位与肉质
    hitzones = []
    parts = ("头部", "颈部", "背部", "腹部", "前脚", "后脚", "左腿", "右腿",
             "尾巴", "翼", "本体", "尾", "脚", "头", "身", "甲壳", "壳")
    for t in tables:
        for r in rows_of(t):
            c = cells(r)
            if len(c) >= 5 and c[0] in parts:
                hitzones.append(c)
    out["hitzones"] = hitzones

    # 状态异常有效度
    ails = []
    for t in tables:
        for r in rows_of(t):
            c = cells(r)
            if len(c) >= 3 and c[0] in ("毒", "麻痹", "睡眠", "昏厥", "爆破",
                                        "火伤", "减气", "骑乘", "晕眩"):
                ails.append(c)
    out["ailments"] = ails

    # 任务列表
    quests = []
    for t in tables:
        for r in rows_of(t):
            c = cells(r)
            if len(c) >= 3 and "★" in c[0]:
                quests.append(c)
    out["quests"] = quests

    return out


# ------------------------------------------------------------
def main():
    index = get_index()
    total = len(index)

    cache = {}
    if os.path.exists(CACHE):
        cache = json.load(open(CACHE, encoding="utf-8"))

    if "--stat" in sys.argv:
        print("进度: %d / %d" % (len(cache), total))
        return

    jobs = 6
    if "-j" in sys.argv:
        try:
            jobs = int(sys.argv[sys.argv.index("-j") + 1])
        except Exception:
            pass

    if "--build" not in sys.argv:
        done = set(cache.keys())
        todo = [it for it in index if it["url"] not in done]
        print("→ 待抓取: %d / %d  (并发 %d)" % (len(todo), total, jobs), flush=True)

        lock = threading.Lock()
        counter = {"n": 0}

        def work(it):
            try:
                rec = parse_monster(fetch_retry(BASE + it["url"]))
                rec["index_name"] = it["name"]
                return it["url"], rec
            except Exception:
                return it["url"], None

        with ThreadPoolExecutor(max_workers=jobs) as ex:
            futs = [ex.submit(work, it) for it in todo]
            for fu in as_completed(futs):
                url, rec = fu.result()
                with lock:
                    counter["n"] += 1
                    if rec:
                        cache[url] = rec
                    n = counter["n"]
                    if n % 10 == 0 or n == len(todo):
                        json.dump(cache, open(CACHE, "w", encoding="utf-8"),
                                  ensure_ascii=False)
                        print("  ✓ %d/%d  (总 %d/%d)"
                              % (n, len(todo), len(cache), total), flush=True)

    # ---- 生成 monsters.js ----
    data = {}
    for url, rec in cache.items():
        nm = rec.get("name") or rec.get("index_name")
        if not nm:
            continue
        data[nm] = {
            "materials": rec.get("materials", []),
            "hitzones": rec.get("hitzones", []),
            "ailments": rec.get("ailments", []),
            "quests": rec.get("quests", []),
        }

    L = []
    L.append("// ============================================================")
    L.append("// 怪物数据（自动抓取自 Kiranico /zh/data/monsters）")
    L.append("// materials 素材表: [{item,rank,way,part,count,rate}]")
    L.append("//   rank = 下位/上位/大师等级   way = 剥取素材/目标报酬/…")
    L.append("// hitzones  部位肉质 | ailments 异常有效度 | quests 任务")
    L.append("// 共 %d 只" % len(data))
    L.append("// ============================================================")
    L.append("var monster_data = " + json.dumps(data, ensure_ascii=False,
                                                indent=2, sort_keys=True) + ";")
    L.append("")
    L.append("if (typeof window !== 'undefined') { window.monster_data = monster_data; }")
    open(OUT, "w", encoding="utf-8").write("\n".join(L))
    print("✅ 输出: monsters.js (%d 只)" % len(data), flush=True)


if __name__ == "__main__":
    main()