// 两份 .cpuprofile 对比：取每份最后一次 __markFn 之前 N 毫秒的样本，按「函数名 文件」汇总自身耗时和含子调用耗时，换算成「每秒里占多少毫秒」后列出差得最多的。
// 用法：node tools/shots-final/prof-diff.mjs 新.cpuprofile 旧.cpuprofile [窗口毫秒=18000] [列几条=45]
import { readFileSync } from 'node:fs';
const [fa, fb, winS = '18000', topS = '45'] = process.argv.slice(2), win = Number(winS) * 1000, top = Number(topS);
function load(f) {
  const P = JSON.parse(readFileSync(f, 'utf8')), byId = new Map(P.nodes.map((n) => [n.id, n])), parent = new Map();
  for (const n of P.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const ts = []; let t = P.startTime; for (let i = 0; i < P.samples.length; i++) { t += P.timeDeltas[i]; ts.push(t); }
  const name = (n) => `${n.callFrame.functionName || '(匿名:' + (n.callFrame.lineNumber + 1) + ')'} ${(n.callFrame.url || '').split('/').pop().split('?')[0]}`;
  let mark = -1; for (let i = 0; i < P.samples.length; i++) if (byId.get(P.samples[i]).callFrame.functionName === '__markFn') mark = ts[i];
  const S = new Map(), T = new Map(); let all = 0;
  for (let i = 0; i < P.samples.length; i++) {
    if (ts[i] < mark - win || ts[i] > mark) continue;
    const dt = (P.timeDeltas[i + 1] ?? P.timeDeltas[i]) / 1000; all += dt;
    let id = P.samples[i]; const k = name(byId.get(id)); S.set(k, (S.get(k) ?? 0) + dt);
    const seen = new Set(); while (id) { const kk = name(byId.get(id)); if (!seen.has(kk)) { seen.add(kk); T.set(kk, (T.get(kk) ?? 0) + dt); } id = parent.get(id); }
  }
  const sec = win / 1e6; for (const M of [S, T]) for (const [k, v] of M) M.set(k, v / sec);
  return { S, T, all: all / sec };
}
const A = load(fa), B = load(fb);
const idle = (X) => (X.S.get('(idle) ') ?? 0) + (X.S.get('(program) ') ?? 0);
console.log(`每秒里：新 忙 ${(A.all - idle(A)).toFixed(0)} 毫秒（空闲/浏览器 ${idle(A).toFixed(0)}），旧 忙 ${(B.all - idle(B)).toFixed(0)} 毫秒（空闲/浏览器 ${idle(B).toFixed(0)}）`);
for (const [title, a, b] of [['自身耗时', A.S, B.S], ['含子调用', A.T, B.T]]) {
  const keys = new Set([...a.keys(), ...b.keys()]);
  const rows = [...keys].map((k) => [k, a.get(k) ?? 0, b.get(k) ?? 0]).sort((x, y) => Math.abs(y[1] - y[2]) - Math.abs(x[1] - x[2])).slice(0, top);
  console.log(`\n== ${title}（毫秒/秒）：新  旧  差`);
  for (const [k, x, y] of rows) console.log(`${x.toFixed(1).padStart(7)} ${y.toFixed(1).padStart(7)} ${(x - y >= 0 ? '+' : '') + (x - y).toFixed(1).padStart(6)}  ${k}`);
}
