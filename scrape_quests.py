#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================
#  mhrise-skill / scrape_quests.py
#  从 Kiranico 抓取全部任务数据 -> quests.js
#
#  数据结构：
#   window.quest_data = {
#     "任务标题": {
#        cat:     "集会所任务 上位",     # 分类
#        star:    4,                     # 星级
#        desc:    "能说会道的男性: …",    # 委托描述
#        goal:    "狩猎1头奇怪龙",        # 主要目标
#        fail:    "报酬金额为零时间耗尽",  # 失败条件
#        hrs:     "360",                 # HRP 点数
#        mrps:    "0",                   # MRP 点数
#        mons:    [ {name, players, hp[], atk[], parts, def, ail, stun, stam, mount} ],
#        supply:  [ {item, count} ],     # 补给箱
#        money:   "0",                   # 报酬金余额
#        next:    "下一个任务名"
#     }
#   }
# ============================================================
import csv, json, os, re, sys, time, html as htmllib
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import requests
except ImportError:
    sys.exit("缺少 requests：pip install requests")

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "quests.js")
IDX = "/tmp/idx.csv"
CACHE = os.path.join(BASE, ".quest_cache.json")
WORKERS = 8
BASE_URL = "https://mhrise.kiranico.com"

CAT_ORDER = ["村庄任务", "集会所任务 下位", "集会所任务 上位", "集会所任务　大师",
             "活动任务", "怪异任务", "盟友任务", "斗技大会任务", "训练任务"]

# ---------- 工具：把 HTML 段转纯文本 ----------
def strip_tags(s):
    s = re.sub(r"<script.*?</script>", "", s, flags=re.S)
    s = re.sub(r"<style.*?</style>", "", s, flags=re.S)
    s = re.sub(r"<[^>]+>", "", s)
    s = htmllib.unescape(s)
    return re.sub(r"\s+", " ", s).strip()

# 任务 id → 分类（从 9 个列表页抓，最准）
_CAT_MAP = {}

def _guess_cat(full):
    """按标题前缀猜分类（兜底）"""
    if full.startswith("村庄"):     return "村庄任务"
    if full.startswith("集会所"):   return "集会所任务"
    if full.startswith("活动"):     return "活动任务"
    if full.startswith("怪异"):     return "怪异任务"
    if full.startswith("盟友"):     return "盟友任务"
    if full.startswith("斗技大会"): return "斗技大会任务"
    if full.startswith("训练"):     return "训练任务"
    return "其他"

VIEWS_QUEST = [
    ("village",    "村庄任务"),
    ("hub_low",    "集会所任务 下位"),
    ("hub_high",   "集会所任务 上位"),
    ("hub_master", "集会所任务 大师"),
    ("event",      "活动任务"),
    ("mystery",    "怪异任务"),
    ("follower",   "盟友任务"),
    ("arena",      "斗技大会任务"),
    ("training",   "训练任务"),
]

# ---------- 1. 索引：任务 id + 标题 ----------
if not os.path.exists(IDX):
    print("下载索引 ...")
    r = requests.get(BASE_URL + "/storage/search/algolia_16.0.0_zh.csv", timeout=120)
    r.raise_for_status()
    open(IDX, "wb").write(r.content)

quests_idx = []      # [(id, name)]
with open(IDX, encoding="utf-8") as f:
    for row in csv.reader(f):
        if len(row) >= 4 and row[3].startswith("/data/quests/"):
            qid = row[3].rsplit("/", 1)[-1]
            quests_idx.append((qid, row[1]))
print("索引里任务数:", len(quests_idx))

# ---------- 1.5 从 9 个列表页抓「任务 id → 分类」 ----------
print("抓取任务分类列表页 ...")
_sess = requests.Session()
_sess.headers["User-Agent"] = "Mozilla/5.0"
for view, label in VIEWS_QUEST:
    try:
        r = _sess.get("%s/zh/data/quests?view=%s" % (BASE_URL, view), timeout=90)
        r.raise_for_status()
        ids = re.findall(r'/data/quests/(\d+)', r.text)
        for qid in ids:
            _CAT_MAP.setdefault(qid, label)
        print("  %s: %d 个" % (label, len(set(ids))))
    except Exception as e:
        print("  ❌ %s: %s" % (label, e))
print("分类映射总数:", len(_CAT_MAP))

