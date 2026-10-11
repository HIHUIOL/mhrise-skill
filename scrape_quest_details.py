import re, html, json, os, sys, time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = '/storage/emulated/0/000/PWA/mhrise-skill'
CACHE = '/tmp/quest_cache'
os.makedirs(CACHE, exist_ok=True)

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

# ---------- 1. 读数据库拿到全部 key ----------
out = os.popen("cd %s && node -e 'global.window={};require(\"./quests.js\");process.stdout.write(Object.keys(window.quest_data).join(\"\\n\"))'" % BASE).read()
ALL_KEYS = [k.strip() for k in out.split('\n') if k.strip()]
print('[1] 数据库任务数: %d' % len(ALL_KEYS))

# 复用已抓的页面
for f in os.listdir('/tmp'):
    m = re.match(r'^q_(\d+)\.html$', f)
    if m:
        dst = os.path.join(CACHE, m.group(1) + '.html')
        if not os.path.exists(dst):
            try: open(dst,'wb').write(open('/tmp/'+f,'rb').read())
            except: pass
have = set(f[:-5] for f in os.listdir(CACHE) if f.endswith('.html'))
need = [k for k in ALL_KEYS if k not in have]
print('[2] 已有缓存: %d 个，需下载: %d 个' % (len(have), len(need)))

# ---------- 2. 并发下载 ----------
def fetch(k):
    path = os.path.join(CACHE, k + '.html')
    if os.path.exists(path) and os.path.getsize(path) > 50000:
        return (k, 'cached')
    url = 'https://mhrise.kiranico.com/zh/data/quests/' + k
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        data = urllib.request.urlopen(req, timeout=30).read()
        if len(data) < 20000:
            return (k, 'too_small:%d' % len(data))
        open(path, 'wb').write(data)
        return (k, 'ok')
    except Exception as e:
        return (k, 'err:%s' % str(e)[:60])

if need:
    t0 = time.time()
    done = 0
    fail = []
    with ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(fetch, k): k for k in need}
        for fu in as_completed(futs):
            k, st = fu.result()
            done += 1
            if not st.startswith('ok') and st != 'cached':
                fail.append((k, st))
            if done % 50 == 0 or done == len(need):
                el = time.time() - t0
                print('    [%d/%d] %.0fs  (%.1f 个/秒)' % (done, len(need), el, done/max(el,0.01)), flush=True)
    print('[3] 下载完成 %.0fs，失败 %d 个' % (time.time()-t0, len(fail)))
    for k, st in fail[:20]:
        print('    ❌ %s: %s' % (k, st))
else:
    print('[3] 无需下载')

# ---------- 3. 解析 ----------
def clean(x):
    x = re.sub(r'<[^>]+>', ' ', x)
    return re.sub(r'\s+', ' ', html.unescape(x)).strip()

def parse(k):
    path = os.path.join(CACHE, k + '.html')
    if not os.path.exists(path):
        return None
    s = open(path, encoding='utf-8', errors='ignore').read()
    s2 = re.sub(r'<script.*?</script>', '', s, flags=re.S)
    s2 = re.sub(r'<style.*?</style>', '', s2, flags=re.S)
    r = {}
    # Details
    i = s2.find('Details for')
    det = {}
    if i > 0:
        for kk, vv in re.findall(r'<dt[^>]*>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>', s2[i:], re.S):
            det[clean(kk)] = clean(vv)
    r['details'] = det
    # h2 分块
    h2s = [(m.start(), clean(m.group(1))) for m in re.finditer(r'<h2[^>]*>(.*?)</h2>', s2, re.S)]
    def rows_between(a, b):
        seg = s2[a:b]
        out = []
        for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', seg, re.S):
            cells = [clean(c) for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', tr, re.S)]
            if any(cells): out.append(cells)
        return out
    for idx, (pos, t) in enumerate(h2s):
        end = h2s[idx+1][0] if idx+1 < len(h2s) else len(s2)
        if t == '报酬金余额':
            r['reward'] = rows_between(pos, end)
        elif t == '补给箱':
            r['supply_box'] = rows_between(pos, end)
        elif t == '怪物':
            r['monster_rows'] = len(rows_between(pos, end))
    return r

print('[4] 解析中...')
results = {}
fail_parse = []
t0 = time.time()
for i, k in enumerate(ALL_KEYS):
    try:
        r = parse(k)
        if r is None:
            fail_parse.append((k, 'no_file'))
        else:
            results[k] = r
    except Exception as e:
        fail_parse.append((k, str(e)[:60]))
print('[5] 解析完成 %.1fs，成功 %d，失败 %d' % (time.time()-t0, len(results), len(fail_parse)))

# 统计
n_reward = sum(1 for r in results.values() if r.get('reward'))
n_det = sum(1 for r in results.values() if r.get('details'))
print('[6] 有报酬表: %d | 有 Details: %d' % (n_reward, n_det))

json.dump({'results': results, 'fail': fail_parse}, open('/tmp/scraped.json','w'), ensure_ascii=False)
print('[7] 已写 /tmp/scraped.json (%d bytes)' % os.path.getsize('/tmp/scraped.json'))