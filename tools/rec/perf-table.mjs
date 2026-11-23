// r9：把 tools/out/perf/*.json（frame-prof.mjs 的输出）汇成一张表：每招预热后放两遍，第二遍的最长帧 / p95 / 超 50 毫秒帧数（第一遍、采样那一遍附在后面）
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const D = 'tools/out/perf', rows = [];
for (const f of readdirSync(D).filter((x) => x.endsWith('.json')).sort()) {
  let j; try { j = JSON.parse(readFileSync(join(D, f), 'utf8')); } catch { continue; }
  for (const m of j) {
    // 预热之后量的那几遍（不含开采样的那一遍）：每项取中位数，后面列出每一遍
    const R = m.reps.filter((r) => !r.busy && !r.spikes?.__prof).filter((r) => r.rep <= (m.reps.length - 1));
    if (!R.length) continue;
    const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor((b.length - 1) / 2)]; };
    rows.push(`| ${m.id} | ${med(R.map((r) => r.frames))} | ${med(R.map((r) => r.max))} | ${med(R.map((r) => r.p95))} | ${med(R.map((r) => r.over50))} | ${R.map((r) => `${r.max} / ${r.p95} / ${r.over50}`).join('；')} |`);
  }
}
const out = ['| 招 | 帧数（中位） | 最长帧（中位，毫秒） | p95（中位） | 超 50 毫秒（中位） | 每一遍 最长 / p95 / 超 50 |', '|---|---|---|---|---|---|', ...rows].join('\n');
writeFileSync(join(D, 'table.md'), out + '\n');
console.log(out);