# ---------- 2. 解析单个任务页 ----------
def parse_quest(qid, name):
    url = "%s/zh/data/quests/%s" % (BASE_URL, qid)
    r = requests.get(url, timeout=90)
    r.raise_for_status()
    h = r.text

    out = {"id": qid, "name": name}

    # 标题（从 <title> 或 og:title）
    m = re.search(r'<meta property="og:title" content="([^"]*)"', h)
    full = htmllib.unescape(m.group(1)) if m else name
    out["full_title"] = full.split(" | ")[0]

    # 描述
    m = re.search(r'<meta property="og:description" content="([^"]*)"', h)
    out["desc"] = htmllib.unescape(m.group(1)) if m else ""

    # 正文文本行
    t = re.sub(r"<[^>]+>", "|", re.sub(r"<script.*?</script>", "", h, flags=re.S))
    t = re.sub(r"<style.*?</style>", "", t, flags=re.S)
    t = re.sub(r"\|+", "|", t).replace("&nbsp;", " ")
    lines = [htmllib.unescape(x.strip()) for x in t.split("|") if x.strip()]

    # 正文起点：最后一个「从列表中选择调和」（导航结尾）
    starts = [i for i, l in enumerate(lines) if "从列表中选择调和" in l]
    s = (starts[-1] + 1) if starts else 0
    body = lines[s:]

    def take_after(label, count=1):
        """取 label 之后的 count 行"""
        for i, l in enumerate(body):
            if l == label:
                return body[i + 1:i + 1 + count]
        return []

    # 分类：优先用列表页归属（由 main 注入 _CAT_MAP），否则按前缀猜
    out["cat"] = qid in _CAT_MAP and _CAT_MAP[qid] or _guess_cat(full)
    sm = re.search(r"(\d+)★", full)
    out["star"] = int(sm.group(1)) if sm else 0

    # 主要目标 / 失败条件
    goal_raw = body[body.index("主要目标") + 1] if "主要目标" in body else ""
    # 清洗：Kiranico 把「主要目标」和「HRP/MRP」放在一起，
    #       抓下来的字符串尾部会带 "(HRP: 5,760点数" 这种未闭合脏数据，去掉它
    goal_raw = re.sub(r"\s*\(?HRP[:\s：].*$", "", goal_raw, flags=re.I)
    goal_raw = re.sub(r"\s*\(?MRP[:\s：].*$", "", goal_raw, flags=re.I)
    out["goal"] = goal_raw.strip()
    blob = " ".join(body[:120])
    m = re.search(r"HRP[:\s]*([\d,]+)", blob)
    out["hrp"] = m.group(1).replace(",", "") if m else ""
    m = re.search(r"MRP[:\s]*([\d,]+)", blob)
    out["mrp"] = m.group(1).replace(",", "") if m else ""
    fail_raw = body[body.index("失败条件") + 1] if "失败条件" in body else ""
    fail_raw = re.sub(r"\s*\(?HRP[:\s：].*$", "", fail_raw, flags=re.I)
    fail_raw = re.sub(r"\s*\(?MRP[:\s：].*$", "", fail_raw, flags=re.I)
    out["fail"] = fail_raw.strip()

    # ---- 怪物表：按 <tr> 精确解析，再按怪物名合并 ----
    _mons_raw = []
    tbl_m = re.search(r"<th[^>]*>\s*Monster\s*</th>.*?<tbody[^>]*>(.*?)</tbody>", h, re.S)
    if tbl_m:
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tbl_m.group(1), re.S):
            tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
            if len(tds) < 10:
                continue
            nm = strip_tags(tds[0])
            if not nm:
                continue
            hp = re.findall(r"([\d,]+) HP", tds[2])
            _mons_raw.append({
                "name": nm,
                "players": strip_tags(tds[1]),
                "hp": hp[0] if hp else "",
                "atk": strip_tags(tds[3]),
                "parts": strip_tags(tds[4]),
                "def": strip_tags(tds[5]),
                "ail": strip_tags(tds[6]),
                "stun": strip_tags(tds[7]),
                "stam": strip_tags(tds[8]),
                "mount": strip_tags(tds[9]),
            })

    # 合并同一怪物的多档人数（页面可能重复渲染，去重）
    mons = []
    idx_by_name = {}
    seen_pr = set()
    for r in _mons_raw:
        nm = r["name"]
        key = (nm, r["players"], r["hp"])
        if key in seen_pr:
            continue
        seen_pr.add(key)
        if nm not in idx_by_name:
            idx_by_name[nm] = len(mons)
            mons.append({
                "name": nm,
                "players": [],      # [{p, hp, atk, parts, def, ail, stun, stam, mount}]
            })
        mons[idx_by_name[nm]]["players"].append({
            "p": r["players"],
            "hp": r["hp"],
            "atk": r["atk"],
            "parts": r["parts"],
            "def": r["def"],
            "ail": r["ail"],
            "stun": r["stun"],
            "stam": r["stam"],
            "mount": r["mount"],
        })
    out["mons"] = mons

    # ---- 补给箱：按 <tr> 精确解析（去重）----
    supply = []
    sup_m = re.search(r"补给箱\s*</[^>]+>(.*?)</table>", h, re.S)
    if not sup_m:
        # 兜底：从 body 文本解析，遇到「Details for」停止
        if "补给箱" in body:
            si = body.index("补给箱")
            i = si + 1
            while i + 1 < len(body):
                it = body[i]
                if it in ("Details for", "QuestNo", "报酬金余额"):
                    break
                cnt = body[i + 1]
                if re.fullmatch(r"x\d+", cnt):
                    supply.append({"item": it, "count": cnt})
                    i += 2
                else:
                    i += 1
    else:
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", sup_m.group(1), re.S):
            tds = [strip_tags(x) for x in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
            tds = [x for x in tds if x]
            if len(tds) >= 2 and re.fullmatch(r"x\d+", tds[-1]):
                supply.append({"item": tds[0], "count": tds[-1]})
    # 去重（同一 item+count 只留一条）
    seen_s = set()
    sup2 = []
    for s in supply:
        k = s["item"] + "|" + s["count"]
        if k not in seen_s:
            seen_s.add(k); sup2.append(s)
    out["supply"] = sup2

    # 报酬金余额（Kiranico 这栏语义不明，取不到就留空）
    out["money"] = ""

    return out

# ---------- 3. 并发抓取（带缓存） ----------
cache = {}
if os.path.exists(CACHE):
    try:
        cache = json.load(open(CACHE, encoding="utf-8"))
    except Exception:
        cache = {}
print("已有缓存:", len(cache))

todo = [(q, n) for q, n in quests_idx if q not in cache]
print("待抓取:", len(todo))

sess_err = []

def work(item):
    qid, name = item
    for attempt in range(3):
        try:
            return parse_quest(qid, name)
        except Exception as e:
            if attempt == 2:
                return {"id": qid, "name": name, "error": str(e)}
            time.sleep(1.5)
    return None

if todo:
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(work, it): it for it in todo}
        done = 0
        for fu in as_completed(futs):
            r = fu.result()
            done += 1
            if r and "error" not in r:
                cache[r["id"]] = r
            elif r:
                sess_err.append(r)
            if done % 50 == 0 or done == len(todo):
                print("  ✓ %d/%d  (%.0fs)" % (done, len(todo), time.time() - t0), flush=True)
    # 只在结束时写盘一次（避免周期性重写大文件拖慢速度）
    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)

