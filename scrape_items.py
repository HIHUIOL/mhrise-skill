#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 Kiranico 爬取【全部道具】信息（并发 + 断点续爬）
============================================================
数据来源:
  索引  https://mhrise.kiranico.com/storage/search/algolia_16.0.0_zh.csv
  详情  https://mhrise.kiranico.com/zh/data/items/<id>

抓取字段:
  name     道具名
  desc     说明文字
  obtain   获得途径 [{ quest, type, count, rate }]

特性:
  - 并发抓取（默认 8 线程，可用 -j 调整）
  - 断点续爬：进度存 .item_cache.json，中断后重跑自动跳过已抓的
  - 失败跳过、可反复运行
  - 自动补 /zh 语言前缀（索引里的 url 不带前缀）

用法:
  python3 scrape_items.py            # 抓取（8 线程）
  python3 scrape_items.py -j 16      # 16 线程
  python3 scrape_items.py --stat     # 只看进度
  python3 scrape_items.py --build    # 只根据缓存生成 items.js
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
LANG_PREFIX = "/zh"        # ← 关键：索引里的 url 不带语言前缀，必须自己拼
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".item_cache.json")
INDEX_CACHE = os.path.join(HERE, ".item_index.json")
OUT = os.path.join(HERE, "items.js")

RETRY = 3                  # 单页失败重试次数
TIMEOUT = 30


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
        if "/data/items/" in u:
            if not u.startswith(LANG_PREFIX + "/"):
                u = LANG_PREFIX + u
            items.append({"name": row["name"].strip(), "url": u})
    json.dump(items, open(INDEX_CACHE, "w", encoding="utf-8"),
              ensure_ascii=False, indent=0)
    print("  索引道具数: %d" % len(items), flush=True)
    return items


# ------------------------------------------------------------
def parse_item(html):
    out = {}

    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    out["name"] = strip(m.group(1)) if m else ""

    desc = ""
    if m:
        seg = html[m.end():m.end() + 2000]
        pm = re.search(r"<p[^>]*>(.*?)</p>", seg, re.S)
        if pm:
            desc = strip(pm.group(1))
    out["desc"] = desc

    obt = []
    for t in re.findall(r"<table[^>]*>(.*?)</table>", html, re.S):
        for r in re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.S):
            tds = [strip(x) for x in
                   re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)]
            if len(tds) >= 4:
                obt.append({
                    "quest": tds[0],
                    "type": tds[1],
                    "count": tds[2],
                    "rate": tds[3],
                })
    out["obtain"] = obt
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

    # 线程数
    jobs = 8
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
            url = BASE + it["url"]
            try:
                rec = parse_item(fetch_retry(url))
                rec["index_name"] = it["name"]
                return it["url"], rec
            except Exception as e:
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
                    if n % 25 == 0 or n == len(todo):
                        json.dump(cache, open(CACHE, "w", encoding="utf-8"),
                                  ensure_ascii=False)
                        print("  ✓ %d/%d  (总 %d/%d)"
                              % (n, len(todo), len(cache), total), flush=True)

    # ---- 生成 items.js ----
    data = {}
    for url, rec in cache.items():
        nm = rec.get("name") or rec.get("index_name")
        if not nm:
            continue
        data[nm] = {
            "desc": rec.get("desc", ""),
            "obtain": rec.get("obtain", []),
        }

    L = []
    L.append("// ============================================================")
    L.append("// 道具数据（自动抓取自 Kiranico /zh/data/items）")
    L.append("// 字段: desc 说明 | obtain 获得途径[{quest,type,count,rate}]")
    L.append("// 共 %d 条" % len(data))
    L.append("// ============================================================")
    L.append("var item_data = " + json.dumps(data, ensure_ascii=False,
                                               indent=2, sort_keys=True) + ";")
    L.append("")
    L.append("if (typeof window !== 'undefined') { window.item_data = item_data; }")
    open(OUT, "w", encoding="utf-8").write("\n".join(L))
    print("✅ 输出: items.js (%d 条)" % len(data), flush=True)


if __name__ == "__main__":
    main()