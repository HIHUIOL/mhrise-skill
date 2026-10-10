#!/data/data/com.termux/files/usr/bin/bash

export PREFIX=/data/data/com.termux/files/usr
export HOME=/data/data/com.termux/files/home
export PATH=$PREFIX/bin:$PATH
export LD_LIBRARY_PATH=$PREFIX/lib:$LD_LIBRARY_PATH

cd "$(dirname "$0")"
SCRIPT="${0%.sh}.py"

python "$SCRIPT"