print("成功:", len(cache), " 失败:", len(sess_err), flush=True)

# ---------- 4. 生成 quests.js ----------
# 注意：任务名可能重复（同一活动任务的多个难度版本），
#       所以用「id」做 key，value 里带 name。
final = {}
for qid, name in quests_idx:
    if qid in cache:
        d = cache[qid]
        final[qid] = {
            "name": name,
            "cat": d.get("cat", ""),
            "star": d.get("star", 0),
            "full": d.get("full_title", name),
            "desc": d.get("desc", ""),
            "goal": d.get("goal", ""),
            "fail": d.get("fail", ""),
            "hrp": d.get("hrp", ""),
            "mrp": d.get("mrp", ""),
            "mons": d.get("mons", []),
            "supply": d.get("supply", []),
        }

with open(OUT, "w", encoding="utf-8") as f:
    f.write("// ============================================================\n")
    f.write("// 任务数据（自动抓取自 Kiranico /zh/data/quests）\n")
    f.write("// quest_data: { 任务id: {name,cat,star,full,desc,goal,fail,hrp,mrp,mons,supply} }\n")
    f.write("// 共 %d 条\n" % len(final))
    f.write("// ============================================================\n")
    f.write("(function(){ var quests = ")
    json.dump(final, f, ensure_ascii=False, separators=(",", ":"))
    f.write("; window.quest_data = quests; })();\n")

size = os.path.getsize(OUT)
print("已输出:", OUT, "%.2f MB" % (size / 1024 / 1024), flush=True)

# 统计
from collections import Counter
cc = Counter(v["cat"] for v in final.values())
print("")
print("分类统计:")
for k, v in cc.most_common():
    print("  %s: %d" % (k, v))