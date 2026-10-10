#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# 一键抓取道具（MT管理器 / Termux 双击可运行）
# 运行 scrape_items.py，脚本自动支持断点续爬。
#
# 想改线程数 / 看进度，编辑下面这行 CONFIG_ARGS：
#   -j 12        12 线程并发（默认 8）
#   --stat       只看进度，不抓取
#   --build      只根据缓存生成 items.js
# ============================================================

CONFIG_ARGS="-j 12"

export PREFIX=/data/data/com.termux/files/usr
export HOME=/data/data/com.termux/files/home
export PATH=$PREFIX/bin:$PATH
export LD_LIBRARY_PATH=$PREFIX/lib:$LD_LIBRARY_PATH
export PYTHONUNBUFFERED=1

# ---- 定位脚本所在目录（MT 里 $0 可能不是绝对路径，做兼容）----
DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
[ -z "$DIR" ] && DIR="/storage/emulated/0/000/PWA/mhrise-skill"
cd "$DIR" || { echo "无法进入目录: $DIR"; exit 1; }

SCRIPT="scrape_items.py"

# ---- 找可用的 python ----
PY=""
for c in python python3 /usr/bin/python3 /data/data/com.termux/files/usr/bin/python; do
  if command -v "$c" >/dev/null 2>&1; then
    PY="$c"
    break
  fi
done

echo "============================================"
echo " 目录  : $DIR"
echo " 脚本  : $SCRIPT"
echo " 参数  : $CONFIG_ARGS $*"
echo " python: ${PY:-未找到}"
echo "============================================"
echo ""

if [ -z "$PY" ]; then
  echo "❌ 找不到 python，请先安装（Termux 里执行: pkg install python）"
  echo "按回车关闭…"
  read -r _
  exit 1
fi

# ---- 运行（把 CONFIG_ARGS 和手工传入的参数都带上）----
"$PY" "$SCRIPT" $CONFIG_ARGS "$@"
CODE=$?

echo ""
echo "============================================"
if [ $CODE -eq 0 ]; then
  echo "✅ 完成！"
else
  echo "⚠️ 退出码 $CODE（失败可重新运行，会自动续爬）"
fi
echo "（按回车关闭窗口）"
read -r _