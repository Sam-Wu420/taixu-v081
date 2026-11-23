#!/bin/bash
# 实拍：四类建筑各「门外 → 走进去屋顶淡出中 → 室内全貌 → 和掌柜交谈开面板」，白天、夜里各一组（1600×900）
# 用法：bash tools/shots-indoor/run-all.sh 端口
export MSYS_NO_PATHCONV=1
P=${1:-5246}; O=tools/out/r4-indoor
run() { k=$1; extra=$2; tag=$3
  timeout 170 node tools/edge-shot.mjs "http://127.0.0.1:$P/tools/perf-acceptance.html?auto=new&map=tiannan&try=indoor&kind=$k$extra" --size=1600x900 --wait=30 --out=$O/$tag-1door.png \
    --step="0.1|$O/$tag-2fading.png|tools/shots-indoor/walkin2.js" --step="0.2|$O/$tag-x.png|tools/shots-indoor/unhold.js" \
    --step="3.5|$O/$tag-3inside.png|tools/shots-indoor/state.js" --step="0.3|$O/$tag-4talk.png|tools/shots-indoor/talk.js" 2>&1 | grep 结果 | tr '\n' ' '; echo " <- $tag"; rm -f $O/$tag-x.png; }
run shop "" day-shop; run inn "" day-inn; run tavern "" day-tavern; run hall "" day-hall
run shop "&night=1&fac=artifact" night-shop; run inn "&night=1" night-inn; run tavern "&night=1&city=jiayuan" night-tavern-jiayuan; run hall "&night=1" night-hall
