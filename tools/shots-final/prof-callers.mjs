// 一份 .cpuprofile 里，某个函数（名字包含给的字样）的时间是从哪些调用链上来的。用法：node tools/shots-final/prof-callers.mjs x.cpuprofile 函数名 [窗口毫秒=18000] [往上几层=4]
import { readFileSync } from 'node:fs';
const [f, fn, winS = '18000', upS = '4'] = process.argv.slice(2), win = Number(winS) * 1000, up = Number(upS);
const P = JSON.parse(readFileSync(f, 'utf8')), byId = new Map(P.nodes.map((n) => [n.id, n])), parent = new Map();
for (const n of P.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const ts = []; let t = P.startTime; for (let i = 0; i < P.samples.length; i++) { t += P.timeDeltas[i]; ts.push(t); }
const name = (n) => `${n.callFrame.functionName || '(匿名:' + (n.callFrame.lineNumber + 1) + ')'} ${(n.callFrame.url || '').split('/').pop().split('?')[0]}:${n.callFrame.lineNumber + 1}`;
let mark = -1; for (let i = 0; i < P.samples.length; i++) if (byId.get(P.samples[i]).callFrame.functionName === '__markFn') mark = ts[i];
const M = new Map();
for (let i = 0; i < P.samples.length; i++) {
  if (ts[i] < mark - win || ts[i] > mark) continue;
  const dt = (P.timeDeltas[i + 1] ?? P.timeDeltas[i]) / 1000;
  let id = P.samples[i]; const chain = []; while (id) { chain.push(name(byId.get(id))); id = parent.get(id); }
  const k = chain.findIndex((x) => x.split(' ')[0].includes(fn)); if (k < 0) continue;
  const key = chain.slice(k, k + 1 + up).join(' ← '); M.set(key, (M.get(key) ?? 0) + dt);
}
for (const [k, v] of [...M].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log((v / (win / 1e6)).toFixed(1).padStart(7) + '  ' + k);
