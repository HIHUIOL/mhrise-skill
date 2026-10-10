#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================
#  mhrise-skill / push.py
#  在 Termux 中用 Python 一键推送文件到 GitHub（不需要 git）
#
#  用法：
#      python push.py                  # 同步当前目录
#      python push.py "提交说明"        # 指定提交说明
#
#  准备（一次性）：
#      pkg install python
#      pip install requests
#      # 在脚本同目录建 token.txt，写入你的 PAT（只放一行）
#
#  特性：
#      · 自动建仓库（不存在时）
#      · 只上传发生变化的文件（对比远程 sha）
#      · 自动删除远程已不存在的文件（保持同步）
#      · 中英文提示，出错给排查建议
# ============================================================

import os
import sys
import json
import base64
import hashlib

try:
    import requests
except ImportError:
    sys.exit("缺少 requests 库，请先执行：pip install requests")

# ============================================================
#  配置区（改这里）
# ============================================================
OWNER  = "HIHUIOL"
REPO   = "mhrise-skill"
BRANCH = "main"

# 要同步的文件清单（相对本脚本所在目录）
INCLUDE = [
    ".nojekyll",
    ".gitignore",
    "404.html",
    "README.md",
    "index.html",
    "manifest.json",
    "render.js",
    "skillData.js",
    "skill_data.js",
    "decoration.js",
    "rampage_decorations.js",
    "sw.js",
    "icon-192.png",
    "icon-512.png",
    "icon.svg",
    "push.sh",
    "push.py",
    "scrape_decorations.py",
    "scrape_ramdeco.py",
    "scrape_items.py",
    "scrape_monsters.py",
    "scrape_items.sh",
    "scrape_monsters.sh",
]

# 不参与同步的目录名 / 文件名
EXCLUDE_DIRS  = [".git", ".backup", "More Detailed Skill Descriptions 3872 2.3 2026-07-14T05-20Z Cl6GvBo7Y"]
EXCLUDE_NAMES = ["token.txt", "push.py.bak", "push.sh.bak"]

API = "https://api.github.com"
TIMEOUT = 30

# ============================================================
#  小工具
# ============================================================

def log(msg):
    print(msg, flush=True)


def die(msg):
    sys.exit("\n❌ " + msg)


def read_token():
    """优先环境变量 GH_TOKEN，其次同目录 token.txt"""
    t = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if t:
        return t.strip()
    here = os.path.dirname(os.path.abspath(__file__))
    tokfile = os.path.join(here, "token.txt")
    if os.path.exists(tokfile):
        with open(tokfile, "r", encoding="utf-8") as f:
            return f.read().strip()
    die("未找到 token。\n"
        "  请在脚本同目录创建 token.txt 并写入你的 Personal Access Token，\n"
        "  或先执行：export GH_TOKEN=你的token")


def make_session(token):
    s = requests.Session()
    s.headers.update({
        "Authorization": "token " + token,
        "Accept": "application/vnd.github+json",
        "User-Agent": "mhrise-push-py",
    })
    return s


def git_blob_sha(data: bytes) -> str:
    """按 git 规则算 blob 的 sha1，用来判断文件是否变化"""
    h = hashlib.sha1()
    h.update(b"blob %d\x00" % len(data))
    h.update(data)
    return h.hexdigest()


def read_bytes(path):
    with open(path, "rb") as f:
        return f.read()


# ============================================================
#  GitHub API 封装
# ============================================================

def ensure_repo(s):
    r = s.get(f"{API}/repos/{OWNER}/{REPO}", timeout=TIMEOUT)
    if r.status_code == 200:
        return
    if r.status_code == 404:
        log(f"🆕 仓库不存在，正在创建 {OWNER}/{REPO} ...")
        r = s.post(f"{API}/user/repos", json={
            "name": REPO,
            "private": False,
            "auto_init": False,
            "description": "怪物猎人崛起：曙光 技能查阅 PWA",
        }, timeout=TIMEOUT)
        if r.status_code not in (200, 201):
            die(f"创建仓库失败（{r.status_code}）：{r.text}")
        log("   ✓ 仓库已创建")
        return
    if r.status_code == 401:
        die("认证失败（401）：token 无效或已过期，请重新生成。")
    if r.status_code == 403:
        die("权限不足（403）：token 需要勾选 repo 权限。")
    die(f"访问仓库失败（{r.status_code}）：{r.text}")


def get_remote_files(s):
    """返回 { 路径: sha }。空仓库返回 {}"""
    r = s.get(f"{API}/repos/{OWNER}/{REPO}/git/ref/heads/{BRANCH}", timeout=TIMEOUT)
    if r.status_code != 200:
        return {}
    head = r.json()["object"]["sha"]

    r = s.get(f"{API}/repos/{OWNER}/{REPO}/git/commits/{head}", timeout=TIMEOUT)
    r.raise_for_status()
    tree_sha = r.json()["tree"]["sha"]

    r = s.get(f"{API}/repos/{OWNER}/{REPO}/git/trees/{tree_sha}?recursive=1", timeout=TIMEOUT)
    r.raise_for_status()

    out = {}
    for item in r.json().get("tree", []):
        if item.get("type") == "blob":
            out[item["path"]] = item["sha"]
    return out


def get_head_sha(s):
    r = s.get(f"{API}/repos/{OWNER}/{REPO}/git/ref/heads/{BRANCH}", timeout=TIMEOUT)
    return r.json()["object"]["sha"] if r.status_code == 200 else None


def upload_blob(s, data: bytes) -> str:
    r = s.post(f"{API}/repos/{OWNER}/{REPO}/git/blobs", json={
        "content": base64.b64encode(data).decode("ascii"),
        "encoding": "base64",
    }, timeout=TIMEOUT)
    if r.status_code not in (200, 201):
        die(f"上传 blob 失败（{r.status_code}）：{r.text}")
    return r.json()["sha"]


def create_tree(s, items, base_tree=None):
    payload = {"tree": items}
    if base_tree:
        payload["base_tree"] = base_tree
    r = s.post(f"{API}/repos/{OWNER}/{REPO}/git/trees", json=payload, timeout=TIMEOUT)
    if r.status_code not in (200, 201):
        die(f"创建 tree 失败（{r.status_code}）：{r.text}")
    return r.json()["sha"]


def create_commit(s, message, tree_sha, parents):
    r = s.post(f"{API}/repos/{OWNER}/{REPO}/git/commits", json={
        "message": message,
        "tree": tree_sha,
        "parents": parents,
    }, timeout=TIMEOUT)
    if r.status_code not in (200, 201):
        die(f"创建 commit 失败（{r.status_code}）：{r.text}")
    return r.json()["sha"]


def update_ref(s, commit_sha, force=False):
    r = s.patch(f"{API}/repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}", json={
        "sha": commit_sha,
        "force": force,
    }, timeout=TIMEOUT)
    if r.status_code not in (200, 201):
        # 分支可能还不存在，尝试创建
        r2 = s.post(f"{API}/repos/{OWNER}/{REPO}/git/refs", json={
            "ref": f"refs/heads/{BRANCH}",
            "sha": commit_sha,
        }, timeout=TIMEOUT)
        if r2.status_code not in (200, 201):
            die(f"更新分支失败（{r.status_code}）：{r.text}")
        return
    return


# ============================================================
#  收集本地文件
# ============================================================

def collect_files():
    here = os.path.dirname(os.path.abspath(__file__))
    result = {}

    def walk(rel):
        full = os.path.join(here, rel)
        name = os.path.basename(rel)
        if name in EXCLUDE_NAMES or name in EXCLUDE_DIRS:
            return
        if os.path.isdir(full):
            for n in sorted(os.listdir(full)):
                if n in EXCLUDE_DIRS or n in EXCLUDE_NAMES:
                    continue
                walk(os.path.join(rel, n))
        else:
            result[rel.replace(os.sep, "/")] = full

    for item in INCLUDE:
        full = os.path.join(here, item)
        if not os.path.exists(full):
            log(f"⚠️  跳过（不存在）：{item}")
            continue
        walk(item)
    return result


# ============================================================
#  主流程
# ============================================================

def main():
    msg = sys.argv[1] if len(sys.argv) > 1 else "更新"
    token = read_token()
    s = make_session(token)

    log(f"📂 仓库：{OWNER}/{REPO}  分支：{BRANCH}")
    log(f"📝 提交说明：{msg}")

    # 1. 确保仓库存在
    ensure_repo(s)

    # 2. 拉远程快照
    log("🔍 读取远程文件列表 ...")
    remote = get_remote_files(s)
    log(f"   远程已有 {len(remote)} 个文件")

    # 3. 收集本地
    local = collect_files()
    log(f"   本地待同步 {len(local)} 个文件")
    log("")

    # 4. 找出变化 / 新增
    to_upload = []      # (rel, content_bytes, sha)
    skipped = 0
    for rel, full in sorted(local.items()):
        content = read_bytes(full)
        sha = git_blob_sha(content)
        if remote.get(rel) == sha:
            skipped += 1
            continue
        to_upload.append((rel, content, sha))

    # 5. 找出需要删除的（远程有、本地没有）
    to_delete = [p for p in remote if p not in local]

    if not to_upload and not to_delete:
        log("✅ 所有文件均为最新，无需推送。")
        return

    log(f"📤 上传 {len(to_upload)} 个 / 删除 {len(to_delete)} 个 / 跳过 {skipped} 个")
    log("")

    # 6. 上传 blob
    tree_items = []
    for i, (rel, content, sha) in enumerate(to_upload, 1):
        log(f"   [{i}/{len(to_upload)}] 上传 {rel}  ({len(content)} 字节)")
        blob_sha = upload_blob(s, content)
        mode = "100755" if rel.endswith((".sh", ".py")) else "100644"
        tree_items.append({
            "path": rel, "mode": mode, "type": "blob", "sha": blob_sha,
        })

    # 7. 删除项
    for rel in to_delete:
        log(f"   🗑  删除 {rel}")
        tree_items.append({
            "path": rel, "mode": "100644", "type": "blob", "sha": None,
        })

    # 8. 生成 tree + commit + 更新 ref
    log("")
    log("🌳 生成 tree / commit ...")
    base = get_head_sha(s)

    base_tree = None
    if base:
        r = s.get(f"{API}/repos/{OWNER}/{REPO}/git/commits/{base}", timeout=TIMEOUT)
        if r.status_code == 200:
            base_tree = r.json()["tree"]["sha"]

    tree_sha = create_tree(s, tree_items, base_tree=base_tree)
    parents = [base] if base else []
    commit_sha = create_commit(s, msg, tree_sha, parents)

    log("⬆️  更新远程分支 ...")
    update_ref(s, commit_sha)

    log("")
    log("✅ 推送完成！")
    log(f"   🔗 https://github.com/{OWNER}/{REPO}")
    log(f"   🌐 https://{OWNER.lower()}.github.io/{REPO}/")


if __name__ == "__main__":
    main()